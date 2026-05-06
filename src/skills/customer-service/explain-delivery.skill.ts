import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

export class ExplainDeliverySkill {
  execute(context: SkillExecutionContext): SkillExecutionResult {
    return {
      reply:
        context.language === "zh"
          ? "定制商品预计 30 天左右完成制作和交付，最终实物会按你确认的设计预览来制作。"
          : "Custom orders usually take about 30 days for production and delivery, and final production follows the confirmed design preview.",
      stage: "customer_service",
      actions: ["explain-delivery"],
      memoryUpdate: {
        language: context.language,
        stage: "customer_service"
      }
    };
  }
}

export const explainDeliverySkill = new ExplainDeliverySkill();
