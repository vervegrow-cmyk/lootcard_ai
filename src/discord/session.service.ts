import { CurrentOrderDraft, FlowMode, HermesMemory } from "../types";

export class SessionService {
  resolveFlowMode(memory: HermesMemory, draft?: CurrentOrderDraft | null): FlowMode {
    if (memory.flowMode && memory.flowMode !== "IDLE") {
      return memory.flowMode;
    }

    if (!draft) {
      return "IDLE";
    }

    if (
      draft.stage === "draft_options" ||
      draft.stage === "option_selected" ||
      draft.stage === "image_generated" ||
      draft.stage === "waiting_confirmation"
    ) {
      return "AI_CARD_ORDER";
    }

    return "IDLE";
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
