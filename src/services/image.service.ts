import { ImageOption } from "../types";

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function imageConfigError(): Error {
  return new Error("图片模型未配置，请配置 IMAGE_PROVIDER 和对应 API KEY。");
}

export class ImageService {
  private getProvider(): string {
    return env("IMAGE_PROVIDER").toLowerCase();
  }

  private ensureConfigured(): { provider: string; model: string; apiKey: string } {
    const provider = this.getProvider();
    console.log(`[IMAGE] provider=${provider || "unconfigured"}`);

    if (!provider) {
      throw imageConfigError();
    }

    if (provider === "kling") {
      const apiKey = env("KLING_API_KEY");
      const model = env("KLING_IMAGE_MODEL") || "kling-v1";
      if (!apiKey) {
        throw imageConfigError();
      }
      return { provider, model, apiKey };
    }

    throw new Error(`Unsupported IMAGE_PROVIDER: ${provider}`);
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

    const config = this.ensureConfigured();

    if (config.provider === "kling") {
      throw new Error(`Kling provider is configured with model ${config.model}, but live image generation is not implemented yet.`);
    }

    throw new Error(`Unsupported IMAGE_PROVIDER: ${config.provider}`);
  }

  async reviseImage(input: {
    imageUrl: string;
    prompt: string;
    revisionText: string;
  }): Promise<{ imageUrl: string; prompt: string; summary: string }> {
    const config = this.ensureConfigured();
    throw new Error(`Image revision is not implemented for provider ${config.provider}.`);
  }

  async generateCardImages(input: {
    imagePrompt: string;
    styleName: string;
    projectId: string;
  }): Promise<{ imageUrl: string }> {
    const generated = await this.generateImages({
      prompt: `${input.imagePrompt}, ${input.styleName}`,
      count: 1,
      size: "768x1024"
    });

    return {
      imageUrl: generated[0]?.imageUrl || ""
    };
  }
}

export const imageService = new ImageService();
