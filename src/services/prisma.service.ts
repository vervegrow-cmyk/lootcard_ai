import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __lootcardPrisma__: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

export const prisma =
  global.__lootcardPrisma__ ||
  createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__lootcardPrisma__ = prisma;
}
