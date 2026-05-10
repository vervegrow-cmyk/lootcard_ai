import { Order, OrderStatus, Prisma } from "@prisma/client";
import { CurrentOrderDraft, OrderDraftOption } from "../types";
import { prisma } from "./prisma.service";

type JsonObject = Record<string, unknown>;

function toDecimal(value?: number | string | null): Prisma.Decimal | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? new Prisma.Decimal(num) : null;
}

function orderNo(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LC-${timestamp}-${random}`;
}

function safeJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value as Prisma.InputJsonValue;
}

export class OrderService {
  async createDraftOrder(input: {
    discordUserId: string;
    discordChannelId?: string;
    discordMessageId?: string;
    originalPrompt?: string;
    metadata?: JsonObject;
    cardProjectId?: string | null;
  }): Promise<Order> {
    const created = await prisma.order.create({
      data: {
        orderNo: orderNo(),
        discordUserId: input.discordUserId,
        discordChannelId: input.discordChannelId,
        discordMessageId: input.discordMessageId,
        originalPrompt: input.originalPrompt,
        status: OrderStatus.DRAFT,
        cardProjectId: input.cardProjectId || undefined,
        metadata: safeJson(input.metadata || {})
      }
    });
    console.log("[ORDER] create draft", created.orderNo);
    return created;
  }

  async updateOrderStatus(orderId: string, status: OrderStatus, extra?: Prisma.OrderUpdateInput): Promise<Order> {
    const payload: Prisma.OrderUpdateInput = {
      status,
      ...extra
    };

    if (status === OrderStatus.PAID && !payload.paidAt) {
      payload.paidAt = new Date();
    }
    if (status === OrderStatus.SHIPPED && !payload.shippedAt) {
      payload.shippedAt = new Date();
    }
    if (status === OrderStatus.COMPLETED && !payload.completedAt) {
      payload.completedAt = new Date();
    }
    if (status === OrderStatus.CANCELLED && !payload.cancelledAt) {
      payload.cancelledAt = new Date();
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: payload
    });
    console.log("[ORDER] status update", updated.orderNo, status);
    return updated;
  }

  async getOrderById(orderId: string): Promise<Order | null> {
    return prisma.order.findUnique({ where: { id: orderId } });
  }

  async getOrderByOrderNo(value: string): Promise<Order | null> {
    return prisma.order.findUnique({ where: { orderNo: value } });
  }

  async getLatestActiveOrderByDiscordUser(discordUserId: string): Promise<Order | null> {
    return prisma.order.findFirst({
      where: {
        discordUserId,
        status: {
          in: [
            OrderStatus.DRAFT,
            OrderStatus.DESIGNING,
            OrderStatus.OPTION_SELECTED,
            OrderStatus.IMAGE_GENERATED,
            OrderStatus.WAITING_CONFIRMATION,
            OrderStatus.SHOPIFY_CREATED,
            OrderStatus.WAITING_PAYMENT,
            OrderStatus.PAID,
            OrderStatus.PRODUCTION,
            OrderStatus.SHIPPED
          ]
        }
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  async attachGeneratedImage(orderId: string, imageUrl: string, designPrompt?: string): Promise<Order> {
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        imageUrl,
        designPrompt,
        status: OrderStatus.WAITING_CONFIRMATION
      }
    });
    console.log("[ORDER] attach image", updated.orderNo, imageUrl);
    return updated;
  }

  async attachShopifyProduct(
    orderId: string,
    productData: {
      shopifyShop?: string;
      shopifyProductId?: string;
      shopifyProductGid?: string;
      shopifyVariantId?: string;
      shopifyVariantGid?: string;
      shopifyProductUrl?: string;
      shopifyCheckoutUrl?: string;
      productTitle?: string;
      productDescription?: string;
      price?: number | string;
      metadata?: JsonObject;
    }
  ): Promise<Order> {
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.WAITING_PAYMENT,
        shopifyShop: productData.shopifyShop,
        shopifyProductId: productData.shopifyProductId,
        shopifyProductGid: productData.shopifyProductGid,
        shopifyVariantId: productData.shopifyVariantId,
        shopifyVariantGid: productData.shopifyVariantGid,
        shopifyProductUrl: productData.shopifyProductUrl,
        shopifyCheckoutUrl: productData.shopifyCheckoutUrl || productData.shopifyProductUrl,
        productTitle: productData.productTitle,
        productDescription: productData.productDescription,
        price: toDecimal(productData.price),
        metadata: safeJson(productData.metadata)
      }
    });
    console.log("[ORDER] attach shopify product", updated.orderNo, updated.shopifyProductId);
    return updated;
  }

  async attachShopifyPayment(
    orderId: string,
    shopifyOrderData: {
      shopifyOrderId?: string;
      shopifyOrderGid?: string;
      shopifyOrderName?: string;
      metadata?: JsonObject;
    }
  ): Promise<Order> {
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.PAID,
        paidAt: new Date(),
        shopifyOrderId: shopifyOrderData.shopifyOrderId,
        shopifyOrderGid: shopifyOrderData.shopifyOrderGid,
        shopifyOrderName: shopifyOrderData.shopifyOrderName,
        metadata: safeJson(shopifyOrderData.metadata)
      }
    });
    console.log("[ORDER] paid", updated.orderNo);
    return updated;
  }

  async cancelOrder(orderId: string, reason?: string): Promise<Order> {
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        metadata: safeJson({ cancelReason: reason || "cancelled" })
      }
    });
    console.log("[ORDER] failed", updated.orderNo, reason || "cancelled");
    return updated;
  }

  async listUserOrders(discordUserId: string, limit = 5): Promise<Order[]> {
    return prisma.order.findMany({
      where: { discordUserId },
      orderBy: { updatedAt: "desc" },
      take: limit
    });
  }

  async saveDraftOptions(orderId: string, options: OrderDraftOption[]): Promise<Order> {
    return this.updateOrderStatus(orderId, OrderStatus.DESIGNING, {
      metadata: safeJson({ options })
    });
  }

  async saveSelectedOption(
    orderId: string,
    option: OrderDraftOption,
    originalPrompt?: string
  ): Promise<Order> {
    return this.updateOrderStatus(orderId, OrderStatus.OPTION_SELECTED, {
      selectedOption: option.id,
      selectedStyle: option.style,
      designPrompt: option.prompt,
      productTitle: option.title,
      productDescription: option.description,
      price: toDecimal(option.estimatedPrice),
      shippingType: option.shippingType,
      originalPrompt: originalPrompt || undefined
    });
  }

  async markShopifyCreated(orderId: string): Promise<Order> {
    return this.updateOrderStatus(orderId, OrderStatus.SHOPIFY_CREATED);
  }

  toCurrentOrderDraft(order: Order, options: OrderDraftOption[] = []): CurrentOrderDraft {
    const metadataOptions = Array.isArray((order.metadata as { options?: unknown[] } | null)?.options)
      ? (((order.metadata as { options?: unknown[] } | null)?.options || []) as OrderDraftOption[])
      : [];
    const sourceOptions = options.length ? options : metadataOptions;
    const selectedOption =
      sourceOptions.find((item) => item.id === order.selectedOption) ||
      (order.selectedOption
        ? {
            id: order.selectedOption as "A" | "B" | "C",
            title: order.productTitle || "",
            style: order.selectedStyle || "",
            description: order.productDescription || "",
            estimatedPrice: Number(order.price || 0),
            shippingType: (order.shippingType as CurrentOrderDraft["shippingType"]) || "physical_card_cn",
            prompt: order.designPrompt || ""
          }
        : null);

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      discordUserId: order.discordUserId,
      stage:
        order.status === OrderStatus.DESIGNING
          ? "draft_options"
          : order.status === OrderStatus.OPTION_SELECTED
            ? "option_selected"
            : order.status === OrderStatus.IMAGE_GENERATED
              ? "image_generated"
              : order.status === OrderStatus.WAITING_CONFIRMATION
                ? "waiting_confirmation"
                : order.status === OrderStatus.SHOPIFY_CREATED || order.status === OrderStatus.WAITING_PAYMENT
                  ? "shopify_created"
                  : order.status === OrderStatus.COMPLETED
                    ? "completed"
                    : "draft_options",
      originalMessage: order.originalPrompt || "",
      options: sourceOptions,
      selectedOption,
      imageUrl: order.imageUrl || "",
      productTitle: order.productTitle || "",
      productDescription: order.productDescription || "",
      price: order.price?.toString() || "",
      shippingType: (order.shippingType as CurrentOrderDraft["shippingType"]) || "physical_card_cn",
      shopifyProductUrl: order.shopifyProductUrl || "",
      shopifyCheckoutUrl: order.shopifyCheckoutUrl || order.shopifyProductUrl || ""
    };
  }

  async findByShopifyProduct(productId?: string | null, variantId?: string | null): Promise<Order | null> {
    if (!productId && !variantId) {
      return null;
    }

    return prisma.order.findFirst({
      where: {
        OR: [
          productId ? { shopifyProductId: productId } : undefined,
          variantId ? { shopifyVariantId: variantId } : undefined
        ].filter(Boolean) as Prisma.OrderWhereInput[]
      },
      orderBy: { updatedAt: "desc" }
    });
  }
}

export const orderService = new OrderService();
