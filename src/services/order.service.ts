import { ProjectContext, ShopifyProductDraft } from "../types";
import { logger } from "../utils/logger";
import { memoryService } from "./memory.service";
import { shopifyService } from "./shopify.service";

export class OrderService {
  async createShopifyOrderLink(params: {
    project: ProjectContext;
    discordUserId: string;
    product: ShopifyProductDraft;
  }): Promise<{ reply: string; url: string }> {
    try {
      const created = await shopifyService.createProduct(params.product);

      await memoryService.updateProject(params.project.projectId, {
        status: "payment",
        shopifyProductId: created.id,
        shopifyProductUrl: created.url
      });

      await memoryService.logShopifyProduct({
        projectId: params.project.projectId,
        discordUserId: params.discordUserId,
        shopifyProductId: created.id,
        shopifyProductUrl: created.url,
        title: created.title,
        price: created.price,
        sku: created.sku
      });

      return {
        reply: `Your custom order link is ready:\n${created.url}`,
        url: created.url
      };
    } catch (error) {
      logger.error("Failed to create Shopify product", error);
      throw error;
    }
  }
}

export const orderService = new OrderService();
