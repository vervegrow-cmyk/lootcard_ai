import { shopifyAgent as legacyShopifyAgent } from "../../agents/shopify-agent";
import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

export class CreateProductSkill {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const selectedImage = {
      id: context.memory.selectedOption,
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

    const product = await legacyShopifyAgent.createProductDraft({
      project: project as never,
      selectedImage,
      quantity: context.memory.quantity,
      theme: context.memory.theme
    });

    return {
      reply: "",
      stage: "payment",
      actions: ["create-product"],
      product,
      data: {
        project
      }
    };
  }
}

export const createProductSkill = new CreateProductSkill();
