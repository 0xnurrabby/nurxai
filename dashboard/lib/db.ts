import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function resolveDatabaseUrl() {
  const candidates = [
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.DATABASE_URL
  ].filter((value): value is string => Boolean(value?.trim()));
  const databaseUrl = process.env.VERCEL
    ? candidates.find((value) => {
        try { return new URL(value).port === "6543"; } catch { return false; }
      }) || candidates[0]
    : candidates[0];
  if (!databaseUrl || !process.env.VERCEL) return databaseUrl;

  try {
    const parsed = new URL(databaseUrl);
    if (parsed.hostname.endsWith(".pooler.supabase.com") && parsed.port === "5432") {
      parsed.port = "6543";
    }
    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

function createPrismaClient() {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) throw new Error("Database connection URL is not configured.");

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: process.env.VERCEL ? 2_000 : 10_000,
    allowExitOnIdle: true
  });
  return new PrismaClient({
    adapter: new PrismaPg(pool),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    transactionOptions: {
      maxWait: 10_000,
      timeout: 30_000
    }
  });
}

function getPrismaClient() {
  const client = globalForPrisma.prisma ?? createPrismaClient();
  if (!globalForPrisma.prisma) globalForPrisma.prisma = client;
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  }
});
