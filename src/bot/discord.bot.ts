import { Client, GatewayIntentBits, Partials } from "discord.js";
import { aiRouterService } from "../services/ai-router.service";
import { imageService } from "../services/image.service";
import { memoryService } from "../services/memory.service";
import { openRouterService } from "../services/openrouter.service";
import { shopifyService } from "../services/shopify.service";
import { logger } from "../utils/logger";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function maskToken(token: string): string {
  if (token.length <= 10) {
    return "***";
  }
  return `${token.slice(0, 6)}...${token.slice(-6)}`;
}

function validateDiscordTokenShape(token: string): { valid: boolean; reason?: string } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return {
      valid: false,
      reason: `Expected 3 dot-separated parts but got ${parts.length}.`
    };
  }
  if (parts.some((part) => part.length === 0)) {
    return {
      valid: false,
      reason: "One or more token segments are empty."
    };
  }
  return { valid: true };
}

function detectLanguage(message: string, fallback: "zh" | "en" = "en"): "zh" | "en" {
  return /[\u4e00-\u9fff]/.test(message) ? "zh" : fallback;
}

function formatCurrency(value?: number): string {
  const amount = Number(value ?? process.env.DEFAULT_CARD_PRICE ?? "29.99");
  return Number.isFinite(amount) ? amount.toFixed(2) : "29.99";
}

function formatImageReply(item: { imageUrl: string; prompt: string; summary: string }): string {
  return [`图片：${item.imageUrl}`, `提示词：${item.prompt}`, `说明：${item.summary}`].join("\n");
}

function formatShopifyReply(params: {
  ok: boolean;
  title?: string;
  price?: number;
  productUrl?: string;
  adminUrl?: string;
  productId?: string;
  error?: string;
}): string {
  if (!params.ok) {
    return `Shopify 产品创建失败：${params.error || "未知错误"}`;
  }

  return [
    "✅ Shopify 产品已创建",
    "",
    `商品名：${params.title || "Custom AI Trading Card"}`,
    `价格：$${formatCurrency(params.price)}`,
    `商品ID：${params.productId || "-"}`,
    `下单链接：${params.productUrl || "-"}`,
    `后台链接：${params.adminUrl || "-"}`,
    "",
    "你可以点击下单链接直接购买。"
  ].join("\n");
}

function isEchoModeEnabled(): boolean {
  return (process.env.ECHO_BOT_MODE || "false").toLowerCase() === "true";
}

export class DiscordBot {
  private readonly client: Client;
  private started = false;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
      ],
      partials: [Partials.Channel]
    });

    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.client.once("clientReady", () => {
      logger.info(`Discord bot logged in as ${this.client.user?.tag}`);
    });

    this.client.on("messageCreate", async (message) => {
      if (message.author.bot || !message.content?.trim()) {
        return;
      }

      const inbound = {
        discordUserId: message.author.id,
        username: message.author.username,
        channelId: message.channelId,
        content: message.content.trim()
      };

      const language = detectLanguage(inbound.content);
      console.log("[Raw User Message]", inbound.content);

      if (isEchoModeEnabled()) {
        await message.reply(`Echo: ${inbound.content}`);
        return;
      }

      try {
        await memoryService.logConversation(inbound.discordUserId, "user", inbound.content);
      } catch (error) {
        logger.error("Failed to log user conversation", error);
      }

      let finalReply = "";

      try {
        const recentConversation = await memoryService.getRecentConversation(inbound.discordUserId);
        const taskType = aiRouterService.detectTaskType(inbound.content);
        console.log(`[AI ROUTER] taskType=${taskType}`);

        if (taskType === "image_generation") {
          const image = await imageService.generateImage(inbound.content);
          finalReply = formatImageReply(image);
        } else if (taskType === "shopify_product_create") {
          const request = aiRouterService.extractShopifyProductRequest(inbound.content);
          const created = await shopifyService.createShopifyProductFromDiscord({
            title: request.title,
            price: request.price,
            description: request.description
          });

          finalReply = formatShopifyReply({
            ok: created.ok,
            title: created.title || request.title,
            price: created.price || request.price,
            productUrl: created.productUrl,
            adminUrl: created.adminUrl,
            productId: created.productId,
            error: created.error
          });
        } else {
          finalReply = await openRouterService.chat({
            message: inbound.content,
            history: recentConversation,
            language
          });
        }
      } catch (error) {
        logger.error("Failed to process Discord message", error);
        finalReply = error instanceof Error ? error.message : "处理请求时发生未知错误。";
      }

      try {
        await memoryService.logConversation(inbound.discordUserId, "assistant", finalReply);
      } catch (error) {
        logger.error("Failed to log assistant conversation", error);
      }

      try {
        await message.reply(finalReply);
      } catch (error) {
        logger.error("Failed to send Discord reply", error);
      }
    });
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    const token = requireEnv("DISCORD_BOT_TOKEN");
    const shape = validateDiscordTokenShape(token);

    logger.info("Discord token diagnostics", {
      tokenMask: maskToken(token),
      tokenLength: token.length,
      segmentCount: token.split(".").length,
      shapeValid: shape.valid,
      shapeReason: shape.reason || "ok"
    });

    if (!shape.valid) {
      throw new Error(`DISCORD_BOT_TOKEN format looks invalid. ${shape.reason}`);
    }

    await this.client.login(token);
    this.started = true;
  }
}

export const discordBot = new DiscordBot();
