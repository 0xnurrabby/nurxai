ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "lastReconciledAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Payment_provider_status_lastReconciledAt_idx"
ON "Payment"("provider", "status", "lastReconciledAt");
