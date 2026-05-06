import { ConversationEntry, HermesInput, HermesResult, LanguagePreference } from "../types";

function t(language: LanguagePreference, zh: string, en: string): string {
  return language === "zh" ? zh : en;
}

function detectChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function summarizeRecentConversation(recentConversation: ConversationEntry[]): string {
  return recentConversation
    .slice(-3)
    .map((entry) => entry.content)
    .join(" ")
    .trim();
}

export class ChatAgent {
  detectLanguage(message: string, fallback: LanguagePreference): LanguagePreference {
    return detectChinese(message) ? "zh" : fallback;
  }

  replyToQuestion(input: HermesInput): HermesResult {
    const language = this.detectLanguage(input.message, input.memory.language);
    const lower = input.message.toLowerCase();
    const recentSummary = summarizeRecentConversation(input.recentConversation);

    let reply = t(
      language,
      "可以。你可以直接问我问题，也可以让我润色提示词、生成 3 个图像方案，或者在确认后生成下单链接。",
      "Sure. You can ask questions directly, ask me to polish a prompt, generate 3 image options, or create a checkout link after confirmation."
    );

    if (lower.includes("你能做什么") || lower.includes("what can you do")) {
      reply = t(
        language,
        "我可以做四件事：答疑、润色提示词、生成 A/B/C 图像方案、根据确认结果生成 Shopify 下单链接。",
        "I can do four things: answer questions, polish prompts, generate A/B/C image options, and create a Shopify checkout link after confirmation."
      );
    } else if (lower.includes("价格") || lower.includes("price")) {
      reply = t(
        language,
        "价格会看数量、复杂度和是否做实体卡。你先把方向定下来，我再带你进入下单。",
        "Pricing depends on quantity, complexity, and whether you want a physical card. Once the direction is clear, I can guide you to checkout."
      );
    } else if (lower.includes("多久") || lower.includes("how long")) {
      reply = t(
        language,
        "定制商品预计 30 天左右完成制作和交付。",
        "Custom orders usually take about 30 days for production and delivery."
      );
    } else if (recentSummary && language === "zh") {
      reply = "我还记得你前面的上下文。你可以继续补充需求、让我直接出图，或者告诉我怎么改。";
    } else if (recentSummary) {
      reply = "I still have your recent context. You can add details, ask me to generate options, or tell me how to revise them.";
    }

    return {
      intent: "answer_question",
      action: "reply",
      stage: input.memory.stage,
      language,
      reply,
      memory_update: {
        language
      },
      prompt: input.memory.currentPrompt,
      image_options: [],
      selected_option: null,
      product: null
    };
  }

  applyLanguagePreference(input: HermesInput, language: LanguagePreference): HermesResult {
    return {
      intent: "language_preference",
      action: "reply",
      stage: input.memory.stage,
      language,
      reply:
        language === "zh"
          ? "可以，我之后会用中文和你沟通。"
          : "Sure, I will use English with you from now on.",
      memory_update: {
        language
      },
      prompt: input.memory.currentPrompt,
      image_options: [],
      selected_option: null,
      product: null
    };
  }
}

export const chatAgent = new ChatAgent();
