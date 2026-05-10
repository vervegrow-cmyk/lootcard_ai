import { ImageOption } from "../types";

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

export class ImageService {
  private getProvider(): string {
    return env("IMAGE_PROVIDER").toLowerCase();
  }

  async generateImage(prompt: string): Promise<{
    ok: boolean;
    imageUrl?: string;
    imageBase64?: string;
    error?: string;
  }> {
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

    try {
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
        imageBase64
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[IMAGE] failed error=${message}`);
      return {
        ok: false,
        error: message
      };
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
      const generated = await this.generateImage(normalized.prompt);
      if (!generated.ok) {
        throw new Error(generated.error || "Image generation failed.");
      }

      items.push({
        id: String.fromCharCode(65 + index),
        title: `Generated Image ${index + 1}`,
        imageUrl: generated.imageUrl || "",
        prompt: normalized.prompt
      });
    }

    return items;
  }

  async reviseImage(input: {
    imageUrl: string;
    prompt: string;
    revisionText: string;
  }): Promise<{ imageUrl: string; prompt: string; summary: string }> {
    const generated = await this.generateImage(`${input.prompt}. Revision request: ${input.revisionText}`);
    if (!generated.ok) {
      throw new Error(generated.error || "Image revision failed.");
    }

    return {
      imageUrl: generated.imageUrl || "",
      prompt: `${input.prompt}. Revision request: ${input.revisionText}`,
      summary: `Revision applied: ${input.revisionText}`
    };
  }

  async generateCardImages(input: {
    imagePrompt: string;
    styleName: string;
    projectId: string;
  }): Promise<{ imageUrl: string }> {
    const generated = await this.generateImage(`${input.imagePrompt}, ${input.styleName}`);
    if (!generated.ok) {
      throw new Error(generated.error || "Image generation failed.");
    }

    return {
      imageUrl: generated.imageUrl || ""
    };
  }
}

export const imageService = new ImageService();
