import { ShopifyProductDraft, ShopifyProductResult } from "../types";

export interface CreateShopifyProductInput {
  title?: string;
  description?: string;
  price?: number;
  tags?: string[];
}

export interface CreateShopifyProductOutput {
  ok: boolean;
  productId?: string;
  handle?: string;
  productUrl?: string;
  adminUrl?: string;
  price?: number;
  title?: string;
  error?: string;
}

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function defaultPrice(): number {
  const parsed = Number(process.env.DEFAULT_CARD_PRICE || "29.99");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 29.99;
}

function defaultTags(): string[] {
  return ["custom-card", "ai-card", "discord-order", "lootcard"];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isShopifyConfigured(): boolean {
  return Boolean(env("SHOPIFY_STORE_DOMAIN") && env("SHOPIFY_ADMIN_ACCESS_TOKEN"));
}

export class ShopifyService {
  isShopifyConfigured(): boolean {
    return isShopifyConfigured();
  }

  async createShopifyProduct(input: CreateShopifyProductInput): Promise<CreateShopifyProductOutput> {
    const storeDomain = env("SHOPIFY_STORE_DOMAIN");
    const accessToken = env("SHOPIFY_ADMIN_ACCESS_TOKEN");
    const apiVersion = env("SHOPIFY_API_VERSION") || "2026-04";

    if (!storeDomain || !accessToken) {
      const missing = [
        !storeDomain ? "SHOPIFY_STORE_DOMAIN" : "",
        !accessToken ? "SHOPIFY_ADMIN_ACCESS_TOKEN" : ""
      ].filter(Boolean);

      return {
        ok: false,
        error: `Shopify is not configured. Missing: ${missing.join(", ")}`
      };
    }

    const title = input.title?.trim() || "Custom AI Trading Card";
    const description =
      input.description?.trim() ||
      "Custom-made AI trading card by LootCard AI.<br><br>Production and delivery usually takes about 30 days.<br><br>Final design will follow the confirmed Discord conversation.";
    const price = input.price ?? defaultPrice();
    const tags = input.tags?.length ? input.tags : defaultTags();
    const endpoint = `https://${storeDomain}/admin/api/${apiVersion}/products.json`;

    const payload = {
      product: {
        title,
        body_html: description,
        vendor: "LootCard AI",
        product_type: "Custom AI Card",
        status: "active",
        tags: tags.join(","),
        variants: [
          {
            price: price.toFixed(2),
            inventory_management: null,
            taxable: true
          }
        ]
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const rawText = await response.text();
      if (!response.ok) {
        return {
          ok: false,
          error: `Shopify create product failed: ${response.status} ${rawText}`
        };
      }

      const data = JSON.parse(rawText) as {
        product?: {
          id?: number | string;
          handle?: string;
          admin_graphql_api_id?: string;
        };
      };

      const handle = data.product?.handle || slugify(title);
      const productId = String(data.product?.id || "");
      const productUrl = `https://${storeDomain}/products/${handle}`;
      const adminUrl = productId
        ? `https://${storeDomain}/admin/products/${productId}`
        : `https://${storeDomain}/admin/products`;

      return {
        ok: true,
        productId,
        handle,
        productUrl,
        adminUrl,
        price,
        title
      };
    } catch (error) {
      return {
        ok: false,
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
