import { ImageOption } from "../types";

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function imageConfigError(): Error {
  return new Error("图片生成模型还没配置，请先配置 IMAGE_PROVIDER 和对应 API KEY。");
}

export class ImageService {
  private getProvider(): string {
    return env("IMAGE_PROVIDER").toLowerCase();
  }

  private ensureConfigured(): {
    provider: string;
    model: string;
    apiKey?: string;
    accessKey?: string;
    secretKey?: string;
  } {
    const provider = this.getProvider();
    console.log(`[IMAGE] provider=${provider || "unconfigured"}`);

    if (!provider) {
      throw imageConfigError();
    }

    if (provider === "kling") {
      const apiKey = env("KLING_API_KEY");
      const accessKey = env("KLING_ACCESS_KEY");
      const secretKey = env("KLING_SECRET_KEY");
      const model = env("KLING_IMAGE_MODEL") || "kling-v1";

      if (!apiKey && !(accessKey && secretKey)) {
        throw imageConfigError();
      }

      return {
        provider,
        model,
        apiKey,
        accessKey,
        secretKey
      };
    }

    throw new Error(`Unsupported IMAGE_PROVIDER: ${provider}`);
  }

  async generateImage(prompt: string): Promise<{ imageUrl: string; prompt: string; summary: string }> {
    const config = this.ensureConfigured();
    console.log("[IMAGE] generating", { provider: config.provider, model: config.model });

    try {
      if (config.provider === "kling") {
        throw new Error(`Kling provider is configured with model ${config.model}, but live image generation is not implemented yet.`);
      }

      throw new Error(`Unsupported IMAGE_PROVIDER: ${config.provider}`);
    } catch (error) {
      console.log("[IMAGE] failed", error instanceof Error ? error.message : String(error));
      throw error;
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
        ? {
            prompt: input,
            count: legacyCount ?? 3,
            size: "1024x1024"
          }
        : input;

    const count = normalized.count ?? 3;
    const items: ImageOption[] = [];

    for (let index = 0; index < count; index += 1) {
      const generated = await this.generateImage(normalized.prompt);
      items.push({
        id: String.fromCharCode(65 + index),
        title: `Generated Image ${index + 1}`,
        imageUrl: generated.imageUrl,
        prompt: generated.prompt
      });
    }

    console.log("[IMAGE] success", { count: items.length });
    return items;
  }

  async reviseImage(input: {
    imageUrl: string;
    prompt: string;
    revisionText: string;
  }): Promise<{ imageUrl: string; prompt: string; summary: string }> {
    const config = this.ensureConfigured();
    console.log("[IMAGE] generating", { provider: config.provider, model: config.model, revision: true });
    throw new Error(`Image revision is not implemented for provider ${config.provider}.`);
  }

  async generateCardImages(input: {
    imagePrompt: string;
    styleName: string;
    projectId: string;
  }): Promise<{ imageUrl: string }> {
    const generated = await this.generateImage(`${input.imagePrompt}, ${input.styleName}`);
    return {
      imageUrl: generated.imageUrl
    };
  }
}

export const imageService = new ImageService();
