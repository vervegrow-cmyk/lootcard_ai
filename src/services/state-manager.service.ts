import { CurrentOrderDraft, HermesMemory, ProjectStage, ShippingType } from "../types";

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export class StateManagerService {
  isPurchaseConfirmation(message: string): boolean {
    const text = message.trim().toLowerCase();
    return (
      text === "1" ||
      hasAny(text, ["生成下单链接", "确认并生成下单链接", "确认", "下单", "我要购买", "buy", "order"])
    );
  }

  wantsModification(message: string): boolean {
    const text = message.toLowerCase();
    return (
      text.trim() === "2" ||
      hasAny(text, [
        "修改a",
        "改一下",
        "换颜色",
        "更暗黑",
        "再高级一点",
        "加金边",
        "做成赛博朋克",
        "修改设计",
        "修改",
        "更酷",
        "更亮",
        "更暗",
        "cyberpunk",
        "revise",
        "change"
      ])
    );
  }

  wantsMoreOptions(message: string): boolean {
    const text = message.toLowerCase();
    return text.trim() === "3" || hasAny(text, ["再生成几个方案", "多几个方案", "再来几个", "more options", "more versions"]);
  }

  detectDraftSelection(message: string, draft?: CurrentOrderDraft | null): "A" | "B" | "C" | null {
    if (!draft || draft.stage !== "draft_options") {
      return null;
    }

    const trimmed = message.trim().toUpperCase();
    if (trimmed === "A" || trimmed === "B" || trimmed === "C") {
      return trimmed;
    }

    return null;
  }

  canCreateShopifyFromDraft(draft?: CurrentOrderDraft | null): boolean {
    return Boolean(
      draft &&
        (draft.stage === "image_generated" || draft.stage === "waiting_confirmation" || draft.stage === "shopify_created")
    );
  }

  inferShippingType(message: string, memory: HermesMemory): ShippingType {
    const text = `${message} ${memory.physical_card}`.toLowerCase();

    if (hasAny(text, ["digital", "download", "电子", "下载"])) {
      return "digital_download";
    }

    if (hasAny(text, ["us", "usa", "united states", "美国"])) {
      return "physical_card_us";
    }

    return "physical_card_cn";
  }

  nextStageAfterImage(): ProjectStage {
    return "waiting_confirmation";
  }
}

export const stateManagerService = new StateManagerService();
