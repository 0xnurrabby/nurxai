import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function resolveDatabaseUrl() {
  return [
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL
  ].find((value) => value && value.trim().length > 0);
}

const databaseUrl = resolveDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {})
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
