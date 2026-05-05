import { ShopifyProductDraft, ShopifyProductResult } from "../types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export class ShopifyService {
  async createProduct(product: ShopifyProductDraft): Promise<ShopifyProductResult> {
    const storeDomain = requireEnv("SHOPIFY_STORE_DOMAIN");
    const accessToken = requireEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
    const apiVersion = process.env.SHOPIFY_API_VERSION || "2025-10";
    const endpoint = `https://${storeDomain}/admin/api/${apiVersion}/products.json`;

    const payload = {
      product: {
        title: product.title,
        body_html: product.description,
        status: "active",
        product_type: "Custom Trading Card",
        tags: product.tags.join(","),
        variants: [
          {
            price: product.price,
            sku: product.sku
          }
        ]
      }
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify product creation failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      product: {
        id: number | string;
        handle?: string;
        title: string;
        variants?: Array<{ price?: string; sku?: string }>;
      };
    };

    const handle = data.product.handle || slugify(product.title);
    return {
      id: String(data.product.id),
      handle,
      url: `https://${storeDomain}/products/${handle}`,
      title: data.product.title,
      price: data.product.variants?.[0]?.price || product.price,
      sku: data.product.variants?.[0]?.sku || product.sku
    };
  }
}

export const shopifyService = new ShopifyService();
