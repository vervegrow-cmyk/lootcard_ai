import {
  ConversationEntry,
  CurrentOrderDraft,
  HermesMemory,
  ImageOption,
  LanguagePreference,
  OrderDraftOption,
  ProjectContext,
  ProjectStage,
  ShippingType
} from "../types";
import { imageService } from "./image.service";
import { memoryService } from "./memory.service";
import { openRouterService } from "./openrouter.service";
import { orderService } from "./order.service";
import { pricingService } from "./pricing.service";
import { stateManagerService } from "./state-manager.service";
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

function inferStyle(message: string, memory: HermesMemory): string {
  const text = `${memory.latestDesignStyle} ${message}`.toLowerCase();

  if (/(黑金|black gold)/.test(text) && /ssr/.test(text)) {
    return "黑金SSR";
  }
  if (/(赛博朋克|cyberpunk)/.test(text)) {
    return "赛博朋克";
  }
  if (/(签名|signed|signature)/.test(text)) {
    return "高级收藏签名卡";
  }

  return memory.latestDesignStyle || "动漫卡牌";
}

function inferCraft(style: string): string {
  if (/黑金|SSR/.test(style)) {
    return "烫金 / 全息 / 动漫角色";
  }
  if (/赛博朋克/.test(style)) {
    return "霓虹 / 机甲 / 战斗感";
  }
  if (/签名/.test(style)) {
    return "限量 / 签名 / 收藏级";
  }
  return "全息 / 收藏卡工艺";
}

function inferTitle(style: string): string {
  if (/黑金|SSR/.test(style)) {
    return "黑金SSR典藏卡";
  }
  if (/赛博朋克/.test(style)) {
    return "赛博朋克战斗卡";
  }
  if (/签名/.test(style)) {
    return "高级收藏签名卡";
  }
  return "高级动漫收藏卡";
}

function buildCommercialPrompt(baseRequest: string, style: string): string {
  const stylePromptMap: Record<string, string> = {
    黑金SSR:
      "black gold SSR anime trading card, premium foil frame, holographic shine, luxury collectible card, cinematic lighting",
    赛博朋克:
      "cyberpunk anime trading card, neon edges, battle posture, futuristic metallic frame, premium collectible composition",
    高级收藏签名卡:
      "limited signature anime trading card, premium collector edition, elegant embossing, luxury finish, showcase composition",
    动漫卡牌:
      "anime trading card, premium collectible frame, vertical composition, glossy hero card, high detail"
  };

  const stylePrompt = stylePromptMap[style] || stylePromptMap["动漫卡牌"];
  return `${stylePrompt}, user request: ${baseRequest}`.replace(/\s+/g, " ").trim();
}

function buildDescription(option: OrderDraftOption, originalMessage: string): string {
  return [
    `<p><strong>${option.title}</strong></p>`,
    `<p>风格：${option.style}</p>`,
    `<p>工艺：${inferCraft(option.style)}</p>`,
    `<p>用户需求：${originalMessage}</p>`,
    "<p>发货说明：定制商品预计 30 天左右制作并发货。</p>",
    "<p>定制说明：最终成品将按照当前确认方案生产。</p>"
  ].join("");
}

function createOptions(message: string, shippingType: ShippingType): OrderDraftOption[] {
  const optionAStyle = /黑金|ssr/i.test(message) ? "黑金SSR" : "动漫卡牌";
  const optionBStyle = /赛博朋克|cyberpunk/i.test(message) ? "赛博朋克" : "赛博朋克";
  const optionCStyle = /签名|收藏|limited/i.test(message) ? "高级收藏签名卡" : "高级收藏签名卡";

  const optionA = {
    id: "A" as const,
    title: "黑金SSR典藏卡",
    style: optionAStyle,
    description: "黑金 / SSR / 全息 / 动漫角色",
    estimatedPrice: pricingService.inferPrice("ssr 黑金").price,
    shippingType,
    prompt: buildCommercialPrompt(message, optionAStyle)
  };

  const optionB = {
    id: "B" as const,
    title: "赛博朋克战斗卡",
    style: optionBStyle,
    description: "赛博朋克 / 霓虹 / 战斗感",
    estimatedPrice: 39.99,
    shippingType,
    prompt: buildCommercialPrompt(message, optionBStyle)
  };

  const optionC = {
    id: "C" as const,
    title: "高级收藏签名卡",
    style: optionCStyle,
    description: "限量 / 签名 / 收藏级",
    estimatedPrice: pricingService.inferPrice("限量签名").price,
    shippingType,
    prompt: buildCommercialPrompt(message, optionCStyle)
  };

  return [optionA, optionB, optionC];
}

async function maybeCreateProject(input: WorkflowInput, prompt: string): Promise<ProjectContext> {
  return input.project || (await memoryService.createProject(input.discordUserId, input.message, prompt));
}

