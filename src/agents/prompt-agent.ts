import { PROMPT_GENERATOR_PROMPT } from "../prompts/prompt-generator.prompt";
import { CardRequirements, LanguagePreference, PromptPolishResult } from "../types";
import { claudeService } from "../services/claude.service";

function buildFallbackPrompt(requirements: CardRequirements): string {
  const segments = [
    requirements.theme,
    requirements.character,
    requirements.style,
    requirements.rarity ? `${requirements.rarity} rarity` : "",
    requirements.physical_card ? `${requirements.physical_card} premium finish` : "",
    "premium collectible card artwork",
    "cinematic lighting",
    "high detail",
    "sharp focus",
    "vertical character card composition",
    requirements.special_requirements
  ].filter(Boolean);

  return segments.join(", ");
}

function explainPrompt(language: LanguagePreference): string {
  return language === "zh"
    ? "我保留了你的核心角色和风格要求，并补充了光影、材质、构图和收藏卡质感，让它更适合直接出图。"
    : "I kept your core character and style requirements, then added lighting, materials, composition, and collectible-card texture so it is ready for image generation.";
}

export class PromptAgent {
  async buildPrompt(requirements: CardRequirements): Promise<{ image_prompt: string }> {
    if (claudeService.isEnabled()) {
      try {
        return await claudeService.generateJson<{ image_prompt: string }>(
          PROMPT_GENERATOR_PROMPT,
          JSON.stringify(requirements, null, 2)
        );
      } catch {
        return {
          image_prompt: buildFallbackPrompt(requirements)
        };
      }
    }

    return {
      image_prompt: buildFallbackPrompt(requirements)
    };
  }

  async polishPrompt(rawIdea: string, language: LanguagePreference): Promise<PromptPolishResult> {
    if (claudeService.isEnabled()) {
      try {
        return await claudeService.generateJson<PromptPolishResult>(
          PROMPT_GENERATOR_PROMPT,
          JSON.stringify(
            {
              task: "prompt_polish",
              language,
              raw_idea: rawIdea
            },
            null,
            2
          )
        );
      } catch {
        return {
          polished_prompt: [
            rawIdea,
            "premium collectible card artwork",
            "cinematic lighting",
            "high detail",
            "sharp rendering",
            "professional composition"
          ].join(", "),
          explanation: explainPrompt(language)
        };
      }
    }

    return {
      polished_prompt: [
        rawIdea,
        "premium collectible card artwork",
        "cinematic lighting",
        "high detail",
        "sharp rendering",
        "professional composition"
      ].join(", "),
      explanation: explainPrompt(language)
    };
  }
}

export const promptAgent = new PromptAgent();
