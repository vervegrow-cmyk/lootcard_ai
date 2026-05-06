import { promptAgent } from "./prompt-agent";
import { imageService } from "../services/image.service";
import { memoryService } from "../services/memory.service";
import {
  CardRequirements,
  HermesInput,
  HermesResult,
  ImageOption,
  LanguagePreference,
  memoryToRequirements,
  ProjectContext
} from "../types";

function t(language: LanguagePreference, zh: string, en: string): string {
  return language === "zh" ? zh : en;
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeStyleValue(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("cyber") || lower.includes("赛博")) return "赛博朋克";
  if (lower.includes("black gold") || lower.includes("黑金")) return "黑金";
  if (lower.includes("gothic") || lower.includes("哥特")) return "暗黑哥特";
  if (lower.includes("anime") || lower.includes("动漫")) return "动漫高光";
  if (lower.includes("luxury") || lower.includes("奢华")) return "奢华收藏卡";
  return cleanText(raw);
}

function extractRequirements(content: string, existing: CardRequirements): CardRequirements {
  const next = { ...existing };
  const text = cleanText(content);
  const lower = text.toLowerCase();

  const rarityMatch = text.match(/\b(SSR|SR|UR|R|N)\b/i);
  if (rarityMatch) next.rarity = rarityMatch[1].toUpperCase();

  const quantityMatch = text.match(/(\d+)\s*(张|套|份|pcs|cards?)?/i);
  if (quantityMatch) next.quantity = quantityMatch[1];

  if (lower.includes("实体") || lower.includes("physical")) next.physical_card = "physical card";

  if (lower.includes("海贼王")) next.theme = "海贼王风格";
  if (lower.includes("女王") || lower.includes("queen")) {
    next.theme = next.theme || "女王主题";
    next.character = "女王";
  }
  if (lower.includes("人造人18") || lower.includes("android 18")) {
    next.theme = next.theme || "龙珠风格";
    next.character = "人造人18";
  }
  if (lower.includes("美女") || lower.includes("female")) {
    next.character = next.theme === "海贼王风格" ? "海贼王风格的女性角色" : "女性角色";
  }

  if (
    lower.includes("赛博朋克") ||
    lower.includes("cyberpunk") ||
    lower.includes("黑金") ||
    lower.includes("black gold") ||
    lower.includes("哥特") ||
    lower.includes("gothic") ||
    lower.includes("动漫") ||
    lower.includes("anime") ||
    lower.includes("奢华")
  ) {
    next.style = normalizeStyleValue(text);
  }

  if (lower.includes("特别") || lower.includes("特殊") || lower.includes("special")) {
    next.special_requirements = text;
  }

  return next;
}

function promptingQuestion(requirements: CardRequirements, language: LanguagePreference): string {
  if (!requirements.theme && !requirements.character) {
    return t(language, "你想做什么主题或角色？", "What theme or character do you want?");
  }

  if (!requirements.style) {
    const topic = requirements.character || requirements.theme;
    return t(
      language,
      `好的，我先记下“${topic}”。你想要什么风格？比如：黑金、赛博朋克、暗黑哥特、动漫高光。`,
      `Got it. I noted "${topic}". What style do you want, such as black gold, cyberpunk, dark gothic, or anime highlight?`
    );
  }

  return t(
    language,
    "如果你愿意，我现在就可以直接生成 3 个图像方案。",
    "If you want, I can generate 3 image options right now."
  );
}

function hasEnoughToGenerate(requirements: CardRequirements, message: string): boolean {
  const lower = message.toLowerCase();
  return (
    Boolean(requirements.character || requirements.theme) &&
    (Boolean(requirements.style) ||
      lower.includes("直接生成") ||
      lower.includes("不要废话") ||
      lower.includes("generate") ||
      lower.includes("出图"))
  );
}

