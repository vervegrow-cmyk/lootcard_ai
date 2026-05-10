import { LanguagePreference, OrderDraftOption, ShippingType } from "../types";

interface ConceptTemplate {
  id: "A" | "B" | "C";
  title: string;
  style: string;
  description: string;
  price: number;
  promptStyle: string;
}

const conceptTemplates: Record<LanguagePreference, ConceptTemplate[]> = {
  zh: [
    {
      id: "A",
      title: "黑金SSR典藏卡",
      style: "黑金 / SSR / 全息 / 动漫角色",
      description: "黑金 / SSR / 全息 / 动漫角色",
      price: 99.99,
      promptStyle: "black gold SSR anime trading card, premium foil frame, holographic shine, luxury collectible card, cinematic lighting"
    },
    {
      id: "B",
      title: "赛博朋克战斗卡",
      style: "赛博朋克 / 霓虹 / 战斗感",
      description: "赛博朋克 / 霓虹 / 战斗感",
      price: 39.99,
      promptStyle: "cyberpunk anime trading card, neon edges, battle posture, futuristic metallic frame, premium collectible composition"
    },
    {
      id: "C",
      title: "高级收藏签名卡",
      style: "限量 / 签名 / 收藏级",
      description: "限量 / 签名 / 收藏级",
      price: 199.99,
      promptStyle: "limited signature anime trading card, premium collector edition, elegant embossing, luxury finish, showcase composition"
    }
  ],
  en: [
    {
      id: "A",
      title: "Black Gold SSR Collector Card",
      style: "Black Gold / SSR / Anime Character",
      description: "Black Gold / SSR / Anime Character",
      price: 99.99,
      promptStyle: "black gold SSR anime trading card, premium foil frame, holographic shine, luxury collectible card, cinematic lighting"
    },
    {
      id: "B",
      title: "Cyberpunk Battle Card",
      style: "Cyberpunk / Mecha / Combat",
      description: "Cyberpunk / Mecha / Combat",
      price: 39.99,
      promptStyle: "cyberpunk anime trading card, neon edges, battle posture, futuristic metallic frame, premium collectible composition"
    },
    {
      id: "C",
      title: "Premium Signature Collector Card",
      style: "Limited Edition / Signed / Luxury",
      description: "Limited Edition / Signed / Luxury",
      price: 199.99,
      promptStyle: "limited signature anime trading card, premium collector edition, elegant embossing, luxury finish, showcase composition"
    }
  ]
};

function buildCommercialPrompt(baseRequest: string, promptStyle: string): string {
  return `${promptStyle}, user request: ${baseRequest}`.replace(/\s+/g, " ").trim();
}

export function buildConceptOptions(
  message: string,
  language: LanguagePreference,
  shippingType: ShippingType
): OrderDraftOption[] {
  return conceptTemplates[language].map((template) => ({
    id: template.id,
    title: template.title,
    style: template.style,
    description: template.description,
    estimatedPrice: template.price,
    shippingType,
    prompt: buildCommercialPrompt(message, template.promptStyle)
  }));
}
