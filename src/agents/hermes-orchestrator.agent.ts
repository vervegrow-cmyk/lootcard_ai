import { OrchestratorInput, OrchestratorPlan, OrchestratorResult } from "../types/agent.types";
import { ProjectStage, SkillExecutionResult } from "../types/skill.types";

function detectChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectLanguage(message: string, fallback: "zh" | "en"): "zh" | "en" {
  return detectChinese(message) ? "zh" : fallback;
}

function detectLanguagePreference(message: string): "zh" | "en" | null {
  const lower = message.toLowerCase();
  if (
    /以后用中文|能反馈中文么|请用中文回复|中文回复/.test(message)
  ) {
    return "zh";
  }
  if (includesAny(lower, ["use english", "reply in english", "please use english"]) || /请用英文|英文回复/.test(message)) {
    return "en";
  }
  return null;
}

function detectQuestion(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return (
    message.trim().endsWith("?") ||
    message.trim().endsWith("？") ||
    includesAny(lower, ["what", "how", "can you", "why", "price", "delivery"]) ||
    /你能|是什么|怎么|为什么|价格|多久|发货|售后/.test(message)
  );
}

function detectShopifyLinkRequest(message: string): boolean {
  const lower = message.toLowerCase();
  const hasShopify = lower.includes("shopify");
  const hasProductLinkWord =
    /\u94fe\u63a5|\u5546\u54c1|\u4ea7\u54c1|\u521b\u5efa\u5546\u54c1|\u4e0b\u5355|\u4ed8\u6b3e|\u8d2d\u4e70/.test(message) ||
    includesAny(lower, ["link", "product", "create product", "checkout", "payment"]);
  return (
    /shopify[\s-]*link/.test(lower) ||
    /checkout\s*link/.test(lower) ||
    /payment\s*link/.test(lower) ||
    /product\s*link/.test(lower) ||
    /create\s*product/.test(lower) ||
    /\bproduct\b/.test(lower) ||
    (hasShopify && hasProductLinkWord) ||
    /\u6211\u8981\u4e0b\u5355/.test(message) ||
    /shopify[\s-]*\u94fe\u63a5/.test(lower) ||
    /\u4e0b\u5355\u94fe\u63a5/.test(message) ||
    /\u4ed8\u6b3e\u94fe\u63a5/.test(message) ||
    /\u652f\u4ed8\u94fe\u63a5/.test(message) ||
    /\u8d2d\u4e70\u94fe\u63a5/.test(message) ||
    /\u751f\u6210\u94fe\u63a5/.test(message) ||
    /\u521b\u5efa\u5546\u54c1/.test(message)
  );
}

function extractProductTitle(message: string): string {
  const clean = (value: string): string =>
    value
      .replace(/的?\s*shopify.*$/i, "")
      .replace(/的?\s*(商品|产品|链接).*$/i, "")
      .trim();

  const trimmed = message.trim();
  const cnMatch =
    trimmed.match(/商品名(?:为|是)?\s*["“]?(.+?)["”]?(?=(?:的)?\s*(?:shopify|商品|产品|product|链接)|$)/i) ||
    trimmed.match(/创建商品(?:名)?(?:为|是)?\s*["“]?(.+?)["”]?(?=(?:的)?\s*(?:shopify|商品|产品|product|链接)|$)/i);
  if (cnMatch?.[1]) {
    return clean(cnMatch[1]);
  }

  const enMatch =
    trimmed.match(/product\s+name\s*(?:is|=|:)?\s*["']?([^"']+?)["']?(?:\s+shopify|\s+product|\s+link)?$/i) ||
    trimmed.match(/create\s+(?:a\s+)?product\s+(?:named|called)\s*["']?([^"']+?)["']?$/i);
  if (enMatch?.[1]) {
    return clean(enMatch[1]);
  }

  return "";
}

function detectSelection(message: string): string | null {
  const trimmed = message.trim().toUpperCase();
  if (["A", "B", "C"].includes(trimmed)) {
    return trimmed;
  }
  return trimmed.match(/\b([ABC])\b/)?.[1] || null;
}