function selectReply(option: ImageOption, language: LanguagePreference): string {
  return language === "zh"
    ? `已为你选中【${option.id}】${option.title}\n图片：${option.imageUrl}\n提示词：${option.prompt}\n\n如果要改，直接说修改意见；如果满意，回复“确认”或“可以下单”。`
    : `Selected [${option.id}] ${option.title}\nImage: ${option.imageUrl}\nPrompt: ${option.prompt}\n\nIf you want changes, just tell me what to revise. If it looks good, reply "confirm" or "create link".`;
}

export class ImageAgent {
  async prepareOrGenerate(input: HermesInput, activeProject: ProjectContext | null): Promise<HermesResult> {
    const language = input.memory.language;
    const requirements = extractRequirements(input.message, memoryToRequirements(input.memory));

    if (!hasEnoughToGenerate(requirements, input.message)) {
      return {
        intent: "generate_images",
        action: "reply",
        stage: "prompting",
        language,
        reply: promptingQuestion(requirements, language),
        memory_update: {
          stage: "prompting",
          ...requirements
        },
        prompt: input.memory.currentPrompt,
        image_options: [],
        selected_option: null,
        product: null
      };
    }

    const builtPrompt = await promptAgent.buildPrompt({
      ...requirements,
      style: requirements.style || (language === "zh" ? "高质感收藏卡" : "premium collectible card")
    });

    const project =
      activeProject || (await memoryService.createProject(input.discordUserId, input.message, builtPrompt.image_prompt));

    await memoryService.updateProject(project.projectId, {
      status: "generating",
      currentPrompt: builtPrompt.image_prompt
    });

    const imageOptions = await imageService.generateImages(builtPrompt.image_prompt, 3);
    await memoryService.replaceImageOptions(project.projectId, imageOptions);

    return {
      intent: "generate_images",
      action: "generate_images",
      stage: "selecting",
      language,
      reply: t(language, "我先给你生成 3 个图像方向，你选 A/B/C 或直接说修改意见。", "I generated 3 image directions for you. Reply with A/B/C or tell me what to revise."),
      memory_update: {
        stage: "selecting",
        ...requirements,
        currentPrompt: builtPrompt.image_prompt
      },
      prompt: builtPrompt.image_prompt,
      image_options: imageOptions,
      selected_option: null,
      product: null,
      project
    };
  }

  async selectImage(input: HermesInput, activeProject: ProjectContext | null, optionId: string): Promise<HermesResult> {
    const language = input.memory.language;

    if (!activeProject) {
      return {
        intent: "select_image",
        action: "reply",
        stage: input.memory.stage,
        language,
        reply: t(language, "你先让我生成 A/B/C 图像方案，我再帮你选。", "Let me generate A/B/C image options first, then you can choose one."),
        memory_update: {},
        prompt: input.memory.currentPrompt,
        image_options: [],
        selected_option: null,
        product: null
      };
    }

    const option = await memoryService.selectImageOption(activeProject.projectId, optionId);
    if (!option) {
      return {
        intent: "select_image",
        action: "reply",
        stage: "selecting",
        language,
        reply: t(language, "我没找到这个选项，请回复 A、B 或 C。", "I could not find that option. Please reply with A, B, or C."),
        memory_update: {},
        prompt: input.memory.currentPrompt,
        image_options: [],
        selected_option: null,
        product: null
      };
    }

    await memoryService.updateProject(activeProject.projectId, {
      status: "confirmed",
      currentPrompt: option.prompt,
      selectedOptionId: option.id,
      finalDesignSummary: option.title
    });

    return {
      intent: "select_image",
      action: "select_image",
      stage: "confirmed",
      language,
      reply: selectReply(option, language),
      memory_update: {
        stage: "confirmed",
        currentPrompt: option.prompt,
        selectedOption: option.id,
        selectedOptionTitle: option.title,
        selectedImageUrl: option.imageUrl,
        selectedDesignSummary: option.title
      },
      prompt: option.prompt,
      image_options: [],
      selected_option: option,
      product: null,
      project: activeProject
    };
  }
}

export const imageAgent = new ImageAgent();
