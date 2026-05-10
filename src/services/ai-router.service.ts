export type TaskType = "text_chat" | "image_generation" | "shopify_product_create";

export interface ShopifyProductRequest {
  title: string;
  price?: number;
  description?: string;
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function cleanTitle(value: string): string {
  return value
    .replace(/\s*的?\s*shopify.*$/i, "")
    .replace(/\s*的?\s*(商品|产品|链接).*$/i, "")
    .replace(/\s*(价格|price)\s*[:：=].*$/i, "")
    .trim();
}

export class AiRouterService {
  detectTaskType(message: string): TaskType {
    const lower = message.toLowerCase();

    if (
      includesAny(lower, [
        "generate image",
        "image",
        "poster",
        "logo",
        "main image",
        "packaging image"
      ]) ||
      /生成图片|做个图|做图|生成图|出图|画图|设计图|帮我做个图|卡牌图|海报|logo|主图|包装图/.test(message)
    ) {
      console.log("[AI ROUTER] matched image_generation");
      return "image_generation";
    }

    if (
      includesAny(lower, [
        "shopify link",
        "product link",
        "checkout link",
        "payment link",
        "create product",
        "create item"
      ]) ||
      /Shopify链接|shopify链接|产品链接|商品链接|下单链接|购买链接|支付链接|付款链接|创建商品|创建产品/.test(message)
    ) {
      return "shopify_product_create";
    }

    return "text_chat";
  }

  extractShopifyProductRequest(message: string): ShopifyProductRequest {
    const trimmed = message.trim();

    const cnMatch =
      trimmed.match(/商品名(?:为|是)?\s*["“]?(.+?)["”]?(?=(?:的?\s*(?:shopify|商品|产品|链接)|$))/i) ||
      trimmed.match(/产品名(?:为|是)?\s*["“]?(.+?)["”]?(?=(?:的?\s*(?:shopify|商品|产品|链接)|$))/i) ||
      trimmed.match(/帮我创建(?:一个)?(.+?)(?:链接|商品|产品)(?:，|,|。|$)/i) ||
      trimmed.match(/给我(?:一个)?(.+?)(?:shopify|商品|产品)链接/i) ||
      trimmed.match(/创建(?:一个)?(.+?)(?:链接|商品|产品)(?:，|,|。|$)/i);

    const enMatch =
      trimmed.match(/product\s+name\s*(?:is|=|:)?\s*["']?([^"']+?)["']?(?:\s+shopify|\s+product|\s+link)?$/i) ||
      trimmed.match(/create\s+(?:a\s+)?product\s+(?:named|called)\s*["']?([^"']+?)["']?$/i);

    const priceMatch =
      trimmed.match(/价格\s*[:：]?\s*(\d+(?:\.\d{1,2})?)/i) ||
      trimmed.match(/price\s*[:=]?\s*(\d+(?:\.\d{1,2})?)/i);

    const rawTitle = cnMatch?.[1] || enMatch?.[1] || "";
    const price = priceMatch?.[1] ? Number(priceMatch[1]) : undefined;

    return {
      title: cleanTitle(rawTitle) || "Custom AI Trading Card",
      price: Number.isFinite(price as number) && (price as number) > 0 ? price : undefined,
      description: "Custom product created from Discord order request."
    };
  }
}

export const aiRouterService = new AiRouterService();
