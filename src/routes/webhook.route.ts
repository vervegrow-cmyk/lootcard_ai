import { Request, Response, Router } from "express";
import { shopifyAuthService } from "../services/shopify-auth.service";

export const webhookRouter = Router();

webhookRouter.post("/", (req: Request, res: Response, next) => {
  void (async () => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    const payload = await shopifyAuthService.verifyWebhook(
      req.headers as Record<string, string | string[] | undefined>,
      rawBody
    );
    await shopifyAuthService.handleWebhook(payload);
    res.status(200).json({ ok: true, topic: payload.topic, shop: payload.shop });
  })().catch(next);
});
