import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

export class GenerateStyleOptionsSkill {
  execute(context: SkillExecutionContext): SkillExecutionResult {
    const basePrompt = context.memory.currentPrompt || context.message;
    const variants = [
      {
        id: "A",
        title: context.language === "zh" ? "黑金SSR收藏卡" : "Black Gold SSR Collector Card",
        prompt: `${basePrompt}, black gold luxury frame, premium foil effect`
      },
      {
        id: "B",
        title: context.language === "zh" ? "赛博朋克战斗卡" : "Cyberpunk Battle Card",
        prompt: `${basePrompt}, cyberpunk combat energy, neon battle atmosphere`
      },
      {
        id: "C",
        title: context.language === "zh" ? "动漫高光角色卡" : "Anime Highlight Character Card",
        prompt: `${basePrompt}, anime highlight character focus, glossy hero card finish`
      }
    ];

    return {
      reply:
        context.language === "zh"
          ? "我先整理了 3 个图像方向。"
          : "I prepared 3 image directions first.",
      stage: "generating",
      actions: ["generate-style-options"],
      data: {
        styleVariants: variants
      }
    };
  }
}

export const generateStyleOptionsSkill = new GenerateStyleOptionsSkill();
