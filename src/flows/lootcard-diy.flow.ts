import { OrderStatus } from "@prisma/client";
import { LanguagePreference, OrderDraftOption, ShippingType } from "../types";
import { imageService } from "../services/image.service";
import { memoryService } from "../services/memory.service";
import { orderService } from "../services/order.service";
import { shopifyService } from "../services/shopify.service";
import { storageService } from "../services/storage.service";

type DiyStage =
  | "IDLE"
  | "CONCEPT_OPTIONS"
  | "IMAGE_GENERATED"
  | "WAITING_CONFIRMATION"
  | "SHOPIFY_CREATED";

interface DiySession {
  discordUserId: string;
  username: string;
  language: LanguagePreference;
  stage: DiyStage;
  orderId?: string;
  orderNo?: string;
  originalMessage: string;
  options: OrderDraftOption[];
  selectedOption?: OrderDraftOption | null;
  imageUrl?: string;
  productUrl?: string;
  checkoutUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface DiyFlowInput {
  discordUserId: string;
  username: string;
  channelId: string;
  message: string;
}

interface DiyFlowResult {
  reply: string;
  imageUrls?: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function buildLanguage(message: string, fallback: LanguagePreference = "en"): LanguagePreference {
  const trimmed = message.trim();
  if (!trimmed) {
    return fallback;
  }

  if (/^(a|b|c|1|2|3)$/i.test(trimmed)) {
    return fallback;
  }

  if (hasChinese(trimmed)) {
    return "zh";
  }

  if (/[a-z]/i.test(trimmed)) {
    return "en";
  }

  return fallback;
}

function wantsEnglish(message: string): boolean {
  return /english please|reply in english|english|我要英文回复|英文回复/i.test(message);
}

function isCancel(message: string): boolean {
  return /^(cancel|reset|exit|start over|取消|重新开始)$/i.test(message.trim());
}

function isSelectOption(message: string): "A" | "B" | "C" | null {
  const normalized = message.trim().toUpperCase();
  return normalized === "A" || normalized === "B" || normalized === "C" ? normalized : null;
}

function isConfirm(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return [
    "1",
    "confirm",
    "yes",
    "ok",
    "go",
    "checkout",
    "buy"
  ].includes(normalized);
}

function isRegenerate(message: string): boolean {
  return /^(3|regenerate|retry|again|重新生成|再来几个方案)$/i.test(message.trim());
}

function isModifyCommand(message: string): boolean {
  return /^(2|modify|edit|change|修改|改一下)$/i.test(message.trim());
}

function isGreeting(message: string): boolean {
  return /^(hello|hi|hey|你好|您好)$/i.test(message.trim());
}

function isNewCardRequest(message: string): boolean {
  const text = message.trim();
  return (
    /给我|我要|帮我|做图|生成图片|生成卡牌|卡牌图|黑金SSR|女角色卡牌|10张/.test(text) ||
    /\bi want\b/i.test(text) ||
    /\bcreate\b/i.test(text) ||
    /\bgenerate\b/i.test(text) ||
    /\bnew card\b/i.test(text) ||
    /\bbeautiful girl card\b/i.test(text) ||
    /\banime card\b/i.test(text) ||
    /\bcustom trading card\b/i.test(text)
  );
}

function buildShippingType(message: string): ShippingType {
  const lower = message.toLowerCase();
  if (/digital|download|电子|下载/.test(lower)) {
    return "digital_download";
  }
  if (/us|usa|united states|美国/.test(lower)) {
    return "physical_card_us";
  }
  return "physical_card_cn";
}

function buildConcepts(message: string, language: LanguagePreference): OrderDraftOption[] {
  const shippingType = buildShippingType(message);
  const basePrompt = language === "zh" ? `${message}，高质量卡牌设计，收藏级构图` : `${message}, high quality trading card design, collectible composition`;

  const zh: OrderDraftOption[] = [
    {
      id: "A",
      title: "黑金SSR典藏卡",
      style: "黑金 / SSR / 全息 / 动漫角色",
      description: "黑金 / SSR / 全息 / 动漫角色",
      estimatedPrice: 99.99,
      shippingType,
      prompt: `black gold SSR anime trading card, luxury foil frame, holographic shine, premium collector card, cinematic lighting, ${basePrompt}`
    },
    {
      id: "B",
      title: "赛博朋克战斗卡",
      style: "赛博朋克 / 霓虹 / 战斗感",
      description: "赛博朋克 / 霓虹 / 战斗感",
      estimatedPrice: 39.99,
      shippingType,
      prompt: `cyberpunk anime trading card, neon frame, battle energy, futuristic premium composition, ${basePrompt}`
    },
    {
      id: "C",
      title: "高级收藏签名卡",
      style: "限量 / 签名 / 收藏级",
      description: "限量 / 签名 / 收藏级",
      estimatedPrice: 199.99,
      shippingType,
      prompt: `limited signature anime trading card, luxury collector edition, premium embossing, showcase composition, ${basePrompt}`
    }
  ];

  const en: OrderDraftOption[] = [
    {
      id: "A",
      title: "Black Gold SSR Collector Card",
      style: "Black Gold / SSR / Anime Character",
      description: "Black Gold / SSR / Anime Character",
      estimatedPrice: 99.99,
      shippingType,
      prompt: `black gold SSR anime trading card, luxury foil frame, holographic shine, premium collector card, cinematic lighting, ${basePrompt}`
    },
    {
      id: "B",
      title: "Cyberpunk Battle Card",
      style: "Cyberpunk / Neon / Combat",
      description: "Cyberpunk / Neon / Combat",
      estimatedPrice: 39.99,
      shippingType,
      prompt: `cyberpunk anime trading card, neon frame, battle energy, futuristic premium composition, ${basePrompt}`
    },
    {
      id: "C",
      title: "Premium Signature Collector Card",
      style: "Limited Edition / Signed / Luxury",
      description: "Limited Edition / Signed / Luxury",
      estimatedPrice: 199.99,
      shippingType,
      prompt: `limited signature anime trading card, luxury collector edition, premium embossing, showcase composition, ${basePrompt}`
    }
  ];

  console.log(`[CONCEPT] using ${language} templates`);
  return language === "zh" ? zh : en;
}

function conceptReply(language: LanguagePreference, options: OrderDraftOption[]): string {
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
      "回复 A / B / C 选择方案。"
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
    "Reply A / B / C to choose a concept."
  ].join("\n");
}

function previewReply(language: LanguagePreference): string {
  return language === "zh"
    ? ["✅ 已生成首版设计图", "", "回复：", "1 确认并生成产品链接", "2 修改设计", "3 重新生成方案"].join("\n")
    : ["✅ Preview generated", "", "Reply:", "1 Confirm and create product link", "2 Modify design", "3 Generate new options"].join("\n");
}

function inFlowReply(language: LanguagePreference): string {
  return language === "zh"
    ? "当前正在 AI 卡牌定制流程中。请回复 A/B/C 选择方案，或回复 1确认下单、2修改设计、3重新生成，或回复“取消”重新开始。"
    : "You’re currently in a card customization flow. Reply A/B/C, 1 to confirm, 2 to modify, 3 to regenerate, or type cancel to start over.";
}

function promptForRequirement(language: LanguagePreference): string {
  return language === "zh"
    ? "请直接告诉我你想做什么卡牌，例如：黑金SSR女角色卡牌。"
    : "Tell me what card you want, for example: a black gold SSR anime girl trading card.";
}

function productReply(params: {
  language: LanguagePreference;
  orderNo: string;
  title: string;
  price: string;
  productUrl: string;
}): string {
  if (params.language === "zh") {
    return [
      "✅ 产品链接已生成",
      "",
      `订单号：${params.orderNo}`,
      `商品：${params.title}`,
      `价格：$${params.price}`,
      `产品链接：${params.productUrl}`
    ].join("\n");
  }

  return [
    "✅ Product link generated",
    "",
    `Order No: ${params.orderNo}`,
    `Product: ${params.title}`,
    `Price: $${params.price}`,
    `Product Link: ${params.productUrl}`
  ].join("\n");
}

function buildDescription(session: DiySession, selected: OrderDraftOption): string {
  if (session.language === "zh") {
    return [
      `${selected.title}`,
      `风格：${selected.style}`,
      `原始需求：${session.originalMessage}`,
      "说明：这是根据用户定制需求生成的 AI 卡牌商品。",
      "发货：定制商品通常约 30 天制作并发货。"
    ].join("\n");
  }

  return [
    `${selected.title}`,
    `Style: ${selected.style}`,
    `Original request: ${session.originalMessage}`,
    "Description: Custom AI trading card created from the confirmed design request.",
    "Shipping: Custom orders usually take around 30 days for production and delivery."
  ].join("\n");
}

export class LootcardDiyFlow {
  private readonly sessions = new Map<string, DiySession>();

