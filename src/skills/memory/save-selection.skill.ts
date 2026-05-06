import { memoryService } from "../../services/memory.service";
import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

function toLegacyStage(stage: SkillExecutionContext["memory"]["stage"]): "idle" | "prompting" | "generating" | "selecting" | "revising" | "confirmed" | "payment" {
  switch (stage) {
    case "customer_service":
    case "collecting":
      return "prompting";
    case "generating":
      return "generating";
    case "selecting":
      return "selecting";
    case "revising":
      return "revising";
    case "confirmed":
      return "confirmed";
    case "payment":
    case "completed":
      return "payment";
    case "idle":
    default:
      return "idle";
  }
}

export class SaveSelectionSkill {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    await memoryService.updateUserMemory({
      discordUserId: context.discordUserId,
      username: context.username,
      memoryPatch: {
        selectedOption: context.memory.selectedOption,
        selectedOptionTitle: context.memory.selectedOptionTitle,
        selectedImageUrl: context.memory.selectedImageUrl,
        selectedDesignSummary: context.memory.selectedDesignSummary,
        currentPrompt: context.memory.currentPrompt,
        stage: toLegacyStage(context.memory.stage)
      }
    });

    return {
      reply: "",
      stage: context.memory.stage,
      actions: ["save-selection"]
    };
  }
}

export const saveSelectionSkill = new SaveSelectionSkill();
