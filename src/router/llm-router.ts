import { LanguagePreference } from "../types";

export type RouterIntent =
  | "CREATE_DIY_CARD"
  | "SEARCH_GALLERY"
  | "CONFIRM_SELECTION"
  | "MODIFY_DESIGN"
  | "REGENERATE"
  | "CREATE_SHOPIFY_PRODUCT"
  | "CHECK_ORDER"
  | "GET_PRODUCT_LINK"
  | "GET_PAYMENT_LINK"
  | "CANCEL"
  | "GENERAL_HELP";

export type RouterFlow = "IDLE" | "DIY_CARD_FLOW" | "GALLERY_SEARCH_FLOW" | "ORDER_FLOW";

export interface RouterEntities {
  selectionId?: string | null;
  galleryCount?: number | null;
  keywords?: string[];
}

export interface RouterResult {
  intent: RouterIntent;
  flow: RouterFlow;
  language: LanguagePreference;
  entities: RouterEntities;
}

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function detectLanguage(message: string, fallback: LanguagePreference): LanguagePreference {
  const trimmed = message.trim();
  if (!trimmed) {
    return fallback;
  }
  if (/^(a|b|c|\d+)$/i.test(trimmed)) {
    return fallback;
  }
  return hasChinese(trimmed) ? "zh" : "en";
}

function isCancel(message: string): boolean {
  return /^(cancel|reset|exit|start over|取消|重新开始)$/i.test(message.trim());
}

function detectSelection(message: string): string | null {
  const trimmed = message.trim().toUpperCase();
  if (/[ABC]/.test(trimmed) && trimmed.length === 1) {
    return trimmed;
  }
  // Number selection is reserved for Gallery flow (1-10), not DIY.
  return null;
}

function isConfirm(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return ["1", "confirm", "yes", "ok", "go", "checkout", "buy", "确认", "下单"].includes(normalized);
}

function isRegenerate(message: string): boolean {
  return /^(3|regenerate|retry|again|重新生成|再来几个方案)$/i.test(message.trim());
}

function isModify(message: string): boolean {
  return /^(2|modify|edit|change|修改|改一下)$/i.test(message.trim());
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export class LlmRouter {
  route(input: {
    message: string;
    currentFlow: RouterFlow;
    fallbackLanguage: LanguagePreference;
  }): RouterResult {
    const { message, currentFlow, fallbackLanguage } = input;
    const trimmed = message.trim();
    const lower = trimmed.toLowerCase();
    const language = detectLanguage(trimmed, fallbackLanguage);

    if (isCancel(trimmed)) {
      return { intent: "CANCEL", flow: "IDLE", language, entities: {} };
    }

    const selection = detectSelection(trimmed);
    if (selection) {
      return {
        intent: "CONFIRM_SELECTION",
        flow: currentFlow,
        language,
        entities: { selectionId: selection }
      };
    }

    if (isConfirm(trimmed)) {
      return { intent: "CREATE_SHOPIFY_PRODUCT", flow: currentFlow, language, entities: {} };
    }

    if (isModify(trimmed)) {
      return { intent: "MODIFY_DESIGN", flow: currentFlow, language, entities: {} };
    }

    if (isRegenerate(trimmed)) {
      return { intent: "REGENERATE", flow: currentFlow, language, entities: {} };
    }

    const gallerySignals = ["10", "show me", "gallery", "cards", "card set", "十张", "10张"];
    if (containsAny(lower, gallerySignals) || /10\s*(cards|images)/i.test(trimmed)) {
      return {
        intent: "SEARCH_GALLERY",
        flow: "GALLERY_SEARCH_FLOW",
        language,
        entities: { galleryCount: 10 }
      };
    }

    const orderSignals = ["check order", "my order", "订单", "查询", "payment link", "付款链接", "产品链接", "product link"];
    if (containsAny(lower, orderSignals) || /付款链接|产品链接|订单|查询/.test(trimmed)) {
      return { intent: "CHECK_ORDER", flow: "ORDER_FLOW", language, entities: {} };
    }

    const diySignals = [
      "card",
      "trading card",
      "anime",
      "girl",
      "black gold",
      "ssr",
      "character",
      "waifu",
      "mecha",
      "cyberpunk",
      "new girl",
      "卡",
      "卡牌",
      "美女",
      "女角色",
      "黑金",
      "动漫",
      "机甲",
      "赛博"
    ];

    if (trimmed.length >= 6 && containsAny(lower, diySignals)) {
      return { intent: "CREATE_DIY_CARD", flow: "DIY_CARD_FLOW", language, entities: {} };
    }

    return { intent: "GENERAL_HELP", flow: "IDLE", language, entities: {} };
  }
}

export const llmRouter = new LlmRouter();
