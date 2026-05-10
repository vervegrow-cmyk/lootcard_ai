export interface PricingDecision {
  price: number;
  tier: "standard" | "ssr" | "black_gold_limited" | "signed_limited";
}

function includesKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export class PricingService {
  inferPrice(input: string): PricingDecision {
    const text = input.toLowerCase();

    if (includesKeyword(text, ["限量签名", "signature", "signed", "autograph"])) {
      return { price: 199.99, tier: "signed_limited" };
    }

    if (includesKeyword(text, ["黑金限定", "black gold limited", "black gold", "黑金"])) {
      return { price: 99.99, tier: "black_gold_limited" };
    }

    if (includesKeyword(text, ["ssr", "holographic", "全息", "烫金"])) {
      return { price: 49.99, tier: "ssr" };
    }

    return { price: 19.99, tier: "standard" };
  }
}

export const pricingService = new PricingService();
