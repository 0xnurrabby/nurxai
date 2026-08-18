CREATE TABLE IF NOT EXISTS "PaygGeneration" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "authorizationId" TEXT,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "settlementStartBlock" BIGINT,
  "payer" TEXT,
  "transactionHash" TEXT,
  "settlement" JSONB,
  "response" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaygGeneration_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaygGeneration" ADD COLUMN IF NOT EXISTS "authorizationId" TEXT;
ALTER TABLE "PaygGeneration" ADD COLUMN IF NOT EXISTS "leaseToken" TEXT;
ALTER TABLE "PaygGeneration" ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "PaygGeneration" ADD COLUMN IF NOT EXISTS "settlementStartBlock" BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS "PaygGeneration_transactionHash_key" ON "PaygGeneration"("transactionHash");
CREATE UNIQUE INDEX IF NOT EXISTS "PaygGeneration_authorizationId_key" ON "PaygGeneration"("authorizationId");
CREATE INDEX IF NOT EXISTS "PaygGeneration_userId_createdAt_idx" ON "PaygGeneration"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaygGeneration_status_updatedAt_idx" ON "PaygGeneration"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "PaygGeneration_status_leaseExpiresAt_idx" ON "PaygGeneration"("status", "leaseExpiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PaygGeneration_activeUser_key" ON "PaygGeneration"("userId")
  WHERE "status" IN ('verified', 'generating', 'ready_to_settle', 'settling');
CREATE UNIQUE INDEX IF NOT EXISTS "PaygGeneration_activePayer_key" ON "PaygGeneration"("payer")
  WHERE "payer" IS NOT NULL AND "status" IN ('verified', 'generating', 'ready_to_settle', 'settling');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PaygGeneration_userId_fkey'
  ) THEN
    ALTER TABLE "PaygGeneration"
      ADD CONSTRAINT "PaygGeneration_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
