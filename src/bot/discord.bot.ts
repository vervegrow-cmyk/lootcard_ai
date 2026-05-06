import { Client, GatewayIntentBits, Partials } from "discord.js";
import { customerServiceAgent } from "../agents/customer-service.agent";
import { designAgent } from "../agents/design.agent";
import { hermesOrchestratorAgent } from "../agents/hermes-orchestrator.agent";
import { memoryWorkflowAgent } from "../agents/memory.agent";
import { promptWorkflowAgent } from "../agents/prompt.agent";
import { shopifyWorkflowAgent } from "../agents/shopify.agent";
import { memoryService } from "../services/memory.service";
import { logger } from "../utils/logger";
import { OrchestratorPlan, OrchestratorResult, TargetAgent } from "../types/agent.types";
import { ImageOption, ProjectMemory, SkillExecutionContext, SkillExecutionResult } from "../types/skill.types";

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

function isEchoModeEnabled(): boolean {
  return (process.env.ECHO_BOT_MODE || "false").toLowerCase() === "true";
}

function classifyErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("SHOPIFY_NOT_CONFIGURED")) {
    return "Shopify 还没有配置完成，我已经记录最终设计，配置完成后可以生成下单链接。";
  }
  if (message.includes("SHOPIFY_CREATE_FAILED")) {
    return "Shopify 商品创建失败，我已经保留当前设计方案，请稍后重试。";
  }
  if (message.toLowerCase().includes("prisma") || message.toLowerCase().includes("database")) {
    return "数据库记录时出现问题，但我会尽量继续回复你。你可以继续发送需求。";
  }
  if (message.toLowerCase().includes("openai") || message.toLowerCase().includes("anthropic") || message.toLowerCase().includes("provider")) {
    return "AI 处理时出现问题，不过我会优先用本地兜底逻辑继续帮你。你可以再发一次需求。";
  }
  if (message.toLowerCase().includes("image")) {
    return "图片生成流程出了点问题。我可以先继续给你文字方案，或者你再试一次出图指令。";
  }
  return "处理这条消息时出现了异常，但服务还在运行。你可以继续发需求，我会尽量从当前上下文接着处理。";
}

function formatImageOption(option: ImageOption): string {
  return `【${option.id}】${option.title}\n图片：${option.imageUrl}\n提示词：${option.prompt}`;
}

function formatReply(result: OrchestratorResult): string {
  if (result.imageOptions.length > 0) {
    return [
      result.reply,
      "",
      ...result.imageOptions.map((option) => formatImageOption(option)),
      "",
      result.language === "zh"
        ? "请回复 A/B/C 选择，或直接说修改意见。"
        : "Reply with A/B/C to choose, or tell me what to revise."
    ].join("\n\n");
  }

  return result.reply;
}

function toProjectMemory(memory: {
  language: "zh" | "en";
  stage: string;
  theme: string;
  character: string;
  style: string;
  rarity: string;
  quantity: string;
  physical_card: string;
  special_requirements: string;
  currentPrompt: string;
  selectedOption: string;
  selectedOptionTitle: string;
  selectedImageUrl: string;
  selectedDesignSummary: string;
  revisionHistory: string[];
}): ProjectMemory {
  return {
    language: memory.language,
    stage: memory.stage as ProjectMemory["stage"],
    theme: memory.theme,
    character: memory.character,
    style: memory.style,
    rarity: memory.rarity,
    quantity: memory.quantity,
    physical_card: memory.physical_card,
    special_requirements: memory.special_requirements,
    currentPrompt: memory.currentPrompt,
    currentProject: "",
    imageOptions: [],
    selectedOption: memory.selectedOption,
    selectedOptionTitle: memory.selectedOptionTitle,
    selectedImageUrl: memory.selectedImageUrl,
    selectedDesignSummary: memory.selectedDesignSummary,
    revisionHistory: memory.revisionHistory,
    shopifyProductUrl: ""
  };
}

