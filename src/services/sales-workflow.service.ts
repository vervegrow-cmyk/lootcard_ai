import { OrderStatus } from "@prisma/client";
import {
  ConversationEntry,
  CurrentOrderDraft,
  HermesMemory,
  LanguagePreference,
  OrderDraftOption,
  ProjectContext,
  ProjectStage,
  ShippingType
} from "../types";
import { buildConceptOptions } from "../templates/card-concepts";
import { imageService } from "./image.service";
import { memoryService } from "./memory.service";
import { openRouterService } from "./openrouter.service";
import { orderService } from "./order.service";
import { stateManagerService } from "./state-manager.service";
import { storageService } from "./storage.service";
import { shopifyService } from "./shopify.service";

export interface WorkflowResponse {
  reply: string;
  stage: ProjectStage;
  memoryPatch: Partial<HermesMemory>;
  imageUrls?: string[];
  projectPatch?: {
    currentPrompt?: string;
    finalDesignSummary?: string | null;
    shopifyProductId?: string | null;
    shopifyProductUrl?: string | null;
    status?: ProjectStage;
  };
}

interface WorkflowInput {
  discordUserId: string;
  username: string;
  message: string;
  language: LanguagePreference;
  memory: HermesMemory;
  project: ProjectContext | null;
  recentConversation: ConversationEntry[];
}

function t(language: LanguagePreference, zh: string, en: string): string {
  return language === "zh" ? zh : en;
}

function inferCraft(style: string, language: LanguagePreference): string {
  const lower = style.toLowerCase();

  if (/black gold|黑金|ssr/.test(lower)) {
    return language === "zh" ? "烫金 / 全息 / 动漫角色" : "Foil / Holographic / Anime Character";
  }
  if (/cyberpunk|赛博/.test(lower)) {
    return language === "zh" ? "霓虹 / 机甲 / 战斗感" : "Neon / Mecha / Combat";
  }
  if (/signature|signed|签名|limited/.test(lower)) {
    return language === "zh" ? "限量 / 签名 / 收藏级" : "Limited / Signed / Collector Grade";
  }
  return language === "zh" ? "全息 / 收藏卡工艺" : "Holographic / Collector Card Finish";
}

function buildDescription(option: OrderDraftOption, originalMessage: string, language: LanguagePreference): string {
  if (language === "zh") {
    return [
      `<p><strong>${option.title}</strong></p>`,
      `<p>风格：${option.style}</p>`,
      `<p>工艺：${inferCraft(option.style, language)}</p>`,
      `<p>用户需求：${originalMessage}</p>`,
      "<p>发货说明：定制商品预计约 30 天制作并发货。</p>",
      "<p>定制说明：最终成品将按照当前确认方案生产。</p>"
    ].join("");
  }

  return [
    `<p><strong>${option.title}</strong></p>`,
    `<p>Style: ${option.style}</p>`,
    `<p>Craft: ${inferCraft(option.style, language)}</p>`,
    `<p>Request: ${originalMessage}</p>`,
    "<p>Shipping note: custom orders usually take around 30 days for production and delivery.</p>",
    "<p>Customization note: final production follows the confirmed design.</p>"
  ].join("");
}

function buildDraftOptionsReply(language: LanguagePreference, options: OrderDraftOption[]): string {
  if (language === "zh") {
    return [
      "✅ 已为你生成 3 个卡牌方案",
      "",
      `A. ${options[0].title}`,
      `价格：$${options[0].estimatedPrice.toFixed(2)}`,
      `风格：${options[0].description}`,
      "",
      `B. ${options[1].title}`,
      `价格：$${options[1].estimatedPrice.toFixed(2)}`,
      `风格：${options[1].description}`,
      "",
      `C. ${options[2].title}`,
      `价格：$${options[2].estimatedPrice.toFixed(2)}`,
      `风格：${options[2].description}`,
      "",
      "回复 A / B / C 选择方案。",
      "也可以回复“修改A：更暗黑一点”。"
    ].join("\n");
  }

  return [
    "✅ I generated 3 card concepts for you",
    "",
    `A. ${options[0].title}`,
    `Price: $${options[0].estimatedPrice.toFixed(2)}`,
    `Style: ${options[0].description}`,
    "",
    `B. ${options[1].title}`,
    `Price: $${options[1].estimatedPrice.toFixed(2)}`,
    `Style: ${options[1].description}`,
    "",
    `C. ${options[2].title}`,
    `Price: $${options[2].estimatedPrice.toFixed(2)}`,
    `Style: ${options[2].description}`,
    "",
    "Reply A / B / C to choose a concept.",
    'You can also say "Modify A: make it darker."'
  ].join("\n");
}

