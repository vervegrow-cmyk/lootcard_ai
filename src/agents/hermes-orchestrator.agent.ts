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
    /\u4ee5\u540e\u7528\u4e2d\u6587|\u80fd\u53cd\u9988\u4e2d\u6587\u4e48|\u8bf7\u7528\u4e2d\u6587\u56de\u590d|\u4e2d\u6587\u56de\u590d/.test(message)
  ) {
    return "zh";
  }
  if (
    includesAny(lower, ["use english", "reply in english", "please use english"]) ||
    /\u8bf7\u7528\u82f1\u6587|\u82f1\u6587\u56de\u590d/.test(message)
  ) {
    return "en";
  }
  return null;
}

function detectQuestion(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return (
    message.trim().endsWith("?") ||
    message.trim().endsWith("\uFF1F") ||
    includesAny(lower, ["what", "how", "can you", "why", "price", "delivery"]) ||
    /\u4f60\u80fd|\u662f\u4ec0\u4e48|\u600e\u4e48|\u4e3a\u4ec0\u4e48|\u4ef7\u683c|\u591a\u4e45|\u53d1\u8d27|\u552e\u540e/.test(message)
  );
}

function detectShopifyLinkRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /shopify[\s-]*link/.test(lower) ||
    /checkout\s*link/.test(lower) ||
    /payment\s*link/.test(lower) ||
    /product\s*link/.test(lower) ||
    /create\s*product/.test(lower) ||
    /create\s*shopify\s*product/.test(lower) ||
    /\u0073hopify\u94fe\u63a5/i.test(message) ||
    /\u4ea7\u54c1\u94fe\u63a5/.test(message) ||
    /\u5546\u54c1\u94fe\u63a5/.test(message) ||
    /\u4e0b\u5355\u94fe\u63a5/.test(message) ||
    /\u8d2d\u4e70\u94fe\u63a5/.test(message) ||
    /\u652f\u4ed8\u94fe\u63a5/.test(message) ||
    /\u4ed8\u6b3e\u94fe\u63a5/.test(message) ||
    /\u521b\u5efa\u5546\u54c1/.test(message) ||
    /\u521b\u5efa\u4ea7\u54c1/.test(message) ||
    /\u6211\u8981\u4e0b\u5355/.test(message) ||
    (/\u521b\u5efa/.test(message) && /\u94fe\u63a5/.test(message))
  );
}

function extractProductTitle(message: string): string {
  const clean = (value: string): string =>
    value
      .replace(/\s*\u7684?\s*shopify.*$/i, "")
      .replace(/\s*\u7684?\s*(\u5546\u54c1|\u4ea7\u54c1|\u94fe\u63a5).*$/i, "")
      .replace(/\s*(\u4ef7\u683c|price)\s*[:\uFF1A=].*$/i, "")
      .trim();

  const trimmed = message.trim();
  const cnMatch =
    trimmed.match(/\u5546\u54c1\u540d(?:\u4e3a|\u662f)?\s*["“]?(.+?)["”]?(?=(?:\u7684?\s*(?:shopify|\u5546\u54c1|\u4ea7\u54c1|\u94fe\u63a5)|$))/i) ||
    trimmed.match(/\u4ea7\u54c1\u540d(?:\u4e3a|\u662f)?\s*["“]?(.+?)["”]?(?=(?:\u7684?\s*(?:shopify|\u5546\u54c1|\u4ea7\u54c1|\u94fe\u63a5)|$))/i) ||
    trimmed.match(/\u5e2e\u6211\u521b\u5efa(?:\u4e00\u4e2a)?(.+?)(?:\u94fe\u63a5|\u5546\u54c1|\u4ea7\u54c1)(?:\uFF0C|,|\u3002|$)/i) ||
    trimmed.match(/\u7ed9\u6211(?:\u4e00\u4e2a)?(.+?)(?:shopify|\u5546\u54c1|\u4ea7\u54c1)\u94fe\u63a5/i) ||
    trimmed.match(/\u521b\u5efa(?:\u4e00\u4e2a)?(.+?)(?:\u94fe\u63a5|\u5546\u54c1|\u4ea7\u54c1)(?:\uFF0C|,|\u3002|$)/i);

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

function extractProductPrice(message: string): number | null {
  const match =
    message.match(/\u4ef7\u683c\s*[:\uFF1A]?\s*(\d+(?:\.\d{1,2})?)/i) ||
    message.match(/price\s*[:=]?\s*(\d+(?:\.\d{1,2})?)/i);

  if (!match?.[1]) {
    return null;
  }

  const price = Number(match[1]);
  return Number.isFinite(price) && price > 0 ? price : null;
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
    /\u592a\u4eae|\u592a\u6697|\u52a0\u91d1\u8272|\u6362\u80cc\u666f|\u6362\u98ce\u683c|\u6539\u56fe|\u66f4\u9177|\u66f4\u6027\u611f|\u66f4\u50cf\u6536\u85cf\u5361/.test(message)
  );
}

