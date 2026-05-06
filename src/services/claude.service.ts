import Anthropic from "@anthropic-ai/sdk";
import { safeParseJson } from "../utils/json-parser";
import { logger } from "../utils/logger";

type ProviderName =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "kimi"
  | "deepseek"
  | "dashscope"
  | "zhipu"
  | "google"
  | "xai";

interface ProviderConfig {
  name: ProviderName;
  apiKeyEnv: string;
}

interface OpenAiCompatibleProvider {
  name: ProviderName;
  apiKey: string;
  endpoint: string;
  model: string;
  extraHeaders?: Record<string, string>;
}

const PROVIDERS: ProviderConfig[] = [
  { name: "anthropic", apiKeyEnv: "ANTHROPIC_API_KEY" },
  { name: "openai", apiKeyEnv: "OPENAI_API_KEY" },
  { name: "openrouter", apiKeyEnv: "OPENROUTER_API_KEY" },
  { name: "kimi", apiKeyEnv: "KIMI_API_KEY" },
  { name: "deepseek", apiKeyEnv: "DEEPSEEK_API_KEY" },
  { name: "dashscope", apiKeyEnv: "DASHSCOPE_API_KEY" },
  { name: "zhipu", apiKeyEnv: "ZHIPU_API_KEY" },
  { name: "google", apiKeyEnv: "GOOGLE_API_KEY" },
  { name: "xai", apiKeyEnv: "XAI_API_KEY" }
];

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function defaultProviderOrder(): ProviderName[] {
  return [
    "kimi",
    "anthropic",
    "openai",
    "openrouter",
    "deepseek",
    "dashscope",
    "zhipu",
    "google",
    "xai"
  ];
}

function getProviderOrder(): ProviderName[] {
  const raw = env("AI_PROVIDER_ORDER");
  if (!raw) {
    return defaultProviderOrder();
  }

  const allowed = new Set<ProviderName>(defaultProviderOrder());
  const ordered = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is ProviderName => allowed.has(item as ProviderName));

  return ordered.length > 0 ? ordered : defaultProviderOrder();
}

function buildTextResponseFormatInstruction(): string {
  return "Return JSON only. Do not include markdown fences or extra explanation.";
}

export class ClaudeService {
  private anthropicClient: Anthropic | null = null;

  isEnabled(): boolean {
    return PROVIDERS.some((provider) => Boolean(env(provider.apiKeyEnv)));
  }

  private getAnthropicClient(): Anthropic {
    if (!this.anthropicClient) {
      this.anthropicClient = new Anthropic({
        apiKey: env("ANTHROPIC_API_KEY")
      });
    }

    return this.anthropicClient;
  }

  private getAvailableProviders(): ProviderName[] {
    const available = new Set(
      PROVIDERS.filter((provider) => Boolean(env(provider.apiKeyEnv))).map((provider) => provider.name)
    );

    return getProviderOrder().filter((provider) => available.has(provider));
  }

