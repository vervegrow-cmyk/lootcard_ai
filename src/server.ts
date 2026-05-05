import express from "express";
import { discordBot } from "./bot/discord.bot";
import { healthRouter } from "./routes/health.route";
import { logger } from "./utils/logger";

export async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT || 3000);

  app.use(express.json());
  app.use("/", healthRouter);

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
