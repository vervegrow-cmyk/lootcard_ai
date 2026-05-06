import { ImageOption } from "../types";
import { logger } from "../utils/logger";

function buildMockTitle(index: number): string {
  const titles = ["动漫SSR收藏卡", "黑金高级角色卡", "赛博战斗角色卡"];
  return titles[index] || `Image Option ${index + 1}`;
}

function buildMockSummary(index: number): string {
  const summaries = [
    "偏动漫收藏卡质感，角色主体突出，适合 SSR 稀有卡牌方向。",
    "更偏黑金高级卡牌，边框奢华，适合高端收藏视觉。",
    "更偏赛博战斗感，光效更强，适合未来感角色卡。"
  ];
  return summaries[index] || "Premium custom card image option.";
}

function buildMockPrompt(prompt: string, index: number): string {
  const suffixes = [
    "anime SSR collector card, premium foil finish",
    "black gold premium character card, luxury border",
    "cyber combat character card, neon battle atmosphere"
  ];
  return `${prompt}, ${suffixes[index] || "premium collectible illustration"}`;
}

export class ImageService {
  async generateImages(
    input:
      | string
      | {
          prompt: string;
          count?: number;
          size?: string;
        },
    legacyCount?: number
  ): Promise<ImageOption[]> {
    const normalized =
      typeof input === "string"
        ? {
            prompt: input,
            count: legacyCount ?? 3,
            size: "1024x1024"
          }
        : input;
    const count = normalized.count ?? 3;
    const mockMode = (process.env.MOCK_IMAGE_MODE || "true").toLowerCase() === "true";
    const optionIds = ["A", "B", "C"];

    if (!mockMode) {
      logger.warn(
        "Real image generation is not configured yet. Falling back to placeholder URLs. You can later connect Replicate, OpenAI Images, or Stable Diffusion."
      );
    }

    return optionIds.slice(0, count).map((id, index) => {
      const title = buildMockTitle(index);
      const text = encodeURIComponent(`${id} ${title}`);
      return {
        id,
        title,
        imageUrl: `https://placehold.co/${normalized.size || "1024x1024"}/png?text=${text}`,
        prompt: buildMockPrompt(normalized.prompt, index),
        summary: buildMockSummary(index)
      };
    });
  }

  async reviseImage(input: {
    imageUrl: string;
    prompt: string;
    revisionText: string;
  }): Promise<{ imageUrl: string; prompt: string; summary: string }> {
    const mockMode = (process.env.MOCK_IMAGE_MODE || "true").toLowerCase() === "true";
    const text = encodeURIComponent(`Revised ${input.revisionText}`);

    if (!mockMode) {
      logger.warn(
        "Real image revision is not configured yet. Falling back to placeholder URLs. You can later connect Replicate, OpenAI Images, or Stable Diffusion."
      );
    }

    return {
      imageUrl: `https://placehold.co/1024x1024/png?text=${text}`,
      prompt: `${input.prompt}, revision: ${input.revisionText}`,
      summary: `Revised with: ${input.revisionText}`
    };
  }

  async generateCardImages(input: {
    imagePrompt: string;
    styleName: string;
    projectId: string;
  }): Promise<{ imageUrl: string }> {
    const image = await this.generateImages({
      prompt: `${input.imagePrompt}, ${input.styleName}`,
      count: 1,
      size: "768x1024"
    });
    return {
      imageUrl: image[0]?.imageUrl || ""
    };
  }
}

export const imageService = new ImageService();
