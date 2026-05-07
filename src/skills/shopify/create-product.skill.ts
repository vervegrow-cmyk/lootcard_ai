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

function requestedProductTitle(context: SkillExecutionContext): string {
  const clean = (value: string): string =>
    value
      .replace(/的?\s*shopify.*$/i, "")
      .replace(/的?\s*(商品|产品|链接).*$/i, "")
      .trim();

  const fromPlan = String(context.data?.requestedProductTitle || "").trim();
  if (fromPlan) {
    return clean(fromPlan);
  }

  const match =
    context.message.match(/商品名(?:为|是)?\s*["“]?(.+?)["”]?(?=(?:的)?\s*(?:shopify|商品|产品|product|链接)|$)/i) ||
    context.message.match(/product\s+name\s*(?:is|=|:)?\s*["']?([^"']+?)["']?/i);

  return match?.[1] ? clean(match[1]) : "";
}

export class CreateProductSkill {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const hasDesignContext = Boolean(
      context.memory.currentPrompt?.trim() ||
        context.memory.selectedOptionTitle?.trim() ||
        context.memory.selectedDesignSummary?.trim() ||
        context.memory.theme?.trim()
    );

    const explicitTitle = requestedProductTitle(context);
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

    if (explicitTitle) {
      product.title = explicitTitle;
    }

    return {
      reply: "",
      stage: "payment",
      actions: ["create-shopify-product"],
      product,
      data: {
        project,
        hasDesignContext,
        requestedProductTitle: explicitTitle
      },
      replyData: {
        type: "shopify_product_draft",
        hasDesignContext,
        requestedProductTitle: explicitTitle
      }
    };
  }
}

export const createProductSkill = new CreateProductSkill();
