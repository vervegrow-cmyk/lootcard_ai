import crypto from "crypto";
import { Request, Response, Router } from "express";
import { shopifyAuthService } from "../services/shopify-auth.service";

export const healthRouter = Router();

function embeddedRedirectHtml(targetUrl: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LootCard AI Shopify App</title>
    <script>
      if (window.top === window.self) {
        window.location.assign(${JSON.stringify(targetUrl)});
      } else {
        window.top.location.href = ${JSON.stringify(targetUrl)};
      }
    </script>
  </head>
  <body>
    <p>Redirecting to Shopify authorization...</p>
  </body>
</html>`;
}

function appShellHtml(params: {
  shop: string | null;
  shopifyConfigured: boolean;
  webhooks: boolean;
  apiStatus: string;
  apiKey: string;
  host: string;
  appUrl: string;
}): string {
  const defaultShop = params.shop || process.env.SHOPIFY_STORE_DOMAIN || "clearance-sale-dekuch.myshopify.com";
  const connectUrl = params.shop
    ? `${params.appUrl}/auth/shopify?shop=${encodeURIComponent(params.shop)}${params.host ? `&host=${encodeURIComponent(params.host)}` : ""}`
    : `${params.appUrl}/auth/shopify?shop=${encodeURIComponent(defaultShop)}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LootCard AI Shopify App</title>
    <meta name="shopify-api-key" content="${params.apiKey}" />
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f6f7;
        color: #111827;
      }
      .shell {
        max-width: 900px;
        margin: 48px auto;
        padding: 0 20px;
      }
      .card {
        background: white;
        border-radius: 18px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        padding: 32px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: #ecfdf3;
        color: #027a48;
        font-size: 14px;
        font-weight: 600;
      }
      .badge.warn {
        background: #fff7ed;
        color: #c2410c;
      }
      dl {
        display: grid;
        grid-template-columns: 180px 1fr;
        gap: 14px 18px;
        margin-top: 28px;
      }
      dt {
        color: #475467;
        font-weight: 600;
      }
      dd {
        margin: 0;
      }
      a.button {
        display: inline-block;
        margin-top: 24px;
        text-decoration: none;
        background: #111827;
        color: white;
        padding: 12px 18px;
        border-radius: 12px;
      }
      code {
        background: #f2f4f7;
        border-radius: 8px;
        padding: 2px 8px;
      }
    </style>
    <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
  </head>
  <body>
    <main class="shell">
      <section class="card">
        <div class="badge ${params.shopifyConfigured ? "" : "warn"}">
          ${params.shopifyConfigured ? "Shopify Connected ✅" : "Shopify Not Connected"}
        </div>
        <h1>LootCard AI Shopify App</h1>
        <p>LootCard AI Shopify App is running.</p>
        <dl>
          <dt>Current Shop</dt>
          <dd>${params.shop || "Not installed yet"}</dd>
          <dt>API Status</dt>
          <dd>${params.apiStatus}</dd>
          <dt>Webhook Status</dt>
          <dd>${params.webhooks ? "Registered" : "Pending"}</dd>
          <dt>Embedded Mode</dt>
          <dd>${params.host ? "Shopify Admin iframe" : "Browser preview"}</dd>
        </dl>
        <a class="button" href="${connectUrl}">Connect or Reauthorize Shopify</a>
        ${
          params.shop
            ? ""
            : `<p style="margin-top:16px;color:#475467;">Authorization shortcut: <code>/auth/shopify?shop=${defaultShop}</code></p>`
        }
      </section>
    </main>
  </body>
</html>`;
}

async function renderHome(req: Request, res: Response): Promise<void> {
  const requestedShop = typeof req.query.shop === "string" ? req.query.shop : "";
  const host = typeof req.query.host === "string" ? req.query.host : "";
  const status = await shopifyAuthService.getHealthStatus(requestedShop || null);

  if (requestedShop && shopifyAuthService.isOAuthConfigured() && !status.shopifyConfigured) {
    const authUrl = `${req.protocol}://${req.get("host")}/auth/shopify?shop=${encodeURIComponent(requestedShop)}${host ? `&host=${encodeURIComponent(host)}` : ""}`;
    res.status(200).type("html").send(embeddedRedirectHtml(authUrl));
    return;
  }

  res.status(200).type("html").send(
    appShellHtml({
      shop: status.connectedShop,
      shopifyConfigured: status.shopifyConfigured,
      webhooks: status.webhooks,
      apiStatus: status.apiStatus,
      apiKey: process.env.SHOPIFY_API_KEY || "",
      host,
      appUrl: (process.env.SHOPIFY_APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "")
    })
  );
}

healthRouter.get("/", (req, res, next) => {
  void renderHome(req, res).catch(next);
});

healthRouter.get("/health", (req, res, next) => {
  void (async () => {
    const requestedShop = typeof req.query.shop === "string" ? req.query.shop : "";
    const status = await shopifyAuthService.getHealthStatus(requestedShop || null);
    res.status(200).json({
      ok: true,
      shopifyConfigured: status.shopifyConfigured,
      connectedShop: status.connectedShop,
      webhooks: status.webhooks
    });
  })().catch(next);
});

healthRouter.get("/auth/shopify", (req, res, next) => {
  void (async () => {
    const shop = typeof req.query.shop === "string" ? req.query.shop : "";
    if (!shop) {
      res.status(400).json({
        ok: false,
        error: "Missing required query parameter: shop"
      });
      return;
    }

    const state = crypto.randomBytes(16).toString("hex");
    res.cookie("shopify_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 10 * 60 * 1000
    });

    const authUrl = shopifyAuthService.createInstallUrl(shop, state);
    res.status(200).type("html").send(embeddedRedirectHtml(authUrl));
  })().catch(next);
});

healthRouter.get("/auth/callback", (req, res, next) => {
  void (async () => {
    const cookieState = typeof req.cookies?.shopify_oauth_state === "string" ? req.cookies.shopify_oauth_state : "";
    const queryState = typeof req.query.state === "string" ? req.query.state : "";
    shopifyAuthService.validateOAuthCallbackState(cookieState, queryState);
    const callbackUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const result = await shopifyAuthService.handleOAuthCallback(callbackUrl);
    res.clearCookie("shopify_oauth_state", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/"
    });
    res.redirect(result.redirectUrl);
  })().catch(next);
});
