import { OrchestratorPlan } from "../types/agent.types";
import { SkillExecutionContext, SkillExecutionResult } from "../types/skill.types";
import { answerFaqSkill } from "../skills/customer-service/answer-faq.skill";
import { explainPricingSkill } from "../skills/customer-service/explain-pricing.skill";
import { explainDeliverySkill } from "../skills/customer-service/explain-delivery.skill";
import { afterSalesSkill } from "../skills/customer-service/after-sales.skill";

export class CustomerServiceAgent {
  execute(plan: OrchestratorPlan, context: SkillExecutionContext): Promise<SkillExecutionResult> | SkillExecutionResult {
    switch (plan.targetSkill) {
      case "explain-pricing":
        return explainPricingSkill.execute(context);
      case "explain-delivery":
        return explainDeliverySkill.execute(context);
      case "after-sales":
        return afterSalesSkill.execute(context);
      case "answer-faq":
      default:
        return answerFaqSkill.execute(context);
    }
  }
}

export const customerServiceAgent = new CustomerServiceAgent();
