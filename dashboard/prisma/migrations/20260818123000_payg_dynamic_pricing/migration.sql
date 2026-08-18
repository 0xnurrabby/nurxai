CREATE TABLE IF NOT EXISTS "PaygPricing" (
  "id" TEXT NOT NULL,
  "regularPriceUSD" DECIMAL(12,6) NOT NULL,
  "currentPriceUSD" DECIMAL(12,6) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaygPricing_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PaygPricing" (
  "id", "regularPriceUSD", "currentPriceUSD", "revision", "updatedAt"
) VALUES (
  'default', 0.009000, 0.009000, 1, CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "PaygGeneration" ADD COLUMN IF NOT EXISTS "pricingRevision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PaygGeneration" ADD COLUMN IF NOT EXISTS "quotedRegularPriceUSD" DECIMAL(12,6) NOT NULL DEFAULT 0.009000;
ALTER TABLE "PaygGeneration" ADD COLUMN IF NOT EXISTS "quotedCurrentPriceUSD" DECIMAL(12,6) NOT NULL DEFAULT 0.009000;
ALTER TABLE "PaygGeneration" ADD COLUMN IF NOT EXISTS "quotedAmountAtomic" TEXT NOT NULL DEFAULT '9000';
ALTER TABLE "PaygGeneration" ADD COLUMN IF NOT EXISTS "quotedNetwork" TEXT NOT NULL DEFAULT 'eip155:8453';
ALTER TABLE "PaygGeneration" ADD COLUMN IF NOT EXISTS "quotedAsset" TEXT NOT NULL DEFAULT '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
ALTER TABLE "PaygGeneration" ADD COLUMN IF NOT EXISTS "quotedPayTo" TEXT NOT NULL DEFAULT '0xe8Bda2Ed9d2FC622D900C8a76dc455A3e79B041f';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PaygPricing_valid_prices'
  ) THEN
    ALTER TABLE "PaygPricing"
      ADD CONSTRAINT "PaygPricing_valid_prices"
      CHECK (
        "regularPriceUSD" > 0 AND
        "currentPriceUSD" > 0 AND
        "currentPriceUSD" <= "regularPriceUSD" AND
        "revision" > 0
      );
  END IF;
END $$;