function detectRevision(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    includesAny(lower, ["too bright", "too dark", "add more gold", "change background", "revise"]) ||
    /太亮|太暗|加金色|换背景|换风格|改图|更酷|更性感|更像收藏卡/.test(message)
  );
}

function detectDirectGenerate(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    includesAny(lower, ["just generate", "generate now", "don't ask", "no questions"]) ||
    /直接出图|直接生成|不要问|不要废话|帮我做一个|生成一个|出图/.test(message)
  );
}

function detectGenerate(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    includesAny(lower, ["generate", "image", "art", "card"]) ||
    /生成|卡牌|图片|图像|人造人18|人造人18号|人造人十八号|海贼王|女王|赛博朋克|黑金/.test(message)
  );
}

function detectPromptPolish(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    includesAny(lower, ["polish prompt", "optimize prompt", "refine prompt"]) ||
    /润色提示词|优化prompt|优化这个prompt|帮我润色提示词|把这个提示词变专业/.test(message)
  );
}

function detectAfterSales(message: string): boolean {
  const lower = message.toLowerCase();
  return includesAny(lower, ["after sales", "refund", "order status", "shipping"]) || /售后|退款|订单|发货|进度/.test(message);
}

function detectConfirm(message: string): boolean {
  const lower = message.toLowerCase();
  return includesAny(lower, ["confirm", "create link"]) || /确认|就这个|可以下单/.test(message);
}

function detectCannotGenerate(message: string): boolean {
  const lower = message.toLowerCase();
  return includesAny(lower, ["can you generate images", "can't you generate"]) || /你是不能出图么|你不能出图吗/.test(message);
}

function detectRefuseMoreQuestions(message: string): boolean {
  return /没有其他要求|没有要求|随便|直接要图|就要|不要反复|不要问|直接生成|角色卡牌|图片/.test(message);
}

function hasCharacterSignal(message: string, memoryCharacter: string): boolean {
  const lower = message.toLowerCase();
  return Boolean(
    memoryCharacter ||
      includesAny(lower, ["android 18"]) ||
      /人造人18|人造人18号|人造人十八号|角色卡牌|女王|海贼王/.test(message)
  );
}

function basePlan(input: {
  intent: OrchestratorPlan["intent"];
  targetAgent: OrchestratorPlan["targetAgent"];
  targetSkill: OrchestratorPlan["targetSkill"];
  action: string;
  language: "zh" | "en";
  stage: ProjectStage;
  memoryUpdate?: OrchestratorPlan["memoryUpdate"];
  replyInstruction: string;
  reason: string;
  data?: Record<string, unknown>;
}): OrchestratorPlan {
  return {
    intent: input.intent,
    targetAgent: input.targetAgent,
    targetSkill: input.targetSkill,
    action: input.action,
    language: input.language,
    stage: input.stage,
    actions: ["detect_intent", "route_to_agent"],
    memoryUpdate: input.memoryUpdate || { language: input.language },
    replyInstruction: input.replyInstruction,
    data: {
      ...(input.data || {}),
      reason: input.reason
    }
  };
}

