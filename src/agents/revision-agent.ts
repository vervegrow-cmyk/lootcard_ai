import { feedbackAgent } from "./feedback-agent";
import { imageService } from "../services/image.service";
import { memoryService } from "../services/memory.service";
import { HermesInput, HermesResult, ImageOption, LanguagePreference, ProjectContext } from "../types";

function t(language: LanguagePreference, zh: string, en: string): string {
  return language === "zh" ? zh : en;
}

function formatRevisionReply(option: ImageOption, changeSummary: string, language: LanguagePreference): string {
  return language === "zh"
    ? `已根据你的反馈优化：\n修改点：${changeSummary}\n图片：${option.imageUrl}\n提示词：${option.prompt}\n\n如果还要继续改，直接告诉我。`
    : `Updated based on your feedback:\nChanges: ${changeSummary}\nImage: ${option.imageUrl}\nPrompt: ${option.prompt}\n\nIf you want more changes, just tell me.`;
}

export class RevisionAgent {
  async revise(input: HermesInput, activeProject: ProjectContext | null): Promise<HermesResult> {
    const language = input.memory.language;
    const basePrompt = input.memory.currentPrompt || activeProject?.currentPrompt || "";

    if (!basePrompt) {
      return {
        intent: "revise_image",
        action: "reply",
        stage: input.memory.stage,
        language,
        reply: t(language, "你先选一个方案，或者先让我生成图像方向，我再帮你修改。", "Please choose an option first, or let me generate image directions before revising."),
        memory_update: {},
        prompt: "",
        image_options: [],
        selected_option: null,
        product: null
      };
    }

    const optimized = await feedbackAgent.optimizePrompt(basePrompt, input.message);
    const previews = await imageService.generateImages(optimized.optimized_prompt, 1);
    const preview = {
      ...(previews[0] || {
        id: input.memory.selectedOption || "A",
        title: input.memory.selectedOptionTitle || "Revised Preview",
        imageUrl: "",
        prompt: optimized.optimized_prompt
      }),
      id: input.memory.selectedOption || previews[0]?.id || "A",
      title:
        input.memory.selectedOptionTitle ||
        previews[0]?.title ||
        (language === "zh" ? "已修改方案" : "Revised option"),
      prompt: optimized.optimized_prompt
    };

    const project =
      activeProject ||
      (await memoryService.createProject(input.discordUserId, basePrompt, optimized.optimized_prompt));

    await memoryService.updateProject(project.projectId, {
      status: "revising",
      currentPrompt: optimized.optimized_prompt,
      selectedOptionId: preview.id,
      finalDesignSummary: preview.title
    });

    await memoryService.saveFeedbackLog({
      projectId: project.projectId,
      discordUserId: input.discordUserId,
      feedbackText: input.message,
      oldPrompt: basePrompt,
      newPrompt: optimized.optimized_prompt
    });

    const revisionHistory = [...input.memory.revisionHistory, input.message].slice(-10);

    return {
      intent: "revise_image",
      action: "revise_image",
      stage: "revising",
      language,
      reply: formatRevisionReply(preview, optimized.change_summary, language),
      memory_update: {
        stage: "revising",
        currentPrompt: optimized.optimized_prompt,
        selectedOption: preview.id,
        selectedOptionTitle: preview.title,
        selectedImageUrl: preview.imageUrl,
        selectedDesignSummary: preview.title,
        revisionHistory
      },
      prompt: optimized.optimized_prompt,
      image_options: [],
      selected_option: preview,
      product: null,
      project
    };
  }
}

export const revisionAgent = new RevisionAgent();
