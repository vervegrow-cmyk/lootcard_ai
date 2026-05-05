import { PROMPT_GENERATOR_PROMPT } from "../prompts/prompt-generator.prompt";
import { CardRequirements } from "../types";
import { claudeService } from "../services/claude.service";

export class PromptAgent {
  async buildPrompt(requirements: CardRequirements): Promise<{ image_prompt: string }> {
    if (claudeService.isEnabled()) {
      return claudeService.generateJson<{ image_prompt: string }>(
        PROMPT_GENERATOR_PROMPT,
        JSON.stringify(requirements, null, 2)
      );
    }

    const segments = [
      requirements.theme,
      requirements.style,
      requirements.character,
      requirements.rarity ? `${requirements.rarity} rarity` : "",
      "premium collectible trading card",
      requirements.physical_card ? `${requirements.physical_card} finish` : "",
      "vertical trading card design",
      "ornate frame",
      "cinematic lighting",
      "high detail",
      requirements.card_text ? `card text: ${requirements.card_text}` : "",
      requirements.special_requirements
    ].filter(Boolean);

    return {
      image_prompt: segments.join(", ")
    };
  }
}

export const promptAgent = new PromptAgent();
