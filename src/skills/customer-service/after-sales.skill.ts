import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

export class AfterSalesSkill {
  execute(context: SkillExecutionContext): SkillExecutionResult {
    return {
      reply:
        context.language === "zh"
          ? "如果是订单进度、修改确认稿、发货周期这类售后问题，你可以直接把问题发给我，我会按当前项目状态继续协助你。"
          : "For after-sales questions like order progress, confirmed design changes, or delivery timing, send me the issue directly and I will continue from the current project state.",
      stage: "customer_service",
      actions: ["after-sales-support"],
      memoryUpdate: {
        language: context.language,
        stage: "customer_service"
      }
    };
  }
}

export const afterSalesSkill = new AfterSalesSkill();
