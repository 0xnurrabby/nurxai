ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "EmailOtpChallenge" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailOtpChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailOtpChallenge_purpose_check" CHECK ("purpose" IN ('signup', 'password_reset')),
  CONSTRAINT "EmailOtpChallenge_attempts_check" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailOtpChallenge_email_purpose_key"
ON "EmailOtpChallenge"("email", "purpose");

CREATE INDEX IF NOT EXISTS "EmailOtpChallenge_expiresAt_idx"
ON "EmailOtpChallenge"("expiresAt");

CREATE TABLE IF NOT EXISTS "AuthRateLimit" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "AuthRateLimit_resetAt_idx"
ON "AuthRateLimit"("resetAt");
