ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredById" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX IF NOT EXISTS "User_referredById_idx" ON "User"("referredById");

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
);

CREATE INDEX IF NOT EXISTS "WalletLedger_userId_createdAt_idx" ON "WalletLedger"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "WalletLedger_type_createdAt_idx" ON "WalletLedger"("type", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "WalletLedger_sourceType_sourceId_key" ON "WalletLedger"("sourceType", "sourceId");

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
);

CREATE INDEX IF NOT EXISTS "WithdrawalRequest_userId_createdAt_idx" ON "WithdrawalRequest"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "WithdrawalRequest_status_createdAt_idx" ON "WithdrawalRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "WithdrawalRequest_noticeClearAt_idx" ON "WithdrawalRequest"("noticeClearAt");
