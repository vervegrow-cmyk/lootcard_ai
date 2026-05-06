import { OrchestratorPlan } from "../types/agent.types";
import { SkillExecutionContext, SkillExecutionResult } from "../types/skill.types";
import { expandPromptSkill } from "../skills/prompt/expand-prompt.skill";
import { imagePromptSkill } from "../skills/prompt/image-prompt.skill";
import { polishPromptSkill } from "../skills/prompt/polish-prompt.skill";
import { translatePromptSkill } from "../skills/prompt/translate-prompt.skill";

export class PromptAgent {
  async execute(plan: OrchestratorPlan, context: SkillExecutionContext): Promise<SkillExecutionResult> {
    switch (plan.targetSkill) {
      case "translate-prompt":
        return translatePromptSkill.execute(context);
      case "expand-prompt":
        return expandPromptSkill.execute(context);
      case "image-prompt":
        return imagePromptSkill.execute(context);
      case "polish-prompt":
      default:
        return polishPromptSkill.execute(context);
    }
  }
}

export const promptWorkflowAgent = new PromptAgent();
