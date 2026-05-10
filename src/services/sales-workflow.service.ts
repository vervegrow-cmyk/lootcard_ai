import {
  ConversationEntry,
  GeneratedImageResult,
  HermesMemory,
  ImageOption,
  LanguagePreference,
  ProjectContext,
  ProjectStage,
  ShippingType
} from "../types";
import { imageService } from "./image.service";
import { memoryService } from "./memory.service";
import { openRouterService } from "./openrouter.service";
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

  if (/(黑金|black gold)/.test(text)) {
    return "黑金限定";
  }

  if (/(赛博朋克|cyberpunk)/.test(text)) {
    return "赛博朋克";
  }

  if (/(anime card|trading card|动漫卡|动漫卡牌)/.test(text)) {
    return "动漫收藏卡";
  }

  return memory.latestDesignStyle || "高级动漫卡牌";
}

function inferCraft(style: string): string {
  if (/黑金|SSR/.test(style)) {
    return "烫金 + 全息";
  }

  if (/赛博朋克/.test(style)) {
    return "镭射 + 霓虹浮雕";
  }

  return "全息 + 收藏卡工艺";
}

function inferTitle(style: string, memory: HermesMemory): string {
  if (/黑金|black gold/i.test(style)) {
    return "Black Gold SSR Anime Card";
  }

  if (/赛博朋克/.test(style)) {
    return "Cyberpunk Trading Card";
  }

  if (memory.character) {
    return `${memory.character} Custom Trading Card`;
  }

  return "Custom AI Trading Card";
}

function buildMarketingDescription(params: {
  style: string;
  craft: string;
  shippingType: ShippingType;
  prompt: string;
}): string {
  const shippingText =
    params.shippingType === "digital_download"
      ? "Delivery mode: digital download."
      : params.shippingType === "physical_card_us"
        ? "Shipping region: United States physical card delivery."
        : "Shipping region: China / international physical card delivery.";

  return [
    `<p><strong>${params.style}</strong> collectible AI trading card.</p>`,
    `<p>Craft details: ${params.craft}.</p>`,
    "<p>Production and delivery usually takes about 30 days.</p>",
    `<p>${shippingText}</p>`,
    `<p>Design reference: ${params.prompt}</p>`
  ].join("");
}

function buildPrompt(message: string, memory: HermesMemory, style: string): string {
  const base =
    memory.latestPrompt ||
    "premium anime trading card, collectible layout, vertical card composition, high detail, cinematic lighting";

  const styleClause = (() => {
    if (/黑金|black gold/i.test(style)) {
      return "black gold premium SSR anime trading card, foil stamped frame, holographic shine";
    }
    if (/赛博朋克/.test(style)) {
      return "cyberpunk anime trading card, neon accents, metallic futuristic frame";
    }
    return "premium anime trading card, glossy collectible finish, high-detail frame";
  })();

  return `${base}, ${styleClause}, user request: ${message}`.replace(/\s+/g, " ").trim();
}

function buildRevisionPrompt(memory: HermesMemory, message: string): string {
  return `${memory.latestPrompt || memory.currentPrompt}. Update the existing design with these changes: ${message}`.trim();
}

async function maybeCreateProject(input: WorkflowInput, prompt: string): Promise<ProjectContext> {
  return (
    input.project ||
    (await memoryService.createProject(input.discordUserId, input.message, prompt))
  );
}

export class SalesWorkflowService {
  private async generateSingleImage(prompt: string, style: string): Promise<GeneratedImageResult> {
    const generated = await imageService.generateImage(prompt, style);
    if (!generated.ok) {
      return generated;
    }

    return generated;
  }

