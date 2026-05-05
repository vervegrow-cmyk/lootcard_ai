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

  await discordBot.start();
}
