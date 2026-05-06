import { feedbackAgent } from "../../agents/feedback-agent";
import { imageService } from "../../services/image.service";
import { memoryService } from "../../services/memory.service";
import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

export class ReviseImageSkill {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const basePrompt = context.memory.currentPrompt || context.project?.currentPrompt || "";

    if (!basePrompt) {
      return {
        reply:
          context.language === "zh"
            ? "你先选一个方案，或者先让我生成图像方案，我再帮你修改。"
            : "Please choose an option first, or let me generate image options before revising.",
        stage: context.memory.stage,
        actions: ["missing-base-prompt"]
      };
    }

    const optimized = await feedbackAgent.optimizePrompt(basePrompt, context.message);
    const revised = await imageService.generateImages(optimized.optimized_prompt, 1);
    const selected = {
      id: context.memory.selectedOption || revised[0]?.id || "A",
      title:
        context.memory.selectedOptionTitle ||
        revised[0]?.title ||
        (context.language === "zh" ? "已修改方案" : "Revised Option"),
      imageUrl: revised[0]?.imageUrl || context.memory.selectedImageUrl,
      prompt: optimized.optimized_prompt
    };

    if (context.project) {
      await memoryService.updateProject(context.project.projectId, {
        status: "revising",
        currentPrompt: optimized.optimized_prompt,
        selectedOptionId: selected.id,
        finalDesignSummary: selected.title
      });

      await memoryService.saveFeedbackLog({
        projectId: context.project.projectId,
        discordUserId: context.discordUserId,
        feedbackText: context.message,
        oldPrompt: basePrompt,
        newPrompt: optimized.optimized_prompt
      });
    }

    return {
      reply:
        context.language === "zh"
          ? `已根据你的反馈优化：\n修改点：${optimized.change_summary}\n图片：${selected.imageUrl}\n提示词：${selected.prompt}\n\n如果还要继续改，直接告诉我。`
          : `Updated based on your feedback:\nChanges: ${optimized.change_summary}\nImage: ${selected.imageUrl}\nPrompt: ${selected.prompt}\n\nIf you want more changes, just tell me.`,
      stage: "revising",
      actions: ["revise-image"],
      memoryUpdate: {
        stage: "revising",
        currentPrompt: optimized.optimized_prompt,
        selectedOption: selected.id,
        selectedOptionTitle: selected.title,
        selectedImageUrl: selected.imageUrl,
        selectedDesignSummary: selected.title,
        revisionHistory: [...context.memory.revisionHistory, context.message].slice(-10)
      },
      prompt: optimized.optimized_prompt,
      selectedOption: selected
    };
  }
}

export const reviseImageSkill = new ReviseImageSkill();
