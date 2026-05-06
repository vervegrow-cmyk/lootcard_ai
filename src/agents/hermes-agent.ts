import { chatAgent } from "./chat-agent";
import { commerceAgent } from "./commerce-agent";
import { imageAgent } from "./image-agent";
import { promptAgent } from "./prompt-agent";
import { revisionAgent } from "./revision-agent";
import { memoryService } from "../services/memory.service";
import { HermesInput, HermesIntent, HermesResult, ImageOption, LanguagePreference, ProjectContext } from "../types";

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function detectLanguage(message: string, fallback: LanguagePreference): LanguagePreference {
  return hasChinese(message) ? "zh" : fallback;
}

function detectLanguagePreferenceIntent(message: string): LanguagePreference | null {
  const lower = message.toLowerCase();
  if (
    lower.includes("以后用中文") ||
    lower.includes("能反馈中文么") ||
    lower.includes("请用中文回复") ||
    lower.includes("中文回复")
  ) {
    return "zh";
  }

  if (
    lower.includes("use english") ||
    lower.includes("reply in english") ||
    lower.includes("please use english") ||
    lower.includes("请用英文") ||
    lower.includes("英文回复")
  ) {
    return "en";
  }

  return null;
}

function detectPromptPolishIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return [
    "润色提示词",
    "优化prompt",
    "优化这个prompt",
    "帮我润色提示词",
    "把这个提示词变专业",
    "polish prompt",
    "optimize prompt",
    "refine prompt"
  ].some((keyword) => lower.includes(keyword));
}

function detectQuestionIntent(message: string): boolean {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();
  return (
    trimmed.endsWith("?") ||
    trimmed.endsWith("？") ||
    lower.startsWith("what ") ||
    lower.startsWith("how ") ||
    lower.startsWith("can you") ||
    lower.includes("你能") ||
    lower.includes("是什么") ||
    lower.includes("多久") ||
    lower.includes("价格")
  );
}

function detectConfirmIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return ["确认", "就这个", "可以下单", "confirm", "create link"].some((keyword) =>
    lower.includes(keyword)
  );
}

function detectSelectedOption(message: string): string | null {
  const trimmed = message.trim().toUpperCase();
  if (["A", "B", "C"].includes(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/\b([ABC])\b/);
  return match?.[1] || null;
}

function detectRevisionIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return [
    "太亮",
    "太暗",
    "更暗",
    "加金色",
    "加点金色",
    "换背景",
    "更酷",
    "换风格",
    "改角色",
    "修改图片",
    "修一下",
    "too bright",
    "too dark",
    "make it darker",
    "add more gold",
    "change background",
    "make it cooler",
    "revise"
  ].some((keyword) => lower.includes(keyword));
}

function detectGenerateIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return [
    "直接生成",
    "生成",
    "出图",
    "不要废话",
    "卡牌",
    "图片",
    "图像",
    "人造人18",
    "海贼王",
    "女王",
    "赛博朋克",
    "黑金",
    "generate",
    "image",
    "art",
    "illustration"
  ].some((keyword) => lower.includes(keyword));
}

function sanitizePromptIdea(message: string): string {
  return message
    .replace(/帮我|请把|润色|优化|这个|提示词|prompt/gi, " ")
    .replace(/[：:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPolishReply(rawIdea: string, polished: string, explanation: string, language: LanguagePreference): string {
  return language === "zh"
    ? `原始想法：\n${rawIdea}\n\n优化提示词：\n${polished}\n\n中文解释：\n${explanation}`
    : `Original idea:\n${rawIdea}\n\nOptimized prompt:\n${polished}\n\nExplanation:\n${explanation}`;
}

function inferIntent(input: HermesInput, activeProject: ProjectContext | null): HermesIntent {
  const message = input.message;
  if (detectLanguagePreferenceIntent(message)) return "language_preference";
  if (detectPromptPolishIntent(message)) return "polish_prompt";
  if (detectConfirmIntent(message)) return "create_shopify_product";
  if (detectSelectedOption(message)) return "select_image";
  if (detectRevisionIntent(message) && (input.memory.selectedOption || input.memory.currentPrompt || activeProject)) {
    return "revise_image";
  }
  if (detectQuestionIntent(message)) return "answer_question";
  if (detectGenerateIntent(message) || input.memory.stage === "prompting") return "generate_images";
  return "answer_question";
}

export class HermesAgent {
  async run(input: HermesInput): Promise<HermesResult> {
    const activeProject = await memoryService.getLatestProject(input.discordUserId);
    const latestOptions = activeProject ? await memoryService.getImageOptions(activeProject.projectId) : [];
    const selectedOption =
      latestOptions.find((option) => option.id === input.memory.selectedOption) ||
      (input.memory.selectedOption
        ? ({
            id: input.memory.selectedOption,
            title: input.memory.selectedOptionTitle,
            imageUrl: input.memory.selectedImageUrl,
            prompt: input.memory.currentPrompt
          } as ImageOption)
        : null);
    const language = detectLanguage(input.message, input.memory.language);
    const normalizedInput: HermesInput = {
      ...input,
      memory: {
        ...input.memory,
        language
      }
    };
    const intent = inferIntent(normalizedInput, activeProject);

    switch (intent) {
      case "language_preference": {
        const preferred = detectLanguagePreferenceIntent(input.message) || language;
        return chatAgent.applyLanguagePreference(normalizedInput, preferred);
      }
      case "polish_prompt": {
        const rawIdea = sanitizePromptIdea(input.message) || input.message;
        const polished = await promptAgent.polishPrompt(rawIdea, language);
        return {
          intent,
          action: "polish_prompt",
          stage: input.memory.stage,
          language,
          reply: formatPolishReply(rawIdea, polished.polished_prompt, polished.explanation, language),
          memory_update: {
            language
          },
          prompt: polished.polished_prompt,
          image_options: [],
          selected_option: null,
          product: null
        };
      }
      case "generate_images":
        return imageAgent.prepareOrGenerate(normalizedInput, activeProject);
      case "select_image": {
        const optionId = detectSelectedOption(input.message);
        if (!optionId) {
          return chatAgent.replyToQuestion(normalizedInput);
        }
        return imageAgent.selectImage(normalizedInput, activeProject, optionId);
      }
      case "revise_image":
        return revisionAgent.revise(normalizedInput, activeProject);
      case "create_shopify_product":
        return commerceAgent.confirmAndPrepareProduct({
          input: normalizedInput,
          activeProject,
          selectedOption
        });
      case "answer_question":
      default:
        return chatAgent.replyToQuestion(normalizedInput);
    }
  }
}

export const hermesAgent = new HermesAgent();
