-- Extra payment metadata for NOWPayments hosted checkout and richer admin review.
ALTER TABLE "Payment" ADD COLUMN "providerPaymentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "raw" JSONB;

CREATE INDEX "Payment_providerPaymentId_idx" ON "Payment"("providerPaymentId");
