import { ShippingType, ShopifyProductDraft, ShopifyProductResult } from "../types";
import { shopifyAuthService } from "./shopify-auth.service";
import { createShopifyProductGraphql, createShopifyProductRest } from "./shopify/createProduct";
import { storageService } from "./storage.service";

export interface CreateShopifyProductInput {
  title?: string;
  description?: string;
  price?: number;
  tags?: string[];
  shop?: string;
  vendor?: string;
  productType?: string;
  sku?: string;
  imageUrl?: string;
  seoTitle?: string;
  seoDescription?: string;
  shippingType?: ShippingType;
  inventoryQuantity?: number;
}

export interface CreateShopifyProductOutput {
  ok: boolean;
  productId?: string;
  variantId?: string;
  handle?: string;
  productUrl?: string;
  checkoutUrl?: string;
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

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function inferStyleLabel(tags: string[]): string {
  const normalizedTags = tags.join(" ").toLowerCase();

  if (normalizedTags.includes("signature") || normalizedTags.includes("signed")) {
    return "Limited Signature";
  }
  if (normalizedTags.includes("black-gold") || normalizedTags.includes("black gold")) {
    return "Black Gold";
  }
  if (normalizedTags.includes("ssr")) {
    return "SSR";
  }
  if (normalizedTags.includes("cyberpunk")) {
    return "Cyberpunk";
  }
  if (normalizedTags.includes("anime")) {
    return "Anime";
  }

  return "Custom";
}

function buildShareHeadline(title: string, tags: string[]): string {
  const styleLabel = inferStyleLabel(tags);
  return `${styleLabel} ${title} Trading Card`.replace(/\s+/g, " ").trim();
}

function buildShareDescription(params: {
  title: string;
  descriptionHtml: string;
  tags: string[];
  price: number;
}): string {
  const baseDescription = stripHtml(params.descriptionHtml);
  const style = params.tags
    .filter((tag) => tag && !["discord-order", "custom-card", "lootcard-ai", "lootcard"].includes(tag))
    .slice(0, 4)
    .join(", ");

  return `${params.title} by LootCard AI. ${style ? `Style: ${style}. ` : ""}Premium custom trading card ready to order at $${params.price.toFixed(2)}. ${baseDescription}`.trim();
}

function buildMarketingDescriptionHtml(params: {
  title: string;
  descriptionHtml: string;
  tags: string[];
  price: number;
}): string {
  const shareHeadline = buildShareHeadline(params.title, params.tags);
  const shareDescription = buildShareDescription(params);
  const highlights = params.tags
    .filter((tag) => tag && !["discord-order", "custom-card", "lootcard-ai", "lootcard"].includes(tag))
    .slice(0, 4)
    .join(" / ");

  return [
    params.descriptionHtml,
    "<hr />",
    `<h3>${shareHeadline}</h3>`,
    `<p>${shareDescription}</p>`,
    highlights ? `<p><strong>Collector Highlights:</strong> ${highlights}</p>` : "",
    `<p><strong>Price:</strong> $${params.price.toFixed(2)}</p>`,
    "<p><strong>Production:</strong> Made to order. Production and delivery usually takes about 30 days.</p>",
    "<p><strong>Share Preview:</strong> This product uses the generated card artwork as its product cover so Discord, WhatsApp, and Facebook shares display the actual card design.</p>"
  ]
    .filter(Boolean)
    .join("");
}

function inferSeoTitle(title: string, tags: string[]): string {
  return buildShareHeadline(title, tags);
}

function inferSeoDescription(params: {
  title: string;
  descriptionHtml: string;
  tags: string[];
  price: number;
}): string {
  return buildShareDescription(params);
}

function discordOrderDescription(input?: string): string {
  return (
    input?.trim() ||
    [
      "Custom product created from Discord order request.",
      "Production and delivery usually takes about 30 days.",
      "Final production follows the confirmed AI card design."
    ].join("<br><br>")
  );
}

function shouldUseRestFallback(error?: string): boolean {
  const message = (error || "").toLowerCase();
  return (
    message.includes("field is not defined") ||
    message.includes("unknown argument") ||
    message.includes("cannot query field") ||
    message.includes("productvariantsbulkinput")
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
    console.log("[SHOPIFY] loading session", shop || "primary");
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

    if (!input.imageUrl?.trim()) {
      return {
        ok: false,
        shop: shopRecord.shop,
        error: "缺少卡牌图，请先生成图片"
      };
    }

    const title = input.title?.trim() || "Custom AI Trading Card";
    const baseDescription = htmlDescription(input.description);
    const price = input.price ?? defaultPrice();
    const tags = input.tags?.length ? input.tags : defaultTags();
    const permanentImageUrl = input.imageUrl
      ? await storageService.ensurePermanentImageUrl(input.imageUrl)
      : undefined;
    const finalImageUrl = permanentImageUrl || input.imageUrl.trim();
    const description = buildMarketingDescriptionHtml({
      title,
      descriptionHtml: baseDescription,
      tags,
      price
    });
    const seoTitle = input.seoTitle?.trim() || inferSeoTitle(title, tags);
    const seoDescription = input.seoDescription?.trim() || inferSeoDescription({
      title,
      descriptionHtml: baseDescription,
      tags,
      price
    });

    console.log("[SHOPIFY] product create start", {
      shop: shopRecord.shop,
      title,
      price,
      tags,
      permanentImageUrl: finalImageUrl
    });

    try {
      const created = await createShopifyProductGraphql({
        shop: shopRecord.shop,
        accessToken: tokenContext.accessToken,
        apiVersion: shopifyApiVersion(),
        title,
        descriptionHtml: description,
        price,
        tags,
        vendor: input.vendor,
        productType: input.productType,
        sku: input.sku,
        imageUrl: finalImageUrl,
        seoTitle,
        seoDescription,
        shippingType: input.shippingType,
        inventoryQuantity: input.inventoryQuantity
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

      if (!created.ok && shouldUseRestFallback(created.error)) {
        console.log("[SHOPIFY] falling back to REST product create");
        const restCreated = await createShopifyProductRest({
          shop: shopRecord.shop,
          accessToken: tokenContext.accessToken,
          apiVersion: shopifyApiVersion(),
          title,
          descriptionHtml: description,
          price,
          tags,
          vendor: input.vendor,
          productType: input.productType,
          sku: input.sku,
          imageUrl: finalImageUrl,
          seoTitle,
          seoDescription,
          shippingType: input.shippingType,
          inventoryQuantity: input.inventoryQuantity
        });

        if (restCreated.productUrl) {
          console.log("[Shopify Product URL]", restCreated.productUrl);
        }
        console.log("[SHOPIFY] product created", restCreated);
        console.log("[Shopify Product Create Result]", restCreated);
        return {
          ...restCreated,
          shop: shopRecord.shop
        };
      }

      if (created.productUrl) {
        console.log("[Shopify Product URL]", created.productUrl);
      }
      if (created.variantId) {
        console.log(`[SHOPIFY] variantId=${created.variantId}`);
      }
      if (created.price !== undefined) {
        console.log(`[SHOPIFY] variant price set price=${created.price.toFixed(2)}`);
      }
      console.log("[SHOPIFY] product created", created);
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

  async createShopifyProductFromDiscord(input: {
    title?: string;
    price?: number;
    description?: string;
    shop?: string;
    imageUrl?: string;
    shippingType?: ShippingType;
    tags?: string[];
    seoTitle?: string;
    seoDescription?: string;
  }): Promise<CreateShopifyProductOutput> {
    return this.createShopifyProduct({
      shop: input.shop,
      title: input.title?.trim() || "Custom AI Trading Card",
      price: input.price ?? defaultPrice(),
      description: discordOrderDescription(input.description),
      vendor: "LootCard AI",
      productType: "Custom Product",
      tags: input.tags?.length ? input.tags : ["discord-order", "lootcard-ai"],
      sku: `DISCORD-${Date.now()}`,
      imageUrl: input.imageUrl,
      shippingType: input.shippingType,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      inventoryQuantity: 100
    });
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