  async generateDraft(input: WorkflowInput): Promise<WorkflowResponse> {
    const style = inferStyle(input.message, input.memory);
    const craft = inferCraft(style);
    const prompt = buildPrompt(input.message, input.memory, style);
    const pricing = pricingService.inferPrice(`${style} ${input.message}`);
    const shippingType = stateManagerService.inferShippingType(input.message, input.memory);
    const title = inferTitle(style, input.memory);
    const description = buildMarketingDescription({
      style,
      craft,
      shippingType,
      prompt
    });

    const generated = await this.generateSingleImage(prompt, style);
    if (!generated.ok) {
      return {
        reply: `图片生成失败：${generated.error || "未知错误"}`,
        stage: input.memory.currentStage || "idle",
        memoryPatch: {}
      };
    }

    const project = await maybeCreateProject(input, prompt);
    const nextStage = stateManagerService.nextStageAfterImage();

    await memoryService.updateProject(project.projectId, {
      status: nextStage,
      currentPrompt: prompt,
      finalDesignSummary: style
    });

    const option: ImageOption = {
      id: "A",
      title,
      imageUrl: generated.imageUrl || "",
      prompt,
      summary: generated.summary,
      style,
      provider: generated.imageProvider,
      model: generated.imageModel
    };
    await memoryService.replaceImageOptions(project.projectId, [option]);

    return {
      reply: [
        "✅ 已生成首版卡牌设计",
        "",
        `风格：${style}`,
        `工艺：${craft}`,
        "尺寸：Trading Card",
        "",
        "请选择：",
        "",
        "1️⃣ 生成购买链接",
        "2️⃣ 修改设计",
        "3️⃣ 再生成几个方案"
      ].join("\n"),
      stage: nextStage,
      imageUrls: generated.imageUrl ? [generated.imageUrl] : [],
      memoryPatch: {
        stage: nextStage,
        currentStage: nextStage,
        style,
        currentPrompt: prompt,
        latestPrompt: prompt,
        latestImageUrl: generated.imageUrl || "",
        latestDesignStyle: style,
        latestImageProvider: generated.imageProvider || "",
        latestImageModel: generated.imageModel || "",
        latestPrice: pricing.price.toFixed(2),
        latestShippingType: shippingType,
        latestProductTitle: title,
        latestProductDescription: description,
        selectedImageUrl: generated.imageUrl || "",
        selectedDesignSummary: style,
        selectedOption: "A",
        selectedOptionTitle: title,
        preferredStyles: Array.from(new Set([...input.memory.preferredStyles, style])),
        rarity: /SSR/i.test(style) ? "SSR" : input.memory.rarity
      }
    };
  }

  async modifyDraft(input: WorkflowInput): Promise<WorkflowResponse> {
    if (!input.memory.latestPrompt) {
      return this.generateDraft(input);
    }

    const style = inferStyle(input.message, input.memory);
    const craft = inferCraft(style);
    const prompt = buildRevisionPrompt(input.memory, input.message);
    const generated = await this.generateSingleImage(prompt, style);

    if (!generated.ok) {
      return {
        reply: `图片生成失败：${generated.error || "未知错误"}`,
        stage: input.memory.currentStage || "waiting_confirmation",
        memoryPatch: {}
      };
    }

    if (input.project?.projectId) {
      await memoryService.saveFeedbackLog({
        projectId: input.project.projectId,
        discordUserId: input.discordUserId,
        feedbackText: input.message,
        oldPrompt: input.memory.latestPrompt,
        newPrompt: prompt
      });
      await memoryService.updateProject(input.project.projectId, {
        status: "waiting_confirmation",
        currentPrompt: prompt,
        finalDesignSummary: style
      });
    }

    return {
      reply: [
        "✅ 已根据你的要求更新设计",
        "",
        `风格：${style}`,
        `工艺：${craft}`,
        "尺寸：Trading Card",
        "",
        "请选择：",
        "",
        "1️⃣ 生成购买链接",
        "2️⃣ 继续修改设计",
        "3️⃣ 再生成几个方案"
      ].join("\n"),
      stage: "waiting_confirmation",
      imageUrls: generated.imageUrl ? [generated.imageUrl] : [],
      memoryPatch: {
        stage: "waiting_confirmation",
        currentStage: "waiting_confirmation",
        currentPrompt: prompt,
        latestPrompt: prompt,
        latestImageUrl: generated.imageUrl || "",
        latestDesignStyle: style,
        latestImageProvider: generated.imageProvider || "",
        latestImageModel: generated.imageModel || "",
        selectedImageUrl: generated.imageUrl || "",
        selectedDesignSummary: style,
        revisionHistory: [...input.memory.revisionHistory, input.message].slice(-10)
      }
    };
  }

