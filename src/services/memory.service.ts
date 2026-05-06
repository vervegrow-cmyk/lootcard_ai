import { CardStyleOption, ConversationLog, PrismaClient } from "@prisma/client";
import {
  ConversationEntry,
  EMPTY_HERMES_MEMORY,
  HermesMemory,
  HermesResult,
  ImageOption,
  ProjectContext,
  ProjectStage,
  UserMemorySnapshot
} from "../types";

const prisma = new PrismaClient();

interface LocalProjectState {
  discordUserId: string;
  context: ProjectContext;
  imageOptions: ImageOption[];
}

function castStage(value: string): ProjectStage {
  return value as ProjectStage;
}

function safeParseMemory(profile: string | null | undefined): Partial<HermesMemory> {
  if (!profile) {
    return {};
  }

  try {
    const parsed = JSON.parse(profile) as Partial<HermesMemory>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function serializeMemory(memory: HermesMemory): string {
  return JSON.stringify(memory);
}

export class MemoryService {
  private readonly fallbackMemory = new Map<string, HermesMemory>();
  private readonly fallbackConversations = new Map<string, ConversationEntry[]>();
  private readonly fallbackProjects = new Map<string, LocalProjectState>();

  private ensureMemory(discordUserId: string): HermesMemory {
    const existing = this.fallbackMemory.get(discordUserId);
    if (existing) {
      return existing;
    }

    const created = { ...EMPTY_HERMES_MEMORY };
    this.fallbackMemory.set(discordUserId, created);
    return created;
  }

  private upsertMemory(discordUserId: string, patch: Partial<HermesMemory>): HermesMemory {
    const current = this.ensureMemory(discordUserId);
    const next: HermesMemory = {
      ...current,
      ...patch,
      revisionHistory: patch.revisionHistory ?? current.revisionHistory
    };
    this.fallbackMemory.set(discordUserId, next);
    return next;
  }

  async getOrCreateUserMemory(discordUserId: string, username: string): Promise<UserMemorySnapshot> {
    const fallback = this.ensureMemory(discordUserId);

    try {
      const existing = await prisma.userMemory.findUnique({
        where: { discordUserId }
      });

      if (!existing) {
        const created = await prisma.userMemory.create({
          data: {
            discordUserId,
            username,
            profile: serializeMemory(fallback),
            stage: fallback.stage
          }
        });

        return {
          discordUserId: created.discordUserId,
          username: created.username,
          profile: created.profile,
          memory: fallback
        };
      }

      const persistedMemory = {
        ...fallback,
        ...safeParseMemory(existing.profile),
        stage: castStage(existing.stage || fallback.stage)
      };
      this.fallbackMemory.set(discordUserId, persistedMemory);

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
        memory: persistedMemory
      };
    } catch {
      return {
        discordUserId,
        username,
        profile: "",
        memory: fallback
      };
    }
  }

  async updateUserMemory(params: {
    discordUserId: string;
    username: string;
    memoryPatch: Partial<HermesMemory>;
  }): Promise<void> {
    const nextMemory = this.upsertMemory(params.discordUserId, params.memoryPatch);

    try {
      await prisma.userMemory.upsert({
        where: { discordUserId: params.discordUserId },
        update: {
          username: params.username,
          stage: nextMemory.stage,
          profile: serializeMemory(nextMemory)
        },
        create: {
          discordUserId: params.discordUserId,
          username: params.username,
          stage: nextMemory.stage,
          profile: serializeMemory(nextMemory)
        }
      });
    } catch {
      return;
    }
  }

  async applyHermesResult(discordUserId: string, username: string, result: HermesResult): Promise<void> {
    const current = this.ensureMemory(discordUserId);
    const mergedHistory = result.memory_update.revisionHistory
      ? result.memory_update.revisionHistory
      : current.revisionHistory;

    await this.updateUserMemory({
      discordUserId,
      username,
      memoryPatch: {
        ...result.memory_update,
        language: result.language,
        stage: result.stage,
        revisionHistory: mergedHistory
      }
    });
  }

  async logConversation(discordUserId: string, role: "user" | "assistant", content: string): Promise<void> {
    const current = this.fallbackConversations.get(discordUserId) || [];
    this.fallbackConversations.set(
      discordUserId,
      [...current, { role, content, createdAt: new Date().toISOString() }].slice(-10)
    );

    try {
      await prisma.conversationLog.create({
        data: {
          discordUserId,
          role,
          content
        }
      });
    } catch {
      return;
    }
  }

  async getRecentConversation(discordUserId: string, limit = 10): Promise<ConversationEntry[]> {
    try {
      const rows = await prisma.conversationLog.findMany({
        where: { discordUserId },
        orderBy: { createdAt: "desc" },
        take: limit
      });

      return rows.reverse().map((row: ConversationLog) => ({
        role: row.role as "user" | "assistant",
        content: row.content,
        createdAt: row.createdAt.toISOString()
      }));
    } catch {
      return this.fallbackConversations.get(discordUserId) || [];
    }
  }

  async getLatestProject(discordUserId: string): Promise<ProjectContext | null> {
    const local = this.fallbackProjects.get(discordUserId)?.context || null;

    try {
      const project = await prisma.cardProject.findFirst({
        where: { discordUserId },
        orderBy: { updatedAt: "desc" }
      });

      if (!project) {
        return local;
      }

      return {
        projectId: project.id,
        status: castStage(project.status),
        originalPrompt: project.originalPrompt,
        currentPrompt: project.currentPrompt,
        selectedOptionId: project.selectedStyleId,
        finalDesignSummary: project.finalDesignSummary,
        shopifyProductId: project.shopifyProductId,
        shopifyProductUrl: project.shopifyProductUrl
      };
    } catch {
      return local;
    }
  }

  async createProject(discordUserId: string, originalPrompt: string, currentPrompt: string): Promise<ProjectContext> {
    try {
      const project = await prisma.cardProject.create({
        data: {
          discordUserId,
          status: "prompting",
          originalPrompt,
          currentPrompt
        }
      });

      const context: ProjectContext = {
        projectId: project.id,
        status: castStage(project.status),
        originalPrompt: project.originalPrompt,
        currentPrompt: project.currentPrompt,
        selectedOptionId: project.selectedStyleId,
        finalDesignSummary: project.finalDesignSummary,
        shopifyProductId: project.shopifyProductId,
        shopifyProductUrl: project.shopifyProductUrl
      };

      this.fallbackProjects.set(discordUserId, {
        discordUserId,
        context,
        imageOptions: []
      });

      return context;
    } catch {
      const context: ProjectContext = {
        projectId: `memory-${discordUserId}`,
        status: "prompting",
        originalPrompt,
        currentPrompt
      };

      this.fallbackProjects.set(discordUserId, {
        discordUserId,
        context,
        imageOptions: []
      });

      return context;
    }
  }

  async updateProject(projectId: string, data: {
    status?: ProjectStage;
    currentPrompt?: string;
    selectedOptionId?: string | null;
    finalDesignSummary?: string | null;
    shopifyProductId?: string | null;
    shopifyProductUrl?: string | null;
  }): Promise<void> {
    for (const [discordUserId, project] of this.fallbackProjects.entries()) {
      if (project.context.projectId === projectId) {
        this.fallbackProjects.set(discordUserId, {
          ...project,
          context: {
            ...project.context,
            ...data
          }
        });
      }
    }

    try {
      await prisma.cardProject.update({
        where: { id: projectId },
        data: {
          status: data.status,
          currentPrompt: data.currentPrompt,
          selectedStyleId: data.selectedOptionId,
          finalDesignSummary: data.finalDesignSummary,
          shopifyProductId: data.shopifyProductId,
          shopifyProductUrl: data.shopifyProductUrl
        }
      });
    } catch {
      return;
    }
  }

  async replaceImageOptions(projectId: string, options: ImageOption[]): Promise<void> {
    for (const [discordUserId, project] of this.fallbackProjects.entries()) {
      if (project.context.projectId === projectId) {
        this.fallbackProjects.set(discordUserId, {
          ...project,
          imageOptions: options
        });
      }
    }

    try {
      await prisma.cardStyleOption.deleteMany({
        where: { cardProjectId: projectId }
      });

      if (options.length === 0) {
        return;
      }

      await prisma.cardStyleOption.createMany({
        data: options.map((option) => ({
          cardProjectId: projectId,
          styleId: option.id,
          styleName: option.title,
          designSummary: option.title,
          imagePrompt: option.prompt,
          imageUrl: option.imageUrl,
          selected: false
        }))
      });
    } catch {
      return;
    }
  }

  async getImageOptions(projectId: string): Promise<ImageOption[]> {
    for (const project of this.fallbackProjects.values()) {
      if (project.context.projectId === projectId && project.imageOptions.length > 0) {
        return project.imageOptions;
      }
    }

    try {
      const rows = await prisma.cardStyleOption.findMany({
        where: { cardProjectId: projectId },
        orderBy: { createdAt: "asc" }
      });

      return rows.map((row: CardStyleOption) => ({
        id: row.styleId,
        title: row.styleName,
        imageUrl: row.imageUrl || "",
        prompt: row.imagePrompt
      }));
    } catch {
      return [];
    }
  }

  async selectImageOption(projectId: string, optionId: string): Promise<ImageOption | null> {
    for (const [discordUserId, project] of this.fallbackProjects.entries()) {
      if (project.context.projectId === projectId) {
        const found = project.imageOptions.find((option) => option.id === optionId) || null;
        if (found) {
          this.fallbackProjects.set(discordUserId, {
            ...project,
            context: {
              ...project.context,
              selectedOptionId: found.id,
              currentPrompt: found.prompt,
              finalDesignSummary: found.title
            }
          });
          return found;
        }
      }
    }

    try {
      await prisma.cardStyleOption.updateMany({
        where: { cardProjectId: projectId },
        data: { selected: false }
      });

      await prisma.cardStyleOption.updateMany({
        where: { cardProjectId: projectId, styleId: optionId },
        data: { selected: true }
      });

      const row = await prisma.cardStyleOption.findFirst({
        where: { cardProjectId: projectId, styleId: optionId }
      });

      if (!row) {
        return null;
      }

      return {
        id: row.styleId,
        title: row.styleName,
        imageUrl: row.imageUrl || "",
        prompt: row.imagePrompt
      };
    } catch {
      return null;
    }
  }

  async saveFeedbackLog(params: {
    projectId: string;
    discordUserId: string;
    feedbackText: string;
    oldPrompt: string;
    newPrompt: string;
  }): Promise<void> {
    try {
      await prisma.feedbackLog.create({
        data: {
          cardProjectId: params.projectId,
          discordUserId: params.discordUserId,
          feedbackText: params.feedbackText,
          oldPrompt: params.oldPrompt,
          newPrompt: params.newPrompt
        }
      });
    } catch {
      return;
    }
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
    try {
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
    } catch {
      return;
    }
  }

  async replaceStyleOptions(projectId: string, options: ImageOption[]): Promise<void> {
    await this.replaceImageOptions(projectId, options);
  }

  async getStyleOptions(projectId: string): Promise<ImageOption[]> {
    return this.getImageOptions(projectId);
  }

  async selectStyleOption(projectId: string, styleId: string): Promise<ImageOption | null> {
    return this.selectImageOption(projectId, styleId);
  }
}

export const memoryService = new MemoryService();
