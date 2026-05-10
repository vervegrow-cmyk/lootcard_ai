import { AttachmentBuilder, Client, GatewayIntentBits, Partials } from "discord.js";
import { designAgent } from "../agents/design.agent";
import { hermesOrchestratorAgent } from "../agents/hermes-orchestrator.agent";
import { aiRouterService } from "../services/ai-router.service";
import { memoryService } from "../services/memory.service";
import { orderService } from "../services/order.service";
import { salesWorkflowService } from "../services/sales-workflow.service";
import { stateManagerService } from "../services/state-manager.service";
import { logger } from "../utils/logger";
import { OrderStatus, Prisma } from "@prisma/client";

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

function isEchoModeEnabled(): boolean {
  return (process.env.ECHO_BOT_MODE || "false").toLowerCase() === "true";
}

function isOrderSystemInitError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  return error.code === "P2021" || error.code === "P2022";
}

function isOrderQuery(message: string): boolean {
  const lower = message.toLowerCase();
  return /我的订单|订单查询|查看订单/.test(message) || lower.includes("order status");
}

function orderStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    DRAFT: "草稿",
    DESIGNING: "设计中",
    OPTION_SELECTED: "已选择方案",
    IMAGE_GENERATED: "已生成图片",
    WAITING_CONFIRMATION: "等待确认",
    SHOPIFY_CREATED: "商品已创建",
    WAITING_PAYMENT: "等待付款",
    PAID: "已付款",
    PRODUCTION: "生产中",
    SHIPPED: "已发货",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
    FAILED: "失败"
  };
  return labels[status] || status;
}

async function formatRecentOrders(discordUserId: string): Promise<string> {
  const orders = await orderService.listUserOrders(discordUserId, 5);
  if (!orders.length) {
    return "📦 我的订单\n\n暂时还没有订单记录。";
  }

  return [
    "📦 我的订单",
    "",
    ...orders.flatMap((order, index) => [
      `${index + 1}. ${order.orderNo}`,
      `状态：${orderStatusLabel(order.status)}`,
      `商品：${order.productTitle || "未生成商品"}`,
      ...(order.price ? [`价格：$${order.price.toString()}`] : []),
      ...(order.shopifyProductUrl || order.shopifyCheckoutUrl ? [`链接：${order.shopifyProductUrl || order.shopifyCheckoutUrl}`] : []),
      ""
    ])
  ].join("\n").trim();
}

