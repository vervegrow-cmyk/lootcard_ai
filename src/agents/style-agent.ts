import { imageService } from "../services/image.service";
import { StyleOption } from "../types";

export class StyleAgent {
  async generateStyleOptions(params: {
    basePrompt: string;
    projectId: string;
    themeHint?: string;
  }): Promise<StyleOption[]> {
    const variants = [
      {
        style_id: "A",
        style_name: "Black Gold Luxury Card",
        design_summary: "A premium collector direction with black enamel surfaces, metallic gold trim, and a regal showcase layout.",
        image_prompt: `${params.basePrompt}, luxury black and gold palette, premium foil border, collector edition finish`,
        suggested_title: "Black Gold Luxury Card"
      },
      {
        style_id: "B",
        style_name: "Dark Gothic Queen Card",
        design_summary: "A darker fantasy direction with gothic details, deeper shadows, and a dramatic queen-focused composition.",
        image_prompt: `${params.basePrompt}, dark gothic fantasy, deeper shadows, cathedral motifs, mysterious queen aura`,
        suggested_title: "Dark Gothic Queen Card"
      },
      {
        style_id: "C",
        style_name: "Cyber Neon Limited Card",
        design_summary: "A bold limited-edition direction blending neon accents, futuristic framing, and vivid contrast.",
        image_prompt: `${params.basePrompt}, cyber neon highlights, futuristic limited edition frame, vibrant contrast`,
        suggested_title: "Cyber Neon Limited Card"
      }
    ];

    return Promise.all(
      variants.map(async (variant) => {
        const image = await imageService.generateCardImages({
          imagePrompt: variant.image_prompt,
          styleName: variant.style_name,
          projectId: params.projectId
        });

        return {
          ...variant,
          image_url: image.imageUrl
        };
      })
    );
  }
}

export const styleAgent = new StyleAgent();
