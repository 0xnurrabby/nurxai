import { prisma } from "@/lib/db";

let schemaReady: Promise<void> | null = null;

export function ensureRuntimeSchema() {
  schemaReady ??= prisma.$transaction([
    prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT'),
    prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authProvider" TEXT NOT NULL DEFAULT \'password\''),
    prisma.$executeRawUnsafe('ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL'),
    prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId")'),
    prisma.$executeRawUnsafe('ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "providerPaymentId" TEXT'),
    prisma.$executeRawUnsafe('ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "raw" JSONB'),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Payment_providerPaymentId_idx" ON "Payment"("providerPaymentId")'),
    prisma.$executeRawUnsafe('ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "dailyLimit" INTEGER'),
    prisma.$executeRawUnsafe('ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "usageDetails" JSONB'),
    prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "XAccount" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "username" TEXT NOT NULL,
        "displayName" TEXT,
        "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "generationCount" INTEGER NOT NULL DEFAULT 0
      )
    `),
    prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "XAccount_userId_username_key" ON "XAccount"("userId", "username")'),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "XAccount_username_idx" ON "XAccount"("username")'),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "XAccount_lastSeenAt_idx" ON "XAccount"("lastSeenAt")'),
    prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "XAccountUsageLog" (
        "id" TEXT PRIMARY KEY,
        "xAccountId" TEXT NOT NULL REFERENCES "XAccount"("id") ON DELETE CASCADE,
        "day" TEXT NOT NULL,
        "count" INTEGER NOT NULL DEFAULT 0
      )
    `),
    prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "XAccountUsageLog_xAccountId_day_key" ON "XAccountUsageLog"("xAccountId", "day")'),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "XAccountUsageLog_day_idx" ON "XAccountUsageLog"("day")'),
    prisma.$executeRawUnsafe('UPDATE "Generation" SET "suggestions" = \'[]\'::jsonb WHERE "suggestions" <> \'[]\'::jsonb')
  ]).then(() => undefined);

  return schemaReady;
}
