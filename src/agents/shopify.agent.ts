import { OrchestratorPlan } from "../types/agent.types";
import { SkillExecutionContext, SkillExecutionResult } from "../types/skill.types";
import { createCheckoutLinkSkill } from "../skills/shopify/create-checkout-link.skill";
import { createProductSkill } from "../skills/shopify/create-product.skill";
import { sendPaymentLinkSkill } from "../skills/shopify/send-payment-link.skill";

function hasConfirmedDesign(context: SkillExecutionContext): boolean {
  const hasPrompt = Boolean(context.memory.currentPrompt?.trim() || context.project?.currentPrompt?.trim());
  const hasSelectedImage = Boolean(
    context.memory.selectedOption?.trim() ||
      context.memory.selectedImageUrl?.trim() ||
      context.memory.selectedOptionTitle?.trim() ||
      context.memory.selectedDesignSummary?.trim() ||
      context.project?.selectedOptionId?.trim() ||
      context.project?.finalDesignSummary?.trim()
  );

  return hasPrompt && hasSelectedImage;
}

export class ShopifyWorkflowAgent {
  async execute(plan: OrchestratorPlan, context: SkillExecutionContext): Promise<SkillExecutionResult> {
    if (!hasConfirmedDesign(context)) {
      return {
        reply:
          context.language === "zh"
            ? "我还没有你的最终确认设计，暂时不能生成 Shopify 下单链接。请先生成/确认一张卡牌方案。"
            : "I do not have your final confirmed design yet, so I cannot create a Shopify checkout link right now. Please generate or confirm a card design first.",
        stage: "confirmed",
        actions: ["create_shopify_product", "missing-final-design"],
        memoryUpdate: {
          stage: "confirmed"
        }
      };
    }

    if (plan.targetSkill !== "create-checkout-link") {
      return createProductSkill.execute(context);
    }

    const productResult = await createProductSkill.execute(context);
    const checkoutResult = await createCheckoutLinkSkill.execute({
      ...context,
      project: (productResult.data?.project as SkillExecutionContext["project"]) || context.project,
      data: {
        ...context.data,
        product: productResult.product
      }
    });

    if (checkoutResult.reply) {
      return checkoutResult;
    }

    const messageResult = sendPaymentLinkSkill.execute({
      ...context,
      data: {
        ...context.data,
        checkoutLink: checkoutResult.data?.checkoutLink
      }
    });

    return {
      reply: messageResult.reply,
      stage: "payment",
      actions: ["create_shopify_product", "create-product", "create-checkout-link", "send-payment-link"],
      memoryUpdate: {
        stage: "payment"
      },
      product: productResult.product,
      data: {
        checkoutLink: checkoutResult.data?.checkoutLink
      }
    };
  }
}

export const shopifyWorkflowAgent = new ShopifyWorkflowAgent();
