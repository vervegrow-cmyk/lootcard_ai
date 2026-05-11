import crypto from "crypto";

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function isTemporarySiliconFlowUrl(url: string): boolean {
  return /temporary\.siliconflow\.cn|s3\.siliconflow\.cn\/temporary/i.test(url);
}

function sha1(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function isoTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function dateStamp(date = new Date()): string {
  return isoTimestamp(date).slice(0, 8);
}

function resolveProvider(): string {
  return (env("CDN_PROVIDER") || env("STORAGE_PROVIDER") || "r2").toLowerCase();
}

export class StorageService {
  isTemporaryImageUrl(url?: string): boolean {
    return Boolean(url && isTemporarySiliconFlowUrl(url));
  }

  async downloadImageAsset(url: string): Promise<{
    attachment: string;
    fileName: string;
    mimeType: string;
  }> {
    if (!url) {
      throw new Error("Missing image URL for download.");
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image asset: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const extension = contentType.includes("jpeg")
      ? "jpg"
      : contentType.includes("webp")
        ? "webp"
        : "png";
    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      attachment: buffer.toString("base64"),
      fileName: `lootcard-${Date.now()}.${extension}`,
      mimeType: contentType
    };
  }

  isConfigured(): boolean {
    const provider = resolveProvider();

    if (provider === "r2") {
      return Boolean(
        env("R2_PUBLIC_BASE_URL") &&
          env("R2_ACCESS_KEY_ID") &&
          env("R2_SECRET_ACCESS_KEY") &&
          env("R2_BUCKET") &&
          env("R2_ENDPOINT")
      );
    }

    if (provider === "cloudinary") {
      return Boolean(
        env("CLOUDINARY_CLOUD_NAME") &&
          env("CLOUDINARY_API_KEY") &&
          env("CLOUDINARY_API_SECRET")
      );
    }

    return false;
  }

  getMissingEnv(): string[] {
    const provider = resolveProvider();

    if (provider === "r2") {
      return [
        !env("R2_PUBLIC_BASE_URL") ? "R2_PUBLIC_BASE_URL" : "",
        !env("R2_ACCESS_KEY_ID") ? "R2_ACCESS_KEY_ID" : "",
        !env("R2_SECRET_ACCESS_KEY") ? "R2_SECRET_ACCESS_KEY" : "",
        !env("R2_BUCKET") ? "R2_BUCKET" : "",
        !env("R2_ENDPOINT") ? "R2_ENDPOINT" : ""
      ].filter(Boolean);
    }

    if (provider === "cloudinary") {
      return [
        !env("CLOUDINARY_CLOUD_NAME") ? "CLOUDINARY_CLOUD_NAME" : "",
        !env("CLOUDINARY_API_KEY") ? "CLOUDINARY_API_KEY" : "",
        !env("CLOUDINARY_API_SECRET") ? "CLOUDINARY_API_SECRET" : ""
      ].filter(Boolean);
    }

    return ["CDN_PROVIDER"];
  }

  private async uploadToCloudinary(url: string): Promise<string> {
    const cloudName = env("CLOUDINARY_CLOUD_NAME");
    const apiKey = env("CLOUDINARY_API_KEY");
    const apiSecret = env("CLOUDINARY_API_SECRET");

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(`CDN is not fully configured. Missing: ${this.getMissingEnv().join(", ")}`);
    }

    const source = await fetch(url);
    if (!source.ok) {
      throw new Error(`Failed to download image for CDN upload: ${source.status}`);
    }

    const buffer = Buffer.from(await source.arrayBuffer());
    const contentType = source.headers.get("content-type") || "image/png";
    const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = env("CDN_UPLOAD_FOLDER") || "lootcard-ai/cards";
    const publicId = `lootcard-${Date.now()}`;
    const signature = sha1(`folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`);

    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: contentType }), `${publicId}.${extension}`);
    formData.append("api_key", apiKey);
    formData.append("timestamp", String(timestamp));
    formData.append("folder", folder);
    formData.append("public_id", publicId);
    formData.append("signature", signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`CDN upload failed: ${response.status} ${text}`);
    }

    const parsed = JSON.parse(text) as { secure_url?: string };
    if (!parsed.secure_url) {
      throw new Error("CDN upload succeeded but no secure_url was returned.");
    }

    console.log(`[STORAGE] upload success publicImageUrl=${parsed.secure_url}`);
    return parsed.secure_url;
  }

  private async uploadToR2(url: string): Promise<string> {
    const publicBaseUrl = env("R2_PUBLIC_BASE_URL");
    const accessKeyId = env("R2_ACCESS_KEY_ID");
    const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
    const bucket = env("R2_BUCKET");
    const endpoint = env("R2_ENDPOINT").replace(/\/$/, "");

    if (!publicBaseUrl || !accessKeyId || !secretAccessKey || !bucket || !endpoint) {
      throw new Error(`R2 storage is not configured. Missing: ${this.getMissingEnv().join(", ")}`);
    }

    console.log("[STORAGE] provider=r2");

    const source = await fetch(url);
    if (!source.ok) {
      throw new Error(`Failed to download image for R2 upload: ${source.status}`);
    }

    const contentType = source.headers.get("content-type") || "image/png";
    const extension = contentType.includes("jpeg")
      ? "jpg"
      : contentType.includes("webp")
        ? "webp"
        : "png";
    const body = Buffer.from(await source.arrayBuffer());
    const prefix = env("R2_UPLOAD_PREFIX") || env("CDN_UPLOAD_FOLDER") || "lootcard-ai/cards";
    const objectKey = `${prefix.replace(/^\/+|\/+$/g, "")}/lootcard-${Date.now()}.${extension}`;

    const now = new Date();
    const amzDate = isoTimestamp(now);
    const shortDate = dateStamp(now);
    const region = "auto";
    const service = "s3";
    const host = new URL(endpoint).host;
    const canonicalUri = `/${bucket}/${objectKey}`;
    const payloadHash = sha256(body);

    const canonicalHeaders =
      `content-type:${contentType}\n` +
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      "PUT",
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join("\n");

    const credentialScope = `${shortDate}/${region}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256(canonicalRequest)
    ].join("\n");

    const signingKey = hmac(
      hmac(
        hmac(
          hmac(`AWS4${secretAccessKey}`, shortDate),
          region
        ),
        service
      ),
      "aws4_request"
    );
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const uploadUrl = `${endpoint}/${bucket}/${objectKey}`;
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        Authorization: authorization
      },
      body
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`R2 upload failed: ${response.status} ${text}`);
    }

    const publicImageUrl = `${publicBaseUrl.replace(/\/$/, "")}/${objectKey}`;
    console.log(`[STORAGE] upload success publicImageUrl=${publicImageUrl}`);
    return publicImageUrl;
  }

  async uploadImageFromUrl(url: string): Promise<string> {
    if (!url) {
      throw new Error("Missing image URL for permanent upload.");
    }

    const provider = resolveProvider();

    if (provider === "r2") {
      return this.uploadToR2(url);
    }

    if (provider === "cloudinary") {
      return this.uploadToCloudinary(url);
    }

    throw new Error(`Unsupported CDN provider: ${provider}`);
  }

  async ensurePermanentImageUrl(url?: string): Promise<string | undefined> {
    if (!url) {
      return undefined;
    }

    if (isTemporarySiliconFlowUrl(url)) {
      if (!this.isConfigured()) {
        const provider = resolveProvider();
        if (provider === "r2") {
          throw new Error(`R2 storage is not configured. Missing: ${this.getMissingEnv().join(", ")}`);
        }
        throw new Error(`Permanent image storage is not configured. Missing: ${this.getMissingEnv().join(", ")}`);
      }
      return this.uploadImageFromUrl(url);
    }

    return url;
  }
}

export const storageService = new StorageService();
