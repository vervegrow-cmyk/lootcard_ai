import crypto from "crypto";
import { ShopifyShop } from "@prisma/client";
import { prisma } from "./prisma.service";

export interface ShopifyHealthStatus {
  shopifyConfigured: boolean;
  shop: string | null;
  webhooks: boolean;
  apiStatus: "connected" | "reauthorize_required" | "not_installed" | "not_configured";
}

export interface ShopifyWebhookPayload {
  topic: string;
  shop: string;
  payload: unknown;
}

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

export function normalizeShopDomain(input: string): string | null {
  const normalized = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!normalized) {
    return null;
  }

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function shopifyApiKey(): string {
  return env("SHOPIFY_API_KEY");
}

function shopifyApiSecret(): string {
  return env("SHOPIFY_API_SECRET");
}

function shopifyAppUrl(): string {
  return env("SHOPIFY_APP_URL").replace(/\/+$/, "");
}

function shopifyApiVersion(): string {
  return env("SHOPIFY_API_VERSION") || "2026-04";
}

function shopifyScopes(): string {
  return env("SHOPIFY_SCOPES") || "write_products,read_products,read_orders";
}

function stateExpiryDate(): Date {
  return new Date(Date.now() + 10 * 60 * 1000);
}

function buildQueryString(params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return search.toString();
}

function createNonce(length = 24): string {
  return crypto.randomBytes(length).toString("hex");
}

