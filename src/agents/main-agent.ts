import { feedbackAgent } from "./feedback-agent";
import { promptAgent } from "./prompt-agent";
import { shopifyAgent } from "./shopify-agent";
import { styleAgent } from "./style-agent";
import { memoryService } from "../services/memory.service";
import {
  AgentResult,
  CardRequirements,
  DiscordInboundMessage,
  EMPTY_REQUIREMENTS,
  ProjectContext,
  ProjectStage,
  StyleOption,
  UserMemorySnapshot
} from "../types";

function mergeRequirements(base: CardRequirements, partial: Partial<CardRequirements>): CardRequirements {
  return {
    ...base,
    ...partial
  };
}

function detectConfirmIntent(content: string): boolean {
  const text = content.toLowerCase();
  return ["confirm", "确认", "就这个", "可以下单", "create link"].some((keyword) =>
    text.includes(keyword)
  );
}

function detectStyleChoice(content: string): string | null {
  const trimmed = content.trim().toUpperCase();
  if (["A", "B", "C"].includes(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/\b([ABC])\b/);
  return match?.[1] || null;
}

function looksLikeRevision(content: string): boolean {
  const text = content.toLowerCase();
  return [
    "make",
    "change",
    "add",
    "remove",
    "more",
    "less",
    "darker",
    "lighter",
    "gold",
    "修改",
    "更",
    "增加",
    "减少"
  ].some((keyword) => text.includes(keyword));
}

function inferStageFromRequirements(requirements: CardRequirements): ProjectStage {
  const filledCount = Object.values(requirements).filter(Boolean).length;
  if (filledCount >= 5) {
    return "generating";
  }
  if (filledCount >= 2) {
    return "collecting";
  }
  return "inquiry";
}

function extractRequirements(content: string, existing: CardRequirements): CardRequirements {
  const next = { ...existing };
  const text = content.trim();
  const lower = text.toLowerCase();

  if (!next.rarity) {
    const rarityMatch = text.match(/\b(SSR|SR|UR|R|N)\b/i);
    if (rarityMatch) {
      next.rarity = rarityMatch[1].toUpperCase();
    }
  }

  if (!next.quantity) {
    const quantityMatch = text.match(/(\d+)\s*(张|pcs|cards|card)?/i);
    if (quantityMatch) {
      next.quantity = quantityMatch[1];
    }
  }

  if (!next.physical_card) {
    if (lower.includes("实体")) {
      next.physical_card = "physical card";
    } else if (lower.includes("digital")) {
      next.physical_card = "digital";
    }
  }

  if (!next.theme && (lower.includes("dark") || lower.includes("暗黑") || lower.includes("black gold") || lower.includes("黑金"))) {
    next.theme = "dark fantasy black gold";
  }

  if (!next.style && (lower.includes("哥特") || lower.includes("gothic"))) {
    next.style = "gothic";
  } else if (!next.style && (lower.includes("暗黑") || lower.includes("dark"))) {
    next.style = "dark fantasy";
  }

  if (!next.character && (lower.includes("queen") || lower.includes("女王"))) {
    next.character = "queen";
  }

  if (!next.theme && text.length > 0) {
    next.theme = text.slice(0, 120);
  }

  if (lower.includes("文字") || lower.includes("text")) {
    next.card_text = text;
  }

  if (lower.includes("special") || lower.includes("特别") || lower.includes("特殊")) {
    next.special_requirements = text;
  }

  return next;
}

function buildProfileFromRequirements(requirements: CardRequirements): string {
  const parts = [requirements.theme, requirements.style, requirements.rarity, requirements.physical_card]
    .filter(Boolean)
    .join(", ");
  return parts || "";
}

function hasEnoughRequirements(requirements: CardRequirements): boolean {
  return Boolean(
    requirements.theme &&
      requirements.character &&
      requirements.style &&
      requirements.rarity &&
      requirements.quantity &&
      requirements.physical_card
  );
}

function formatStyleOptionsReply(options: StyleOption[]): string {
  const lines = ["Here are 3 card design directions:", ""];

  for (const option of options) {
    lines.push(`${option.style_id}. ${option.style_name}`);
    lines.push(`Description: ${option.design_summary}`);
    if (option.image_url) {
      lines.push(`Preview: ${option.image_url}`);
    }
    lines.push(`Reply "${option.style_id}" to choose this style.`);
    lines.push("");
  }

  lines.push('You can also reply with changes like:');
  lines.push('"Make it darker"');
  lines.push('"Add more gold"');
  lines.push('"Change the character style"');

  return lines.join("\n");
}

export class MainAgent {
  async handleMessage(input: {
    inbound: DiscordInboundMessage;
    userMemory: UserMemorySnapshot;
    recentConversation: { role: "user" | "assistant"; content: string; createdAt: string }[];
    activeProject: ProjectContext | null;
  }): Promise<AgentResult> {
    const requirements = extractRequirements(input.inbound.content, EMPTY_REQUIREMENTS);
    const latestOptions = input.activeProject
      ? await memoryService.getStyleOptions(input.activeProject.projectId)
      : [];
    const selectedStyle = latestOptions.find((option) => option.style_id === input.activeProject?.selectedStyleId);

    if (detectConfirmIntent(input.inbound.content)) {
      if (!input.activeProject || !selectedStyle) {
        return {
          action: "chat",
          reply: "Before I create the order link, please choose one style option first, or tell me what to adjust.",
          stage: "selecting",
          requirements,
          style_options: latestOptions,
          product: null
        };
      }

      await memoryService.updateProject(input.activeProject.projectId, {
        status: "confirmed",
        finalDesignSummary: selectedStyle.design_summary,
        selectedStyleId: selectedStyle.style_id
      });

      const product = await shopifyAgent.createProductDraft({
        project: input.activeProject,
        selectedStyle,
        quantity: requirements.quantity,
        theme: requirements.theme
      });

      return {
        action: "create_shopify_product",
        reply: "Your design is confirmed. I am creating your Shopify checkout link now.",
        stage: "payment",
        requirements,
        style_options: latestOptions,
        product
      };
    }

    const selectedChoice = detectStyleChoice(input.inbound.content);
    if (selectedChoice && input.activeProject && latestOptions.length > 0) {
      const chosen = await memoryService.selectStyleOption(input.activeProject.projectId, selectedChoice);
      if (!chosen) {
        return {
          action: "chat",
          reply: 'I could not find that option. Please reply with "A", "B", or "C".',
          stage: "selecting",
          requirements,
          style_options: latestOptions,
          product: null
        };
      }

      await memoryService.updateProject(input.activeProject.projectId, {
        status: "selecting",
        selectedStyleId: chosen.style_id,
        finalDesignSummary: chosen.design_summary
      });

      return {
        action: "chat",
        reply: `You selected ${chosen.style_id}. ${chosen.style_name}. If it looks good, reply "confirm" or "可以下单". If you want changes, send one adjustment request and I will refine it.`,
        stage: "selecting",
        requirements,
        style_options: latestOptions,
        product: null
      };
    }

    if (input.activeProject && latestOptions.length > 0 && looksLikeRevision(input.inbound.content)) {
      const basePrompt =
        input.activeProject.currentPrompt ||
        latestOptions.find((option) => option.style_id === input.activeProject?.selectedStyleId)?.image_prompt ||
        latestOptions[0].image_prompt;

      const optimized = await feedbackAgent.optimizePrompt(basePrompt, input.inbound.content);
      await memoryService.saveFeedbackLog({
        projectId: input.activeProject.projectId,
        discordUserId: input.inbound.discordUserId,
        feedbackText: input.inbound.content,
        oldPrompt: basePrompt,
        newPrompt: optimized.optimized_prompt
      });

      await memoryService.updateProject(input.activeProject.projectId, {
        status: "revising",
        currentPrompt: optimized.optimized_prompt
      });

      const revisedOptions = await styleAgent.generateStyleOptions({
        basePrompt: optimized.optimized_prompt,
        projectId: input.activeProject.projectId
      });

      await memoryService.replaceStyleOptions(input.activeProject.projectId, revisedOptions);

      return {
        action: "revise_design",
        reply: `I refined the prompt based on your feedback: ${optimized.change_summary}`,
        stage: "revising",
        requirements,
        style_options: revisedOptions,
        product: null
      };
    }

    const mergedRequirements = mergeRequirements(EMPTY_REQUIREMENTS, requirements);
    const stage = inferStageFromRequirements(mergedRequirements);

    if (!hasEnoughRequirements(mergedRequirements)) {
      const missing = Object.entries(mergedRequirements)
        .filter(([, value]) => !value)
        .map(([key]) => key);

      const questions: string[] = [];
      if (missing.includes("character")) {
        questions.push("Who should be the main character or subject on the card?");
      }
      if (missing.includes("style")) {
        questions.push("What art style do you want, such as gothic, luxury, anime, or cyber?");
      }
      if (missing.includes("rarity")) {
        questions.push("What rarity should it be, like SSR, SR, or UR?");
      }
      if (missing.includes("quantity")) {
        questions.push("How many cards do you want to order?");
      }
      if (missing.includes("physical_card")) {
        questions.push("Do you want a physical printed card or a digital preview only?");
      }

      const reply = questions.slice(0, 2).join(" ");

      return {
        action: "chat",
        reply: reply || "Tell me the theme and character you want for this card, and I will help shape the concept.",
        stage,
        requirements: mergedRequirements,
        style_options: [],
        product: null
      };
    }

    const basePrompt = await promptAgent.buildPrompt(mergedRequirements);
    const project =
      input.activeProject ??
      (await memoryService.createProject(
        input.inbound.discordUserId,
        input.inbound.content,
        basePrompt.image_prompt
      ));

    if (input.activeProject) {
      await memoryService.updateProject(input.activeProject.projectId, {
        status: "generating",
        currentPrompt: basePrompt.image_prompt
      });
    }

    const options = await styleAgent.generateStyleOptions({
      basePrompt: basePrompt.image_prompt,
      projectId: project.projectId,
      themeHint: mergedRequirements.theme
    });

    await memoryService.replaceStyleOptions(project.projectId, options);
    await memoryService.updateUserMemory({
      discordUserId: input.inbound.discordUserId,
      username: input.inbound.username,
      stage: "selecting",
      profile: buildProfileFromRequirements(mergedRequirements)
    });

    return {
      action: "show_style_options",
      reply: formatStyleOptionsReply(options),
      stage: "selecting",
      requirements: mergedRequirements,
      style_options: options,
      product: null
    };
  }
}

export const mainAgent = new MainAgent();