function toSkillProjectContext(project: Awaited<ReturnType<typeof memoryService.getLatestProject>>): SkillExecutionContext["project"] {
  if (!project) {
    return null;
  }

  return {
    projectId: project.projectId,
    status:
      project.status === "prompting"
        ? "collecting"
        : (project.status as NonNullable<SkillExecutionContext["project"]>["status"]),
    originalPrompt: project.originalPrompt,
    currentPrompt: project.currentPrompt,
    selectedOptionId: project.selectedOptionId,
    finalDesignSummary: project.finalDesignSummary,
    shopifyProductId: project.shopifyProductId,
    shopifyProductUrl: project.shopifyProductUrl
  };
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

  private async executeAgent(
    targetAgent: TargetAgent,
    plan: OrchestratorPlan,
    context: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    switch (targetAgent) {
      case "design":
        return designAgent.execute(plan, context);
      case "prompt":
        return promptWorkflowAgent.execute(plan, context);
      case "shopify":
        return shopifyWorkflowAgent.execute(plan, context);
      case "customer-service":
      default:
        return customerServiceAgent.execute(plan, context);
    }
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

      console.log("[Raw User Message]", inbound.content);
      logger.info("Received Discord message", {
        userId: inbound.discordUserId,
        username: inbound.username,
        channelId: inbound.channelId,
        content: inbound.content
      });

      if (inbound.content.toLowerCase() === "hello") {
        try {
          await message.reply("Hi bro!");
        } catch (replyError) {
          logger.error("Failed to send Discord hello reply", replyError);
        }
        return;
      }

      if (isEchoModeEnabled()) {
        try {
          await message.reply(`Echo: ${inbound.content}`);
        } catch (replyError) {
          logger.error("Failed to send Discord echo reply", replyError);
        }
        return;
      }

      try {
        await memoryService.logConversation(inbound.discordUserId, "user", inbound.content);

        const userMemory = await memoryService.getOrCreateUserMemory(
          inbound.discordUserId,
          inbound.username
        );
        const recentConversation = await memoryService.getRecentConversation(inbound.discordUserId);
        const project = toSkillProjectContext(await memoryService.getLatestProject(inbound.discordUserId));
        const projectMemory = toProjectMemory(userMemory.memory);

        const plan = hermesOrchestratorAgent.plan({
          discordUserId: inbound.discordUserId,
          username: inbound.username,
          message: inbound.content,
          memory: projectMemory,
          recentConversation
        });

        console.log("[Hermes Intent]", plan.intent);
        console.log("[Target Agent]", plan.targetAgent);
        console.log("[Target Skill]", plan.targetSkill);
        console.log("[Stage]", plan.stage);

        const skillContext: SkillExecutionContext = {
          discordUserId: inbound.discordUserId,
          username: inbound.username,
          message: inbound.content,
          language: plan.language,
          memory: {
            ...projectMemory,
            ...plan.memoryUpdate,
            language: plan.language
          },
          recentConversation,
          project,
          data: plan.data
        };

        const skillResult = await this.executeAgent(plan.targetAgent, plan, skillContext);
        console.log("[Skill Result]", {
          stage: skillResult.stage,
          actions: skillResult.actions,
          hasPrompt: Boolean(skillResult.prompt),
          imageCount: skillResult.imageOptions?.length || 0,
          hasProduct: Boolean(skillResult.product)
        });

        const merged = hermesOrchestratorAgent.mergeResult(plan, skillResult);
        const replyText = formatReply(merged);

        await memoryWorkflowAgent.persist({
          discordUserId: inbound.discordUserId,
          username: inbound.username,
          message: inbound.content,
          language: plan.language,
          memory: skillContext.memory,
          recentConversation,
          project: (merged.data.project as SkillExecutionContext["project"]) || project,
          result: merged
        });

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
          await message.reply(classifyErrorMessage(error));
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

    try {
      await this.client.login(token);
      this.started = true;
    } catch (error) {
      logger.error("Discord bot failed to start", error);
      throw error;
    }
  }
}

export const discordBot = new DiscordBot();