function buildPreviewReply(language: LanguagePreference): string {
  return language === "zh"
    ? ["✅ 已生成首版设计图", "", "回复：", "1️⃣ 确认并生成下单链接", "2️⃣ 修改设计", "3️⃣ 再生成几个方案"].join("\n")
    : ["✅ Preview generated", "", "Reply:", "1 Confirm and create product link", "2 Modify design", "3 Generate new options"].join("\n");
}

function buildOrderLinkReply(params: {
  language: LanguagePreference;
  orderNo: string;
  title: string;
  price: string;
  url: string;
  linkType: "product" | "checkout";
}): string {
  const { language, orderNo, title, price, url, linkType } = params;

  if (language === "zh") {
    return [
      linkType === "checkout" ? "✅ 付款链接已生成" : "✅ 产品链接已生成",
      "",
      `订单号：${orderNo}`,
      `商品：${title}`,
      `价格：$${price}`,
      `${linkType === "checkout" ? "付款链接" : "产品链接"}：${url}`,
      ...(linkType === "product" ? ["", "如需直接付款，请回复“付款链接”。"] : [])
    ].join("\n");
  }

  return [
    linkType === "checkout" ? "✅ Payment link generated" : "✅ Product link generated",
    "",
    `Order No: ${orderNo}`,
    `Product: ${title}`,
    `Price: $${price}`,
    `${linkType === "checkout" ? "Payment Link" : "Product Link"}: ${url}`,
    ...(linkType === "product" ? ["", 'Reply "payment link" if you want direct checkout.'] : [])
  ].join("\n");
}

async function maybeCreateProject(input: WorkflowInput, prompt: string): Promise<ProjectContext> {
  return input.project || (await memoryService.createProject(input.discordUserId, input.message, prompt));
}

function stampDraft(draft: CurrentOrderDraft, language: LanguagePreference): CurrentOrderDraft {
  return {
    ...draft,
    language,
    lastActiveAt: new Date().toISOString()
  };
}

async function persistPermanentImageOrFail(params: {
  input: WorkflowInput;
  tempImageUrl?: string;
  failureStage: ProjectStage;
}): Promise<{ ok: true; permanentImageUrl: string } | { ok: false; response: WorkflowResponse }> {
  const { input, tempImageUrl, failureStage } = params;

  if (!tempImageUrl) {
    return {
      ok: false,
      response: {
        reply: t(input.language, "图片生成失败：未返回图片链接。", "Image generation failed: no image URL was returned."),
        stage: failureStage,
        memoryPatch: { language: input.language }
      }
    };
  }

  try {
    const permanentImageUrl = await storageService.uploadImageFromUrl(tempImageUrl);
    return { ok: true, permanentImageUrl };
  } catch (error) {
    return {
      ok: false,
      response: {
        reply: t(
          input.language,
          `图片已生成，但永久存储失败：${error instanceof Error ? error.message : "未知错误"}。请重试后再创建商品。`,
          `The preview was generated, but permanent storage failed: ${error instanceof Error ? error.message : "Unknown error"}. Please retry before creating a product link.`
        ),
        stage: failureStage,
        imageUrls: tempImageUrl ? [tempImageUrl] : [],
        memoryPatch: { language: input.language }
      }
    };
  }
}

