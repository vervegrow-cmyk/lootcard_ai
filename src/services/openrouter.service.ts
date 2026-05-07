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

export class OpenRouterService {
  async chat(params: {
    message: string;
    history?: ConversationEntry[];
    language?: "zh" | "en";
  }): Promise<string> {
    const primaryModel = env("OPENROUTER_TEXT_MODEL") || "deepseek/deepseek-chat-v3-0324";
    const fallbackModel = env("OPENROUTER_FALLBACK_MODEL") || "qwen/qwen-2.5-72b-instruct";

    const systemPrompt =
      params.language === "zh"
        ? "你是 LootCard AI 的 Discord 助手。请用自然、准确、简洁的中文回复用户。"
        : "You are the LootCard AI Discord assistant. Reply naturally, accurately, and concisely in English.";

    const messages: OpenRouterMessage[] = [
      { role: "system", content: systemPrompt },
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
