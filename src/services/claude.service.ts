import Anthropic from "@anthropic-ai/sdk";
import { safeParseJson } from "../utils/json-parser";

function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class ClaudeService {
  private client: Anthropic | null = null;

  isEnabled(): boolean {
    return hasAnthropicKey();
  }

  private getClient(): Anthropic {
    if (!hasAnthropicKey()) {
      throw new Error("ANTHROPIC_API_KEY is not configured.");
    }

    if (!this.client) {
      this.client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }

    return this.client;
  }

  async generateJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
    const response = await this.getClient().messages.create({
      model,
      max_tokens: 1200,
      system: systemPrompt,
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
}

export const claudeService = new ClaudeService();