async function buildAttachmentsFromUrls(urls: string[]): Promise<AttachmentBuilder[]> {
  const attachments: AttachmentBuilder[] = [];

  for (let index = 0; index < urls.length; index += 1) {
    const imageUrl = urls[index];
    if (!imageUrl) {
      continue;
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download generated image: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
    const arrayBuffer = await response.arrayBuffer();
    attachments.push(
      new AttachmentBuilder(Buffer.from(arrayBuffer), {
        name: `lootcard-design-${index + 1}.${extension}`
      })
    );
  }

  return attachments;
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
      console.log("[DISCORD] incoming message", inbound.content);

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
      let attachments: AttachmentBuilder[] = [];

      try {
        const snapshot = await memoryService.getOrCreateUserMemory(inbound.discordUserId, inbound.username);
        const recentConversation = await memoryService.getRecentConversation(inbound.discordUserId);
        const project = await memoryService.getLatestProject(inbound.discordUserId);
        const activeOrder = await orderService.getLatestActiveOrderByDiscordUser(inbound.discordUserId);
        const restoredDraft =
          snapshot.memory.currentOrderDraft ||
          (activeOrder ? orderService.toCurrentOrderDraft(activeOrder) : null);
        const aiRoute = aiRouterService.detectRoute(inbound.content);
        const taskType = aiRoute.taskType;

        console.log("[AGENT] route start");
        const plan = hermesOrchestratorAgent.plan({
          discordUserId: inbound.discordUserId,
          username: inbound.username,
          message: inbound.content,
          memory: {
            ...snapshot.memory,
            currentOrderDraft: restoredDraft,
            currentProject: project?.projectId || "",
            imageOptions:
              restoredDraft?.options.map((option) => ({
                id: option.id,
                title: option.title,
                imageUrl: "",
                prompt: option.prompt,
                summary: option.description,
                style: option.style
              })) || []
          },
          recentConversation
        });
        console.log("[AGENT] route result", {
          intent: plan.intent,
          targetAgent: taskType === "image_generation" ? aiRoute.targetAgent : plan.targetAgent,
          targetSkill: taskType === "image_generation" ? aiRoute.targetSkill : plan.targetSkill
        });

        console.log(`[AI ROUTER] taskType=${taskType}`);

        const workflowInput = {
          discordUserId: inbound.discordUserId,
          username: inbound.username,
          message: inbound.content,
          language,
          memory: {
            ...snapshot.memory,
            currentOrderDraft: restoredDraft
          },
          project,
          recentConversation
        } as const;

        let workflowResult;
        const draft = restoredDraft;
        console.log(`[ORDER_FLOW] stage=${draft?.stage || snapshot.memory.currentStage || "idle"}`);

        const selectedDraftOption = stateManagerService.detectDraftSelection(inbound.content, draft);

        if (isOrderQuery(inbound.content)) {
          finalReply = await formatRecentOrders(inbound.discordUserId);
          workflowResult = null;
        } else if (stateManagerService.wantsCheckoutLink(inbound.content) && stateManagerService.canCreateShopifyFromDraft(draft)) {
          workflowResult = await salesWorkflowService.createOrderLink(workflowInput, "checkout");
        } else if (
          (stateManagerService.isPurchaseConfirmation(inbound.content) || stateManagerService.wantsProductLink(inbound.content)) &&
          stateManagerService.canCreateShopifyFromDraft(draft)
        ) {
          workflowResult = await salesWorkflowService.createOrderLink(workflowInput, "product");
        } else if (selectedDraftOption) {
          workflowResult = await salesWorkflowService.generateImageForSelectedOption(workflowInput, selectedDraftOption);
        } else if (stateManagerService.wantsModification(inbound.content) && draft) {
          workflowResult = await salesWorkflowService.modifyCurrentDesign(workflowInput);
        } else if (stateManagerService.wantsMoreOptions(inbound.content) && draft) {
          workflowResult = await salesWorkflowService.regenerateOptions(workflowInput);
        } else if (taskType === "image_generation" && !draft) {
          const skillMemory = {
            ...((snapshot.memory as unknown) as Record<string, unknown>),
            currentOrderDraft: restoredDraft
          } as never;

          const skillResult = await designAgent.execute(plan, {
            discordUserId: inbound.discordUserId,
            username: inbound.username,
            message: inbound.content,
            language,
            memory: skillMemory,
            recentConversation,
            project,
            data: plan.data
          });

          finalReply = skillResult.reply;
          if (skillResult.imageOptions?.length) {
            attachments = await buildAttachmentsFromUrls(
              skillResult.imageOptions.map((item) => item.imageUrl).filter(Boolean)
            );
          }

          await memoryService.updateUserMemory({
            discordUserId: inbound.discordUserId,
            username: inbound.username,
            memoryPatch: skillResult.memoryUpdate || {}
          });

          workflowResult = null;
        } else if (taskType === "image_generation") {
          workflowResult = await salesWorkflowService.createDraftOptions(workflowInput);
        } else if (taskType === "shopify_product_create") {
          const requestedLinkType = stateManagerService.wantsCheckoutLink(inbound.content) ? "checkout" : "product";
          workflowResult = await salesWorkflowService.createOrderLink(workflowInput, requestedLinkType);
        } else {
          workflowResult = await salesWorkflowService.answerGeneralQuestion(workflowInput);
        }

        if (workflowResult) {
          await memoryService.updateUserMemory({
            discordUserId: inbound.discordUserId,
            username: inbound.username,
            memoryPatch: workflowResult.memoryPatch
          });

          if (project?.projectId && workflowResult.projectPatch) {
            await memoryService.updateProject(project.projectId, workflowResult.projectPatch);
          }

          finalReply = workflowResult.reply;

          if (workflowResult.imageUrls?.length) {
            attachments = await buildAttachmentsFromUrls(workflowResult.imageUrls);
          }
        }
      } catch (error) {
        logger.error("Failed to process Discord message", error);
        finalReply = isOrderSystemInitError(error)
          ? "订单系统初始化失败，请稍后重试。"
          : error instanceof Error
            ? error.message
            : "处理请求时发生未知错误。";
      }

      try {
        await memoryService.logConversation(inbound.discordUserId, "assistant", finalReply);
      } catch (error) {
        logger.error("Failed to log assistant conversation", error);
      }

      try {
        if (attachments.length > 0) {
          await message.channel.send({
            content: finalReply,
            files: attachments
          });
        } else {
          await message.reply(finalReply);
        }
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
