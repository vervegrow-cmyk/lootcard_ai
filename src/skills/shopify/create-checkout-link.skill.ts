import { orderService } from "../../services/order.service";
import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

function hasShopifyConfig(): boolean {
  return Boolean(
    process.env.SHOPIFY_STORE_DOMAIN?.trim() &&
      process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim()
  );
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

    const created = await orderService.createShopifyOrderLink({
      project: context.project as never,
      discordUserId: context.discordUserId,
      product
    });

    return {
      reply: "",
      stage: "payment",
      actions: ["create-checkout-link"],
      data: {
        checkoutLink: created.url
      },
      memoryUpdate: {
        shopifyProductUrl: created.url
      },
      product
    };
  }
}

export const createCheckoutLinkSkill = new CreateCheckoutLinkSkill();
