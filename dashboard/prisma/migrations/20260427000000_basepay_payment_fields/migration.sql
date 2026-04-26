-- Add Base Pay support to the Payment table.
-- New nullable columns so existing NOWPayments rows are unaffected.
ALTER TABLE "Payment" ADD COLUMN "txHash" TEXT;
ALTER TABLE "Payment" ADD COLUMN "payerAddr" TEXT;

-- Indexes used by the admin views and by replay-protection lookups.
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");
CREATE INDEX "Payment_txHash_idx" ON "Payment"("txHash");
