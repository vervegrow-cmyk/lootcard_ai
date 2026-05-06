import { imageService } from "../../services/image.service";
import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";
import { generateStyleOptionsSkill } from "./generate-style-options.skill";
import { promptAgent as legacyPromptAgent } from "../../agents/prompt-agent";
import { memoryService } from "../../services/memory.service";
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
    (lower.includes("人造人18") ||
      lower.includes("人造人18号") ||
      lower.includes("人造人十八号") ||
      lower.includes("android 18"))
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

export class GenerateImagesSkill {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const collected = collectRequirementsSkill.execute(context);
    const mergedMemory = {
      ...context.memory,
      ...(collected.memoryUpdate || {})
    };
    const lower = context.message.toLowerCase();
    const isDirectGenerate = Boolean(context.data?.directGenerate);
    const explainImageCapability = Boolean(context.data?.explainImageCapability);
    const userRejectedMoreQuestions = Boolean(context.data?.userRejectedMoreQuestions || collected.data?.shouldStopAsking);
    const autoFilledMemory = buildAutoFilledMemory({
      ...context,
      memory: mergedMemory
    });
    const effectiveMemory = isDirectGenerate || userRejectedMoreQuestions ? autoFilledMemory : mergedMemory;

    if (isDirectGenerate || userRejectedMoreQuestions) {
      console.log("[Auto Filled Design Info]", {
        theme: effectiveMemory.theme,
        character: effectiveMemory.character,
        style: effectiveMemory.style,
        count: 3
      });
    }

    const canGenerate =
      isDirectGenerate ||
      userRejectedMoreQuestions ||
      ((Boolean(effectiveMemory.character || effectiveMemory.theme) ||
        lower.includes("人造人18") ||
        lower.includes("人造人18号") ||
        lower.includes("人造人十八号") ||
        lower.includes("海贼王") ||
        lower.includes("女王")) &&
        (Boolean(effectiveMemory.style) || lower.includes("generate") || lower.includes("出图")));

    if (!canGenerate) {
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

    let variants = (styleResult.data?.styleVariants as Array<{ id: string; title: string; prompt: string }>) || [];
    if (isDirectGenerate || userRejectedMoreQuestions) {
      variants = [
        {
          id: "A",
          title: "动漫SSR收藏卡",
          prompt: `${prompt.image_prompt}, anime SSR collector card, premium foil finish`
        },
        {
          id: "B",
          title: "黑金高级角色卡",
          prompt: `${prompt.image_prompt}, black gold premium character card, luxury border`
        },
        {
          id: "C",
          title: "赛博战斗角色卡",
          prompt: `${prompt.image_prompt}, cyber combat character card, neon battle atmosphere`
        }
      ];
    }

    const project =
      context.project || (await memoryService.createProject(context.discordUserId, context.message, prompt.image_prompt));

    await memoryService.updateProject(project.projectId, {
      status: "generating",
      currentPrompt: prompt.image_prompt
    });

    const generated = await imageService.generateImages(prompt.image_prompt, 3);
    const imageOptions = generated.map((option, index) => ({
      id: variants[index]?.id || option.id,
      title: variants[index]?.title || option.title,
      imageUrl: option.imageUrl,
      prompt: variants[index]?.prompt || option.prompt
    }));

    await memoryService.replaceImageOptions(project.projectId, imageOptions);

    const intro =
      (isDirectGenerate || userRejectedMoreQuestions) && context.language === "zh"
        ? `好的，我直接按“${effectiveMemory.character || "角色"}角色卡牌”生成 3 个方案：`
        : (isDirectGenerate || userRejectedMoreQuestions)
          ? `Got it. I will directly generate 3 options for "${effectiveMemory.character || "the character"} card":`
          : "";

    const capabilityReply =
      explainImageCapability && context.language === "zh"
        ? "我可以进入出图流程。目前如果 MOCK_IMAGE_MODE=true，会先返回模拟图片链接；如果要真实出图，需要接入 OpenAI Images / Replicate / Stable Diffusion。\n\n"
        : explainImageCapability
          ? "I can enter the image generation flow. If MOCK_IMAGE_MODE=true, I will return mock image links first. For real image generation, you need to connect OpenAI Images, Replicate, or Stable Diffusion.\n\n"
          : "";

    const result: SkillExecutionResult = {
      reply:
        capabilityReply +
        (intro ||
          (context.language === "zh"
            ? "我已经生成 3 个图像方案，你可以选 A/B/C，或者直接说想改哪里。"
            : "I generated 3 image options. You can choose A/B/C or tell me what to revise.")),
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