export class SalesWorkflowService {
  async createDraftOptions(input: WorkflowInput): Promise<WorkflowResponse> {
    const shippingType = stateManagerService.inferShippingType(input.message, input.memory);
    const options = createOptions(input.message, shippingType);
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

    const currentOrderDraft: CurrentOrderDraft = {
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
    };

    return {
      reply: [
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
      ].join("\n"),
      stage: "draft_design",
      memoryPatch: {
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
        reply: "我还没有可选方案，请先让我为你生成 A/B/C 方案。",
        stage: input.memory.currentStage || "idle",
        memoryPatch: {}
      };
    }

    if (draft.orderId) {
      await orderService.saveSelectedOption(draft.orderId, selectedOption, draft.originalMessage);
    }

    const generated = await imageService.generateImage(selectedOption.prompt, selectedOption.style);
    if (!generated.ok) {
      return {
        reply: `图片生成失败：${generated.error || "未知错误"}`,
        stage: "draft_design",
        memoryPatch: {}
      };
    }

    if (input.project?.projectId) {
      await memoryService.updateProject(input.project.projectId, {
        status: "waiting_confirmation",
        currentPrompt: selectedOption.prompt,
        finalDesignSummary: selectedOption.style
      });
    }
    if (draft.orderId) {
      await orderService.attachGeneratedImage(draft.orderId, generated.imageUrl || "", selectedOption.prompt);
    }

    return {
      reply: [
        "✅ 已生成首版设计图",
        "",
        "回复：",
        "1️⃣ 确认并生成下单链接",
        "2️⃣ 修改设计",
        "3️⃣ 再生成几个方案"
      ].join("\n"),
      stage: "waiting_confirmation",
      imageUrls: generated.imageUrl ? [generated.imageUrl] : [],
      memoryPatch: {
        stage: "waiting_confirmation",
        currentStage: "waiting_confirmation",
        selectedOption: selectedOption.id,
        selectedOptionTitle: selectedOption.title,
        selectedDesignSummary: selectedOption.description,
        selectedImageUrl: generated.imageUrl || "",
        latestImageUrl: generated.imageUrl || "",
        currentPrompt: selectedOption.prompt,
        latestPrompt: selectedOption.prompt,
        latestDesignStyle: selectedOption.style,
        latestImageProvider: generated.imageProvider || "",
        latestImageModel: generated.imageModel || "",
        latestPrice: selectedOption.estimatedPrice.toFixed(2),
        latestShippingType: selectedOption.shippingType,
        latestProductTitle: selectedOption.title,
        latestProductDescription: buildDescription(selectedOption, draft.originalMessage),
        currentOrderDraft: {
          ...draft,
          stage: "waiting_confirmation",
          selectedOption,
          imageUrl: generated.imageUrl || "",
          productTitle: selectedOption.title,
          productDescription: buildDescription(selectedOption, draft.originalMessage),
          price: selectedOption.estimatedPrice.toFixed(2),
          shippingType: selectedOption.shippingType
        }
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
        reply: `图片生成失败：${generated.error || "未知错误"}`,
        stage: "waiting_confirmation",
        memoryPatch: {}
      };
    }

    const updatedOption: OrderDraftOption = {
      ...selected,
      description: `${selected.description} / 已按要求修改`
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
      await orderService.saveSelectedOption(draft.orderId, { ...updatedOption, prompt: revisedPrompt }, draft.originalMessage);
      await orderService.attachGeneratedImage(draft.orderId, generated.imageUrl || "", revisedPrompt);
    }

    return {
      reply: [
        "✅ 已更新设计图",
        "",
        "回复：",
        "1️⃣ 确认并生成下单链接",
        "2️⃣ 继续修改设计",
        "3️⃣ 再生成几个方案"
      ].join("\n"),
      stage: "waiting_confirmation",
      imageUrls: generated.imageUrl ? [generated.imageUrl] : [],
      memoryPatch: {
        stage: "waiting_confirmation",
        currentStage: "waiting_confirmation",
        currentPrompt: revisedPrompt,
        latestPrompt: revisedPrompt,
        latestImageUrl: generated.imageUrl || "",
        selectedImageUrl: generated.imageUrl || "",
        latestDesignStyle: updatedOption.style,
        latestImageProvider: generated.imageProvider || "",
        latestImageModel: generated.imageModel || "",
        revisionHistory: [...input.memory.revisionHistory, input.message].slice(-10),
        currentOrderDraft: {
          ...draft,
          stage: "waiting_confirmation",
          selectedOption: { ...updatedOption, prompt: revisedPrompt },
          imageUrl: generated.imageUrl || "",
          productDescription: buildDescription(updatedOption, draft.originalMessage)
        }
      }
    };
  }

