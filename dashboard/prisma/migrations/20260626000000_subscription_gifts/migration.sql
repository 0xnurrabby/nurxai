-- CreateTable
CREATE TABLE "SubscriptionGift" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "adminId" TEXT,
    "days" INTEGER NOT NULL,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionGift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionGift_userId_createdAt_idx" ON "SubscriptionGift"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionGift_subscriptionId_idx" ON "SubscriptionGift"("subscriptionId");

-- CreateIndex
CREATE INDEX "SubscriptionGift_active_createdAt_idx" ON "SubscriptionGift"("active", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionGift" ADD CONSTRAINT "SubscriptionGift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionGift" ADD CONSTRAINT "SubscriptionGift_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
