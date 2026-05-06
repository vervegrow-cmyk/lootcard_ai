import { createProductSkill } from "../skills/shopify/create-product.skill";
import { OrchestratorPlan } from "../types/agent.types";
import { SkillExecutionContext, SkillExecutionResult } from "../types/skill.types";
import { isShopifyConfigured, shopifyService } from "../services/shopify.service";

export class ShopifyWorkflowAgent {
  async execute(plan: OrchestratorPlan, context: SkillExecutionContext): Promise<SkillExecutionResult> {
    console.log("[Shopify Configured]", isShopifyConfigured());

    const draftResult = await createProductSkill.execute(context);
    const draft = draftResult.product;

    if (!draft) {
      const result: SkillExecutionResult = {
        reply: "",
        stage: "payment",
        actions: ["create-product", "missing-product-draft"],
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
        actions: ["create-product", "shopify-not-configured"],
        product: draft,
        replyData: {
          type: "shopify_not_configured",
          ok: false,
          missing: [
            !process.env.SHOPIFY_STORE_DOMAIN?.trim() ? "SHOPIFY_STORE_DOMAIN" : "",
            !process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim() ? "SHOPIFY_ADMIN_ACCESS_TOKEN" : ""
          ].filter(Boolean)
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
          actions: ["create-product", "shopify-product-created"],
          product: draft,
          data: {
            project: draftResult.data?.project,
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
            productUrl: created.productUrl,
            adminUrl: created.adminUrl,
            price: created.price,
            title: created.title
          }
        }
      : {
          reply: "",
          stage: "payment",
          actions: ["create-product", "shopify-product-failed"],
          product: draft,
          replyData: {
            type: "shopify_product_create_failed",
            ok: false,
            error: created.error
          }
        };

    console.log("[Shopify Create Product Result]", result.replyData);
    return result;
  }
}

export const shopifyWorkflowAgent = new ShopifyWorkflowAgent();
