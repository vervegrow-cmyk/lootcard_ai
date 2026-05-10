import { shopifyAgent } from "./shopify-agent";
import { HermesInput, HermesResult, ImageOption, LanguagePreference, ProjectContext } from "../types";

function t(language: LanguagePreference, zh: string, en: string): string {
  return language === "zh" ? zh : en;
}

function buildFallbackSelectedOption(input: HermesInput): ImageOption | null {
  if (!input.memory.currentPrompt) {
    return null;
  }

  return {
    id: input.memory.selectedOption || "A",
    title:
      input.memory.selectedOptionTitle ||
      (input.memory.language === "zh" ? "最终确认方案" : "Final confirmed concept"),
    imageUrl: input.memory.selectedImageUrl,
    prompt: input.memory.currentPrompt
  };
}

export class CommerceAgent {
  async confirmAndPrepareProduct(params: {
    input: HermesInput;
    activeProject: ProjectContext | null;
    selectedOption: ImageOption | null;
  }): Promise<HermesResult> {
    const { input, activeProject } = params;
    const language = input.memory.language;
    const selectedOption = params.selectedOption || buildFallbackSelectedOption(input);

    if (!selectedOption || !input.memory.currentPrompt) {
      return {
        intent: "create_shopify_product",
        action: "reply",
        stage: "selecting",
        language,
        reply: t(language, "你先确认一个最终图像方案，我再帮你生成下单链接。", "Please confirm a final image option first, then I can create the order link."),
        memory_update: {},
        prompt: input.memory.currentPrompt,
        image_options: [],
        selected_option: null,
        product: null
      };
    }

    if (!activeProject) {
      return {
        intent: "create_shopify_product",
        action: "reply",
        stage: "confirmed",
        language,
        reply: t(language, "我收到了确认，但当前项目还没准备好。你先让我重新整理一次图像方案。", "I received your confirmation, but the current project is not ready yet. Let me rebuild the image options first."),
        memory_update: {},
        prompt: input.memory.currentPrompt,
        image_options: [],
        selected_option: null,
        product: null
      };
    }

    const product = await shopifyAgent.createProductDraft({
      project: activeProject,
      selectedImage: selectedOption,
      quantity: input.memory.quantity,
      theme: input.memory.theme
    });

    return {
      intent: "create_shopify_product",
      action: "create_shopify_product",
      stage: "payment",
      language,
      reply: t(language, "好的，我现在为你生成 Shopify 下单链接。", "Great, I am creating your Shopify checkout link now."),
      memory_update: {
        flowMode: "SHOPIFY_CHECKOUT",
        stage: "payment",
        selectedOption: selectedOption.id,
        selectedOptionTitle: selectedOption.title,
        selectedImageUrl: selectedOption.imageUrl
      },
      prompt: input.memory.currentPrompt,
      image_options: [],
      selected_option: selectedOption,
      product,
      project: activeProject
    };
  }
}

export const commerceAgent = new CommerceAgent();
