import { OrderStatus } from "@prisma/client";
import { LanguagePreference, OrderDraftOption, ShippingType } from "../types";
import { templates } from "../i18n/templates";
import { imageService } from "../services/image.service";
import { memoryService } from "../services/memory.service";
import { orderService } from "../services/order.service";
import { shopifyService } from "../services/shopify.service";
import { storageService } from "../services/storage.service";
import { RouterIntent } from "../router/llm-router";

type DiyStage = "IDLE" | "CONCEPT_OPTIONS" | "IMAGE_GENERATING" | "WAITING_CONFIRMATION" | "SHOPIFY_CREATED";

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
  intent: RouterIntent;
  language: LanguagePreference;
}

interface DiyFlowResult {
  reply: string;
  imageUrls?: string[];
  handled: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
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
  const basePrompt = `${message}, ${templates[language].basePromptSuffix}`;
  const preset = templates[language].conceptPresets;

  console.log(`[DIY_FLOW] using ${language} templates`);
  return preset.map((item, index) => {
    const promptBase =
      index === 0
        ? "black gold SSR anime trading card, luxury foil frame, holographic shine, premium collector card, cinematic lighting"
        : index === 1
          ? "cyberpunk anime trading card, neon frame, battle energy, futuristic premium composition"
          : "limited signature anime trading card, luxury collector edition, premium embossing, showcase composition";

    return {
      id: item.id,
      title: item.title,
      style: item.style,
      description: item.description,
      estimatedPrice: index === 0 ? 99.99 : index === 1 ? 39.99 : 199.99,
      shippingType,
      prompt: `${promptBase}, ${basePrompt}`
    } as OrderDraftOption;
  });
}

function buildDescription(session: DiySession, selected: OrderDraftOption): string {
  return templates[session.language].productDescription({
    title: selected.title,
    style: selected.style,
    originalMessage: session.originalMessage
  });
}

export class DiyCardFlow {
  private readonly sessions = new Map<string, DiySession>();

  getSession(discordUserId: string): DiySession | null {
    return this.sessions.get(discordUserId) || null;
  }

  async cancel(discordUserId: string, username: string, language: LanguagePreference): Promise<DiyFlowResult> {
    console.log("[DIY_FLOW] cancel matched");
    const current = this.getSession(discordUserId);
    const t = templates[language];

    if (current?.orderId) {
      try {
        await orderService.cancelOrder(current.orderId, "user_cancelled");
      } catch {
        // ignore cancel persistence errors
      }
    }

    this.sessions.delete(discordUserId);
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

    console.log("[DIY_FLOW] reset complete");
    return { reply: t.cancelReply, handled: true };
  }

