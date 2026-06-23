import { prisma } from "@/lib/db";

let schemaReady: Promise<void> | null = null;

export function ensureRuntimeSchema() {
  schemaReady ??= prisma.$transaction([
    prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT'),
    prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authProvider" TEXT NOT NULL DEFAULT \'password\''),
    prisma.$executeRawUnsafe('ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL'),
    prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId")'),
    prisma.$executeRawUnsafe('ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "providerPaymentId" TEXT'),
    prisma.$executeRawUnsafe('ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "raw" JSONB'),
    prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Payment_providerPaymentId_idx" ON "Payment"("providerPaymentId")')
  ]).then(() => undefined);

  return schemaReady;
}
