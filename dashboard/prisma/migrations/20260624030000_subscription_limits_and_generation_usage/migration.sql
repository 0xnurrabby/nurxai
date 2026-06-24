-- Snapshot purchased daily limits so active buyers keep their limit until expiry.
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "dailyLimit" INTEGER;

-- Store future per-provider/per-stage metering for admin cost review.
ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "usageDetails" JSONB;
