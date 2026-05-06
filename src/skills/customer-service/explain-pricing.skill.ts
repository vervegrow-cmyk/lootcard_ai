import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

export class ExplainPricingSkill {
  execute(context: SkillExecutionContext): SkillExecutionResult {
    return {
      reply:
        context.language === "zh"
          ? "价格会根据数量、复杂度、是否做实体卡来判断。你先把想要的图像方向确认下来，我再带你进入下单。"
          : "Pricing depends on quantity, complexity, and whether you want a physical card. Once the image direction is confirmed, I can guide you to checkout.",
      stage: "customer_service",
      actions: ["explain-pricing"],
      memoryUpdate: {
        language: context.language,
        stage: "customer_service"
      }
    };
  }
}

export const explainPricingSkill = new ExplainPricingSkill();
