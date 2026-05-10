import { imageService } from "../../services/image.service";
import { memoryService } from "../../services/memory.service";
import { promptAgent as legacyPromptAgent } from "../../agents/prompt-agent";
import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";
import { generateStyleOptionsSkill } from "./generate-style-options.skill";
import { collectRequirementsSkill } from "./collect-requirements.skill";

const DEFAULT_STYLE =
  "高质量动漫收藏卡，SSR稀有卡牌，精致边框，电影级光影，高细节，适合定制实体卡";

function buildAutoFilledMemory(context: SkillExecutionContext) {
  const lower = context.message.toLowerCase();
  const autoFilled = {
    ...context.memory
  };

  if (
    !autoFilled.character &&
    (lower.includes("人造人18") || lower.includes("人造人十八") || lower.includes("android 18"))
  ) {
    autoFilled.character = "人造人18号";
  }
  if (!autoFilled.theme && autoFilled.character === "人造人18号") {
    autoFilled.theme = "动漫角色卡牌";
  }
  if (!autoFilled.style) {
    autoFilled.style = DEFAULT_STYLE;
  }
  if (!autoFilled.rarity) {
    autoFilled.rarity = "SSR";
  }

  return autoFilled;
}

function hasEnoughToGenerate(message: string, effectiveMemory: ReturnType<typeof buildAutoFilledMemory>): boolean {
  const lower = message.toLowerCase();
  return (
    Boolean(effectiveMemory.character || effectiveMemory.theme) &&
    (Boolean(effectiveMemory.style) ||
      lower.includes("generate") ||
      lower.includes("anime") ||
      lower.includes("custom card") ||
      lower.includes("trading card") ||
      /出图|生成图|生成图片|画图|做图|卡牌图|头像|海报|logo|主图|包装图/.test(message))
  );
}

function formatSelectionReply(
  language: "zh" | "en",
  imageOptions: Array<{ id: string; title: string; prompt: string }>
): string {
  if (language === "zh") {
    return [
      "✅ 已生成卡牌预览图",
      "",
      ...imageOptions.flatMap((option) => [`${option.id}. ${option.title}`, `提示词：${option.prompt}`, ""]),
      "回复 A / B / C 选择方案，也可以直接说修改意见。"
    ]
      .join("\n")
      .trim();
  }

  return [
    "✅ Card previews generated",
    "",
    ...imageOptions.flatMap((option) => [`${option.id}. ${option.title}`, `Prompt: ${option.prompt}`, ""]),
    "Reply with A / B / C to choose one, or tell me what to revise."
  ]
    .join("\n")
    .trim();
}

export class GenerateImagesSkill {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const collected = collectRequirementsSkill.execute(context);
    const mergedMemory = {
      ...context.memory,
      ...(collected.memoryUpdate || {})
    };
    const isDirectGenerate = Boolean(context.data?.directGenerate);
    const userRejectedMoreQuestions = Boolean(context.data?.userRejectedMoreQuestions || collected.data?.shouldStopAsking);
    const effectiveMemory = isDirectGenerate || userRejectedMoreQuestions
      ? buildAutoFilledMemory({ ...context, memory: mergedMemory })
      : mergedMemory;

    if (isDirectGenerate || userRejectedMoreQuestions) {
      console.log("[Auto Filled Design Info]", {
        theme: effectiveMemory.theme,
        character: effectiveMemory.character,
        style: effectiveMemory.style,
        count: 3
      });
    }

    if (!hasEnoughToGenerate(context.message, effectiveMemory)) {
      return {
        reply:
          context.language === "zh"
            ? "在出图前，我还差一个关键信息：你想要什么风格？"
            : "Before generating images, I still need one key detail: what style do you want?",
        stage: "collecting",
        actions: ["ask-style"],
        memoryUpdate: {
          stage: "collecting"
        }
      };
    }

    const prompt = await legacyPromptAgent.buildPrompt({
      theme: effectiveMemory.theme || "动漫角色卡牌",
      character: effectiveMemory.character || "角色主角",
      style: effectiveMemory.style || DEFAULT_STYLE,
      rarity: effectiveMemory.rarity || "SSR",
      quantity: effectiveMemory.quantity,
      physical_card: effectiveMemory.physical_card,
      special_requirements: effectiveMemory.special_requirements
    });

    const styleResult = generateStyleOptionsSkill.execute({
      ...context,
      memory: {
        ...effectiveMemory,
        currentPrompt: prompt.image_prompt
      }
    });

    const variants =
      (styleResult.data?.styleVariants as Array<{ id: string; title: string; prompt: string }>) || [];

    const project =
      context.project || (await memoryService.createProject(context.discordUserId, context.message, prompt.image_prompt));

    await memoryService.updateProject(project.projectId, {
      status: "generating",
      currentPrompt: prompt.image_prompt
    });

    const imageOptions = [];
    for (const variant of variants) {
      try {
        const generated = await imageService.generateImage(variant.prompt, variant.title);
        if (!generated.ok || !generated.imageUrl) {
          console.log("[IMAGE] generation failed");
          continue;
        }

        imageOptions.push({
          id: variant.id,
          title: variant.title,
          imageUrl: generated.imageUrl,
          prompt: variant.prompt,
          summary: generated.summary,
          style: generated.imageStyle,
          provider: generated.imageProvider,
          model: generated.imageModel
        });
      } catch {
        console.log("[IMAGE] generation failed");
      }
    }

    if (!imageOptions.length) {
      return {
        reply:
          context.language === "zh"
            ? "图片生成失败，请稍后重试。"
            : "Image generation failed. Please try again later.",
        stage: "generating",
        actions: ["generate-images"],
        memoryUpdate: {
          stage: "generating"
        }
      };
    }

    await memoryService.replaceImageOptions(project.projectId, imageOptions);

    const result: SkillExecutionResult = {
      reply: formatSelectionReply(context.language, imageOptions),
      stage: "selecting",
      actions: ["generate-images"],
      memoryUpdate: {
        stage: "selecting",
        theme: effectiveMemory.theme || "动漫角色卡牌",
        character: effectiveMemory.character || "角色主角",
        style: effectiveMemory.style || DEFAULT_STYLE,
        rarity: effectiveMemory.rarity || "SSR",
        quantity: effectiveMemory.quantity,
        physical_card: effectiveMemory.physical_card,
        special_requirements: effectiveMemory.special_requirements,
        currentPrompt: prompt.image_prompt
      },
      prompt: prompt.image_prompt,
      imageOptions,
      data: {
        project
      }
    };

    console.log("[Generate Images Result]", {
      count: result.imageOptions?.length || 0,
      stage: result.stage,
      titles: result.imageOptions?.map((item) => item.title)
    });

    return result;
  }
}

export const generateImagesSkill = new GenerateImagesSkill();
