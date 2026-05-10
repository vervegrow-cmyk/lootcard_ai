import crypto from "crypto";

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function isTemporarySiliconFlowUrl(url: string): boolean {
  return /temporary\.siliconflow\.cn/i.test(url);
}

function sha1(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex");
}

export class StorageService {
  isConfigured(): boolean {
    const provider = env("CDN_PROVIDER").toLowerCase();
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
    const provider = env("CDN_PROVIDER").toLowerCase();
    if (provider !== "cloudinary") {
      return ["CDN_PROVIDER"];
    }

    return [
      !env("CLOUDINARY_CLOUD_NAME") ? "CLOUDINARY_CLOUD_NAME" : "",
      !env("CLOUDINARY_API_KEY") ? "CLOUDINARY_API_KEY" : "",
      !env("CLOUDINARY_API_SECRET") ? "CLOUDINARY_API_SECRET" : ""
    ].filter(Boolean);
  }

  async uploadImageFromUrl(url: string): Promise<string> {
    if (!url) {
      throw new Error("Missing image URL for permanent upload.");
    }

    const provider = env("CDN_PROVIDER").toLowerCase();
    if (provider !== "cloudinary") {
      throw new Error("Unsupported CDN provider. Configure CDN_PROVIDER=cloudinary.");
    }

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

    return parsed.secure_url;
  }

  async ensurePermanentImageUrl(url?: string): Promise<string | undefined> {
    if (!url) {
      return undefined;
    }

    if (isTemporarySiliconFlowUrl(url)) {
      if (!this.isConfigured()) {
        throw new Error(
          `Temporary SiliconFlow image URLs cannot be used for Shopify sharing. Configure CDN storage first: ${this.getMissingEnv().join(", ")}`
        );
      }
      return this.uploadImageFromUrl(url);
    }

    return url;
  }
}

export const storageService = new StorageService();
