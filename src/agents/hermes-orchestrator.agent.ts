import { OrchestratorInput, OrchestratorPlan, OrchestratorResult } from "../types/agent.types";
import { LanguagePreference, ProjectStage, SkillExecutionResult } from "../types/skill.types";

function detectChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function detectLanguage(message: string, fallback: LanguagePreference): LanguagePreference {
  return detectChinese(message) ? "zh" : fallback;
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectLanguagePreference(message: string): LanguagePreference | null {
  const lower = message.toLowerCase();
  if (includesAny(lower, ["以后用中文", "能反馈中文么", "请用中文回复", "中文回复"])) {
    return "zh";
  }
  if (includesAny(lower, ["use english", "reply in english", "please use english", "请用英文", "英文回复"])) {
    return "en";
  }
  return null;
}

function detectQuestion(message: string): boolean {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();
  return (
    trimmed.endsWith("?") ||
    trimmed.endsWith("？") ||
    includesAny(lower, ["what ", "how ", "can you", "你能", "是什么", "多久", "价格", "退款", "发货", "售后"])
  );
}

function detectAfterSales(message: string): boolean {
  const lower = message.toLowerCase();
  return includesAny(lower, ["售后", "退款", "订单", "发货", "进度", "after sales", "refund", "order status", "shipping"]);
}

function detectPromptPolish(message: string): boolean {
  const lower = message.toLowerCase();
  return includesAny(lower, [
    "润色提示词",
    "优化prompt",
    "优化这个prompt",
    "帮我润色提示词",
    "把这个提示词变专业",
    "polish prompt",
    "optimize prompt",
    "refine prompt"
  ]);
}

function detectDirectGenerate(message: string): boolean {
  const lower = message.toLowerCase();
  return includesAny(lower, [
    "直接出图",
    "直接生成",
    "不要问",
    "不要废话",
    "帮我做一个",
    "生成一个",
    "出图",
    "just generate",
    "generate now",
    "don't ask",
    "no questions"
  ]);
}

function detectRefuseMoreQuestions(message: string): boolean {
  const lower = message.toLowerCase();
  return includesAny(lower, [
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
  ]);
}

function detectGenerate(message: string): boolean {
  const lower = message.toLowerCase();
  return includesAny(lower, [
    "生成",
    "卡牌",
    "图片",
    "图像",
    "人造人18",
    "人造人18号",
    "人造人十八号",
    "海贼王",
    "女王",
    "赛博朋克",
    "黑金",
    "generate",
    "image",
    "art"
  ]);
}

function detectRevision(message: string): boolean {
  const lower = message.toLowerCase();
  return includesAny(lower, [
    "太亮",
    "太暗",
    "更酷",
    "加金色",
    "换背景",
    "换风格",
    "改图",
    "too bright",
    "too dark",
    "make it cooler",
    "add more gold",
    "change background",
    "revise"
  ]);
}

function detectSelection(message: string): string | null {
  const trimmed = message.trim().toUpperCase();
  if (["A", "B", "C"].includes(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/\b([ABC])\b/);
  return match?.[1] || null;
}

function detectConfirm(message: string): boolean {
  const lower = message.toLowerCase();
  return includesAny(lower, ["确认", "就这个", "可以下单", "confirm", "create link"]);
}

function detectCannotGenerate(message: string): boolean {
  const lower = message.toLowerCase();
  return includesAny(lower, ["你是不能出图么", "你不能出图吗", "can you generate images", "can't you generate"]);
}

function hasCharacterSignal(message: string, memoryCharacter: string): boolean {
  const lower = message.toLowerCase();
  return Boolean(
    memoryCharacter ||
      lower.includes("人造人18") ||
      lower.includes("人造人18号") ||
      lower.includes("人造人十八号") ||
      lower.includes("android 18") ||
      lower.includes("角色卡牌")
  );
}

export class HermesOrchestratorAgent {
  plan(input: OrchestratorInput): OrchestratorPlan {
    const language = detectLanguage(input.message, input.memory.language);
    const lower = input.message.toLowerCase();
    const selectedOption = detectSelection(input.message);
    const preferredLanguage = detectLanguagePreference(input.message);
    const isDirectGenerate = detectDirectGenerate(input.message) || detectCannotGenerate(input.message);
    const userRejectedMoreQuestions =
      detectRefuseMoreQuestions(input.message) && hasCharacterSignal(input.message, input.memory.character);

    if (preferredLanguage) {
      return {
        intent: "language_preference",
        targetAgent: "customer-service",
        targetSkill: "answer-faq",
        language: preferredLanguage,
        stage: input.memory.stage === "idle" ? "customer_service" : input.memory.stage,
        reply: "",
        actions: ["detect_language", "route_to_agent"],
        memoryUpdate: {
          language: preferredLanguage
        },
        data: {}
      };
    }

    if (detectConfirm(input.message) && input.memory.currentPrompt) {
      return {
        intent: "create_shopify_link",
        targetAgent: "shopify",
        targetSkill: "create-checkout-link",
        language,
        stage: "payment",
        reply: "",
        actions: ["detect_intent", "route_to_agent"],
        memoryUpdate: {
          language
        },
        data: {}
      };
    }

    if (selectedOption) {
      return {
        intent: "select_image",
        targetAgent: "design",
        targetSkill: "select-design",
        language,
        stage: "selecting",
        reply: "",
        actions: ["detect_intent", "route_to_agent"],
        memoryUpdate: {
          language
        },
        data: {
          selectedOption
        }
      };
    }

    if (detectRevision(input.message) && (input.memory.selectedOption || input.memory.currentPrompt)) {
      return {
        intent: "revise_image",
        targetAgent: "design",
        targetSkill: "revise-image",
        language,
        stage: "revising",
        reply: "",
        actions: ["detect_intent", "route_to_agent"],
        memoryUpdate: {
          language
        },
        data: {}
      };
    }

    if (isDirectGenerate || userRejectedMoreQuestions) {
      console.log("[Direct Generate]", true);
      return {
        intent: "direct_generate",
        targetAgent: "design",
        targetSkill: "generate-images",
        language,
        stage: "generating",
        reply: "",
        actions: ["detect_intent", "route_to_agent"],
        memoryUpdate: {
          language
        },
        data: {
          directGenerate: true,
          explainImageCapability: detectCannotGenerate(input.message),
          userRejectedMoreQuestions
        }
      };
    }

    if (detectGenerate(input.message)) {
      return {
        intent: "generate_images",
        targetAgent: "design",
        targetSkill: "generate-images",
        language,
        stage: "generating",
        reply: "",
        actions: ["detect_intent", "route_to_agent"],
        memoryUpdate: {
          language
        },
        data: {}
      };
    }

    if (detectPromptPolish(input.message)) {
      return {
        intent: "prompt_polish",
        targetAgent: "prompt",
        targetSkill: "polish-prompt",
        language,
        stage: input.memory.stage,
        reply: "",
        actions: ["detect_intent", "route_to_agent"],
        memoryUpdate: {
          language
        },
        data: {}
      };
    }

    if (detectAfterSales(input.message)) {
      return {
        intent: "after_sales",
        targetAgent: "customer-service",
        targetSkill: "after-sales",
        language,
        stage: "customer_service",
        reply: "",
        actions: ["detect_intent", "route_to_agent"],
        memoryUpdate: {
          language
        },
        data: {}
      };
    }

    if (lower.includes("价格") || lower.includes("price")) {
      return {
        intent: "customer_service",
        targetAgent: "customer-service",
        targetSkill: "explain-pricing",
        language,
        stage: "customer_service",
        reply: "",
        actions: ["detect_intent", "route_to_agent"],
        memoryUpdate: {
          language
        },
        data: {}
      };
    }

    if (lower.includes("多久") || lower.includes("delivery") || lower.includes("30天")) {
      return {
        intent: "customer_service",
        targetAgent: "customer-service",
        targetSkill: "explain-delivery",
        language,
        stage: "customer_service",
        reply: "",
        actions: ["detect_intent", "route_to_agent"],
        memoryUpdate: {
          language
        },
        data: {}
      };
    }

    if (detectQuestion(input.message)) {
      return {
        intent: "customer_service",
        targetAgent: "customer-service",
        targetSkill: "answer-faq",
        language,
        stage: "customer_service",
        reply: "",
        actions: ["detect_intent", "route_to_agent"],
        memoryUpdate: {
          language
        },
        data: {}
      };
    }

    return {
      intent: "general_chat",
      targetAgent: "customer-service",
      targetSkill: "answer-faq",
      language,
      stage: input.memory.stage === "idle" ? "customer_service" : input.memory.stage,
      reply: "",
      actions: ["detect_intent", "route_to_agent"],
      memoryUpdate: {
        language
      },
      data: {}
    };
  }

  mergeResult(plan: OrchestratorPlan, skillResult: SkillExecutionResult): OrchestratorResult {
    const nextStage = (skillResult.stage || plan.stage) as ProjectStage;
    return {
      ...plan,
      stage: nextStage,
      reply: skillResult.reply || plan.reply,
      actions: [...plan.actions, ...(skillResult.actions || []), "merge_result"],
      memoryUpdate: {
        ...plan.memoryUpdate,
        ...(skillResult.memoryUpdate || {}),
        stage: nextStage,
        language: plan.language
      },
      data: {
        ...plan.data,
        ...(skillResult.data || {})
      },
      prompt: skillResult.prompt,
      imageOptions: skillResult.imageOptions || [],
      selectedOption: skillResult.selectedOption || null,
      product: skillResult.product || null
    };
  }
}

export const hermesOrchestratorAgent = new HermesOrchestratorAgent();
