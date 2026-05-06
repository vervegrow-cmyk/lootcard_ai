import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

export class ExpandPromptSkill {
  execute(context: SkillExecutionContext): SkillExecutionResult {
    const base = context.memory.currentPrompt || context.message;
    const expanded = `${base}, premium collectible card artwork, cinematic lighting, high detail, dramatic composition`;

    return {
      reply:
        context.language === "zh"
          ? `扩展后的提示词：\n${expanded}`
          : `Expanded prompt:\n${expanded}`,
      stage: context.memory.stage,
      actions: ["expand-prompt"],
      prompt: expanded
    };
  }
}

export const expandPromptSkill = new ExpandPromptSkill();
