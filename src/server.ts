import express from "express";
import { discordBot } from "./bot/discord.bot";
import { healthRouter } from "./routes/health.route";
import { webhookRouter } from "./routes/webhook.route";
import { logger } from "./utils/logger";

export async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT || 3000);

  app.use("/webhooks", express.raw({ type: "*/*" }), webhookRouter);
  app.use(express.json());
  app.use("/", healthRouter);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("HTTP route failed", error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  });

  app.listen(port, () => {
    logger.info(`HTTP server listening on port ${port}`);
  });

  try {
    await discordBot.start();
  } catch (error) {
    logger.warn(
      "HTTP server is running, but Discord bot is offline. Check the token in .env and verify it is the Bot Token from Discord Developer Portal.",
      error
    );
  }
}
