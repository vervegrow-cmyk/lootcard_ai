import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

export class ExplainPricingSkill {
  execute(context: SkillExecutionContext): SkillExecutionResult {
    const parsed = Number(process.env.DEFAULT_CARD_PRICE || "29.99");
    const defaultPrice = Number.isFinite(parsed) ? parsed.toFixed(2) : "29.99";

    return {
      reply: "",
      stage: "customer_service",
      actions: ["explain-pricing"],
      replyData: {
        type: "pricing_info",
        defaultPrice,
        currency: "USD",
        note: "Custom trading card pricing can vary by quantity, complexity, and whether a physical card is required."
      },
      memoryUpdate: {
        language: context.language,
        stage: "customer_service"
      }
    };
  }
}

export const explainPricingSkill = new ExplainPricingSkill();
