import { OrchestratorPlan } from "../types/agent.types";
import { SkillExecutionContext, SkillExecutionResult } from "../types/skill.types";
import { createCheckoutLinkSkill } from "../skills/shopify/create-checkout-link.skill";
import { createProductSkill } from "../skills/shopify/create-product.skill";
import { sendPaymentLinkSkill } from "../skills/shopify/send-payment-link.skill";

export class ShopifyWorkflowAgent {
  async execute(plan: OrchestratorPlan, context: SkillExecutionContext): Promise<SkillExecutionResult> {
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
      actions: ["create-product", "create-checkout-link", "send-payment-link"],
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
