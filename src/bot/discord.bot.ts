import { Client, GatewayIntentBits, Partials } from "discord.js";
import { mainAgent } from "../agents/main-agent";
import { memoryService } from "../services/memory.service";
import { orderService } from "../services/order.service";
import { AgentResult, DiscordInboundMessage } from "../types";
import { logger } from "../utils/logger";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function formatOptionsForReply(result: AgentResult): string {
  if (result.action === "show_style_options") {
    return result.reply;
  }

  if (result.action === "revise_design") {
    const lines = [result.reply, "", "Here are the refreshed style directions:", ""];
    for (const option of result.style_options) {
      lines.push(`${option.style_id}. ${option.style_name}`);
      lines.push(`Description: ${option.design_summary}`);
      if (option.image_url) {
        lines.push(`Preview: ${option.image_url}`);
      }
      lines.push(`Reply "${option.style_id}" to choose this style.`);
      lines.push("");
    }
    lines.push('You can also reply with another change, or say "confirm" when one version is right.');
    return lines.join("\n");
  }

  return result.reply;
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
    this.client.once("ready", () => {
      logger.info(`Discord bot logged in as ${this.client.user?.tag}`);
    });

    this.client.on("messageCreate", async (message) => {
      if (message.author.bot) {
        return;
      }

      if (!message.content?.trim()) {
        return;
      }

      const inbound: DiscordInboundMessage = {
        discordUserId: message.author.id,
        username: message.author.username,
        channelId: message.channelId,
        content: message.content.trim()
      };

      try {
        await memoryService.logConversation(inbound.discordUserId, "user", inbound.content);

        const userMemory = await memoryService.getOrCreateUserMemory(
          inbound.discordUserId,
          inbound.username
        );
        const recentConversation = await memoryService.getRecentConversation(inbound.discordUserId);
        const activeProject = await memoryService.getLatestProject(inbound.discordUserId);

        const result = await mainAgent.handleMessage({
          inbound,
          userMemory,
          recentConversation,
          activeProject
        });

        let replyText = formatOptionsForReply(result);

        if (result.action === "create_shopify_product" && result.product && activeProject) {
          const shopifyLink = await orderService.createShopifyOrderLink({
            project: activeProject,
            discordUserId: inbound.discordUserId,
            product: result.product
          });
          replyText = `${result.reply}\n${shopifyLink.url}`;
        }

        try {
          await memoryService.updateUserMemory({
            discordUserId: inbound.discordUserId,
            username: inbound.username,
            stage: result.stage
          });
        } catch (dbError) {
          logger.error("Failed to update user memory", dbError);
        }

        try {
          await memoryService.logConversation(inbound.discordUserId, "assistant", replyText);
        } catch (dbError) {
          logger.error("Failed to log assistant reply", dbError);
        }

        try {
          await message.reply(replyText);
        } catch (replyError) {
          logger.error("Failed to send Discord reply", replyError);
        }
      } catch (error) {
        logger.error("Failed to process Discord message", error);

        try {
          await message.reply("Sorry, something went wrong. Please try again.");
        } catch (replyError) {
          logger.error("Failed to send Discord error reply", replyError);
        }
      }
    });
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    await this.client.login(requireEnv("DISCORD_BOT_TOKEN"));
    this.started = true;
  }
}

export const discordBot = new DiscordBot();
