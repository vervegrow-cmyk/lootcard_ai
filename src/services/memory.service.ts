import { CardStyleOption, ConversationLog, PrismaClient } from "@prisma/client";
import {
  ConversationEntry,
  ProjectContext,
  ProjectStage,
  StyleOption,
  UserMemorySnapshot
} from "../types";

const prisma = new PrismaClient();

function castStage(value: string): ProjectStage {
  return value as ProjectStage;
}

export class MemoryService {
  async getOrCreateUserMemory(
    discordUserId: string,
    username: string
  ): Promise<UserMemorySnapshot> {
    const existing = await prisma.userMemory.findUnique({
      where: { discordUserId }
    });

    if (!existing) {
      const created = await prisma.userMemory.create({
        data: {
          discordUserId,
          username,
          profile: "",
          stage: "inquiry"
        }
      });

      return {
        discordUserId: created.discordUserId,
        username: created.username,
        profile: created.profile,
        stage: castStage(created.stage)
      };
    }

    if (existing.username !== username) {
      await prisma.userMemory.update({
        where: { discordUserId },
        data: { username }
      });
    }

    return {
      discordUserId: existing.discordUserId,
      username,
      profile: existing.profile,
      stage: castStage(existing.stage)
    };
  }

  async updateUserMemory(params: {
    discordUserId: string;
    username: string;
    stage: ProjectStage;
    profile?: string;
  }): Promise<void> {
    await prisma.userMemory.upsert({
      where: { discordUserId: params.discordUserId },
      update: {
        username: params.username,
        stage: params.stage,
        ...(params.profile !== undefined ? { profile: params.profile } : {})
      },
      create: {
        discordUserId: params.discordUserId,
        username: params.username,
        stage: params.stage,
        profile: params.profile || ""
      }
    });
  }

  async logConversation(discordUserId: string, role: "user" | "assistant", content: string): Promise<void> {
    await prisma.conversationLog.create({
      data: {
        discordUserId,
        role,
        content
      }
    });
  }

  async getRecentConversation(discordUserId: string, limit = 10): Promise<ConversationEntry[]> {
    const rows = await prisma.conversationLog.findMany({
      where: { discordUserId },
      orderBy: { createdAt: "desc" },
      take: limit
    });

    return rows
      .reverse()
      .map((row: ConversationLog) => ({
        role: row.role as "user" | "assistant",
        content: row.content,
        createdAt: row.createdAt.toISOString()
      }));
  }

  async getLatestProject(discordUserId: string): Promise<ProjectContext | null> {
    const project = await prisma.cardProject.findFirst({
      where: { discordUserId },
      orderBy: { updatedAt: "desc" }
    });

    if (!project) {
      return null;
    }

    return {
      projectId: project.id,
      status: castStage(project.status),
      originalPrompt: project.originalPrompt,
      currentPrompt: project.currentPrompt,
      selectedStyleId: project.selectedStyleId,
      finalDesignSummary: project.finalDesignSummary,
      shopifyProductId: project.shopifyProductId,
      shopifyProductUrl: project.shopifyProductUrl
    };
  }

  async createProject(discordUserId: string, originalPrompt: string, currentPrompt: string): Promise<ProjectContext> {
    const project = await prisma.cardProject.create({
      data: {
        discordUserId,
        status: "generating",
        originalPrompt,
        currentPrompt
      }
    });

    return {
      projectId: project.id,
      status: castStage(project.status),
      originalPrompt: project.originalPrompt,
      currentPrompt: project.currentPrompt,
      selectedStyleId: project.selectedStyleId,
      finalDesignSummary: project.finalDesignSummary,
      shopifyProductId: project.shopifyProductId,
      shopifyProductUrl: project.shopifyProductUrl
    };
  }

  async updateProject(projectId: string, data: {
    status?: ProjectStage;
    currentPrompt?: string;
    selectedStyleId?: string | null;
    finalDesignSummary?: string | null;
    shopifyProductId?: string | null;
    shopifyProductUrl?: string | null;
  }): Promise<void> {
    await prisma.cardProject.update({
      where: { id: projectId },
      data
    });
  }

  async replaceStyleOptions(projectId: string, options: StyleOption[]): Promise<void> {
    await prisma.cardStyleOption.deleteMany({
      where: { cardProjectId: projectId }
    });

    if (options.length === 0) {
      return;
    }

    await prisma.cardStyleOption.createMany({
      data: options.map((option) => ({
        cardProjectId: projectId,
        styleId: option.style_id,
        styleName: option.style_name,
        designSummary: option.design_summary,
        imagePrompt: option.image_prompt,
        imageUrl: option.image_url,
        selected: false
      }))
    });
  }

  async getStyleOptions(projectId: string): Promise<StyleOption[]> {
    const rows = await prisma.cardStyleOption.findMany({
      where: { cardProjectId: projectId },
      orderBy: { createdAt: "asc" }
    });

    return rows.map((row: CardStyleOption) => ({
      style_id: row.styleId,
      style_name: row.styleName,
      design_summary: row.designSummary,
      image_prompt: row.imagePrompt,
      suggested_title: row.styleName,
      image_url: row.imageUrl || undefined
    }));
  }

  async selectStyleOption(projectId: string, styleId: string): Promise<StyleOption | null> {
    await prisma.cardStyleOption.updateMany({
      where: { cardProjectId: projectId },
      data: { selected: false }
    });

    await prisma.cardStyleOption.updateMany({
      where: { cardProjectId: projectId, styleId },
      data: { selected: true }
    });

    const row = await prisma.cardStyleOption.findFirst({
      where: { cardProjectId: projectId, styleId }
    });

    if (!row) {
      return null;
    }

    return {
      style_id: row.styleId,
      style_name: row.styleName,
      design_summary: row.designSummary,
      image_prompt: row.imagePrompt,
      suggested_title: row.styleName,
      image_url: row.imageUrl || undefined
    };
  }

  async saveFeedbackLog(params: {
    projectId: string;
    discordUserId: string;
    feedbackText: string;
    oldPrompt: string;
    newPrompt: string;
  }): Promise<void> {
    await prisma.feedbackLog.create({
      data: {
        cardProjectId: params.projectId,
        discordUserId: params.discordUserId,
        feedbackText: params.feedbackText,
        oldPrompt: params.oldPrompt,
        newPrompt: params.newPrompt
      }
    });
  }

  async logShopifyProduct(params: {
    projectId: string;
    discordUserId: string;
    shopifyProductId: string;
    shopifyProductUrl: string;
    title: string;
    price: string;
    sku: string;
  }): Promise<void> {
    await prisma.shopifyProductLog.create({
      data: {
        cardProjectId: params.projectId,
        discordUserId: params.discordUserId,
        shopifyProductId: params.shopifyProductId,
        shopifyProductUrl: params.shopifyProductUrl,
        title: params.title,
        price: params.price,
        sku: params.sku
      }
    });
  }
}

export const memoryService = new MemoryService();