export class SalesWorkflowService {
  async createDraftOptions(input: WorkflowInput): Promise<WorkflowResponse> {
    const shippingType = stateManagerService.inferShippingType(input.message, input.memory);
    console.log(`[LANGUAGE] detected=${input.language}`);
    console.log(`[CONCEPT] using ${input.language} templates`);

    const options = buildConceptOptions(input.message, input.language, shippingType);
    const project = await maybeCreateProject(input, options[0].prompt);
    const order =
      (input.memory.currentOrderDraft?.orderId && (await orderService.getOrderById(input.memory.currentOrderDraft.orderId))) ||
      (await orderService.getLatestActiveOrderByDiscordUser(input.discordUserId)) ||
      (await orderService.createDraftOrder({
        discordUserId: input.discordUserId,
        originalPrompt: input.message,
        cardProjectId: project.projectId,
        metadata: { source: "discord", type: "card_design" }
      }));

    await memoryService.replaceImageOptions(
      project.projectId,
      options.map((option) => ({
        id: option.id,
        title: option.title,
        imageUrl: "",
        prompt: option.prompt,
        summary: option.description,
        style: option.style
      }))
    );

    await memoryService.updateProject(project.projectId, {
      status: "draft_design",
      currentPrompt: options[0].prompt,
      finalDesignSummary: options[0].style
    });
    await orderService.saveDraftOptions(order.id, options);

    const currentOrderDraft = stampDraft(
      {
        orderId: order.id,
        orderNo: order.orderNo,
        discordUserId: input.discordUserId,
        stage: "draft_options",
        originalMessage: input.message,
        options,
        selectedOption: null,
        imageUrl: "",
        productTitle: "",
        productDescription: "",
        price: "",
        shippingType,
        shopifyProductUrl: ""
      },
      input.language
    );

    console.log("[SESSION] set flowMode=AI_CARD_ORDER");
    console.log("[ORDER_FLOW] stage=draft_options");

    return {
      reply: buildDraftOptionsReply(input.language, options),
      stage: "draft_design",
      memoryPatch: {
        language: input.language,
        flowMode: "AI_CARD_ORDER",
        stage: "draft_design",
        currentStage: "draft_design",
        latestPrompt: options[0].prompt,
        latestDesignStyle: options[0].style,
        latestPrice: options[0].estimatedPrice.toFixed(2),
        latestShippingType: shippingType,
        currentOrderDraft
      }
    };
  }

  async generateImageForSelectedOption(input: WorkflowInput, selectedId: "A" | "B" | "C"): Promise<WorkflowResponse> {
    const draft = input.memory.currentOrderDraft;
    const selectedOption = draft?.options.find((option) => option.id === selectedId) || null;

    if (!draft || !selectedOption) {
      return {
        reply: t(input.language, "我还没有可选方案，请先让我为你生成 A/B/C 方案。", "I do not have card options yet. Let me generate A/B/C concepts first."),
        stage: input.memory.currentStage || "idle",
        memoryPatch: { language: input.language }
      };
    }

    if (draft.orderId) {
      await orderService.saveSelectedOption(draft.orderId, selectedOption, draft.originalMessage);
    }

    const generated = await imageService.generateImage(selectedOption.prompt, selectedOption.style);
    if (!generated.ok) {
      return {
        reply: t(input.language, `图片生成失败：${generated.error || "未知错误"}`, `Image generation failed: ${generated.error || "Unknown error"}`),
        stage: "draft_design",
        memoryPatch: { language: input.language }
      };
    }

    const persisted = await persistPermanentImageOrFail({
      input,
      tempImageUrl: generated.imageUrl,
      failureStage: "draft_design"
    });
    if (!persisted.ok) {
      return persisted.response;
    }

    if (input.project?.projectId) {
      await memoryService.updateProject(input.project.projectId, {
        status: "waiting_confirmation",
        currentPrompt: selectedOption.prompt,
        finalDesignSummary: selectedOption.style
      });
    }

    if (draft.orderId) {
      const currentOrder = await orderService.getOrderById(draft.orderId);
      await orderService.attachGeneratedImage(draft.orderId, persisted.permanentImageUrl, selectedOption.prompt);
      await orderService.updateOrderStatus(draft.orderId, OrderStatus.WAITING_CONFIRMATION, {
        metadata: {
          ...((currentOrder?.metadata as Record<string, unknown> | null) || {}),
          permanentImageUrl: persisted.permanentImageUrl
        }
      });
    }

    console.log(`[ORDER_FLOW] option selected ${selectedId}`);
    console.log("[IMAGE] success");
    console.log("[ORDER_FLOW] stage=waiting_confirmation");

    return {
      reply: buildPreviewReply(input.language),
      stage: "waiting_confirmation",
      imageUrls: [persisted.permanentImageUrl],
      memoryPatch: {
        language: input.language,
        flowMode: "AI_CARD_ORDER",
        stage: "waiting_confirmation",
        currentStage: "waiting_confirmation",
        selectedOption: selectedOption.id,
        selectedOptionTitle: selectedOption.title,
        selectedDesignSummary: selectedOption.description,
        selectedImageUrl: persisted.permanentImageUrl,
        latestImageUrl: persisted.permanentImageUrl,
        currentPrompt: selectedOption.prompt,
        latestPrompt: selectedOption.prompt,
        latestDesignStyle: selectedOption.style,
        latestImageProvider: generated.imageProvider || "",
        latestImageModel: generated.imageModel || "",
        latestPrice: selectedOption.estimatedPrice.toFixed(2),
        latestShippingType: selectedOption.shippingType,
        latestProductTitle: selectedOption.title,
        latestProductDescription: buildDescription(selectedOption, draft.originalMessage, input.language),
        currentOrderDraft: stampDraft(
          {
            ...draft,
            stage: "waiting_confirmation",
            selectedOption,
            imageUrl: persisted.permanentImageUrl,
            productTitle: selectedOption.title,
            productDescription: buildDescription(selectedOption, draft.originalMessage, input.language),
            price: selectedOption.estimatedPrice.toFixed(2),
            shippingType: selectedOption.shippingType
          },
          input.language
        )
      }
    };
  }

