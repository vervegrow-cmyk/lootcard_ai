import { imageService } from "../services/image.service";
import { ImageOption } from "../types";

export class StyleAgent {
  async generateStyleOptions(params: {
    basePrompt: string;
    projectId: string;
    themeHint?: string;
  }): Promise<ImageOption[]> {
    return imageService.generateImages(params.basePrompt, 3);
  }
}

export const styleAgent = new StyleAgent();
