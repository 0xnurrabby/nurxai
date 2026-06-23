-- Google sign-in support. Existing password users keep their hashes.
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
ALTER TABLE "User" ADD COLUMN "authProvider" TEXT NOT NULL DEFAULT 'password';
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
