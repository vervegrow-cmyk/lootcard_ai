import { ShopifyProductDraft, ShopifyProductResult } from "../types";
import { shopifyAuthService } from "./shopify-auth.service";
import { createShopifyProductGraphql } from "./shopify/createProduct";

export interface CreateShopifyProductInput {
  title?: string;
  description?: string;
  price?: number;
  tags?: string[];
  shop?: string;
}

export interface CreateShopifyProductOutput {
  ok: boolean;
  productId?: string;
  variantId?: string;
  handle?: string;
  productUrl?: string;
  adminUrl?: string;
  price?: number;
  title?: string;
  shop?: string;
  reauthorizeUrl?: string;
  missing?: string[];
  error?: string;
}

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function shopifyApiVersion(): string {
  return env("SHOPIFY_API_VERSION") || "2026-04";
}

function defaultPrice(): number {
  const parsed = Number(process.env.DEFAULT_CARD_PRICE || "29.99");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 29.99;
}

function defaultTags(): string[] {
  return ["custom-card", "ai-card", "discord-order", "lootcard"];
}

function htmlDescription(input?: string): string {
  return (
    input?.trim() ||
    [
      "Custom-made AI trading card by LootCard AI.",
      "Production and delivery usually takes about 30 days.",
      "Final design will follow the confirmed Discord conversation."
    ].join("<br><br>")
  );
}

export function isShopifyConfigured(): boolean {
  return shopifyAuthService.isOAuthConfigured();
}

export class ShopifyService {
  isShopifyConfigured(): boolean {
    return isShopifyConfigured();
  }

  async getShopifyToken(shop?: string): Promise<{ shop: string; accessToken: string } | null> {
    const shopRecord =
      (shop ? await shopifyAuthService.getShopByDomain(shop) : null) ||
      (await shopifyAuthService.getPrimaryShop());

    if (!shopRecord || shopRecord.reauthorizeRequired) {
      return null;
    }

    console.log("[Shopify OAuth Token Loaded]", shopRecord.shop);
    return {
      shop: shopRecord.shop,
      accessToken: shopRecord.accessToken
    };
  }

  async createShopifyProduct(input: CreateShopifyProductInput): Promise<CreateShopifyProductOutput> {
    if (!shopifyAuthService.isOAuthConfigured()) {
      return {
        ok: false,
        missing: shopifyAuthService.getMissingOAuthEnv(),
        error: `Shopify OAuth is not configured. Missing: ${shopifyAuthService.getMissingOAuthEnv().join(", ")}`
      };
    }

    const tokenContext = await this.getShopifyToken(input.shop);
    const shopRecord =
      (input.shop ? await shopifyAuthService.getShopByDomain(input.shop) : null) ||
      (await shopifyAuthService.getPrimaryShop());

    if (!shopRecord || !tokenContext) {
      return {
        ok: false,
        missing: ["installed_shop"],
        error: "No installed Shopify shop was found. Open the embedded app in Shopify Admin to complete OAuth installation first."
      };
    }

    if (shopRecord.reauthorizeRequired) {
      const reauthorizeUrl = await shopifyAuthService.markShopForReauthorization(shopRecord.shop);
      return {
        ok: false,
        shop: shopRecord.shop,
        reauthorizeUrl,
        error: "The connected Shopify shop requires reauthorization."
      };
    }

    const title = input.title?.trim() || "Custom AI Trading Card";
    const description = htmlDescription(input.description);
    const price = input.price ?? defaultPrice();
    const tags = input.tags?.length ? input.tags : defaultTags();

    console.log("[Shopify Product Create Start]", {
      shop: shopRecord.shop,
      title,
      price,
      tags
    });

    try {
      const created = await createShopifyProductGraphql({
        shop: shopRecord.shop,
        accessToken: tokenContext.accessToken,
        apiVersion: shopifyApiVersion(),
        title,
        descriptionHtml: description,
        price,
        tags
      });

      if (!created.ok && /401|403|Reauthorization/i.test(created.error || "")) {
        const reauthorizeUrl = await shopifyAuthService.markShopForReauthorization(shopRecord.shop);
        return {
          ok: false,
          shop: shopRecord.shop,
          reauthorizeUrl,
          error: `Shopify token is no longer valid for ${shopRecord.shop}. Reauthorization is required.`
        };
      }
      if (created.productUrl) {
        console.log("[Shopify Product URL]", created.productUrl);
      }
      console.log("[Shopify Product Create Result]", created);
      return {
        ...created,
        shop: shopRecord.shop
      };
    } catch (error) {
      console.log("[Shopify Product Create Result]", error);
      return {
        ok: false,
        shop: shopRecord.shop,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async createProduct(product: ShopifyProductDraft): Promise<ShopifyProductResult> {
    const result = await this.createShopifyProduct({
      title: product.title,
      description: product.description,
      price: Number(product.price || defaultPrice()),
      tags: product.tags
    });

    if (!result.ok || !result.productId || !result.handle || !result.productUrl) {
      throw new Error(result.error || "SHOPIFY_CREATE_FAILED");
    }

    return {
      id: result.productId,
      handle: result.handle,
      url: result.productUrl,
      title: result.title || product.title,
      price: String(result.price ?? product.price),
      sku: product.sku
    };
  }
}

export const shopifyService = new ShopifyService();
