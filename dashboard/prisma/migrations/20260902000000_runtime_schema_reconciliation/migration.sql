-- Reconcile schema that was previously created only by request-time guards.
BEGIN;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "chatReadAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Announcement" (
  "id" TEXT NOT NULL,
  "title" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "body" TEXT NOT NULL;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

CREATE TABLE IF NOT EXISTS "AnnouncementRead" (
  "id" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AnnouncementRead" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;
ALTER TABLE "AnnouncementRead" ADD COLUMN IF NOT EXISTS "announcementId" TEXT NOT NULL;
ALTER TABLE "AnnouncementRead" ADD COLUMN IF NOT EXISTS "userId" TEXT NOT NULL;
ALTER TABLE "AnnouncementRead" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "userId" TEXT NOT NULL;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "body" TEXT NOT NULL;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public."Announcement"'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE "Announcement"
      ADD CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public."AnnouncementRead"'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE "AnnouncementRead"
      ADD CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public."ChatMessage"'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE "ChatMessage"
      ADD CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id");
  END IF;

END $$;

-- Normalize foreign keys that legacy runtime DDL created without ON UPDATE CASCADE.
ALTER TABLE "AnnouncementRead" DROP CONSTRAINT IF EXISTS "AnnouncementRead_announcementId_fkey";
ALTER TABLE "AnnouncementRead"
  ADD CONSTRAINT "AnnouncementRead_announcementId_fkey"
  FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnnouncementRead" DROP CONSTRAINT IF EXISTS "AnnouncementRead_userId_fkey";
ALTER TABLE "AnnouncementRead"
  ADD CONSTRAINT "AnnouncementRead_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage" DROP CONSTRAINT IF EXISTS "ChatMessage_userId_fkey";
ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WalletLedger" DROP CONSTRAINT IF EXISTS "WalletLedger_userId_fkey";
ALTER TABLE "WalletLedger"
  ADD CONSTRAINT "WalletLedger_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WithdrawalRequest" DROP CONSTRAINT IF EXISTS "WithdrawalRequest_userId_fkey";
ALTER TABLE "WithdrawalRequest"
  ADD CONSTRAINT "WithdrawalRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- @updatedAt is maintained by Prisma, not by a database default.
ALTER TABLE "WithdrawalRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "PaygPricing" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "Announcement_createdAt_idx"
ON "Announcement"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementRead_announcementId_userId_key"
ON "AnnouncementRead"("announcementId", "userId");

CREATE INDEX IF NOT EXISTS "AnnouncementRead_userId_readAt_idx"
ON "AnnouncementRead"("userId", "readAt");

CREATE INDEX IF NOT EXISTS "ChatMessage_createdAt_idx"
ON "ChatMessage"("createdAt");

CREATE INDEX IF NOT EXISTS "ChatMessage_userId_createdAt_idx"
ON "ChatMessage"("userId", "createdAt");

COMMIT;
