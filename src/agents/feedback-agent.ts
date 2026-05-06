import { FEEDBACK_OPTIMIZER_PROMPT } from "../prompts/feedback-optimizer.prompt";
import { FeedbackOptimization } from "../types";
import { claudeService } from "../services/claude.service";

function inferFeedbackModifiers(feedback: string): string[] {
  const text = feedback.toLowerCase();
  const modifiers: string[] = [];

  if (
    text.includes("dark") ||
    text.includes("darker") ||
    text.includes("更暗") ||
    text.includes("太亮") ||
    text.includes("降低亮度")
  ) {
    modifiers.push("darker tone", "lower exposure", "deeper shadows", "more mysterious atmosphere");
  }
  if (text.includes("gold") || text.includes("金色") || text.includes("加金")) {
    modifiers.push("richer metallic gold texture", "more premium gold detailing");
  }
  if (text.includes("sharp") || text.includes("细节") || text.includes("收藏卡")) {
    modifiers.push("higher detail", "premium collectible card finish", "sharper line work");
  }
  if (text.includes("queen") || text.includes("女王") || text.includes("性感")) {
    modifiers.push("stronger character presence", "more elegant pose", "refined character styling");
  }
  if (text.includes("cyber") || text.includes("赛博")) {
    modifiers.push("stronger cyberpunk neon accents", "futuristic metallic elements");
  }
  if (text.includes("换风格") || text.includes("change the style")) {
    modifiers.push("new style direction based on customer revision");
  }

  if (modifiers.length === 0) {
    modifiers.push(`customer feedback: ${feedback}`);
  }

  return modifiers;
}

export class FeedbackAgent {
  async optimizePrompt(currentPrompt: string, feedbackText: string): Promise<FeedbackOptimization> {
    if (claudeService.isEnabled()) {
      try {
        return await claudeService.generateJson<FeedbackOptimization>(
          FEEDBACK_OPTIMIZER_PROMPT,
          JSON.stringify(
            {
              current_prompt: currentPrompt,
              feedback_text: feedbackText
            },
            null,
            2
          )
        );
      } catch {
        const modifiers = inferFeedbackModifiers(feedbackText);
        return {
          optimized_prompt: `${currentPrompt}, ${modifiers.join(", ")}`,
          change_summary: modifiers.join(", ")
        };
      }
    }

    const modifiers = inferFeedbackModifiers(feedbackText);
    return {
      optimized_prompt: `${currentPrompt}, ${modifiers.join(", ")}`,
      change_summary: modifiers.join(", ")
    };
  }
}

export const feedbackAgent = new FeedbackAgent();
