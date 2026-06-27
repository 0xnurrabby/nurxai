import { prisma } from "@/lib/db";

let schemaReady: Promise<void> | null = null;

async function verifyRuntimeSchema() {
  await Promise.all([
    prisma.$queryRawUnsafe('SELECT "chatReadAt" FROM "User" LIMIT 0'),
    prisma.$queryRawUnsafe('SELECT "referralCode", "referredById" FROM "User" LIMIT 0'),
    prisma.$queryRawUnsafe('SELECT "id" FROM "ChatMessage" LIMIT 0'),
    prisma.$queryRawUnsafe('SELECT "id" FROM "AnnouncementRead" LIMIT 0'),
    prisma.$queryRawUnsafe('SELECT "id" FROM "SubscriptionGift" LIMIT 0'),
    prisma.$queryRawUnsafe('SELECT "id" FROM "WalletLedger" LIMIT 0'),
    prisma.$queryRawUnsafe('SELECT "id" FROM "WithdrawalRequest" LIMIT 0')
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
    prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT'),
    prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredById" TEXT'),
    prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredAt" TIMESTAMP(3)'),
    prisma.$executeRawUnsafe('ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL'),
    prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId")'),
    prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode")'),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "User_referredById_idx" ON "User"("referredById")'),
    prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'User_referredById_fkey'
        ) THEN
          ALTER TABLE "User"
            ADD CONSTRAINT "User_referredById_fkey"
            FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `),
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
    prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SubscriptionGift" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "subscriptionId" TEXT NOT NULL REFERENCES "Subscription"("id") ON DELETE CASCADE,
        "adminId" TEXT,
        "days" INTEGER NOT NULL,
        "note" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "SubscriptionGift_userId_createdAt_idx" ON "SubscriptionGift"("userId", "createdAt")'),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "SubscriptionGift_subscriptionId_idx" ON "SubscriptionGift"("subscriptionId")'),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "SubscriptionGift_active_createdAt_idx" ON "SubscriptionGift"("active", "createdAt")'),
    prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WalletLedger" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "amountUSD" DECIMAL(65,30) NOT NULL,
        "type" TEXT NOT NULL,
        "sourceType" TEXT,
        "sourceId" TEXT,
        "note" TEXT,
        "adminId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "WalletLedger_userId_createdAt_idx" ON "WalletLedger"("userId", "createdAt")'),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "WalletLedger_type_createdAt_idx" ON "WalletLedger"("type", "createdAt")'),
    prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "WalletLedger_sourceType_sourceId_key" ON "WalletLedger"("sourceType", "sourceId")'),
    prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WithdrawalRequest" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "amountUSD" DECIMAL(65,30) NOT NULL,
        "network" TEXT NOT NULL DEFAULT 'BEP20_USDT',
        "address" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "userNote" TEXT,
        "adminNote" TEXT,
        "txHash" TEXT,
        "paidAt" TIMESTAMP(3),
        "rejectedAt" TIMESTAMP(3),
        "noticeSeenAt" TIMESTAMP(3),
        "noticeClearAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "WithdrawalRequest_userId_createdAt_idx" ON "WithdrawalRequest"("userId", "createdAt")'),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "WithdrawalRequest_status_createdAt_idx" ON "WithdrawalRequest"("status", "createdAt")'),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "WithdrawalRequest_noticeClearAt_idx" ON "WithdrawalRequest"("noticeClearAt")'),
    ...legacyCleanup
  ]).then(() => undefined);
}

export function ensureRuntimeSchema() {
  schemaReady ??= verifyRuntimeSchema().catch(runRuntimeMigration);

  return schemaReady;
}
