import { GeneratedImageResult, ImageOption } from "../types";

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

interface SiliconFlowImageResponse {
  images?: Array<{
    url?: string;
    b64_json?: string;
  }>;
}

interface SiliconFlowErrorResponse {
  code?: number;
  message?: string;
}

function inferStyle(prompt: string): string {
  const text = prompt.toLowerCase();
  if (/(黑金|black gold)/.test(text) && /ssr/.test(text)) {
    return "黑金SSR";
  }
  if (/(赛博朋克|cyberpunk)/.test(text)) {
    return "赛博朋克";
  }
  if (/(anime card|trading card|动漫卡|动漫卡牌)/.test(text)) {
    return "动漫收藏卡";
  }
  return "高级卡牌设计";
}

export class ImageService {
  private getProvider(): string {
    return env("IMAGE_PROVIDER").toLowerCase();
  }

  async generateImage(prompt: string, styleHint?: string): Promise<GeneratedImageResult> {
    const provider = this.getProvider();
    console.log(`[IMAGE] provider=${provider || "unconfigured"}`);

    if (provider !== "siliconflow") {
      const error = "Unsupported image provider";
      console.log(`[IMAGE] failed error=${error}`);
      return { ok: false, error };
    }

    const apiKey = env("SILICONFLOW_API_KEY");
    if (!apiKey) {
      const error = "Missing SILICONFLOW_API_KEY";
      console.log(`[IMAGE] failed error=${error}`);
      return { ok: false, error };
    }

    const model = env("IMAGE_MODEL") || "black-forest-labs/FLUX.1-dev";
    const fallbackModel = env("IMAGE_FALLBACK_MODEL") || "Kwai-Kolors/Kolors";
    console.log(`[IMAGE] model=${model}`);
    console.log("[IMAGE] generating");

    const attempt = async (targetModel: string) => {
      const response = await fetch("https://api.siliconflow.cn/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: targetModel,
          prompt,
          image_size: "768x1024",
          batch_size: 1
        })
      });

      const text = await response.text();
      return { response, text, model: targetModel };
    };

    try {
      let attemptResult = await attempt(model);
      let parsedError: SiliconFlowErrorResponse | null = null;
      try {
        parsedError = JSON.parse(attemptResult.text) as SiliconFlowErrorResponse;
      } catch {
        parsedError = null;
      }

      if (
        !attemptResult.response.ok &&
        fallbackModel &&
        fallbackModel !== model &&
        (parsedError?.code === 30003 || /Model disabled/i.test(attemptResult.text))
      ) {
        console.log(`[IMAGE] model fallback=${fallbackModel}`);
        attemptResult = await attempt(fallbackModel);
      }

      if (!attemptResult.response.ok) {
        const error = `SiliconFlow request failed: ${attemptResult.response.status} ${attemptResult.text}`;
        console.log(`[IMAGE] failed error=${error}`);
        return { ok: false, error };
      }

      const parsed = JSON.parse(attemptResult.text) as SiliconFlowImageResponse;
      const first = parsed.images?.[0];
      const imageUrl = first?.url?.trim();
      const imageBase64 = first?.b64_json?.trim();

      if (!imageUrl && !imageBase64) {
        const error = "SiliconFlow returned no image URL or base64 data.";
        console.log(`[IMAGE] failed error=${error}`);
        return { ok: false, error };
      }

      console.log(`[IMAGE] success imageUrl=${imageUrl || "base64-only"}`);
      return {
        ok: true,
        imageUrl,
        imageBase64,
        imagePrompt: prompt,
        imageStyle: styleHint || inferStyle(prompt),
        imageProvider: provider,
        imageModel: attemptResult.model,
        summary: `${styleHint || inferStyle(prompt)} 设计已生成`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[IMAGE] failed error=${message}`);
      return { ok: false, error: message };
    }
  }

  async generateImages(
    input:
      | string
      | {
          prompt: string;
          count?: number;
          size?: string;
        },
    legacyCount?: number
  ): Promise<ImageOption[]> {
    const normalized =
      typeof input === "string"
        ? { prompt: input, count: legacyCount ?? 1, size: "768x1024" }
        : input;

    const count = normalized.count ?? 1;
    const items: ImageOption[] = [];

    for (let index = 0; index < count; index += 1) {
      const generated = await this.generateImage(`${normalized.prompt}. Variation ${index + 1}`, inferStyle(normalized.prompt));
      if (!generated.ok) {
        throw new Error(generated.error || "Image generation failed.");
      }

      items.push({
        id: String.fromCharCode(65 + index),
        title: `${generated.imageStyle || "Card Design"} ${index + 1}`,
        imageUrl: generated.imageUrl || "",
        prompt: generated.imagePrompt || normalized.prompt,
        summary: generated.summary,
        style: generated.imageStyle,
        provider: generated.imageProvider,
        model: generated.imageModel
      });
    }

    return items;
  }

  async reviseImage(input: {
    imageUrl: string;
    prompt: string;
    revisionText: string;
  }): Promise<{ imageUrl: string; prompt: string; summary: string }> {
    const revisedPrompt = `${input.prompt}. Revision request: ${input.revisionText}`;
    const generated = await this.generateImage(revisedPrompt);
    if (!generated.ok) {
      throw new Error(generated.error || "Image revision failed.");
    }

    return {
      imageUrl: generated.imageUrl || "",
      prompt: revisedPrompt,
      summary: generated.summary || `Revision applied: ${input.revisionText}`
    };
  }

  async generateCardImages(input: {
    imagePrompt: string;
    styleName: string;
    projectId: string;
  }): Promise<{ imageUrl: string }> {
    const generated = await this.generateImage(`${input.imagePrompt}, ${input.styleName}`, input.styleName);
    if (!generated.ok) {
      throw new Error(generated.error || "Image generation failed.");
    }

    return {
      imageUrl: generated.imageUrl || ""
    };
  }
}

export const imageService = new ImageService();
