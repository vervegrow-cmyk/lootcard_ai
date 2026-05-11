import { CurrentOrderDraft, FlowMode, HermesMemory, LanguagePreference } from "../types";

const AI_CARD_ORDER_TIMEOUT_MS = 30 * 60 * 1000;

function isActiveAiCardStage(stage?: string | null): boolean {
  return stage === "draft_options" || stage === "option_selected" || stage === "image_generated" || stage === "waiting_confirmation";
}

export class SessionService {
  resolveFlowMode(memory: HermesMemory, draft?: CurrentOrderDraft | null): FlowMode {
    if (memory.flowMode && memory.flowMode !== "IDLE") {
      return memory.flowMode;
    }

    if (!draft) {
      return "IDLE";
    }

    return isActiveAiCardStage(draft.stage) ? "AI_CARD_ORDER" : "IDLE";
  }

  detectLanguageSwitch(message: string): LanguagePreference | null {
    const lower = message.toLowerCase();

    if (/我要英文回复|请用英文回复|英文回复/.test(message) || lower.includes("english please") || lower.includes("reply in english") || lower.includes("use english")) {
      return "en";
    }

    if (/我要中文回复|请用中文回复|中文回复/.test(message) || lower.includes("use chinese") || lower.includes("reply in chinese")) {
      return "zh";
    }

    return null;
  }

  detectMessageLanguage(message: string): LanguagePreference {
    const lower = message.trim().toLowerCase();

    if (/[\u4e00-\u9fff]/.test(message)) {
      return "zh";
    }

    if (
      /^(hello|hi|hey)\b/.test(lower) ||
      /\bi want\b/.test(lower) ||
      /\bnew card\b/.test(lower) ||
      /\bbeautiful girl card\b/.test(lower) ||
      /\bcancel\b/.test(lower) ||
      /\bpayment link\b/.test(lower) ||
      /\bproduct link\b/.test(lower) ||
      /[a-z]/i.test(message)
    ) {
      return "en";
    }

    return "en";
  }

  isResetRequest(message: string): boolean {
    const lower = message.trim().toLowerCase();
    return /取消|重新开始|新卡牌/.test(message) || lower === "cancel" || lower === "exit" || lower === "reset" || lower === "start over";
  }

  isNewRequestWhileLocked(message: string): boolean {
    const lower = message.trim().toLowerCase();

    return (
      /给我|新卡牌|美女卡牌|黑金SSR|10张|我要英文回复/.test(message) ||
      lower.includes("start over") ||
      lower.includes("i want") ||
      lower.includes("create") ||
      lower.includes("generate") ||
      lower.includes("new card") ||
      lower.includes("beautiful girl card") ||
      lower.includes("sexy girl card") ||
      lower.includes("goddess card") ||
      lower.includes("waifu card") ||
      lower.includes("girl card") ||
      lower.includes("anime card") ||
      lower.includes("custom trading card") ||
      lower.includes("i want a new") ||
      lower.includes("make me a") ||
      lower.includes("give me a card picture") ||
      lower.includes("i want a card design") ||
      lower.includes("black gold ssr") ||
      /\b10\b/.test(lower)
    );
  }

  isGreeting(message: string): boolean {
    const lower = message.trim().toLowerCase();
    return ["hello", "hi", "hey", "你好", "您好"].includes(lower);
  }

  isTimedOutDraft(draft?: CurrentOrderDraft | null): boolean {
    if (!draft || !isActiveAiCardStage(draft.stage) || !draft.lastActiveAt) {
      return false;
    }

    const lastActiveAt = Date.parse(draft.lastActiveAt);
    if (Number.isNaN(lastActiveAt)) {
      return false;
    }

    return Date.now() - lastActiveAt > AI_CARD_ORDER_TIMEOUT_MS;
  }

  lockAiCardOrder(): FlowMode {
    return "AI_CARD_ORDER";
  }

  lockShopifyCheckout(): FlowMode {
    return "SHOPIFY_CHECKOUT";
  }

  reset(): FlowMode {
    return "IDLE";
  }
}

export const sessionService = new SessionService();
