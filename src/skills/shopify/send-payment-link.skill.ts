import { SkillExecutionContext, SkillExecutionResult } from "../../types/skill.types";

export class SendPaymentLinkSkill {
  execute(context: SkillExecutionContext): SkillExecutionResult {
    const checkoutLink = String(context.data?.checkoutLink || "");

    if (!checkoutLink) {
      return {
        reply:
          context.language === "zh"
            ? "Shopify 还没有配置完成，我已经记录最终设计，配置完成后可以生成下单链接。"
            : "Shopify is not configured yet. I saved the final design, and the checkout link can be created once Shopify is configured.",
        stage: "confirmed",
        actions: ["send-payment-link-skipped"]
      };
    }

    return {
      reply:
        context.language === "zh"
          ? `好的，这是你的定制卡牌下单链接：\n${checkoutLink}\n\n说明：这是定制商品，预计 30 天左右到货。`
          : `Here is your custom trading card checkout link:\n${checkoutLink}\n\nNote: This is a custom order and usually takes about 30 days for production and delivery.`,
      stage: "payment",
      actions: ["send-payment-link"]
    };
  }
}

export const sendPaymentLinkSkill = new SendPaymentLinkSkill();
