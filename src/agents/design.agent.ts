import { OrchestratorPlan } from "../types/agent.types";
import { SkillExecutionContext, SkillExecutionResult } from "../types/skill.types";
import { collectRequirementsSkill } from "../skills/design/collect-requirements.skill";
import { generateImagesSkill } from "../skills/design/generate-images.skill";
import { reviseImageSkill } from "../skills/design/revise-image.skill";
import { selectDesignSkill } from "../skills/design/select-design.skill";

export class DesignAgent {
  async execute(plan: OrchestratorPlan, context: SkillExecutionContext): Promise<SkillExecutionResult> {
    switch (plan.targetSkill) {
      case "collect-requirements":
        return collectRequirementsSkill.execute(context);
      case "generate-images":
        return generateImagesSkill.execute(context);
      case "select-design":
        return selectDesignSkill.execute(context);
      case "revise-image":
        return reviseImageSkill.execute(context);
      default:
        return generateImagesSkill.execute(context);
    }
  }
}

export const designAgent = new DesignAgent();
