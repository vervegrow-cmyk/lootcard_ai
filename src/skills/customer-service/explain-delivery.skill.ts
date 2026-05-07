import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

export class ExplainDeliverySkill {
  execute(context: SkillExecutionContext): SkillExecutionResult {
    return {
      reply: "",
      stage: "customer_service",
      actions: ["explain-delivery"],
      replyData: {
        type: "delivery_info",
        leadTimeDays: 30,
        note: "Custom orders usually take about 30 days for production and delivery."
      },
      memoryUpdate: {
        language: context.language,
        stage: "customer_service"
      }
    };
  }
}

export const explainDeliverySkill = new ExplainDeliverySkill();
