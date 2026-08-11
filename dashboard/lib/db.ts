import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function resolveDatabaseUrl() {
  try {
    const env = getCloudflareContext().env as Record<string, unknown>;
    const hyperdrive = env.HYPERDRIVE as { connectionString?: unknown } | undefined;
    if (typeof hyperdrive?.connectionString === "string" && hyperdrive.connectionString.trim()) {
      return hyperdrive.connectionString;
    }
    const workerUrl = [env.POSTGRES_PRISMA_URL, env.POSTGRES_URL, env.DATABASE_URL]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (workerUrl) return workerUrl;
  } catch {
    // Local Next.js runs outside the Cloudflare request context.
  }

  return [
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL
  ].find((value) => value && value.trim().length > 0);
}

function createPrismaClient() {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) throw new Error("Database connection URL is not configured.");

  const pool = new Pool({ connectionString: databaseUrl, maxUses: 1 });
  return new PrismaClient({
    adapter: new PrismaPg(pool),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
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
