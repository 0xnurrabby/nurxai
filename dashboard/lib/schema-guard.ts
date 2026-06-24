import { prisma } from "@/lib/db";

let schemaReady: Promise<void> | null = null;

async function verifyRuntimeSchema() {
  await Promise.all([
    prisma.$queryRawUnsafe('SELECT "chatReadAt" FROM "User" LIMIT 0'),
    prisma.$queryRawUnsafe('SELECT "id" FROM "ChatMessage" LIMIT 0'),
    prisma.$queryRawUnsafe('SELECT "id" FROM "AnnouncementRead" LIMIT 0')
  ]);
}

function runRuntimeMigration() {
  const legacyCleanup = process.env.RUN_LEGACY_DB_CLEANUP === "1"
    ? [
        prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "XAccountUsageLog"'),
        prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "XAccount"'),
        prisma.$executeRawUnsafe('UPDATE "Generation" SET "suggestions" = \'[]\'::jsonb WHERE "suggestions" <> \'[]\'::jsonb')
      ]
    : [];

  return prisma.$transaction([
    prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT'),
    prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authProvider" TEXT NOT NULL DEFAULT \'password\''),
    prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT'),
    prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "chatReadAt" TIMESTAMP(3)'),
    prisma.$executeRawUnsafe('ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL'),
    prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId")'),
    prisma.$executeRawUnsafe('ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "providerPaymentId" TEXT'),
    prisma.$executeRawUnsafe('ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "raw" JSONB'),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Payment_providerPaymentId_idx" ON "Payment"("providerPaymentId")'),
    prisma.$executeRawUnsafe('ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "dailyLimit" INTEGER'),
    prisma.$executeRawUnsafe('ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "usageDetails" JSONB'),
    prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Announcement" (
        "id" TEXT PRIMARY KEY,
        "title" TEXT,
        "body" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdBy" TEXT
      )
    `),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Announcement_createdAt_idx" ON "Announcement"("createdAt")'),
    prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AnnouncementRead" (
        "id" TEXT PRIMARY KEY,
        "announcementId" TEXT NOT NULL REFERENCES "Announcement"("id") ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementRead_announcementId_userId_key" ON "AnnouncementRead"("announcementId", "userId")'),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AnnouncementRead_userId_readAt_idx" ON "AnnouncementRead"("userId", "readAt")'),
    prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ChatMessage" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "body" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt")'),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ChatMessage_userId_createdAt_idx" ON "ChatMessage"("userId", "createdAt")'),
    ...legacyCleanup
  ]).then(() => undefined);
}

export function ensureRuntimeSchema() {
  schemaReady ??= verifyRuntimeSchema().catch(runRuntimeMigration);

  return schemaReady;
}