  async modifyCurrentDesign(input: WorkflowInput): Promise<WorkflowResponse> {
    const draft = input.memory.currentOrderDraft;
    const selected = draft?.selectedOption;

    if (!draft || !selected) {
      return this.createDraftOptions(input);
    }

    const revisedPrompt = `${selected.prompt}. Modify this design according to: ${input.message}`;
    const generated = await imageService.generateImage(revisedPrompt, selected.style);
    if (!generated.ok) {
      return {
        reply: t(input.language, `图片生成失败：${generated.error || "未知错误"}`, `Image generation failed: ${generated.error || "Unknown error"}`),
        stage: "waiting_confirmation",
        memoryPatch: { language: input.language }
      };
    }

    const persisted = await persistPermanentImageOrFail({
      input,
      tempImageUrl: generated.imageUrl,
      failureStage: "waiting_confirmation"
    });
    if (!persisted.ok) {
      return persisted.response;
    }

    const updatedOption: OrderDraftOption = {
      ...selected,
      description: input.language === "zh" ? `${selected.description} / 已按要求修改` : `${selected.description} / Updated based on your feedback`
    };

    if (input.project?.projectId) {
      await memoryService.saveFeedbackLog({
        projectId: input.project.projectId,
        discordUserId: input.discordUserId,
        feedbackText: input.message,
        oldPrompt: selected.prompt,
        newPrompt: revisedPrompt
      });
      await memoryService.updateProject(input.project.projectId, {
        status: "waiting_confirmation",
        currentPrompt: revisedPrompt,
        finalDesignSummary: updatedOption.style
      });
    }

    if (draft.orderId) {
      const currentOrder = await orderService.getOrderById(draft.orderId);
      await orderService.saveSelectedOption(draft.orderId, { ...updatedOption, prompt: revisedPrompt }, draft.originalMessage);
      await orderService.attachGeneratedImage(draft.orderId, persisted.permanentImageUrl, revisedPrompt);
      await orderService.updateOrderStatus(draft.orderId, OrderStatus.WAITING_CONFIRMATION, {
        metadata: {
          ...((currentOrder?.metadata as Record<string, unknown> | null) || {}),
          permanentImageUrl: persisted.permanentImageUrl
        }
      });
    }

    return {
      reply: buildPreviewReply(input.language),
      stage: "waiting_confirmation",
      imageUrls: [persisted.permanentImageUrl],
      memoryPatch: {
        language: input.language,
        flowMode: "AI_CARD_ORDER",
        stage: "waiting_confirmation",
        currentStage: "waiting_confirmation",
        currentPrompt: revisedPrompt,
        latestPrompt: revisedPrompt,
        latestImageUrl: persisted.permanentImageUrl,
        selectedImageUrl: persisted.permanentImageUrl,
        latestDesignStyle: updatedOption.style,
        latestImageProvider: generated.imageProvider || "",
        latestImageModel: generated.imageModel || "",
        revisionHistory: [...input.memory.revisionHistory, input.message].slice(-10),
        currentOrderDraft: stampDraft(
          {
            ...draft,
            stage: "waiting_confirmation",
            selectedOption: { ...updatedOption, prompt: revisedPrompt },
            imageUrl: persisted.permanentImageUrl,
            productDescription: buildDescription(updatedOption, draft.originalMessage, input.language)
          },
          input.language
        )
      }
    };
  }

