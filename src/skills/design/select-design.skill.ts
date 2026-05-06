import { memoryService } from "../../services/memory.service";
import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

export class SelectDesignSkill {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const optionId = String(context.data?.selectedOption || "").toUpperCase();

    if (!context.project) {
      return {
        reply:
          context.language === "zh"
            ? "你先让我生成 A/B/C 图像方案，我再帮你选。"
            : "Let me generate A/B/C image options first, then you can choose one.",
        stage: context.memory.stage,
        actions: ["missing-project"]
      };
    }

    const option = await memoryService.selectImageOption(context.project.projectId, optionId);
    if (!option) {
      return {
        reply:
          context.language === "zh"
            ? "我没找到这个选项，请回复 A、B 或 C。"
            : "I could not find that option. Please reply with A, B, or C.",
        stage: "selecting",
        actions: ["invalid-selection"]
      };
    }

    await memoryService.updateProject(context.project.projectId, {
      status: "confirmed",
      currentPrompt: option.prompt,
      selectedOptionId: option.id,
      finalDesignSummary: option.title
    });

    return {
      reply:
        context.language === "zh"
          ? `已为你选中【${option.id}】${option.title}\n图片：${option.imageUrl}\n提示词：${option.prompt}\n\n如果要改，直接说修改意见；如果满意，回复“确认”或“可以下单”。`
          : `Selected [${option.id}] ${option.title}\nImage: ${option.imageUrl}\nPrompt: ${option.prompt}\n\nIf you want changes, tell me what to revise. If it looks good, reply "confirm" or "create link".`,
      stage: "confirmed",
      actions: ["select-design"],
      memoryUpdate: {
        stage: "confirmed",
        currentPrompt: option.prompt,
        selectedOption: option.id,
        selectedOptionTitle: option.title,
        selectedImageUrl: option.imageUrl,
        selectedDesignSummary: option.title
      },
      selectedOption: option
    };
  }
}

export const selectDesignSkill = new SelectDesignSkill();