  private getSession(discordUserId: string): DiySession | null {
    return this.sessions.get(discordUserId) || null;
  }

  private async persistSession(session: DiySession): Promise<void> {
    this.sessions.set(session.discordUserId, {
      ...session,
      updatedAt: nowIso()
    });

    await memoryService.updateUserMemory({
      discordUserId: session.discordUserId,
      username: session.username,
      memoryPatch: {
        language: session.language,
        flowMode: session.stage === "SHOPIFY_CREATED" ? "IDLE" : "AI_CARD_ORDER",
        stage:
          session.stage === "CONCEPT_OPTIONS"
            ? "draft_design"
            : session.stage === "WAITING_CONFIRMATION"
              ? "waiting_confirmation"
              : session.stage === "SHOPIFY_CREATED"
                ? "payment_stage"
                : "idle",
        currentStage:
          session.stage === "CONCEPT_OPTIONS"
            ? "draft_design"
            : session.stage === "WAITING_CONFIRMATION"
              ? "waiting_confirmation"
              : session.stage === "SHOPIFY_CREATED"
                ? "payment_stage"
                : "idle",
        currentOrderDraft: {
          orderId: session.orderId,
          orderNo: session.orderNo,
          discordUserId: session.discordUserId,
          stage:
            session.stage === "CONCEPT_OPTIONS"
              ? "draft_options"
              : session.stage === "WAITING_CONFIRMATION"
                ? "waiting_confirmation"
                : session.stage === "SHOPIFY_CREATED"
                  ? "shopify_created"
                  : "draft_options",
          originalMessage: session.originalMessage,
          options: session.options,
          selectedOption: session.selectedOption || null,
          imageUrl: session.imageUrl || "",
          productTitle: session.selectedOption?.title || "",
          productDescription: session.selectedOption ? buildDescription(session, session.selectedOption) : "",
          price: session.selectedOption ? session.selectedOption.estimatedPrice.toFixed(2) : "",
          shippingType: session.selectedOption?.shippingType || session.options[0]?.shippingType || "physical_card_cn",
          shopifyProductUrl: session.productUrl || "",
          shopifyCheckoutUrl: session.checkoutUrl || "",
          language: session.language,
          lastActiveAt: session.updatedAt
        }
      }
    });
  }