  async generateMoreOptions(input: WorkflowInput): Promise<WorkflowResponse> {
    const seedPrompt = input.memory.latestPrompt || buildPrompt(input.message, input.memory, inferStyle(input.message, input.memory));
    const style = inferStyle(input.message, input.memory);
    const results = await imageService.generateImages({
      prompt: `${seedPrompt}. Create variation candidates for this design.`,
      count: 3
    });

    if (!results.length) {
      return {
        reply: "图片生成失败：没有生成到可用方案。",
        stage: input.memory.currentStage || "waiting_confirmation",
        memoryPatch: {}
      };
    }

    if (input.project?.projectId) {
      await memoryService.replaceImageOptions(input.project.projectId, results);
      await memoryService.updateProject(input.project.projectId, {
        status: "waiting_confirmation",
        currentPrompt: seedPrompt,
        finalDesignSummary: style
      });
    }

    return {
      reply: [
        "✅ 已再生成几个方案",
        "",
        `风格：${style}`,
        "我先把 3 张方案发给你。",
        "如果你满意其中一张，直接回复“1 生成链接”即可。",
        "如果还要调整，直接告诉我你想改哪里。"
      ].join("\n"),
      stage: "waiting_confirmation",
      imageUrls: results.map((item) => item.imageUrl).filter(Boolean),
      memoryPatch: {
        stage: "waiting_confirmation",
        currentStage: "waiting_confirmation",
        latestPrompt: seedPrompt,
        currentPrompt: seedPrompt,
        latestDesignStyle: style,
        latestImageUrl: results[0]?.imageUrl || input.memory.latestImageUrl,
        selectedImageUrl: results[0]?.imageUrl || input.memory.selectedImageUrl,
        selectedOption: results[0]?.id || "A",
        selectedOptionTitle: results[0]?.title || input.memory.selectedOptionTitle
      }
    };
  }

  async createOrderLink(input: WorkflowInput): Promise<WorkflowResponse> {
    if (!input.memory.latestImageUrl || !input.memory.latestPrompt) {
      return {
        reply: "我还没有可下单的最终设计，请先让我帮你生成一版卡牌图。",
        stage: input.memory.currentStage || "idle",
        memoryPatch: {}
      };
    }

    const style = input.memory.latestDesignStyle || inferStyle(input.message, input.memory);
    const craft = inferCraft(style);
    const shippingType = input.memory.latestShippingType || stateManagerService.inferShippingType(input.message, input.memory);
    const title = input.memory.latestProductTitle || inferTitle(style, input.memory);
    const price = Number(input.memory.latestPrice || pricingService.inferPrice(style).price);
    const description =
      input.memory.latestProductDescription ||
      buildMarketingDescription({
        style,
        craft,
        shippingType,
        prompt: input.memory.latestPrompt
      });

    if (input.project?.projectId) {
      await memoryService.updateProject(input.project.projectId, {
        status: "creating_shopify_product",
        currentPrompt: input.memory.latestPrompt,
        finalDesignSummary: style
      });
    }

    const created = await shopifyService.createShopifyProductFromDiscord({
      title,
      price,
      description,
      imageUrl: input.memory.latestImageUrl,
      shippingType,
      tags: [
        "discord-order",
        "lootcard-ai",
        style,
        shippingType,
        craft.replace(/\s+/g, "-")
      ],
      seoTitle: title,
      seoDescription: `${title} by LootCard AI. ${craft}. Production and delivery usually takes about 30 days.`
    });

    if (!created.ok || !created.productUrl) {
      return {
        reply: `Shopify 产品创建失败：${created.error || "未知错误"}`,
        stage: "waiting_confirmation",
        memoryPatch: {
          stage: "waiting_confirmation",
          currentStage: "waiting_confirmation"
        }
      };
    }

    if (input.project?.projectId && created.productId) {
      await memoryService.updateProject(input.project.projectId, {
        status: "payment_stage",
        currentPrompt: input.memory.latestPrompt,
        finalDesignSummary: style,
        shopifyProductId: created.productId,
        shopifyProductUrl: created.productUrl
      });
      await memoryService.logShopifyProduct({
        projectId: input.project.projectId,
        discordUserId: input.discordUserId,
        shopifyProductId: created.productId,
        shopifyProductUrl: created.productUrl,
        title,
        price: price.toFixed(2),
        sku: created.variantId || `DISCORD-${Date.now()}`
      });
    }

    return {
      reply: [
        "✅ 您的专属卡牌已生成",
        "",
        `商品名：${title}`,
        "",
        `价格：$${price.toFixed(2)}`,
        "",
        `工艺：${craft}`,
        "",
        `下单链接：${created.productUrl}`,
        "",
        "点击即可直接购买。"
      ].join("\n"),
      stage: "payment_stage",
      memoryPatch: {
        stage: "payment_stage",
        currentStage: "payment_stage",
        latestProductTitle: title,
        latestProductDescription: description,
        latestPrice: price.toFixed(2),
        latestShippingType: shippingType,
        latestShopifyProductId: created.productId || "",
        latestShopifyProductUrl: created.productUrl,
        shopifyProductUrl: created.productUrl,
        recentPurchaseContent: title
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
