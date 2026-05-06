import { Client, GatewayIntentBits, Partials } from "discord.js";
import { customerServiceAgent } from "../agents/customer-service.agent";
import { designAgent } from "../agents/design.agent";
import { hermesOrchestratorAgent } from "../agents/hermes-orchestrator.agent";
import { memoryWorkflowAgent } from "../agents/memory.agent";
import { promptWorkflowAgent } from "../agents/prompt.agent";
import { replyAgent } from "../agents/reply.agent";
import { shopifyWorkflowAgent } from "../agents/shopify.agent";
import { memoryService } from "../services/memory.service";
import { OrchestratorPlan, TargetAgent } from "../types/agent.types";
import { ProjectMemory, SkillExecutionContext, SkillExecutionResult } from "../types/skill.types";
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

function isEchoModeEnabled(): boolean {
  return (process.env.ECHO_BOT_MODE || "false").toLowerCase() === "true";
}

function classifyProcessingError(error: unknown): string {
  logger.error("Failed to process Discord message", error);
  return "Kimi AI 当前回复失败，请查看 Railway 日志。";
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
  shopifyProductUrl?: string;
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
    shopifyProductUrl: memory.shopifyProductUrl || ""
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

        const userMemory = await memoryService.getOrCreateUserMemory(inbound.discordUserId, inbound.username);
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
        console.log("[Route Reason]", String(plan.data?.reason || ""));
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

        let skillResult: SkillExecutionResult;
        try {
          skillResult = await this.executeAgent(plan.targetAgent, plan, skillContext);
        } catch (toolError) {
          logger.error("Agent or skill execution failed", toolError);
          skillResult = {
            reply: "",
            stage: plan.stage,
            actions: ["tool-error"],
            data: {
              toolError:
                toolError instanceof Error ? toolError.message : String(toolError)
            },
            replyData: {
              errorType: "tool_error"
            }
          };
        }
        console.log("[Skill Result]", skillResult);

        const merged = hermesOrchestratorAgent.mergeResult(plan, skillResult);
        if (skillResult.actions?.includes("tool-error")) {
          merged.replyInstruction =
            plan.language === "zh"
              ? "工具执行失败了。请根据工具报错内容，用自然、简短、准确的中文说明具体原因，并告诉用户稍后再试或换一种操作。"
              : "A tool execution failed. Use the tool error details to explain the specific problem naturally and briefly in English, and tell the user they can try again later or take a different step.";
        }

        let finalReply = "";
        try {
          console.log("[Calling Kimi Final Reply]", true);
          finalReply = await replyAgent.generateReply({
            userMessage: inbound.content,
            memory: {
              ...skillContext.memory,
              ...(merged.memoryUpdate || {})
            },
            history: recentConversation,
            result: merged
          });
          console.log("[Kimi Final Reply]", finalReply);
        } catch (error) {
          console.error("[Kimi Reply Error]", error);
          finalReply = "Kimi AI 当前回复失败，请查看 Railway 日志。";
        }

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
          await memoryService.logConversation(inbound.discordUserId, "assistant", finalReply);
        } catch (dbError) {
          logger.error("Failed to log assistant reply", dbError);
        }

        try {
          await message.reply(finalReply);
        } catch (replyError) {
          logger.error("Failed to send Discord reply", replyError);
        }
      } catch (error) {
        const fallbackMessage = classifyProcessingError(error);
        try {
          await message.reply(fallbackMessage);
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