function createQueryHmac(params: URLSearchParams): string {
  const message = [...params.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return crypto
    .createHmac("sha256", shopifyApiSecret())
    .update(message)
    .digest("hex");
}

async function registerWebhookTopic(shop: ShopifyShop, topic: string, callbackUrl: string): Promise<void> {
  const mutation = `
    mutation RegisterWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        webhookSubscription {
          id
          topic
          uri
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await fetch(`https://${shop.shop}/admin/api/${shopifyApiVersion()}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shop.accessToken
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        topic,
        webhookSubscription: {
          uri: callbackUrl,
          format: "JSON"
        }
      }
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Webhook ${topic} failed: ${response.status} ${text}`);
  }

  const parsed = JSON.parse(text) as {
    data?: {
      webhookSubscriptionCreate?: {
        userErrors?: Array<{ message: string }>;
      };
    };
  };

  const userErrors = parsed.data?.webhookSubscriptionCreate?.userErrors || [];
  if (userErrors.length > 0) {
    throw new Error(`Webhook ${topic} failed: ${userErrors.map((item) => item.message).join("; ")}`);
  }
}

export class ShopifyAuthService {
  isOAuthConfigured(): boolean {
    return Boolean(shopifyApiKey() && shopifyApiSecret() && shopifyAppUrl());
  }

  getMissingOAuthEnv(): string[] {
    return [
      !shopifyApiKey() ? "SHOPIFY_API_KEY" : "",
      !shopifyApiSecret() ? "SHOPIFY_API_SECRET" : "",
      !shopifyAppUrl() ? "SHOPIFY_APP_URL" : ""
    ].filter(Boolean);
  }

  async getPrimaryShop(): Promise<ShopifyShop | null> {
    try {
      return await prisma.shopifyShop.findFirst({
        where: { reauthorizeRequired: false },
        orderBy: { installedAt: "desc" }
      });
    } catch {
      return null;
    }
  }

  async getShopByDomain(shop: string): Promise<ShopifyShop | null> {
    try {
      return await prisma.shopifyShop.findUnique({
        where: { shop }
      });
    } catch {
      return null;
    }
  }

  async getHealthStatus(preferredShop?: string | null): Promise<ShopifyHealthStatus> {
    if (!this.isOAuthConfigured()) {
      return {
        shopifyConfigured: false,
        shop: preferredShop || null,
        webhooks: false,
        apiStatus: "not_configured"
      };
    }

    const normalizedShop = preferredShop ? normalizeShopDomain(preferredShop) : null;
    const shopRecord =
      (normalizedShop ? await this.getShopByDomain(normalizedShop) : null) ||
      (await this.getPrimaryShop());

    if (!shopRecord) {
      return {
        shopifyConfigured: false,
        shop: normalizedShop,
        webhooks: false,
        apiStatus: "not_installed"
      };
    }

    return {
      shopifyConfigured: !shopRecord.reauthorizeRequired,
      shop: shopRecord.shop,
      webhooks: shopRecord.webhookStatus === "registered",
      apiStatus: shopRecord.reauthorizeRequired ? "reauthorize_required" : "connected"
    };
  }

  async createInstallUrl(rawShop: string): Promise<string> {
    const shop = normalizeShopDomain(rawShop);
    if (!shop) {
      throw new Error("Invalid Shopify shop domain.");
    }

    if (!this.isOAuthConfigured()) {
      throw new Error(`Missing Shopify OAuth config: ${this.getMissingOAuthEnv().join(", ")}`);
    }

    const state = createNonce();
    await prisma.shopifyOAuthState.create({
      data: {
        shop,
        state,
        expiresAt: stateExpiryDate()
      }
    });

    const query = buildQueryString({
      client_id: shopifyApiKey(),
      scope: shopifyScopes(),
      redirect_uri: `${shopifyAppUrl()}/auth/callback`,
      state
    });

    return `https://${shop}/admin/oauth/authorize?${query}`;
  }

  async handleOAuthCallback(callbackUrl: string): Promise<{ shop: ShopifyShop; redirectUrl: string; webhooksRegistered: boolean }> {
    const url = new URL(callbackUrl);
    const params = url.searchParams;
    const shop = normalizeShopDomain(params.get("shop") || "");
    const code = params.get("code") || "";
    const state = params.get("state") || "";
    const hmac = params.get("hmac") || "";
    const host = params.get("host") || "";

    if (!shop || !code || !state || !hmac) {
      throw new Error("Missing Shopify OAuth callback parameters.");
    }

    const storedState = await prisma.shopifyOAuthState.findUnique({
      where: { state }
    });

    if (!storedState || storedState.shop !== shop || storedState.expiresAt.getTime() < Date.now()) {
      throw new Error("Invalid or expired Shopify OAuth state.");
    }

    const expectedHmac = createQueryHmac(params);
    if (expectedHmac !== hmac) {
      throw new Error("Invalid Shopify OAuth HMAC.");
    }

    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: shopifyApiKey(),
        client_secret: shopifyApiSecret(),
        code
      })
    });

    const tokenText = await tokenResponse.text();
    if (!tokenResponse.ok) {
      throw new Error(`Shopify OAuth token exchange failed: ${tokenResponse.status} ${tokenText}`);
    }

    const tokenData = JSON.parse(tokenText) as {
      access_token?: string;
      scope?: string;
    };

    if (!tokenData.access_token) {
      throw new Error("Shopify OAuth token exchange did not return an access token.");
    }

    const scopes = tokenData.scope || shopifyScopes();

    const shopRecord = await prisma.shopifyShop.upsert({
      where: { shop },
      update: {
        accessToken: tokenData.access_token,
        scope: scopes,
        installedAt: new Date(),
        reauthorizeRequired: false
      },
      create: {
        shop,
        accessToken: tokenData.access_token,
        scope: scopes,
        installedAt: new Date(),
        reauthorizeRequired: false
      }
    });

    await prisma.shopifyOAuthState.deleteMany({
      where: { state }
    });

    let webhooksRegistered = false;
    try {
      await this.registerWebhooks(shopRecord);
      webhooksRegistered = true;
    } catch (error) {
      await prisma.shopifyShop.update({
        where: { shop },
        data: {
          webhookStatus: "failed",
          webhookTopics: "",
          reauthorizeRequired: false
        }
      });
      throw error;
    }

    const redirectQuery = new URLSearchParams();
    redirectQuery.set("shop", shop);
    if (host) {
      redirectQuery.set("host", host);
    }
    redirectQuery.set("embedded", "1");
    redirectQuery.set("shopify_oauth", "success");

    return {
      shop: shopRecord,
      redirectUrl: `${shopifyAppUrl()}/?${redirectQuery.toString()}`,
      webhooksRegistered
    };
  }

  async registerWebhooks(shopRecord: ShopifyShop): Promise<void> {
    const callbackUrl = `${shopifyAppUrl()}/webhooks`;
    const topics = [
      "APP_UNINSTALLED",
      "PRODUCTS_CREATE",
      "PRODUCTS_UPDATE",
      "ORDERS_CREATE"
    ];

    for (const topic of topics) {
      await registerWebhookTopic(shopRecord, topic, callbackUrl);
    }

    await prisma.shopifyShop.update({
      where: { shop: shopRecord.shop },
      data: {
        webhookStatus: "registered",
        webhookTopics: topics.join(","),
        reauthorizeRequired: false
      }
    });
  }

  async verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): Promise<ShopifyWebhookPayload> {
    const shop = normalizeShopDomain(String(headers["x-shopify-shop-domain"] || ""));
    const topic = String(headers["x-shopify-topic"] || "");
    const signature = String(headers["x-shopify-hmac-sha256"] || "");

    if (!shop || !topic || !signature) {
      throw new Error("Missing Shopify webhook headers.");
    }

    const digest = crypto
      .createHmac("sha256", shopifyApiSecret())
      .update(rawBody)
      .digest("base64");

    const digestBuffer = Buffer.from(digest);
    const signatureBuffer = Buffer.from(signature);

    if (digestBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
      throw new Error("Invalid Shopify webhook HMAC.");
    }

    const payload = JSON.parse(rawBody.toString("utf8")) as unknown;
    return { topic, shop, payload };
  }

  async handleWebhook(payload: ShopifyWebhookPayload): Promise<void> {
    if (payload.topic === "APP_UNINSTALLED") {
      try {
        await prisma.shopifyShop.updateMany({
          where: { shop: payload.shop },
          data: {
            reauthorizeRequired: true,
            webhookStatus: "uninstalled"
          }
        });
      } catch {
        return;
      }
    }
  }

  async markShopForReauthorization(shop: string): Promise<string> {
    const normalizedShop = normalizeShopDomain(shop);
    if (!normalizedShop) {
      throw new Error("Invalid shop domain for reauthorization.");
    }

    await prisma.shopifyShop.updateMany({
      where: { shop: normalizedShop },
      data: { reauthorizeRequired: true }
    });

    return this.createInstallUrl(normalizedShop);
  }
}

export const shopifyAuthService = new ShopifyAuthService();
