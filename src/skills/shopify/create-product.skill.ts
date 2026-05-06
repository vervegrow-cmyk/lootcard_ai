import { shopifyAgent as legacyShopifyAgent } from "../../agents/shopify-agent";
import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

function defaultProduct() {
  return {
    title: "Custom AI Trading Card",
    description: [
      "Custom-made AI trading card by LootCard AI.",
      "Production and delivery usually takes about 30 days.",
      "Final design will follow the confirmed Discord conversation."
    ].join("\n"),
    price: process.env.DEFAULT_CARD_PRICE || "29.99",
    sku: `CARD-${Date.now()}`,
    tags: ["custom-card", "ai-card", "discord-order", "lootcard"]
  };
}

export class CreateProductSkill {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const hasDesignContext = Boolean(
      context.memory.currentPrompt?.trim() ||
        context.memory.selectedOptionTitle?.trim() ||
        context.memory.selectedDesignSummary?.trim() ||
        context.memory.theme?.trim()
    );

    const selectedImage = {
      id: context.memory.selectedOption || "DEFAULT",
      title: context.memory.selectedOptionTitle || context.memory.selectedDesignSummary || "Final Design",
      imageUrl: context.memory.selectedImageUrl,
      prompt: context.memory.currentPrompt
    };

    const project =
      context.project || {
        projectId: `memory-${context.discordUserId}`,
        status: "confirmed" as const,
        originalPrompt: context.message,
        currentPrompt: context.memory.currentPrompt
      };

    const product = hasDesignContext
      ? await legacyShopifyAgent.createProductDraft({
          project: project as never,
          selectedImage,
          quantity: context.memory.quantity,
          theme: context.memory.theme
        })
      : defaultProduct();

    return {
      reply: "",
      stage: "payment",
      actions: ["create-product"],
      product,
      data: {
        project,
        hasDesignContext
      },
      replyData: {
        type: "shopify_product_draft",
        hasDesignContext
      }
    };
  }
}

export const createProductSkill = new CreateProductSkill();
