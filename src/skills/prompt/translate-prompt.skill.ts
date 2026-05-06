import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

export class TranslatePromptSkill {
  execute(context: SkillExecutionContext): SkillExecutionResult {
    const prompt = context.memory.currentPrompt || context.message;
    const translated =
      context.language === "zh"
        ? `English prompt:\n${prompt}`
        : `中文提示词：\n${prompt}`;

    return {
      reply: translated,
      stage: context.memory.stage,
      actions: ["translate-prompt"]
    };
  }
}

export const translatePromptSkill = new TranslatePromptSkill();