export class HermesOrchestratorAgent {
  plan(input: OrchestratorInput): OrchestratorPlan {
    const language = detectLanguage(input.message, input.memory.language);
    const selectedOption = detectSelection(input.message);
    const preferredLanguage = detectLanguagePreference(input.message);
    const wantsShopifyLink = detectShopifyLinkRequest(input.message);
    const requestedProductTitle = extractProductTitle(input.message);
    const wantsDirectGenerate = detectDirectGenerate(input.message) || detectCannotGenerate(input.message);
    const userRejectedMoreQuestions =
      detectRefuseMoreQuestions(input.message) && hasCharacterSignal(input.message, input.memory.character);

    if (preferredLanguage) {
      return basePlan({
        intent: "language_preference",
        targetAgent: "customer-service",
        targetSkill: "answer-faq",
        action: "reply",
        language: preferredLanguage,
        stage: input.memory.stage === "idle" ? "customer_service" : input.memory.stage,
        memoryUpdate: { language: preferredLanguage },
        replyInstruction:
          preferredLanguage === "zh"
            ? "用户要求之后用中文沟通。请自然确认你之后会用中文回复，并简短说明可以继续告诉你需求。"
            : "The user asked to switch to English. Confirm naturally that you will continue in English and invite the next request.",
        reason: "language preference request detected"
      });
    }

    if (wantsShopifyLink || (detectConfirm(input.message) && input.memory.currentPrompt)) {
      return basePlan({
        intent: "create_shopify_product_link",
        targetAgent: "shopify",
        targetSkill: "create-shopify-product",
        action: "create_shopify_product",
        language,
        stage: "payment",
        memoryUpdate: { language },
        replyInstruction:
          language === "zh"
            ? "用户想要 Shopify 链接。请基于工具结果自然说明是否可以生成链接；如果还缺最终确认设计，要清楚说明原因，并引导用户先生成或确认一张卡牌方案。"
            : "The user wants a Shopify link. Use the tool result to explain naturally whether a link can be created; if a final confirmed design is missing, explain that clearly and guide the user to generate or confirm a card design first.",
        reason: wantsShopifyLink ? "shopify link or create product keywords detected in user message" : "final confirmation with current prompt detected",
        data: {
          requestedProductTitle
        }
      });
    }

    if (selectedOption) {
      return basePlan({
        intent: "select_image",
        targetAgent: "design",
        targetSkill: "select-design",
        action: "select_image",
        language,
        stage: "selecting",
        memoryUpdate: { language },
        replyInstruction:
          language === "zh"
            ? "用户选择了一个方案。请自然确认已选中的 A/B/C 方案，总结这个方案，并告诉用户可以继续修改或确认下单。"
            : "The user selected an option. Confirm naturally which A/B/C option was chosen, summarize it, and tell the user they can keep revising it or confirm checkout.",
        reason: `user selected option ${selectedOption}`,
        data: {
          selectedOption
        }
      });
    }

    if (detectRevision(input.message) && (input.memory.selectedOption || input.memory.currentPrompt)) {
      return basePlan({
        intent: "revise_image",
        targetAgent: "design",
        targetSkill: "revise-image",
        action: "revise_image",
        language,
        stage: "revising",
        memoryUpdate: { language },
        replyInstruction:
          language === "zh"
            ? "用户在修改方案。请根据工具结果自然说明这次修改了哪些点、当前方案朝什么方向调整，并邀请用户继续给反馈或确认。"
            : "The user is revising the design. Based on the tool result, explain naturally what changed, how the design direction shifted, and invite more feedback or confirmation.",
        reason: "revision keywords detected and an active design exists"
      });
    }

    if (wantsDirectGenerate || userRejectedMoreQuestions) {
      console.log("[Direct Generate]", true);
      return basePlan({
        intent: "direct_generate",
        targetAgent: "design",
        targetSkill: "generate-images",
        action: "generate_images",
        language,
        stage: "generating",
        memoryUpdate: { language },
        replyInstruction:
          language === "zh"
            ? "用户明确要求直接出图。请积极自然地说明你已经直接给出 3 个方案，不要再追问风格，并引导用户回复 A/B/C 或继续提修改意见。"
            : "The user explicitly wants direct generation. Respond proactively that you generated 3 options without more follow-up questions, and guide them to reply with A/B/C or revision feedback.",
        reason: wantsDirectGenerate ? "direct generate keywords detected" : "user rejected more questions and character signal exists",
        data: {
          directGenerate: true,
          explainImageCapability: detectCannotGenerate(input.message),
          userRejectedMoreQuestions
        }
      });
    }

    if (detectGenerate(input.message)) {
      return basePlan({
        intent: "generate_images",
        targetAgent: "design",
        targetSkill: "generate-images",
        action: "generate_images",
        language,
        stage: "generating",
        memoryUpdate: { language },
        replyInstruction:
          language === "zh"
            ? "用户想生成卡牌方案。请根据工具结果自然介绍 3 个方案，并引导用户选择 A/B/C 或继续修改。"
            : "The user wants card design options. Introduce the 3 generated options naturally and invite the user to choose A/B/C or request revisions.",
        reason: "design or image generation keywords detected"
      });
    }

    if (detectPromptPolish(input.message)) {
      return basePlan({
        intent: "prompt_polish",
        targetAgent: "prompt",
        targetSkill: "polish-prompt",
        action: "polish_prompt",
        language,
        stage: input.memory.stage,
        memoryUpdate: { language },
        replyInstruction:
          language === "zh"
            ? "用户想润色提示词。请自然输出原始描述、优化后的提示词和简短说明，不要把对话带去 Shopify 或其他流程。"
            : "The user wants prompt polishing. Present the original idea, the improved prompt, and a short explanation naturally, without switching to Shopify or other flows.",
        reason: "prompt polish request detected"
      });
    }

    if (detectAfterSales(input.message)) {
      return basePlan({
        intent: "after_sales",
        targetAgent: "customer-service",
        targetSkill: "after-sales",
        action: "reply",
        language,
        stage: "customer_service",
        memoryUpdate: { language },
        replyInstruction:
          language === "zh"
            ? "这是售后相关问题。请基于工具结果用自然客服口吻直接回答。"
            : "This is an after-sales request. Answer it directly in a natural support tone based on the tool result.",
        reason: "after-sales keywords detected"
      });
    }

    if (/价格/.test(input.message) || input.message.toLowerCase().includes("price")) {
      return basePlan({
        intent: "customer_service",
        targetAgent: "customer-service",
        targetSkill: "explain-pricing",
        action: "reply",
        language,
        stage: "customer_service",
        memoryUpdate: { language },
        replyInstruction:
          language === "zh"
            ? "用户在问价格。请自然解释价格和数量、复杂度、是否实体卡有关，不要虚构固定报价。"
            : "The user is asking about pricing. Explain naturally that pricing depends on quantity, complexity, and whether it is a physical card, without inventing a fixed quote.",
        reason: "pricing question detected"
      });
    }

    if (/多久|30天/.test(input.message) || input.message.toLowerCase().includes("delivery")) {
      return basePlan({
        intent: "customer_service",
        targetAgent: "customer-service",
        targetSkill: "explain-delivery",
        action: "reply",
        language,
        stage: "customer_service",
        memoryUpdate: { language },
        replyInstruction:
          language === "zh"
            ? "用户在问交付周期。请自然解释这是定制商品，预计大约 30 天到货，不要做额外承诺。"
            : "The user is asking about delivery. Explain naturally that this is a custom product and the estimated production and delivery time is around 30 days, without making extra promises.",
        reason: "delivery question detected"
      });
    }

    if (detectQuestion(input.message)) {
      return basePlan({
        intent: "customer_service",
        targetAgent: "customer-service",
        targetSkill: "answer-faq",
        action: "reply",
        language,
        stage: "customer_service",
        memoryUpdate: { language },
        replyInstruction:
          language === "zh"
            ? "用户在普通提问。请用自然客服口吻直接回答，并简短说明你还能帮他做什么。"
            : "The user is asking a general question. Answer directly in a natural support tone and briefly mention what else you can help with.",
        reason: "general question detected"
      });
    }

    return basePlan({
      intent: "general_chat",
      targetAgent: "customer-service",
      targetSkill: "answer-faq",
      action: "reply",
      language,
      stage: input.memory.stage === "idle" ? "customer_service" : input.memory.stage,
      memoryUpdate: { language },
      replyInstruction:
        language === "zh"
          ? "这是普通聊天。请自然问候并说明你可以帮助答疑、润色提示词、出图、改图和生成 Shopify 链接。"
          : "This is general chat. Greet the user naturally and explain that you can help with questions, prompt polishing, image generation, image revision, and Shopify links.",
      reason: "fallback general chat route"
    });
  }

  mergeResult(plan: OrchestratorPlan, skillResult: SkillExecutionResult): OrchestratorResult {
    const nextStage = (skillResult.stage || plan.stage) as ProjectStage;
    return {
      ...plan,
      stage: nextStage,
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
      skillResult,
      prompt: skillResult.prompt,
      imageOptions: skillResult.imageOptions || [],
      selectedOption: skillResult.selectedOption || null,
      product: skillResult.product || null
    };
  }
}

export const hermesOrchestratorAgent = new HermesOrchestratorAgent();
