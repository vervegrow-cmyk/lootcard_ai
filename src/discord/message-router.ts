import { AiRouteResult } from "../services/ai-router.service";
import { CurrentOrderDraft, FlowMode, LanguagePreference } from "../types";
import { sessionService } from "./session.service";

export type FlowAction =
  | "confirm"
  | "modify"
  | "regenerate"
  | "select_option"
  | "checkout_link"
  | "product_link"
  | "stay_in_flow"
  | "start_ai_card_order"
  | "pass_through"
  | "reset_flow"
  | "switch_language"
  | "reset_and_restart";

export interface FlowRouteResult {
  flowMode: FlowMode;
  action: FlowAction;
  selectedOption?: "A" | "B" | "C";
  handledByFlow: boolean;
  language?: LanguagePreference;
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function isConfirmation(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  const matched =
    normalized === "1" ||
    hasAny(normalized, [
      "ok",
      "yes",
      "confirm",
      "确认",
      "下单",
      "buy",
      "checkout",
      "order",
      "go",
      "place order",
      "create product",
      "generate shopify link",
      "make shopify link"
    ]);

  if (matched && /^(ok|yes|confirm|go|buy|checkout|order|place order|create product|generate shopify link|make shopify link|1)$/i.test(normalized)) {
    console.log("[ORDER_FLOW] english confirm matched");
  }

  return matched;
}

function isModification(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    normalized === "2" ||
    hasAny(normalized, ["modify", "edit", "修改", "改一下", "换颜色", "更暗黑", "加金边", "再高级一点", "做成赛博朋克"])
  );
}

function isRegenerate(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized === "3" || hasAny(normalized, ["retry", "again", "regenerate", "重新生成"]);
}

function isCheckoutLink(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return hasAny(normalized, ["付款链接", "结账链接", "checkout", "cart", "直接付款", "payment link"]);
}

function isProductLink(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return hasAny(normalized, ["产品链接", "商品链接", "产品页面", "发我链接", "我要产品链接", "product link"]);
}

function detectSelection(text: string, draft?: CurrentOrderDraft | null): "A" | "B" | "C" | null {
  if (!draft || draft.stage !== "draft_options") {
    return null;
  }

  const normalized = text.trim().toUpperCase();
  if (normalized === "A" || normalized === "B" || normalized === "C") {
    return normalized;
  }

  const optionMatch = normalized.match(/^OPTION\s+([ABC])$/);
  return optionMatch?.[1] as "A" | "B" | "C" | null;
}

export class MessageRouter {
  route(params: {
    message: string;
    flowMode: FlowMode;
    draft?: CurrentOrderDraft | null;
    aiRoute: AiRouteResult;
  }): FlowRouteResult {
    const { message, flowMode, draft, aiRoute } = params;
    const selected = detectSelection(message, draft);
    const languageSwitch = sessionService.detectLanguageSwitch(message);

    if (flowMode !== "IDLE") {
      if (languageSwitch) {
        return { flowMode, action: "switch_language", handledByFlow: true, language: languageSwitch };
      }

      if (sessionService.isResetRequest(message)) {
        console.log("[SESSION] reset by user");
        return { flowMode, action: "reset_flow", handledByFlow: true };
      }

      if (sessionService.isNewRequestWhileLocked(message)) {
        console.log("[SESSION] new card request overrides current flow");
        console.log("[SESSION] reset current draft");
        return { flowMode: "IDLE", action: "reset_and_restart", handledByFlow: true };
      }

      if (flowMode === "AI_CARD_ORDER") {
        if (selected) {
          return {
            flowMode,
            action: "select_option",
            selectedOption: selected,
            handledByFlow: true
          };
        }

        if (isCheckoutLink(message)) {
          return { flowMode, action: "checkout_link", handledByFlow: true };
        }

        if (isProductLink(message) || isConfirmation(message)) {
          return { flowMode, action: "confirm", handledByFlow: true };
        }

        if (isModification(message)) {
          return { flowMode, action: "modify", handledByFlow: true };
        }

        if (isRegenerate(message)) {
          return { flowMode, action: "regenerate", handledByFlow: true };
        }

        return { flowMode, action: "stay_in_flow", handledByFlow: true };
      }

      if (flowMode === "SHOPIFY_CHECKOUT") {
        if (isCheckoutLink(message)) {
          return { flowMode, action: "checkout_link", handledByFlow: true };
        }

        if (isProductLink(message) || isConfirmation(message)) {
          return { flowMode, action: "confirm", handledByFlow: true };
        }

        return { flowMode, action: "pass_through", handledByFlow: false };
      }
    }

    if (aiRoute.taskType === "image_generation") {
      return {
        flowMode: "AI_CARD_ORDER",
        action: "start_ai_card_order",
        handledByFlow: true
      };
    }

    return {
      flowMode,
      action: "pass_through",
      handledByFlow: false
    };
  }
}

export const messageRouter = new MessageRouter();
