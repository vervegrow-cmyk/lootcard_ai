import dotenv from "dotenv";

dotenv.config();

async function bootstrap(): Promise<void> {
  const { startServer } = await import("./server");
  await startServer();
}

bootstrap().catch((error) => {
  console.error("Application failed to start:", error);
  process.exit(1);
});