  async regenerateOptions(input: WorkflowInput): Promise<WorkflowResponse> {
    const draft = input.memory.currentOrderDraft;
    const baseMessage = draft?.originalMessage || input.message;
    const shippingType = draft?.shippingType || stateManagerService.inferShippingType(input.message, input.memory);
    console.log(`[LANGUAGE] detected=${input.language}`);
    console.log(`[CONCEPT] using ${input.language} templates`);

    const refreshed = buildConceptOptions(`${baseMessage} ${input.message}`, input.language, shippingType);

    if (input.project?.projectId) {
      await memoryService.replaceImageOptions(
        input.project.projectId,
        refreshed.map((option) => ({
          id: option.id,
          title: option.title,
          imageUrl: "",
          prompt: option.prompt,
          summary: option.description,
          style: option.style
        }))
      );
      await memoryService.updateProject(input.project.projectId, {
        status: "draft_design",
        currentPrompt: refreshed[0].prompt,
        finalDesignSummary: refreshed[0].style
      });
    }

    console.log("[SESSION] set flowMode=AI_CARD_ORDER");
    console.log("[ORDER_FLOW] stage=draft_options");

    return {
      reply: buildDraftOptionsReply(input.language, refreshed),
      stage: "draft_design",
      memoryPatch: {
        language: input.language,
        flowMode: "AI_CARD_ORDER",
        stage: "draft_design",
        currentStage: "draft_design",
        currentOrderDraft: stampDraft(
          {
            orderId: draft?.orderId,
            orderNo: draft?.orderNo,
            discordUserId: input.discordUserId,
            stage: "draft_options",
            originalMessage: baseMessage,
            options: refreshed,
            selectedOption: null,
            imageUrl: "",
            productTitle: "",
            productDescription: "",
            price: "",
            shippingType: refreshed[0].shippingType,
            shopifyProductUrl: ""
          },
          input.language
        )
      }
    };
  }

