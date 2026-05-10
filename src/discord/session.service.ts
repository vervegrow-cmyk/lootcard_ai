import { CurrentOrderDraft, FlowMode, HermesMemory } from "../types";

export class SessionService {
  resolveFlowMode(memory: HermesMemory, draft?: CurrentOrderDraft | null): FlowMode {
    if (memory.flowMode && memory.flowMode !== "IDLE") {
      return memory.flowMode;
    }

    if (!draft) {
      return "IDLE";
    }

    if (draft.stage === "shopify_created" || memory.currentStage === "payment_stage") {
      return "SHOPIFY_CHECKOUT";
    }

    return "AI_CARD_ORDER";
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
