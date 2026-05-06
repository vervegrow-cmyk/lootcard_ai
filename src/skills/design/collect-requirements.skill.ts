import {
  DesignRequirements,
  SkillExecutionContext,
  SkillExecutionResult
} from "../../types/skill.types";

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

function extractRequirements(message: string, existing: DesignRequirements): DesignRequirements {
  const text = cleanText(message);
  const lower = text.toLowerCase();
  const next = { ...existing };

  const rarityMatch = text.match(/\b(SSR|SR|UR|R|N)\b/i);
  if (rarityMatch) next.rarity = rarityMatch[1].toUpperCase();

  const quantityMatch = text.match(/(\d+)\s*(张|套|份|pcs|cards?)?/i);
  if (quantityMatch) next.quantity = quantityMatch[1];

  if (lower.includes("实体") || lower.includes("physical")) next.physical_card = "physical card";
  if (lower.includes("海贼王")) next.theme = "海贼王风格";
  if (
    lower.includes("人造人18") ||
    lower.includes("人造人18号") ||
    lower.includes("人造人十八号") ||
    lower.includes("android 18")
  ) {
    next.theme = next.theme || "动漫角色卡牌";
    next.character = "人造人18号";
  }
  if (lower.includes("女王") || lower.includes("queen")) {
    next.theme = next.theme || "女王主题";
    next.character = "女王";
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

function userRejectedMoreQuestions(message: string): boolean {
  const lower = message.toLowerCase();
  return [
    "没有其他要求",
    "没有要求",
    "随便",
    "直接要图",
    "就要",
    "不要反复",
    "不要问",
    "直接生成",
    "角色卡牌",
    "图片"
  ].some((keyword) => lower.includes(keyword));
}

export class CollectRequirementsSkill {
  execute(context: SkillExecutionContext): SkillExecutionResult {
    const current = {
      theme: context.memory.theme,
      character: context.memory.character,
      style: context.memory.style,
      rarity: context.memory.rarity,
      quantity: context.memory.quantity,
      physical_card: context.memory.physical_card,
      special_requirements: context.memory.special_requirements
    };
    const requirements = extractRequirements(context.message, current);
    const shouldStopAsking = userRejectedMoreQuestions(context.message) && Boolean(requirements.character || context.memory.character);

    let reply =
      context.language === "zh"
        ? "你想做什么主题或角色？"
        : "What theme or character do you want?";

    if (shouldStopAsking) {
      reply =
        context.language === "zh"
          ? "好的，我直接继续往下处理，不再追问风格。"
          : "Got it. I will continue directly and stop asking about style.";
    } else if ((requirements.character || requirements.theme) && !requirements.style) {
      const topic = requirements.character || requirements.theme;
      reply =
        context.language === "zh"
          ? `好的，我先记下“${topic}”。你想要什么风格？比如：黑金、赛博朋克、暗黑哥特、动漫高光。`
          : `Got it. I noted "${topic}". What style do you want, such as black gold, cyberpunk, dark gothic, or anime highlight?`;
    } else if (requirements.style && !(requirements.character || requirements.theme)) {
      reply =
        context.language === "zh"
          ? "风格我记下了。主角或主题你想做什么？"
          : "I noted the style. What character or theme do you want?";
    } else if (requirements.style && (requirements.character || requirements.theme)) {
      reply =
        context.language === "zh"
          ? "核心方向已经够了，我现在可以直接给你出 3 个图像方案。"
          : "I have enough core direction now, and I can generate 3 image options next.";
    }

    return {
      reply,
      stage: "collecting",
      actions: ["collect-requirements"],
      memoryUpdate: {
        stage: "collecting",
        ...requirements
      },
      data: {
        requirements,
        shouldStopAsking
      }
    };
  }
}

export const collectRequirementsSkill = new CollectRequirementsSkill();
