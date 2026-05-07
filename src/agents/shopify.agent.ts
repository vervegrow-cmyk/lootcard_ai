import { createProductSkill } from "../skills/shopify/create-product.skill";
import { OrchestratorPlan } from "../types/agent.types";
import { SkillExecutionContext, SkillExecutionResult } from "../types/skill.types";
import { isShopifyConfigured, shopifyService } from "../services/shopify.service";
import { shopifyAuthService } from "../services/shopify-auth.service";

export class ShopifyWorkflowAgent {
  async execute(plan: OrchestratorPlan, context: SkillExecutionContext): Promise<SkillExecutionResult> {
    console.log("[Shopify Configured]", isShopifyConfigured());

    const draftResult = await createProductSkill.execute(context);
    const draft = draftResult.product;

    if (!draft) {
      const result: SkillExecutionResult = {
        reply: "",
        stage: "payment",
        actions: ["create-shopify-product", "missing-product-draft"],
        replyData: {
          type: "shopify_product_missing",
          ok: false
        }
      };
      console.log("[Shopify Create Product Result]", result.replyData);
      return result;
    }

    if (!isShopifyConfigured()) {
      const result: SkillExecutionResult = {
        reply: "",
        stage: "payment",
        actions: ["create-shopify-product", "shopify-not-configured"],
        product: draft,
        replyData: {
          type: "shopify_not_configured",
          ok: false,
          missing: shopifyAuthService.getMissingOAuthEnv()
        }
      };
      console.log("[Shopify Create Product Result]", result.replyData);
      return result;
    }

    const created = await shopifyService.createShopifyProduct({
      title: draft.title,
      description: draft.description,
      price: Number(draft.price || process.env.DEFAULT_CARD_PRICE || "29.99"),
      tags: draft.tags
    });

    const result: SkillExecutionResult = created.ok
      ? {
          reply: "",
          stage: "payment",
          actions: ["create-shopify-product", "shopify-product-created"],
          product: draft,
          data: {
            project: draftResult.data?.project,
            productId: created.productId,
            productUrl: created.productUrl,
            adminUrl: created.adminUrl
          },
          memoryUpdate: {
            stage: "payment",
            shopifyProductUrl: created.productUrl || ""
          },
          replyData: {
            type: "shopify_product_created",
            ok: true,
            shop: created.shop,
            productId: created.productId,
            productUrl: created.productUrl,
            adminUrl: created.adminUrl,
            price: created.price,
            title: created.title
          }
        }
      : {
          reply: "",
          stage: "payment",
          actions: ["create-shopify-product", "shopify-product-failed"],
          product: draft,
          replyData: {
            type: "shopify_product_create_failed",
            ok: false,
            error: created.error,
            missing: created.missing,
            reauthorizeUrl: created.reauthorizeUrl,
            shop: created.shop
          }
        };

    console.log("[Shopify Create Product Result]", result.replyData);
    return result;
  }
}

export const shopifyWorkflowAgent = new ShopifyWorkflowAgent();