  private async persistSession(session: DiySession): Promise<void> {
    this.sessions.set(session.discordUserId, { ...session, updatedAt: nowIso() });

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

  private async startNewFlow(params: DiyFlowInput): Promise<DiyFlowResult> {
    const options = buildConcepts(params.message, params.language);
    const t = templates[params.language];
    const order = await orderService.createDraftOrder({
      discordUserId: params.discordUserId,
      discordChannelId: params.channelId,
      originalPrompt: params.message,
      metadata: {
        source: "lootcarddiy",
        language: params.language
      }
    });

    await orderService.saveDraftOptions(order.id, options);

    const session: DiySession = {
      discordUserId: params.discordUserId,
      username: params.username,
      language: params.language,
      stage: "CONCEPT_OPTIONS",
      orderId: order.id,
      orderNo: order.orderNo,
      originalMessage: params.message,
      options,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    await this.persistSession(session);
    console.log("[DIY_FLOW] stage=CONCEPT_OPTIONS");

    return { reply: t.conceptOptions(options), handled: true };
  }

  private async generateSelectedImage(session: DiySession, selectedId: "A" | "B" | "C"): Promise<DiyFlowResult> {
    const selected = session.options.find((option) => option.id === selectedId);
    const t = templates[session.language];
    if (!selected) {
      return { reply: t.inFlow, handled: true };
    }

    session.stage = "IMAGE_GENERATING";
    await this.persistSession(session);

    if (session.orderId) {
      await orderService.saveSelectedOption(session.orderId, selected, session.originalMessage);
    }

    const generated = await imageService.generateImage(selected.prompt, selected.style);
    if (!generated.ok || !generated.imageUrl) {
      return {
        reply: t.imageGenerateFailed(generated.error || (session.language === "zh" ? "未知错误" : "Unknown error")),
        handled: true
      };
    }

    const publicImageUrl = await storageService.uploadImageFromUrl(generated.imageUrl);
    if (!publicImageUrl) {
      return { reply: t.imageStorageFailed, handled: true };
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

    console.log(`[DIY_FLOW] option selected ${selectedId}`);
    console.log("[IMAGE] success");
    console.log("[DIY_FLOW] stage=WAITING_CONFIRMATION");

    return {
      reply: t.selectOption,
      imageUrls: [publicImageUrl],
      handled: true
    };
  }

  private async createProductFromSession(session: DiySession): Promise<DiyFlowResult> {
    const t = templates[session.language];
    if (!session.selectedOption || !session.imageUrl) {
      return { reply: t.missingImage, handled: true };
    }

    console.log("[SHOPIFY] create product from draft");
    console.log(`[SHOPIFY] image=permanentImageUrl ${session.imageUrl}`);

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
        reply: t.shopifyFailed(created.error || (session.language === "zh" ? "未知错误" : "Unknown error")),
        handled: true
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
      reply: t.confirmOrder({
        orderNo: session.orderNo || "-",
        title: session.selectedOption.title,
        price: session.selectedOption.estimatedPrice.toFixed(2),
        productUrl: created.productUrl
      }),
      handled: true
    };
  }

  private async modifyCurrentImage(session: DiySession, message: string): Promise<DiyFlowResult> {
    const t = templates[session.language];
    if (!session.selectedOption) {
      return { reply: t.inFlow, handled: true };
    }

    session.stage = "IMAGE_GENERATING";
    await this.persistSession(session);

    const prompt = `${session.selectedOption.prompt}. Revision request: ${message}`;
    const generated = await imageService.generateImage(prompt, session.selectedOption.style);
    if (!generated.ok || !generated.imageUrl) {
      return {
        reply: t.imageGenerateFailed(generated.error || (session.language === "zh" ? "未知错误" : "Unknown error")),
        handled: true
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
    console.log("[DIY_FLOW] stage=WAITING_CONFIRMATION");

    return {
      reply: t.selectOption,
      imageUrls: [publicImageUrl],
      handled: true
    };
  }

  async handleMessage(params: DiyFlowInput): Promise<DiyFlowResult> {
    const existing = this.getSession(params.discordUserId);
    const t = templates[params.language];

    if (existing) {
      existing.language = params.language;
      const currentT = templates[existing.language];
      existing.updatedAt = nowIso();

      console.log(`[DIY_FLOW] stage=${existing.stage}`);

      if (existing.stage === "IMAGE_GENERATING") {
        return { reply: currentT.inFlow, handled: true };
      }

      if (existing.stage === "CONCEPT_OPTIONS") {
        const selectedId = params.intent === "CONFIRM_SELECTION" ? (params.message.trim().toUpperCase() as "A" | "B" | "C") : null;
        if (selectedId && ["A", "B", "C"].includes(selectedId)) {
          return this.generateSelectedImage(existing, selectedId);
        }
        return { reply: currentT.inFlow, handled: true };
      }

      if (existing.stage === "WAITING_CONFIRMATION") {
        if (params.intent === "CREATE_SHOPIFY_PRODUCT") {
          return this.createProductFromSession(existing);
        }
        if (params.intent === "REGENERATE") {
          if (existing.orderId) {
            try {
              await orderService.cancelOrder(existing.orderId, "regenerated_options");
            } catch {
              // ignore cancellation
            }
          }
          this.sessions.delete(params.discordUserId);
          const restarted = await this.startNewFlow({ ...params, message: existing.originalMessage });
          return { ...restarted, handled: true };
        }
        if (params.intent === "MODIFY_DESIGN") {
          return { reply: currentT.modifyDesign, handled: true };
        }
        return this.modifyCurrentImage(existing, params.message);
      }

      if (existing.stage === "SHOPIFY_CREATED") {
        if (params.intent === "GET_PAYMENT_LINK") {
          return {
            reply: existing.checkoutUrl
              ? currentT.paymentLink({
                  orderNo: existing.orderNo || "-",
                  title: existing.selectedOption?.title || "Custom AI Trading Card",
                  price: existing.selectedOption?.estimatedPrice.toFixed(2) || "0.00",
                  productUrl: existing.checkoutUrl
                })
              : currentT.inFlow,
            handled: true
          };
        }

        return {
          reply:
            existing.productUrl
              ? currentT.confirmOrder({
                  orderNo: existing.orderNo || "-",
                  title: existing.selectedOption?.title || "Custom AI Trading Card",
                  price: existing.selectedOption?.estimatedPrice.toFixed(2) || "0.00",
                  productUrl: existing.productUrl
                })
              : currentT.inFlow,
          handled: true
        };
      }
    }

    if (params.intent === "CREATE_DIY_CARD") {
      console.log("[DIY_FLOW] create request matched");
      return this.startNewFlow(params);
    }

    if (params.intent === "GENERAL_HELP") {
      return { reply: t.askPrompt, handled: true };
    }

    return { reply: t.askPrompt, handled: false };
  }
}

export const diyCardFlow = new DiyCardFlow();
