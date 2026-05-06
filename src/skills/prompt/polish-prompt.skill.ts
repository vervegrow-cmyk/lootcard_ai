import { promptAgent as legacyPromptAgent } from "../../agents/prompt-agent";
import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

function sanitizePromptIdea(message: string): string {
  return message
    .replace(/帮我|请把|润色|优化|这个|提示词|prompt/gi, " ")
    .replace(/[：:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class PolishPromptSkill {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const rawIdea = sanitizePromptIdea(context.message) || context.message;
    const polished = await legacyPromptAgent.polishPrompt(rawIdea, context.language);

    return {
      reply:
        context.language === "zh"
          ? `原始想法：\n${rawIdea}\n\n优化提示词：\n${polished.polished_prompt}\n\n中文解释：\n${polished.explanation}`
          : `Original idea:\n${rawIdea}\n\nOptimized prompt:\n${polished.polished_prompt}\n\nExplanation:\n${polished.explanation}`,
      stage: context.memory.stage,
      actions: ["polish-prompt"],
      memoryUpdate: {
        language: context.language
      },
      prompt: polished.polished_prompt
    };
  }
}

export const polishPromptSkill = new PolishPromptSkill();