  private async clearPersistedState(discordUserId: string, username: string, language: LanguagePreference): Promise<void> {
    await memoryService.updateUserMemory({
      discordUserId,
      username,
      memoryPatch: {
        language,
        flowMode: "IDLE",
        stage: "idle",
        currentStage: "idle",
        currentOrderDraft: null
      }
    });
  }

  isCancelRequest(message: string): boolean {
    return isCancel(message);
  }

  async cancel(params: DiyFlowInput): Promise<DiyFlowResult> {
    console.log("[DIY_FLOW] cancel matched");
    const current = this.getSession(params.discordUserId);
    const language = current?.language || buildLanguage(params.message, "zh");

    if (current?.orderId) {
      try {
        await orderService.cancelOrder(current.orderId, "user_cancelled");
      } catch {
        // ignore cancel persistence errors to keep reset deterministic
      }
    }

    this.sessions.delete(params.discordUserId);
    await this.clearPersistedState(params.discordUserId, params.username, language);
    console.log("[SESSION] language reset");
    console.log("[DIY_FLOW] reset complete");

    return {
      reply:
        language === "zh"
          ? "已取消当前卡牌定制流程。你可以直接发送新的卡牌需求重新开始。"
          : "The current card customization flow has been cancelled. Send a new card request to start over."
    };
  }

