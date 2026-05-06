import { PRODUCT_DESCRIPTION_PROMPT } from "../prompts/product-description.prompt";
import { ImageOption, ProjectContext, ShopifyProductDraft } from "../types";
import { claudeService } from "../services/claude.service";

function defaultPrice(): string {
  return process.env.DEFAULT_CARD_PRICE || "29.99";
}

export class ShopifyAgent {
  async createProductDraft(params: {
    project: ProjectContext;
    selectedImage: ImageOption;
    quantity?: string;
    theme?: string;
  }): Promise<ShopifyProductDraft> {
    const sku = `CARD-${Date.now()}`;

    if (claudeService.isEnabled()) {
      try {
        return await claudeService.generateJson<ShopifyProductDraft>(
          PRODUCT_DESCRIPTION_PROMPT,
          JSON.stringify(
            {
              theme: params.theme,
              quantity: params.quantity,
              selected_image: params.selectedImage,
              project: params.project,
              default_price: defaultPrice(),
              sku
            },
            null,
            2
          )
        );
      } catch {
        return this.buildFallbackDraft(params.selectedImage, sku);
      }
    }

    return this.buildFallbackDraft(params.selectedImage, sku);
  }

  private buildFallbackDraft(selectedImage: ImageOption, sku: string): ShopifyProductDraft {
    return {
      title: `AI Custom Trading Card - ${selectedImage.title}`,
      description: [
        `<p>Selected concept: ${selectedImage.title}</p>`,
        `<p>Prompt: ${selectedImage.prompt}</p>`,
        "<p>This is a custom-made AI trading card.</p>",
        "<p>Production and delivery time: approximately 30 days.</p>",
        "<p>Final production will follow the confirmed design preview.</p>",
        "<p>Custom orders are made-to-order.</p>"
      ].join(""),
      price: defaultPrice(),
      sku,
      tags: ["discord", "ai-card", "custom-card", "made-to-order"]
    };
  }
}

export const shopifyAgent = new ShopifyAgent();
