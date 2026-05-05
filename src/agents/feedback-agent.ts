import { FEEDBACK_OPTIMIZER_PROMPT } from "../prompts/feedback-optimizer.prompt";
import { FeedbackOptimization } from "../types";
import { claudeService } from "../services/claude.service";

function inferFeedbackModifiers(feedback: string): string[] {
  const text = feedback.toLowerCase();
  const modifiers: string[] = [];

  if (text.includes("dark") || text.includes("更暗") || text.includes("太亮")) {
    modifiers.push("darker tone", "lower exposure", "deeper shadows", "more mysterious atmosphere");
  }
  if (text.includes("gold") || text.includes("金")) {
    modifiers.push("richer metallic gold texture", "more premium gold detailing");
  }
  if (text.includes("sharp") || text.includes("细节")) {
    modifiers.push("higher detail", "sharper line work");
  }
  if (text.includes("queen") || text.includes("女王")) {
    modifiers.push("stronger regal queen presence");
  }

  if (modifiers.length === 0) {
    modifiers.push(`customer feedback: ${feedback}`);
  }

  return modifiers;
}

export class FeedbackAgent {
  async optimizePrompt(currentPrompt: string, feedbackText: string): Promise<FeedbackOptimization> {
    if (claudeService.isEnabled()) {
      return claudeService.generateJson<FeedbackOptimization>(
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
    }

    const modifiers = inferFeedbackModifiers(feedbackText);
    return {
      optimized_prompt: `${currentPrompt}, ${modifiers.join(", ")}`,
      change_summary: modifiers.join(", ")
    };
  }
}

export const feedbackAgent = new FeedbackAgent();
