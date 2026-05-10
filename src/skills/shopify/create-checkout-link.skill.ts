import { isShopifyConfigured } from "../../services/shopify.service";
import { shopifyService } from "../../services/shopify.service";
import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

function hasShopifyConfig(): boolean {
  return isShopifyConfigured();
}

export class CreateCheckoutLinkSkill {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const product = context.data?.product as
      | {
          title: string;
          description: string;
          price: string;
          sku: string;
          tags: string[];
          imageUrl?: string;
          prompt?: string;
        }
      | undefined;

    if (!product || !context.project) {
      return {
        reply:
          context.language === "zh"
            ? "你先确认一个最终图像方案，我再帮你生成下单链接。"
            : "Please confirm a final image option first, then I can create the checkout link.",
        stage: "confirmed",
        actions: ["missing-product-or-project"]
      };
    }

    if (!hasShopifyConfig()) {
      return {
        reply:
          context.language === "zh"
            ? "Shopify 还没有配置完成，我已经记录最终设计，配置完成后可以生成下单链接。"
            : "Shopify is not configured yet. I saved the final design, and the checkout link can be created once Shopify is configured.",
        stage: "confirmed",
        actions: ["shopify-not-configured"],
        memoryUpdate: {
          shopifyProductUrl: ""
        },
        product
      };
    }

    const created = await shopifyService.createShopifyProduct({
      title: product.title,
      description: product.description,
      price: Number(product.price),
      tags: product.tags
    });

    if (!created.ok || !created.productUrl) {
      return {
        reply:
          context.language === "zh"
            ? `Shopify 产品创建失败：${created.error || "未知错误"}`
            : `Shopify product creation failed: ${created.error || "Unknown error"}`,
        stage: "confirmed",
        actions: ["create-checkout-link-failed"],
        product
      };
    }

    return {
      reply: "",
      stage: "payment",
      actions: ["create-checkout-link"],
      data: {
        checkoutLink: created.productUrl
      },
      memoryUpdate: {
        shopifyProductUrl: created.productUrl
      },
      product
    };
  }
}

export const createCheckoutLinkSkill = new CreateCheckoutLinkSkill();
