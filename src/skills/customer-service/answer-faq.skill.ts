import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

function detectChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

export class AnswerFaqSkill {
  execute(context: SkillExecutionContext): SkillExecutionResult {
    const language = context.language;
    const lower = context.message.toLowerCase();
    const hasRecentContext = context.recentConversation.length > 0;

    let reply =
      language === "zh"
        ? "可以。你可以直接问我问题，也可以让我帮你润色提示词、出图、改图，或者生成下单链接。"
        : "Sure. You can ask questions directly, or ask me to polish prompts, generate images, revise images, or create a checkout link.";

    if (lower.includes("你能做什么") || lower.includes("what can you do")) {
      reply =
        language === "zh"
          ? "我可以回答问题、沟通设计、生成 3 个图像方案、根据反馈改图，并在确认后生成 Shopify 下单链接。"
          : "I can answer questions, discuss the design, generate 3 image options, revise them based on feedback, and create a Shopify checkout link after confirmation.";
    } else if (hasRecentContext) {
      reply =
        language === "zh"
          ? "我还记得你前面的上下文。你可以继续补充需求，或者直接告诉我下一步想做什么。"
          : "I still have your recent context. You can keep adding details or tell me the next step you want.";
    }

    return {
      reply,
      stage: "customer_service",
      actions: ["answer-question"],
      memoryUpdate: {
        language,
        stage: "customer_service"
      }
    };
  }
}

export const answerFaqSkill = new AnswerFaqSkill();
