import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

function rateLimitPepper() {
  const pepper = process.env.AUTH_RATE_LIMIT_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("AUTH_RATE_LIMIT_PEPPER is not configured.");
  return pepper;
}

function privateKey(scope: string, identity: string) {
  return `${scope}:${crypto.createHmac("sha256", rateLimitPepper()).update(identity).digest("hex")}`;
}

export function trustedClientIp(req: NextRequest) {
  return req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")?.trim()
    || req.headers.get("x-real-ip")?.trim()
    || "unknown";
}

export async function consumeAuthRateLimit(input: {
  scope: string;
  identity: string;
  max: number;
  windowMs: number;
}) {
  const key = privateKey(input.scope, input.identity);
  const resetAt = new Date(Date.now() + input.windowMs);
  const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
    INSERT INTO "AuthRateLimit" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, ${resetAt}, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "AuthRateLimit"."resetAt" <= NOW() THEN 1
        ELSE "AuthRateLimit"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "AuthRateLimit"."resetAt" <= NOW() THEN EXCLUDED."resetAt"
        ELSE "AuthRateLimit"."resetAt"
      END,
      "updatedAt" = NOW()
    RETURNING "count", "resetAt"
  `;
  const row = rows[0];
  return {
    allowed: Boolean(row && row.count <= input.max),
    retryAfter: row ? Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000)) : 1
  };
}
