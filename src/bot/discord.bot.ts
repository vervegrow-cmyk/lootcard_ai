import { AttachmentBuilder, ChannelType, Client, GatewayIntentBits, Partials } from "discord.js";
import { lootcardDiyFlow } from "../flows/lootcard-diy.flow";
import { memoryService } from "../services/memory.service";
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
        name: `lootcarddiy-${index + 1}.${extension}`
      })
    );
  }

  return attachments;
}

function isLootcardDiyChannel(message: {
  channel: { type: ChannelType } & { name?: string | null };
}): boolean {
  if (message.channel.type === ChannelType.DM) {
    return false;
  }

  const name = String(message.channel.name || "");
  return name.toLowerCase() === "lootcarddiy";
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

      if (!isLootcardDiyChannel(message)) {
        return;
      }

      const inbound = {
        discordUserId: message.author.id,
        username: message.author.username,
        channelId: message.channelId,
        message: message.content.trim()
      };

      console.log("[DISCORD] incoming message", inbound.message);

      try {
        await memoryService.logConversation(inbound.discordUserId, "user", inbound.message);
      } catch (error) {
        logger.error("Failed to log user conversation", error);
      }

      let finalReply = "";
      let attachments: AttachmentBuilder[] = [];

      try {
        if (lootcardDiyFlow.isCancelRequest(inbound.message)) {
          const cancelResult = await lootcardDiyFlow.cancel(inbound);
          finalReply = cancelResult.reply;
        } else {
          const result = await lootcardDiyFlow.handleMessage(inbound);
          finalReply = result.reply;
          if (result.imageUrls?.length) {
            attachments = await buildAttachmentsFromUrls(result.imageUrls);
          }
        }
      } catch (error) {
        logger.error("Failed to process lootcarddiy flow", error);
        finalReply = error instanceof Error ? error.message : "Unknown error";
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
