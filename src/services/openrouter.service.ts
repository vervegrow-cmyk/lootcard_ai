import { ConversationEntry } from "../types/skill.types";

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

async function sendOpenRouterRequest(model: string, messages: OpenRouterMessage[]): Promise<string> {
  const apiKey = env("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY.");
  }

  console.log(`[OPENROUTER] model=${model}`);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status} ${text}`);
  }

  const parsed = JSON.parse(text) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const reply = parsed.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error("OpenRouter returned an empty reply.");
  }

  return reply;
}

function buildSystemPrompt(language: "zh" | "en" = "en"): string {
  if (language === "zh") {
    return [
      "你是 LootCard AI 的 Discord 助手。",
      "请用自然、准确、简洁的中文回复用户。",
      "不要机械重复，不要说“我还记得你前面的上下文”这种模板废话。",
      "如果用户只是打招呼，例如“你好 / hello / hi”，请友好地回应，并简短说明你可以帮他做卡牌设计、生成图片、修改设计、生成 Shopify 商品链接。",
      "如果用户是在普通聊天或提问，请像真人客服和设计顾问一样回答，不要像教程机器人。",
      "回复通常控制在 1 到 3 句。"
    ].join(" ");
  }

  return [
    "You are the LootCard AI Discord assistant.",
    "Reply naturally, accurately, and concisely in English.",
    "Do not sound robotic. Do not say things like 'I still remember your context' or similar filler.",
    "If the user just says hello or hi, greet them warmly and briefly explain you can help with card design, image generation, design revisions, and Shopify product links.",
    "For normal chat or questions, answer like a real support and design assistant, not a tutorial bot.",
    "Keep most replies to 1 to 3 sentences."
  ].join(" ");
}

export class OpenRouterService {
  async chat(params: {
    message: string;
    history?: ConversationEntry[];
    language?: "zh" | "en";
  }): Promise<string> {
    const primaryModel = env("OPENROUTER_TEXT_MODEL") || "deepseek/deepseek-chat-v3-0324";
    const fallbackModel = env("OPENROUTER_FALLBACK_MODEL") || "qwen/qwen-2.5-72b-instruct";

    const messages: OpenRouterMessage[] = [
      { role: "system", content: buildSystemPrompt(params.language) },
      ...((params.history || []).slice(-6).map((item) => ({
        role: item.role,
        content: item.content
      })) as OpenRouterMessage[]),
      { role: "user", content: params.message }
    ];

    try {
      return await sendOpenRouterRequest(primaryModel, messages);
    } catch (error) {
      if (fallbackModel && fallbackModel !== primaryModel) {
        console.log(`[OPENROUTER] fallback model=${fallbackModel}`);
        return sendOpenRouterRequest(fallbackModel, messages);
      }
      throw error;
    }
  }
}

export const openRouterService = new OpenRouterService();
