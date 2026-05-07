import crypto from "crypto";
import { ShopifySession, ShopifyShop } from "@prisma/client";
import { prisma } from "./prisma.service";

export interface ShopifyHealthStatus {
  shopifyConfigured: boolean;
  connectedShop: string | null;
  webhooks: boolean;
  apiStatus: "connected" | "reauthorize_required" | "not_installed" | "not_configured";
}

export interface ShopifyWebhookPayload {
  topic: string;
  shop: string;
  payload: unknown;
}

export interface ShopifyTokenRecord {
  shop: string;
  accessToken: string;
  webhookStatus: string;
  reauthorizeRequired: boolean;
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

function buildQueryString(params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return search.toString();
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

async function registerWebhookTopic(shop: string, accessToken: string, topic: string, callbackUrl: string): Promise<void> {
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

  const response = await fetch(`https://${shop}/admin/api/${shopifyApiVersion()}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
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

function toTokenRecord(session: ShopifySession, shopMeta?: ShopifyShop | null): ShopifyTokenRecord {
  return {
    shop: session.shop,
    accessToken: session.accessToken,
    webhookStatus: shopMeta?.webhookStatus || "pending",
    reauthorizeRequired: shopMeta?.reauthorizeRequired || false
  };
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

  async getPrimaryShop(): Promise<ShopifyTokenRecord | null> {
    try {
      const session = await prisma.shopifySession.findFirst({
        orderBy: { createdAt: "desc" }
      });

      if (!session) {
        return null;
      }

      const shopMeta = await prisma.shopifyShop.findUnique({
        where: { shop: session.shop }
      });

      return toTokenRecord(session, shopMeta);
    } catch {
      return null;
    }
  }

  async getShopByDomain(shop: string): Promise<ShopifyTokenRecord | null> {
    try {
      const session = await prisma.shopifySession.findUnique({
        where: { shop }
      });

      if (!session) {
        return null;
      }

      const shopMeta = await prisma.shopifyShop.findUnique({
        where: { shop }
      });

      return toTokenRecord(session, shopMeta);
    } catch {
      return null;
    }
  }

  async getHealthStatus(preferredShop?: string | null): Promise<ShopifyHealthStatus> {
    if (!this.isOAuthConfigured()) {
      return {
        shopifyConfigured: false,
        connectedShop: preferredShop || null,
        webhooks: false,
        apiStatus: "not_configured"
      };
    }

    const normalizedShop = preferredShop ? normalizeShopDomain(preferredShop) : null;
    const tokenRecord =
      (normalizedShop ? await this.getShopByDomain(normalizedShop) : null) ||
      (await this.getPrimaryShop());

    if (!tokenRecord) {
      return {
        shopifyConfigured: false,
        connectedShop: normalizedShop,
        webhooks: false,
        apiStatus: "not_installed"
      };
    }

    return {
      shopifyConfigured: !tokenRecord.reauthorizeRequired,
      connectedShop: tokenRecord.shop,
      webhooks: tokenRecord.webhookStatus === "registered",
      apiStatus: tokenRecord.reauthorizeRequired ? "reauthorize_required" : "connected"
    };
  }

  createInstallUrl(rawShop: string, state: string): string {
    const shop = normalizeShopDomain(rawShop);
    if (!shop) {
      throw new Error("Invalid Shopify shop domain.");
    }

    if (!this.isOAuthConfigured()) {
      throw new Error(`Missing Shopify OAuth config: ${this.getMissingOAuthEnv().join(", ")}`);
    }

    const query = buildQueryString({
      client_id: shopifyApiKey(),
      scope: shopifyScopes(),
      redirect_uri: `${shopifyAppUrl()}/auth/callback`,
      state
    });

    return `https://${shop}/admin/oauth/authorize?${query}`;
  }

  validateOAuthCallbackState(cookieState: string | undefined, queryState: string): void {
    if (!cookieState || !queryState || cookieState !== queryState) {
      throw new Error("Invalid Shopify OAuth state");
    }
  }

  validateOAuthCallbackHmac(callbackUrl: string): { shop: string; code: string; host: string } {
    const url = new URL(callbackUrl);
    const params = url.searchParams;
    const shop = normalizeShopDomain(params.get("shop") || "");
    const code = params.get("code") || "";
    const hmac = params.get("hmac") || "";
    const host = params.get("host") || "";

    if (!shop || !code || !hmac) {
      throw new Error("Missing Shopify OAuth callback parameters.");
    }

    const expectedHmac = createQueryHmac(params);
    if (expectedHmac !== hmac) {
      throw new Error("Invalid Shopify OAuth HMAC.");
    }

    return { shop, code, host };
  }

  async exchangeCodeForToken(params: { shop: string; code: string }): Promise<{ accessToken: string; scope: string }> {
    const tokenResponse = await fetch(`https://${params.shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: shopifyApiKey(),
        client_secret: shopifyApiSecret(),
        code: params.code
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

    return {
      accessToken: tokenData.access_token,
      scope: tokenData.scope || shopifyScopes()
    };
  }

  async saveAuthorizedShop(params: { shop: string; accessToken: string; scope: string }): Promise<void> {
    await prisma.shopifySession.upsert({
      where: { shop: params.shop },
      update: {
        accessToken: params.accessToken
      },
      create: {
        shop: params.shop,
        accessToken: params.accessToken
      }
    });

    await prisma.shopifyShop.upsert({
      where: { shop: params.shop },
      update: {
        accessToken: params.accessToken,
        scope: params.scope,
        installedAt: new Date(),
        reauthorizeRequired: false
      },
      create: {
        shop: params.shop,
        accessToken: params.accessToken,
        scope: params.scope,
        installedAt: new Date(),
        reauthorizeRequired: false
      }
    });
  }

  async handleOAuthCallback(callbackUrl: string): Promise<{ shop: string; redirectUrl: string; webhooksRegistered: boolean }> {
    const validated = this.validateOAuthCallbackHmac(callbackUrl);
    const token = await this.exchangeCodeForToken({
      shop: validated.shop,
      code: validated.code
    });

    await this.saveAuthorizedShop({
      shop: validated.shop,
      accessToken: token.accessToken,
      scope: token.scope
    });

    let webhooksRegistered = false;
    try {
      await this.registerWebhooks(validated.shop, token.accessToken);
      webhooksRegistered = true;
    } catch (error) {
      await prisma.shopifyShop.update({
        where: { shop: validated.shop },
        data: {
          webhookStatus: "failed",
          webhookTopics: "",
          reauthorizeRequired: false
        }
      });
      throw error;
    }

    const redirectQuery = new URLSearchParams();
    redirectQuery.set("shop", validated.shop);
    if (validated.host) {
      redirectQuery.set("host", validated.host);
    }
    redirectQuery.set("embedded", "1");
    redirectQuery.set("shopify_oauth", "success");

    return {
      shop: validated.shop,
      redirectUrl: `${shopifyAppUrl()}/?${redirectQuery.toString()}`,
      webhooksRegistered
    };
  }

  async registerWebhooks(shop: string, accessToken: string): Promise<void> {
    const callbackUrl = `${shopifyAppUrl()}/webhooks/shopify`;
    const topics = ["APP_UNINSTALLED", "PRODUCTS_CREATE", "PRODUCTS_UPDATE", "ORDERS_CREATE"];

    for (const topic of topics) {
      await registerWebhookTopic(shop, accessToken, topic, callbackUrl);
    }

    await prisma.shopifyShop.update({
      where: { shop },
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

    const digest = crypto.createHmac("sha256", shopifyApiSecret()).update(rawBody).digest("base64");
    const digestBuffer = Buffer.from(digest);
    const signatureBuffer = Buffer.from(signature);

    if (digestBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
      throw new Error("Invalid Shopify webhook HMAC.");
    }

    return {
      topic,
      shop,
      payload: JSON.parse(rawBody.toString("utf8")) as unknown
    };
  }

  async handleWebhook(payload: ShopifyWebhookPayload): Promise<void> {
    if (payload.topic === "APP_UNINSTALLED") {
      await prisma.shopifyShop.updateMany({
        where: { shop: payload.shop },
        data: {
          reauthorizeRequired: true,
          webhookStatus: "uninstalled"
        }
      });
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

    return `${shopifyAppUrl()}/auth/shopify?shop=${encodeURIComponent(normalizedShop)}`;
  }
}

export const shopifyAuthService = new ShopifyAuthService();
