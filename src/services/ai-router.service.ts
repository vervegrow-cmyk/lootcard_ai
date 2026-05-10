export type TaskType = "text_chat" | "image_generation" | "shopify_product_create";

export interface ShopifyProductRequest {
  title: string;
  price?: number;
  description?: string;
}

export interface AiRouteResult {
  taskType: TaskType;
  intent?: "create_ai_card" | "create_shopify_product_link" | "general_chat";
  targetAgent: "image-generator" | "shopify" | "customer-service";
  targetSkill: "generate-image" | "create-shopify-product" | "answer-faq";
}

const IMAGE_GENERATION_INTENTS = [
  "生成图",
  "画图",
  "生成图片",
  "做卡牌",
  "卡牌设计",
  "生成头像",
  "ai绘图",
  "midjourney",
  "人造人18号",
  "人造人十八号",
  "人造人十八",
  "封面图",
  "生成方案",
  "做个图",
  "做图",
  "出图",
  "帮我做个图",
  "设计图",
  "预览图",
  "卡牌图",
  "海报",
  "logo",
  "主图",
  "包装图",
  "黑金ssr",
  "头像",
  "i want a new beautiful girl card",
  "make me a beautiful girl card",
  "create a girl trading card",
  "generate anime girl card",
  "make a card",
  "new card",
  "beautiful girl card",
  "sexy girl card",
  "goddess card",
  "waifu card",
  "anime card",
  "custom trading card",
  "make a lootcard",
  "generate card image",
  "give me a card picture",
  "i want a card design",
  "custom card",
  "trading card",
  "card design",
  "card picture",
  "girl trading card",
  "generate image",
  "image"
];

const SHOPIFY_CREATE_INTENTS = [
  "shopify链接",
  "shopify 链接",
  "产品链接",
  "商品链接",
  "下单链接",
  "购买链接",
  "支付链接",
  "付款链接",
  "创建商品",
  "创建产品",
  "我要下单",
  "shopify link",
  "product link",
  "checkout link",
  "payment link",
  "create product",
  "create item"
];

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function cleanTitle(value: string): string {
  return value
    .replace(/\s*的?\s*shopify.*$/i, "")
    .replace(/\s*的?\s*(商品|产品|链接).*$/i, "")
    .replace(/\s*(价格|price)\s*[:：=]?\s*.*$/i, "")
    .trim();
}

function normalizeText(message: string): string {
  return message.toLowerCase().trim();
}

function isImageGenerationIntent(message: string): boolean {
  const lower = normalizeText(message);
  return includesAny(lower, IMAGE_GENERATION_INTENTS.map((item) => item.toLowerCase()));
}

function isShopifyCreateIntent(message: string): boolean {
  const lower = normalizeText(message);
  return includesAny(lower, SHOPIFY_CREATE_INTENTS.map((item) => item.toLowerCase()));
}

export class AiRouterService {
  detectRoute(message: string): AiRouteResult {
    if (isImageGenerationIntent(message)) {
      if (/[a-z]/i.test(message) && /(beautiful girl card|anime card|custom trading card|lootcard|card design|card picture|girl trading card|waifu|goddess)/i.test(message)) {
        console.log("[AI ROUTER] matched ai_card_order_en");
      } else {
        console.log("[AI ROUTER] matched image_generation");
      }
      return {
        taskType: "image_generation",
        intent: "create_ai_card",
        targetAgent: "image-generator",
        targetSkill: "generate-image"
      };
    }

    if (isShopifyCreateIntent(message)) {
      return {
        taskType: "shopify_product_create",
        intent: "create_shopify_product_link",
        targetAgent: "shopify",
        targetSkill: "create-shopify-product"
      };
    }

    return {
      taskType: "text_chat",
      intent: "general_chat",
      targetAgent: "customer-service",
      targetSkill: "answer-faq"
    };
  }

  detectTaskType(message: string): TaskType {
    return this.detectRoute(message).taskType;
  }

  extractShopifyProductRequest(message: string): ShopifyProductRequest {
    const trimmed = message.trim();

    const cnMatch =
      trimmed.match(/商品名(?:为|是)?\s*["“”]?(.+?)["“”]?(?=(?:的?\s*(?:shopify|商品|产品|链接)|$))/i) ||
      trimmed.match(/产品名(?:为|是)?\s*["“”]?(.+?)["“”]?(?=(?:的?\s*(?:shopify|商品|产品|链接)|$))/i) ||
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
