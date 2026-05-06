import { Router } from "express";
import { isShopifyConfigured } from "../services/shopify.service";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  const shopifyReady = isShopifyConfigured();
  res.status(200).type("html").send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>LootCard AI Shopify App</title>
        <style>
          body { font-family: Arial, sans-serif; background:#0f172a; color:#e2e8f0; margin:0; padding:40px; }
          .card { max-width:720px; margin:0 auto; background:#111827; border:1px solid #334155; border-radius:16px; padding:32px; }
          h1 { margin-top:0; }
          p { line-height:1.6; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>LootCard AI Shopify App</h1>
          <p>LootCard AI Shopify App is running.</p>
          <p>LootCard AI is running.</p>
          <p>Discord Bot: Online</p>
          <p>Shopify Integration: ${shopifyReady ? "Ready" : "Not Configured"}</p>
        </div>
      </body>
    </html>
  `);
});

healthRouter.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "lootcard-ai",
    shopifyConfigured: isShopifyConfigured()
  });
});
