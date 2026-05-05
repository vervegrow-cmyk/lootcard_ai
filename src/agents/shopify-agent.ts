import { PRODUCT_DESCRIPTION_PROMPT } from "../prompts/product-description.prompt";
import { ProjectContext, ShopifyProductDraft, StyleOption } from "../types";
import { claudeService } from "../services/claude.service";

function defaultPrice(): string {
  return process.env.DEFAULT_CARD_PRICE || "29.99";
}

export class ShopifyAgent {
  async createProductDraft(params: {
    project: ProjectContext;
    selectedStyle: StyleOption;
    quantity?: string;
    theme?: string;
  }): Promise<ShopifyProductDraft> {
    const sku = `CARD-${Date.now()}`;

    if (claudeService.isEnabled()) {
      return claudeService.generateJson<ShopifyProductDraft>(
        PRODUCT_DESCRIPTION_PROMPT,
        JSON.stringify(
          {
            theme: params.theme,
            quantity: params.quantity,
            selected_style: params.selectedStyle,
            project: params.project,
            default_price: defaultPrice(),
            sku
          },
          null,
          2
        )
      );
    }

    const title = `AI Custom Trading Card - ${params.selectedStyle.suggested_title}`;
    const description = [
      `<p>${params.selectedStyle.design_summary}</p>`,
      "<p>This is a custom-made AI trading card.</p>",
      "<p>Production and delivery time: approximately 30 days.</p>",
      "<p>Final production will follow the confirmed design preview.</p>",
      "<p>Custom orders are made-to-order.</p>"
    ].join("");

    return {
      title,
      description,
      price: defaultPrice(),
      sku,
      tags: ["discord", "ai-card", "custom-card", "made-to-order"]
    };
  }
}

export const shopifyAgent = new ShopifyAgent();