function detectDirectGenerate(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    includesAny(lower, [
      "just generate",
      "generate now",
      "don't ask",
      "no questions",
      "anime",
      "custom card",
      "trading card",
      "generate image",
      "anime girl card"
    ]) ||
    /\u76f4\u63a5\u51fa\u56fe|\u76f4\u63a5\u751f\u6210|\u4e0d\u8981\u95ee|\u4e0d\u8981\u5e9f\u8bdd|\u5e2e\u6211\u505a\u4e00\u4e2a|\u751f\u6210\u4e00\u4e2a|\u51fa\u56fe|\u505a\u4e2a\u56fe|\u505a\u56fe|\u753b\u56fe|\u751f\u6210\u56fe|\u751f\u6210\u56fe\u7247|\u5361\u724c\u8bbe\u8ba1|\u751f\u6210\u5934\u50cf|\u4eba\u9020\u4eba18\u53f7|\u4eba\u9020\u4eba\u5341\u516b\u53f7|\u4eba\u9020\u4eba\u5341\u516b|\u5c01\u9762\u56fe|\u751f\u6210\u65b9\u6848/.test(message)
  );
}

function detectGenerate(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    includesAny(lower, [
      "generate",
      "image",
      "art",
      "card",
      "anime",
      "custom card",
      "trading card",
      "generate image",
      "anime girl card"
    ]) ||
    /\u751f\u6210|\u5361\u724c|\u56fe\u7247|\u56fe\u50cf|\u4eba\u9020\u4eba18|\u4eba\u9020\u4eba18\u53f7|\u4eba\u9020\u4eba\u5341\u516b\u53f7|\u4eba\u9020\u4eba\u5341\u516b|\u6d77\u8d3c\u738b|\u5973\u738b|\u8d5b\u535a\u670b\u514b|\u9ed1\u91d1|\u505a\u4e2a\u56fe|\u505a\u56fe|\u753b\u56fe|\u751f\u6210\u56fe|\u751f\u6210\u56fe\u7247|\u5361\u724c\u8bbe\u8ba1|\u751f\u6210\u5934\u50cf|\u5c01\u9762\u56fe|\u751f\u6210\u65b9\u6848/.test(message)
  );
}

function detectPromptPolish(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    includesAny(lower, ["polish prompt", "optimize prompt", "refine prompt"]) ||
    /\u6da6\u8272\u63d0\u793a\u8bcd|\u4f18\u5316prompt|\u4f18\u5316\u8fd9\u4e2aprompt|\u5e2e\u6211\u6da6\u8272\u63d0\u793a\u8bcd|\u628a\u8fd9\u4e2a\u63d0\u793a\u8bcd\u53d8\u4e13\u4e1a/.test(message)
  );
}

function detectAfterSales(message: string): boolean {
  const lower = message.toLowerCase();
  return includesAny(lower, ["after sales", "refund", "order status", "shipping"]) || /\u552e\u540e|\u9000\u6b3e|\u8ba2\u5355|\u53d1\u8d27|\u8fdb\u5ea6/.test(message);
}

