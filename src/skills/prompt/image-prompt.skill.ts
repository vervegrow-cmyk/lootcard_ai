import { promptAgent as legacyPromptAgent } from "../../agents/prompt-agent";
import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

export class ImagePromptSkill {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const built = await legacyPromptAgent.buildPrompt({
      theme: context.memory.theme,
      character: context.memory.character,
      style: context.memory.style,
      rarity: context.memory.rarity,
      quantity: context.memory.quantity,
      physical_card: context.memory.physical_card,
      special_requirements: context.memory.special_requirements
    });

    return {
      reply:
        context.language === "zh"
          ? `专业图像提示词：\n${built.image_prompt}`
          : `Professional image prompt:\n${built.image_prompt}`,
      stage: context.memory.stage,
      actions: ["build-image-prompt"],
      prompt: built.image_prompt
    };
  }
}

export const imagePromptSkill = new ImagePromptSkill();