  private async startNewFlow(params: DiyFlowInput, language: LanguagePreference): Promise<DiyFlowResult> {
    const options = buildConcepts(params.message, language);
    const order = await orderService.createDraftOrder({
      discordUserId: params.discordUserId,
      discordChannelId: params.channelId,
      originalPrompt: params.message,
      metadata: {
        source: "lootcarddiy",
        language
      }
    });
    await orderService.saveDraftOptions(order.id, options);

    const session: DiySession = {
      discordUserId: params.discordUserId,
      username: params.username,
      language,
      stage: "CONCEPT_OPTIONS",
      orderId: order.id,
      orderNo: order.orderNo,
      originalMessage: params.message,
      options,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    await this.persistSession(session);
    console.log("[ORDER_FLOW] stage=CONCEPT_OPTIONS");

    return {
      reply: conceptReply(language, options)
    };
  }

  private async generateSelectedImage(session: DiySession, selectedId: "A" | "B" | "C"): Promise<DiyFlowResult> {
    const selected = session.options.find((option) => option.id === selectedId);
    if (!selected) {
      return { reply: inFlowReply(session.language) };
    }

    if (session.orderId) {
      await orderService.saveSelectedOption(session.orderId, selected, session.originalMessage);
    }

    const generated = await imageService.generateImage(selected.prompt, selected.style);
    if (!generated.ok || !generated.imageUrl) {
      return {
        reply:
          session.language === "zh"
            ? `图片生成失败：${generated.error || "未知错误"}`
            : `Image generation failed: ${generated.error || "Unknown error"}`
      };
    }

    const publicImageUrl = await storageService.uploadImageFromUrl(generated.imageUrl);
    if (!publicImageUrl) {
      return {
        reply:
          session.language === "zh"
            ? "图片永久存储失败，请稍后重试。"
            : "Permanent image storage failed. Please try again."
      };
    }

    if (session.orderId) {
      const currentOrder = await orderService.getOrderById(session.orderId);
      await orderService.attachGeneratedImage(session.orderId, publicImageUrl, selected.prompt);
      await orderService.updateOrderStatus(session.orderId, OrderStatus.WAITING_CONFIRMATION, {
        metadata: {
          ...((currentOrder?.metadata as Record<string, unknown> | null) || {}),
          permanentImageUrl: publicImageUrl
        }
      });
    }

    session.selectedOption = selected;
    session.imageUrl = publicImageUrl;
    session.stage = "WAITING_CONFIRMATION";
    await this.persistSession(session);

    console.log(`[ORDER_FLOW] option selected ${selectedId}`);
    console.log("[IMAGE] success");
    console.log("[ORDER_FLOW] stage=WAITING_CONFIRMATION");

    return {
      reply: previewReply(session.language),
      imageUrls: [publicImageUrl]
    };
  }

  private async createProductFromSession(session: DiySession): Promise<DiyFlowResult> {
    if (!session.selectedOption || !session.imageUrl) {
      return {
        reply:
          session.language === "zh"
            ? "缺少卡牌图，请先生成图片。"
            : "Missing card artwork. Please generate the image first."
      };
    }

    console.log("[SHOPIFY] create product from draft");
    console.log(`[SHOPIFY IMAGE] using permanentImageUrl=${session.imageUrl}`);

    const created = await shopifyService.createShopifyProductFromDiscord({
      title: session.selectedOption.title,
      price: session.selectedOption.estimatedPrice,
      description: buildDescription(session, session.selectedOption),
      imageUrl: session.imageUrl,
      shippingType: session.selectedOption.shippingType,
      tags: ["discord-order", "custom-card", "lootcard-ai", session.selectedOption.style]
    });

    if (!created.ok || !created.productUrl) {
      return {
        reply:
          session.language === "zh"
            ? `Shopify 产品创建失败：${created.error || "未知错误"}`
            : `Shopify product creation failed: ${created.error || "Unknown error"}`
      };
    }

    if (session.orderId) {
      await orderService.attachShopifyProduct(session.orderId, {
        shopifyShop: created.shop,
        shopifyProductId: created.productId,
        shopifyProductGid: created.productId,
        shopifyVariantId: created.variantId,
        shopifyVariantGid: created.variantId,
        shopifyProductUrl: created.productUrl,
        shopifyCheckoutUrl: created.checkoutUrl || created.productUrl,
        productTitle: session.selectedOption.title,
        productDescription: buildDescription(session, session.selectedOption),
        price: session.selectedOption.estimatedPrice,
        metadata: {
          permanentImageUrl: session.imageUrl
        }
      });
    }

    session.stage = "SHOPIFY_CREATED";
    session.productUrl = created.productUrl;
    session.checkoutUrl = created.checkoutUrl || created.productUrl;
    await this.persistSession(session);

    return {
      reply: productReply({
        language: session.language,
        orderNo: session.orderNo || "-",
        title: session.selectedOption.title,
        price: session.selectedOption.estimatedPrice.toFixed(2),
        productUrl: created.productUrl
      })
    };
  }

  private async modifyCurrentImage(session: DiySession, message: string): Promise<DiyFlowResult> {
    if (!session.selectedOption) {
      return { reply: inFlowReply(session.language) };
    }

    const prompt = `${session.selectedOption.prompt}. Revision request: ${message}`;
    const generated = await imageService.generateImage(prompt, session.selectedOption.style);
    if (!generated.ok || !generated.imageUrl) {
      return {
        reply:
          session.language === "zh"
            ? `图片生成失败：${generated.error || "未知错误"}`
            : `Image generation failed: ${generated.error || "Unknown error"}`
      };
    }

    const publicImageUrl = await storageService.uploadImageFromUrl(generated.imageUrl);
    if (session.orderId) {
      const currentOrder = await orderService.getOrderById(session.orderId);
      await orderService.attachGeneratedImage(session.orderId, publicImageUrl, prompt);
      await orderService.updateOrderStatus(session.orderId, OrderStatus.WAITING_CONFIRMATION, {
        metadata: {
          ...((currentOrder?.metadata as Record<string, unknown> | null) || {}),
          permanentImageUrl: publicImageUrl
        }
      });
    }

    session.imageUrl = publicImageUrl;
    await this.persistSession(session);

    console.log("[IMAGE] success");
    console.log("[ORDER_FLOW] stage=WAITING_CONFIRMATION");

    return {
      reply: previewReply(session.language),
      imageUrls: [publicImageUrl]
    };
  }

  async handleMessage(params: DiyFlowInput): Promise<DiyFlowResult> {
    const existing = this.getSession(params.discordUserId);
    const messageLanguage = buildLanguage(params.message, existing?.language || "en");
    console.log(`[LANGUAGE] detected=${messageLanguage}`);

    if (existing) {
      existing.language = wantsEnglish(params.message) ? "en" : buildLanguage(params.message, existing.language);
      existing.updatedAt = nowIso();
      console.log("[SESSION] set flowMode=AI_CARD_ORDER");
      console.log(`[ORDER_FLOW] stage=${existing.stage}`);

      if (isNewCardRequest(params.message)) {
        console.log("[SESSION] new card request overrides current flow");
        if (existing.orderId) {
          try {
            await orderService.cancelOrder(existing.orderId, "new_card_request");
          } catch {
            // ignore cancellation write failures
          }
        }
        this.sessions.delete(params.discordUserId);
        await this.clearPersistedState(params.discordUserId, params.username, existing.language);
        console.log("[SESSION] reset current draft");
        return this.startNewFlow(params, buildLanguage(params.message, "en"));
      }

      if (existing.stage === "CONCEPT_OPTIONS") {
        const selectedId = isSelectOption(params.message);
        if (selectedId) {
          return this.generateSelectedImage(existing, selectedId);
        }

        if (isGreeting(params.message)) {
          return { reply: inFlowReply(existing.language) };
        }

        return { reply: inFlowReply(existing.language) };
      }

      if (existing.stage === "WAITING_CONFIRMATION") {
        if (isConfirm(params.message)) {
          return this.createProductFromSession(existing);
        }

        if (isRegenerate(params.message)) {
          if (existing.orderId) {
            try {
              await orderService.cancelOrder(existing.orderId, "regenerated_options");
            } catch {
              // ignore cancellation write failures
            }
          }
          this.sessions.delete(params.discordUserId);
          await this.clearPersistedState(params.discordUserId, params.username, existing.language);
          return this.startNewFlow(
            {
              ...params,
              message: existing.originalMessage
            },
            existing.language
          );
        }

        if (isModifyCommand(params.message)) {
          return {
            reply:
              existing.language === "zh"
                ? "请直接告诉我你想怎么修改，比如：更暗一点、加金边。"
                : "Tell me what to change, for example: make it darker or add a gold frame."
          };
        }

        if (isGreeting(params.message)) {
          return { reply: inFlowReply(existing.language) };
        }

        return this.modifyCurrentImage(existing, params.message);
      }

      if (existing.stage === "SHOPIFY_CREATED") {
        if (/付款链接|checkout|cart|payment link/i.test(params.message)) {
          return {
            reply:
              existing.checkoutUrl
                ? productReply({
                    language: existing.language,
                    orderNo: existing.orderNo || "-",
                    title: existing.selectedOption?.title || "Custom AI Trading Card",
                    price: existing.selectedOption?.estimatedPrice.toFixed(2) || "0.00",
                    productUrl: existing.checkoutUrl
                  })
                : inFlowReply(existing.language)
          };
        }

        if (isGreeting(params.message)) {
          return {
            reply:
              existing.language === "zh"
                ? "上一张卡牌的产品链接已经生成。你也可以直接发送新的卡牌需求开始下一单。"
                : "The product link for your last card is ready. You can also send a new card request to start a new order."
          };
        }

        return {
          reply:
            existing.productUrl
              ? productReply({
                  language: existing.language,
                  orderNo: existing.orderNo || "-",
                  title: existing.selectedOption?.title || "Custom AI Trading Card",
                  price: existing.selectedOption?.estimatedPrice.toFixed(2) || "0.00",
                  productUrl: existing.productUrl
                })
              : inFlowReply(existing.language)
        };
      }
    }

    if (!isNewCardRequest(params.message)) {
      return {
        reply: promptForRequirement(messageLanguage)
      };
    }

    return this.startNewFlow(params, wantsEnglish(params.message) ? "en" : messageLanguage);
  }
}

export const lootcardDiyFlow = new LootcardDiyFlow();