  private isRetryableProviderError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    return [
      "credit",
      "quota",
      "balance",
      "rate limit",
      "rate_limit",
      "insufficient",
      "exceeded",
      "billing",
      "unauthorized",
      "forbidden",
      "timeout",
      "network",
      "temporarily unavailable",
      "overloaded"
    ].some((keyword) => message.includes(keyword));
  }

  private async callAnthropic<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    const response = await this.getAnthropicClient().messages.create({
      model: env("ANTHROPIC_MODEL") || "claude-3-5-sonnet-20241022",
      max_tokens: 1200,
      system: `${systemPrompt}\n\n${buildTextResponseFormatInstruction()}`,
      messages: [
        {
          role: "user",
          content: userPrompt
        }
      ]
    });

    const text = response.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");

    return safeParseJson<T>(text);
  }

  private async callOpenAiCompatible<T>(
    provider: OpenAiCompatibleProvider,
    systemPrompt: string,
    userPrompt: string
  ): Promise<T> {
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
        ...(provider.extraHeaders ?? {})
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\n\n${buildTextResponseFormatInstruction()}`
          },
          {
            role: "user",
            content: userPrompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${provider.name} request failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error(`${provider.name} returned an empty response.`);
    }

    return safeParseJson<T>(text);
  }

  private async callGoogle<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    const apiKey = env("GOOGLE_API_KEY");
    const model = env("GOOGLE_MODEL") || "gemini-1.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${systemPrompt}\n\n${buildTextResponseFormatInstruction()}\n\n${userPrompt}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.4
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`google request failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n");
    if (!text) {
      throw new Error("google returned an empty response.");
    }

    return safeParseJson<T>(text);
  }

  private async callProvider<T>(
    provider: ProviderName,
    systemPrompt: string,
    userPrompt: string
  ): Promise<T> {
    switch (provider) {
      case "anthropic":
        return this.callAnthropic<T>(systemPrompt, userPrompt);
      case "openai":
        return this.callOpenAiCompatible<T>(
          {
            name: "openai",
            apiKey: env("OPENAI_API_KEY"),
            endpoint: "https://api.openai.com/v1/chat/completions",
            model: env("OPENAI_MODEL") || "gpt-4o-mini"
          },
          systemPrompt,
          userPrompt
        );
      case "openrouter":
        return this.callOpenAiCompatible<T>(
          {
            name: "openrouter",
            apiKey: env("OPENROUTER_API_KEY"),
            endpoint: "https://openrouter.ai/api/v1/chat/completions",
            model: env("OPENROUTER_MODEL") || "openai/gpt-4o-mini",
            extraHeaders: {
              "HTTP-Referer": env("OPENROUTER_SITE_URL") || "https://github.com/vervegrow-cmyk/lootcard_ai",
              "X-Title": env("OPENROUTER_APP_NAME") || "CardForge AI"
            }
          },
          systemPrompt,
          userPrompt
        );
      case "kimi":
        return this.callOpenAiCompatible<T>(
          {
            name: "kimi",
            apiKey: env("KIMI_API_KEY"),
            endpoint: "https://api.moonshot.cn/v1/chat/completions",
            model: env("KIMI_MODEL") || "moonshot-v1-8k"
          },
          systemPrompt,
          userPrompt
        );
      case "deepseek":
        return this.callOpenAiCompatible<T>(
          {
            name: "deepseek",
            apiKey: env("DEEPSEEK_API_KEY"),
            endpoint: "https://api.deepseek.com/chat/completions",
            model: env("DEEPSEEK_MODEL") || "deepseek-chat"
          },
          systemPrompt,
          userPrompt
        );
      case "dashscope":
        return this.callOpenAiCompatible<T>(
          {
            name: "dashscope",
            apiKey: env("DASHSCOPE_API_KEY"),
            endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
            model: env("DASHSCOPE_MODEL") || "qwen-plus"
          },
          systemPrompt,
          userPrompt
        );
      case "zhipu":
        return this.callOpenAiCompatible<T>(
          {
            name: "zhipu",
            apiKey: env("ZHIPU_API_KEY"),
            endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            model: env("ZHIPU_MODEL") || "glm-4-flash"
          },
          systemPrompt,
          userPrompt
        );
      case "google":
        return this.callGoogle<T>(systemPrompt, userPrompt);
      case "xai":
        return this.callOpenAiCompatible<T>(
          {
            name: "xai",
            apiKey: env("XAI_API_KEY"),
            endpoint: "https://api.x.ai/v1/chat/completions",
            model: env("XAI_MODEL") || "grok-2-latest"
          },
          systemPrompt,
          userPrompt
        );
      default:
        throw new Error(`Unsupported provider: ${provider satisfies never}`);
    }
  }

  async generateJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    const providers = this.getAvailableProviders();
    if (providers.length === 0) {
      throw new Error("No AI provider API key is configured.");
    }

    const errors: string[] = [];

    for (const provider of providers) {
      try {
        logger.info(`Trying AI provider: ${provider}`);
        return await this.callProvider<T>(provider, systemPrompt, userPrompt);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${provider}: ${message}`);
        logger.warn(`AI provider failed, trying next provider: ${provider}`, message);

        if (!this.isRetryableProviderError(error)) {
          continue;
        }
      }
    }

    throw new Error(`All configured AI providers failed. ${errors.join(" | ")}`);
  }
}

export const claudeService = new ClaudeService();