  async createOrderLink(input: WorkflowInput, requestedLinkType: "product" | "checkout" = "product"): Promise<WorkflowResponse> {
    const draft = input.memory.currentOrderDraft;

    if (draft?.shopifyProductUrl) {
      const resolvedCheckoutUrl =
        draft.shopifyCheckoutUrl ||
        (draft.orderId ? (await orderService.getOrderById(draft.orderId))?.shopifyCheckoutUrl || "" : "") ||
        draft.shopifyProductUrl;
      const resolvedLink = requestedLinkType === "checkout" ? resolvedCheckoutUrl : draft.shopifyProductUrl;

      return {
        reply: buildOrderLinkReply({
          language: input.language,
          orderNo: draft.orderNo || "-",
          title: draft.productTitle || input.memory.latestProductTitle || "Custom AI Trading Card",
          price: draft.price || input.memory.latestPrice || "29.99",
          url: resolvedLink,
          linkType: requestedLinkType
        }),
        stage: "payment_stage",
        memoryPatch: { language: input.language }
      };
    }

    if (!draft || draft.stage !== "waiting_confirmation" || !draft.selectedOption) {
      return {
        reply: t(
          input.language,
          "我还没有你的最终确认设计，请先选择方案并生成卡牌图。",
          "I do not have your confirmed design yet. Please choose a concept and generate the card image first."
        ),
        stage: input.memory.currentStage || "idle",
        memoryPatch: { language: input.language }
      };
    }

    if (!draft.imageUrl) {
      return {
        reply: t(input.language, "缺少卡牌图，请先重新生成图片。", "Missing card artwork. Please generate the card image first."),
        stage: "waiting_confirmation",
        memoryPatch: { language: input.language }
      };
    }

    const permanentImageUrl = await storageService.ensurePermanentImageUrl(draft.imageUrl);
    if (!permanentImageUrl) {
      return {
        reply: t(input.language, "永久图片链接缺失，请重新生成图片。", "A permanent image URL is missing. Please generate the card image again."),
        stage: "waiting_confirmation",
        memoryPatch: { language: input.language }
      };
    }

    console.log("[SHOPIFY] create product from draft");
    console.log(`[SHOPIFY IMAGE] using permanentImageUrl=${permanentImageUrl}`);

    const created = await shopifyService.createShopifyProductFromDiscord({
      title: draft.selectedOption.title,
      price: Number(draft.price || draft.selectedOption.estimatedPrice),
      description: draft.productDescription || buildDescription(draft.selectedOption, draft.originalMessage, input.language),
      imageUrl: permanentImageUrl,
      shippingType: draft.shippingType,
      tags: ["discord-order", "custom-card", "lootcard-ai", draft.selectedOption.style],
      seoTitle: `${draft.selectedOption.title} Trading Card`,
      seoDescription: `${draft.selectedOption.title} by LootCard AI. ${draft.selectedOption.description}. Custom-made product with around 30 days production and delivery.`
    });

    const checkoutUrl = created.checkoutUrl || created.productUrl;
    const productUrl = created.productUrl || checkoutUrl;

    if (!created.ok || !checkoutUrl || !productUrl) {
      return {
        reply: t(
          input.language,
          `Shopify 产品创建失败：${created.error || "未知错误"}`,
          `Shopify product creation failed: ${created.error || "Unknown error"}`
        ),
        stage: "waiting_confirmation",
        memoryPatch: { language: input.language }
      };
    }

    if (draft.orderId) {
      const numericProductId = created.productId?.split("/").pop() || created.productId;
      const numericVariantId = created.variantId?.split("/").pop() || created.variantId;
      await orderService.markShopifyCreated(draft.orderId);
      await orderService.attachShopifyProduct(draft.orderId, {
        shopifyShop: created.shop,
        shopifyProductId: numericProductId,
        shopifyProductGid: created.productId,
        shopifyVariantId: numericVariantId,
        shopifyVariantGid: created.variantId,
        shopifyProductUrl: productUrl,
        shopifyCheckoutUrl: checkoutUrl,
        productTitle: draft.selectedOption.title,
        productDescription: draft.productDescription,
        price: Number(draft.price || draft.selectedOption.estimatedPrice),
        metadata: {
          source: "discord",
          orderNo: draft.orderNo,
          permanentImageUrl
        }
      });
    }

    if (input.project?.projectId) {
      await memoryService.updateProject(input.project.projectId, {
        status: "payment_stage",
        currentPrompt: draft.selectedOption.prompt,
        finalDesignSummary: draft.selectedOption.style,
        shopifyProductId: created.productId,
        shopifyProductUrl: productUrl
      });
      if (created.productId) {
        await memoryService.logShopifyProduct({
          projectId: input.project.projectId,
          discordUserId: input.discordUserId,
          shopifyProductId: created.productId,
          shopifyProductUrl: productUrl,
          title: draft.selectedOption.title,
          price: Number(draft.price || draft.selectedOption.estimatedPrice).toFixed(2),
          sku: created.variantId || `DISCORD-${Date.now()}`
        });
      }
    }

    const finalLink = requestedLinkType === "checkout" ? checkoutUrl : productUrl;

    return {
      reply: buildOrderLinkReply({
        language: input.language,
        orderNo: draft.orderNo || "-",
        title: draft.selectedOption.title,
        price: Number(draft.price || draft.selectedOption.estimatedPrice).toFixed(2),
        url: finalLink,
        linkType: requestedLinkType
      }),
      stage: "payment_stage",
      memoryPatch: {
        language: input.language,
        flowMode: "IDLE",
        stage: "payment_stage",
        currentStage: "payment_stage",
        latestShopifyProductId: created.productId || "",
        latestShopifyProductUrl: productUrl,
        latestProductTitle: draft.selectedOption.title,
        latestProductDescription: draft.productDescription,
        latestPrice: Number(draft.price || draft.selectedOption.estimatedPrice).toFixed(2),
        currentOrderDraft: stampDraft(
          {
            ...draft,
            stage: "shopify_created",
            imageUrl: permanentImageUrl,
            shopifyProductUrl: productUrl,
            shopifyCheckoutUrl: checkoutUrl
          },
          input.language
        ),
        shopifyProductUrl: productUrl
      }
    };
  }

  async answerGeneralQuestion(input: WorkflowInput): Promise<WorkflowResponse> {
    const reply = await openRouterService.chat({
      message: input.message,
      history: input.recentConversation,
      language: input.language
    });

    return {
      reply,
      stage: input.memory.currentStage || "idle",
      memoryPatch: { language: input.language }
    };
  }
}

export const salesWorkflowService = new SalesWorkflowService();
