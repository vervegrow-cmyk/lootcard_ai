import { OrderDraftOption } from "../types";

export const templates = {
  zh: {
    askPrompt: "欢迎来到 LootCard AI！请直接告诉我你想做什么卡牌，例如：黑金SSR女角色卡牌。",
    basePromptSuffix: "高质量卡牌设计，收藏级构图",
    inFlow:
      "当前正在 AI 卡牌定制流程中。请回复 A/B/C 选择方案，或回复 1确认下单、2修改设计、3重新生成，或回复“取消”重新开始。",
    conceptPresets: [
      {
        id: "A",
        title: "黑金SSR典藏卡",
        style: "黑金 / SSR / 全息 / 动漫角色",
        description: "黑金 / SSR / 全息 / 动漫角色"
      },
      {
        id: "B",
        title: "赛博朋克战斗卡",
        style: "赛博朋克 / 霓虹 / 战斗感",
        description: "赛博朋克 / 霓虹 / 战斗感"
      },
      {
        id: "C",
        title: "高级收藏签名卡",
        style: "限量 / 签名 / 收藏级",
        description: "限量 / 签名 / 收藏级"
      }
    ],
    conceptOptions: (options: OrderDraftOption[]): string =>
      [
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
      ].join("\n"),
    selectOption: "✅ 已生成首版设计图\n\n回复：\n1 确认并生成产品链接\n2 修改设计\n3 重新生成方案",
    confirmOrder: (params: { orderNo: string; title: string; price: string; productUrl: string }): string =>
      [
        "✅ 产品链接已生成",
        "",
        `订单号：${params.orderNo}`,
        `商品：${params.title}`,
        `价格：$${params.price}`,
        `产品链接：${params.productUrl}`
      ].join("\n"),
    imageGenerateFailed: (error: string): string => `图片生成失败：${error}`,
    imageStorageFailed: "图片永久存储失败，请稍后重试。",
    missingImage: "缺少卡牌图，请先生成图片。",
    shopifyFailed: (error: string): string => `Shopify 产品创建失败：${error}`,
    modifyDesign: "请直接告诉我你想怎么修改，比如：更暗一点、加金边。",
    regenerate: "已取消当前方案，正在重新生成卡牌方案。",
    cancelReply: "已取消当前卡牌定制流程。你可以直接发送新的卡牌需求重新开始。",
    shopifyCreated: "上一张卡牌的产品链接已经生成。你也可以直接发送新的卡牌需求开始下一单。",
    productDescription: (params: { title: string; style: string; originalMessage: string }): string =>
      [
        params.title,
        `风格：${params.style}`,
        `原始需求：${params.originalMessage}`,
        "说明：这是根据用户定制需求生成的 AI 卡牌商品。",
        "发货：定制商品通常约 30 天制作并发货。"
      ].join("\n"),
    paymentLink: (params: { orderNo: string; title: string; price: string; productUrl: string }): string =>
      [
        "✅ 支付链接已生成",
        "",
        `订单号：${params.orderNo}`,
        `商品：${params.title}`,
        `价格：$${params.price}`,
        `支付链接：${params.productUrl}`
      ].join("\n")
  },
  en: {
    askPrompt: "Welcome to LootCard AI! Tell me what card you want, for example: a black gold SSR anime girl trading card.",
    basePromptSuffix: "high quality trading card design, collectible composition",
    inFlow:
      "You’re currently in a card customization flow. Reply A/B/C, 1 to confirm, 2 to modify, 3 to regenerate, or type cancel to start over.",
    conceptPresets: [
      {
        id: "A",
        title: "Black Gold SSR Collector Card",
        style: "Black Gold / SSR / Anime Character",
        description: "Black Gold / SSR / Anime Character"
      },
      {
        id: "B",
        title: "Cyberpunk Battle Card",
        style: "Cyberpunk / Neon / Combat",
        description: "Cyberpunk / Neon / Combat"
      },
      {
        id: "C",
        title: "Premium Signature Collector Card",
        style: "Limited Edition / Signed / Luxury",
        description: "Limited Edition / Signed / Luxury"
      }
    ],
    conceptOptions: (options: OrderDraftOption[]): string =>
      [
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
      ].join("\n"),
    selectOption: "✅ Preview generated\n\nReply:\n1 Confirm and create product link\n2 Modify design\n3 Generate new options",
    confirmOrder: (params: { orderNo: string; title: string; price: string; productUrl: string }): string =>
      [
        "✅ Product link generated",
        "",
        `Order No: ${params.orderNo}`,
        `Product: ${params.title}`,
        `Price: $${params.price}`,
        `Product Link: ${params.productUrl}`
      ].join("\n"),
    imageGenerateFailed: (error: string): string => `Image generation failed: ${error}`,
    imageStorageFailed: "Permanent image storage failed. Please try again.",
    missingImage: "Missing card artwork. Please generate the image first.",
    shopifyFailed: (error: string): string => `Shopify product creation failed: ${error}`,
    modifyDesign: "Tell me what to change, for example: make it darker or add a gold frame.",
    regenerate: "Cancelled current options. Generating new card concepts now.",
    cancelReply: "The current card customization flow has been cancelled. Send a new card request to start over.",
    shopifyCreated: "The product link for your last card is ready. You can also send a new card request to start a new order.",
    productDescription: (params: { title: string; style: string; originalMessage: string }): string =>
      [
        params.title,
        `Style: ${params.style}`,
        `Original request: ${params.originalMessage}`,
        "Description: Custom AI trading card created from the confirmed design request.",
        "Shipping: Custom orders usually take around 30 days for production and delivery."
      ].join("\n"),
    paymentLink: (params: { orderNo: string; title: string; price: string; productUrl: string }): string =>
      [
        "✅ Checkout link generated",
        "",
        `Order No: ${params.orderNo}`,
        `Product: ${params.title}`,
        `Price: $${params.price}`,
        `Checkout Link: ${params.productUrl}`
      ].join("\n")
  }
};
