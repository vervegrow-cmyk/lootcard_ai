import { AttachmentBuilder, Client, GatewayIntentBits, Partials } from "discord.js";
import { aiRouterService } from "../services/ai-router.service";
import { memoryService } from "../services/memory.service";
import { openRouterService } from "../services/openrouter.service";
import { salesWorkflowService } from "../services/sales-workflow.service";
import { stateManagerService } from "../services/state-manager.service";
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

function isEchoModeEnabled(): boolean {
  return (process.env.ECHO_BOT_MODE || "false").toLowerCase() === "true";
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
      let attachments: AttachmentBuilder[] = [];

      try {
        const snapshot = await memoryService.getOrCreateUserMemory(inbound.discordUserId, inbound.username);
        const recentConversation = await memoryService.getRecentConversation(inbound.discordUserId);
        const project = await memoryService.getLatestProject(inbound.discordUserId);
        const taskType = aiRouterService.detectTaskType(inbound.content);

        console.log(`[AI ROUTER] taskType=${taskType}`);

        const workflowInput = {
          discordUserId: inbound.discordUserId,
          username: inbound.username,
          message: inbound.content,
          language,
          memory: snapshot.memory,
          project,
          recentConversation
        } as const;

        let workflowResult;

        if (stateManagerService.isPurchaseConfirmation(inbound.content)) {
          workflowResult = await salesWorkflowService.createOrderLink(workflowInput);
        } else if (stateManagerService.wantsModification(inbound.content) && snapshot.memory.latestPrompt) {
          workflowResult = await salesWorkflowService.modifyDraft(workflowInput);
        } else if (stateManagerService.wantsMoreOptions(inbound.content) && snapshot.memory.latestPrompt) {
          workflowResult = await salesWorkflowService.generateMoreOptions(workflowInput);
        } else if (taskType === "image_generation") {
          workflowResult = await salesWorkflowService.generateDraft(workflowInput);
        } else if (taskType === "shopify_product_create") {
          workflowResult = await salesWorkflowService.createOrderLink(workflowInput);
        } else {
          workflowResult = await salesWorkflowService.answerGeneralQuestion(workflowInput);
        }

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
