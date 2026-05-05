import { logger } from "../utils/logger";

export class ImageService {
  async generateCardImages(input: {
    imagePrompt: string;
    styleName: string;
    projectId: string;
  }): Promise<{ imageUrl: string }> {
    const mockMode = (process.env.MOCK_IMAGE_MODE || "true").toLowerCase() === "true";

    if (mockMode) {
      const label = encodeURIComponent(`${input.styleName} Mock Preview`);
      const imageUrl = `https://placehold.co/768x1024/png?text=${label}`;
      return { imageUrl };
    }

    logger.warn("Real image generation is not configured. Falling back to a placeholder URL.");
    const label = encodeURIComponent(`${input.styleName} Preview`);
    return {
      imageUrl: `https://placehold.co/768x1024/png?text=${label}`
    };
  }
}

export const imageService = new ImageService();