function detectConfirm(message: string): boolean {
  const lower = message.toLowerCase();
  return includesAny(lower, ["confirm", "create link"]) || /\u786e\u8ba4|\u5c31\u8fd9\u4e2a|\u53ef\u4ee5\u4e0b\u5355/.test(message);
}

function detectCannotGenerate(message: string): boolean {
  const lower = message.toLowerCase();
  return includesAny(lower, ["can you generate images", "can't you generate"]) || /\u4f60\u662f\u4e0d\u80fd\u51fa\u56fe\u4e48|\u4f60\u4e0d\u80fd\u51fa\u56fe\u5417/.test(message);
}

function detectRefuseMoreQuestions(message: string): boolean {
  return /\u6ca1\u6709\u5176\u4ed6\u8981\u6c42|\u6ca1\u6709\u8981\u6c42|\u968f\u4fbf|\u76f4\u63a5\u8981\u56fe|\u5c31\u8981|\u4e0d\u8981\u53cd\u590d|\u4e0d\u8981\u95ee|\u76f4\u63a5\u751f\u6210|\u89d2\u8272\u5361\u724c|\u56fe\u7247/.test(message);
}

function hasCharacterSignal(message: string, memoryCharacter: string): boolean {
  const lower = message.toLowerCase();
  return Boolean(
    memoryCharacter ||
      includesAny(lower, ["android 18"]) ||
      /\u4eba\u9020\u4eba18|\u4eba\u9020\u4eba18\u53f7|\u4eba\u9020\u4eba\u5341\u516b\u53f7|\u89d2\u8272\u5361\u724c|\u5973\u738b|\u6d77\u8d3c\u738b/.test(message)
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
    const requestedProductPrice = extractProductPrice(input.message);
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
            ? "The user asked to continue in Chinese. Confirm naturally in Chinese and invite the next request."
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
            ? "The user wants a direct Shopify checkout link. If product creation succeeds, clearly provide the title, price, product ID, storefront URL, and admin URL in Chinese. If it fails, clearly explain the exact Shopify error in Chinese."
            : "The user wants a direct Shopify product link. If product creation succeeds, clearly provide the title, price, product ID, storefront URL, and admin URL. If it fails, clearly explain the exact Shopify error.",
        reason: wantsShopifyLink ? "shopify link or create product keywords detected in user message" : "final confirmation with current prompt detected",
        data: {
          requestedProductTitle,
          requestedProductPrice
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
            ? "The user selected an option. Confirm the chosen A/B/C option in Chinese, summarize it, and say they can revise it or confirm checkout."
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
            ? "The user is revising the design. Explain in Chinese what changed and invite more feedback or confirmation."
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
            ? "The user explicitly wants direct generation. Respond in Chinese that 3 options were generated directly and invite A/B/C or revision feedback."
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
            ? "The user wants card design options. Introduce the 3 generated options naturally in Chinese and invite A/B/C or revisions."
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
            ? "The user wants prompt polishing. Present the original idea, improved prompt, and short explanation in Chinese."
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
            ? "This is an after-sales request. Answer directly in Chinese using a natural support tone."
            : "This is an after-sales request. Answer it directly in a natural support tone based on the tool result.",
        reason: "after-sales keywords detected"
      });
    }

    if (/\u4ef7\u683c/.test(input.message) || input.message.toLowerCase().includes("price")) {
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
            ? "The user is asking about pricing. Explain in Chinese that price depends on quantity, complexity, and whether it is a physical card."
            : "The user is asking about pricing. Explain naturally that pricing depends on quantity, complexity, and whether it is a physical card, without inventing a fixed quote.",
        reason: "pricing question detected"
      });
    }

    if (/\u591a\u4e45|30\u5929/.test(input.message) || input.message.toLowerCase().includes("delivery")) {
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
            ? "The user is asking about delivery time. Explain in Chinese that custom production and delivery usually takes about 30 days."
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
            ? "The user is asking a general question. Answer directly in Chinese and briefly mention what else you can help with."
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
          ? "This is general chat. Greet the user naturally in Chinese and explain that you can help with questions, prompt polishing, image generation, image revision, and Shopify links."
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