  async regenerateOptions(input: WorkflowInput): Promise<WorkflowResponse> {
    const draft = input.memory.currentOrderDraft;
    const baseMessage = draft?.originalMessage || input.message;
    const baseOptions = createOptions(`${baseMessage} ${input.message}`, draft?.shippingType || stateManagerService.inferShippingType(input.message, input.memory));
    const refreshed = baseOptions.map((option, index) => ({
      ...option,
      title: index === 0 ? "黑金SSR典藏卡" : index === 1 ? "赛博朋克战斗卡" : "高级收藏签名卡"
    }));

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

    return {
      reply: [
        "✅ 已重新生成 3 个卡牌方案",
        "",
        `A. ${refreshed[0].title}`,
        `价格：$${refreshed[0].estimatedPrice.toFixed(2)}`,
        `风格：${refreshed[0].description}`,
        "",
        `B. ${refreshed[1].title}`,
        `价格：$${refreshed[1].estimatedPrice.toFixed(2)}`,
        `风格：${refreshed[1].description}`,
        "",
        `C. ${refreshed[2].title}`,
        `价格：$${refreshed[2].estimatedPrice.toFixed(2)}`,
        `风格：${refreshed[2].description}`,
        "",
        "回复 A / B / C 选择方案。",
        "也可以继续告诉我你想修改的方向。"
      ].join("\n"),
      stage: "draft_design",
      memoryPatch: {
        stage: "draft_design",
        currentStage: "draft_design",
        currentOrderDraft: {
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
        }
      }
    };
  }

  async createOrderLink(input: WorkflowInput): Promise<WorkflowResponse> {
    const draft = input.memory.currentOrderDraft;

    if (draft?.shopifyProductUrl) {
      return {
        reply: [
          "✅ 下单链接已生成",
          "",
          `订单号：${draft.orderNo || "-"}`,
          `商品：${draft.productTitle || input.memory.latestProductTitle || "Custom AI Trading Card"}`,
          `价格：$${draft.price || input.memory.latestPrice || "29.99"}`,
          `下单链接：${draft.shopifyProductUrl}`,
          "",
          "点击即可付款。"
        ].join("\n"),
        stage: "payment_stage",
        memoryPatch: {}
      };
    }

    if (!draft || !(draft.stage === "image_generated" || draft.stage === "waiting_confirmation") || !draft.selectedOption || !draft.imageUrl) {
      return {
        reply: "我还没有你的确认设计，请先选择方案并生成设计图。",
        stage: input.memory.currentStage || "idle",
        memoryPatch: {}
      };
    }

    const created = await shopifyService.createShopifyProductFromDiscord({
      title: draft.selectedOption.title,
      price: Number(draft.price || draft.selectedOption.estimatedPrice),
      description: draft.productDescription || buildDescription(draft.selectedOption, draft.originalMessage),
      imageUrl: draft.imageUrl,
      shippingType: draft.shippingType,
      tags: ["discord-order", "custom-card", "lootcard-ai", draft.selectedOption.style],
      seoTitle: draft.selectedOption.title,
      seoDescription: `${draft.selectedOption.title} by LootCard AI. ${draft.selectedOption.description}. 定制商品预计 30 天左右发货。`
    });

    const checkoutUrl = created.checkoutUrl || created.productUrl;

    if (!created.ok || !checkoutUrl) {
      return {
        reply: `Shopify 产品创建失败：${created.error || "未知错误"}`,
        stage: "waiting_confirmation",
        memoryPatch: {}
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
        shopifyProductUrl: created.productUrl,
        shopifyCheckoutUrl: checkoutUrl,
        productTitle: draft.selectedOption.title,
        productDescription: draft.productDescription,
        price: Number(draft.price || draft.selectedOption.estimatedPrice),
        metadata: {
          source: "discord",
          orderNo: draft.orderNo
        }
      });
    }

    if (input.project?.projectId) {
      await memoryService.updateProject(input.project.projectId, {
        status: "payment_stage",
        currentPrompt: draft.selectedOption.prompt,
        finalDesignSummary: draft.selectedOption.style,
        shopifyProductId: created.productId,
        shopifyProductUrl: checkoutUrl
      });
      if (created.productId) {
        await memoryService.logShopifyProduct({
          projectId: input.project.projectId,
          discordUserId: input.discordUserId,
          shopifyProductId: created.productId,
          shopifyProductUrl: checkoutUrl,
          title: draft.selectedOption.title,
          price: Number(draft.price || draft.selectedOption.estimatedPrice).toFixed(2),
          sku: created.variantId || `DISCORD-${Date.now()}`
        });
      }
    }

    return {
      reply: [
        "✅ 下单链接已生成",
        "",
        `订单号：${draft.orderNo || "-"}`,
        `商品：${draft.selectedOption.title}`,
        `价格：$${Number(draft.price || draft.selectedOption.estimatedPrice).toFixed(2)}`,
        `下单链接：${checkoutUrl}`,
        "",
        "点击即可付款。"
      ].join("\n"),
      stage: "payment_stage",
      memoryPatch: {
        stage: "payment_stage",
        currentStage: "payment_stage",
        latestShopifyProductId: created.productId || "",
        latestShopifyProductUrl: checkoutUrl,
        latestProductTitle: draft.selectedOption.title,
        latestProductDescription: draft.productDescription,
        latestPrice: Number(draft.price || draft.selectedOption.estimatedPrice).toFixed(2),
        currentOrderDraft: {
          ...draft,
          stage: "shopify_created",
          shopifyProductUrl: checkoutUrl
        },
        shopifyProductUrl: checkoutUrl
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
      memoryPatch: {}
    };
  }
}

export const salesWorkflowService = new SalesWorkflowService();
