import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, isAdminEmail } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { getCurrentSubscriptionForUser } from "@/lib/billing";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensureRuntimeSchema();

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("q") || "";

  const users = await prisma.user.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } }
          ]
        }
      : {},
    include: {
      subscriptions: {
        orderBy: { endsAt: "desc" },
        take: 3
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          provider: true,
          providerId: true,
          providerPaymentId: true,
          amount: true,
          currency: true,
          plan: true,
          status: true,
          createdAt: true
        }
      },
      referredBy: {
        select: { id: true, email: true, name: true, referralCode: true }
      },
      _count: { select: { payments: true, generations: true, projects: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  // Aggregate per-user token + cost in a single query.
  const userIds = users.map((u) => u.id);
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const [stats, todayUsage, activeSubscriptions, queuedPaidSubscriptions, walletLedger, withdrawals] = userIds.length === 0
    ? [[], [], [], [], [], []]
    : await Promise.all([
        prisma.generation.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds } },
          _sum: { inputTokens: true, outputTokens: true, costUSD: true }
        }),
        prisma.usageLog.findMany({
          where: { userId: { in: userIds }, day: today },
          select: { userId: true, count: true }
        }),
        prisma.subscription.findMany({
          where: {
            userId: { in: userIds },
            status: "active",
            startsAt: { lte: now },
            endsAt: { gt: now }
          },
          orderBy: { endsAt: "desc" }
        }),
        prisma.subscription.findMany({
          where: {
            userId: { in: userIds },
            status: "active",
            startsAt: { gt: now },
            endsAt: { gt: now },
            plan: { in: ["starter", "pro", "premium"] }
          },
          select: { userId: true },
          distinct: ["userId"]
        }),
        prisma.walletLedger.groupBy({
          by: ["userId", "type"],
          where: { userId: { in: userIds } },
          _sum: { amountUSD: true }
        }),
        prisma.withdrawalRequest.groupBy({
          by: ["userId", "status"],
          where: { userId: { in: userIds }, status: { in: ["pending", "paid"] } },
          _sum: { amountUSD: true }
        })
      ]);
  const statsByUser = new Map(stats.map((s) => [s.userId, s]));
  const todayByUser = new Map(todayUsage.map((u) => [u.userId, u.count]));
  const activeSubByUser = new Map<string, (typeof activeSubscriptions)[number]>();
  for (const subscription of activeSubscriptions) {
    if (!activeSubByUser.has(subscription.userId)) activeSubByUser.set(subscription.userId, subscription);
  }
  const queuedPaidUserIds = new Set(queuedPaidSubscriptions.map((subscription) => subscription.userId));
  const promotableUserIds = userIds.filter((userId) => {
    const subscription = activeSubByUser.get(userId);
    return subscription?.plan === "trial" && queuedPaidUserIds.has(userId);
  });
  const promotedSubscriptions = await Promise.all(
    promotableUserIds.map((userId) => getCurrentSubscriptionForUser(userId, prisma, now))
  );
  promotableUserIds.forEach((userId, index) => {
    const subscription = promotedSubscriptions[index];
    if (subscription) activeSubByUser.set(userId, subscription);
  });
  const walletByUser = new Map(userIds.map((userId) => [userId, {
    balanceUSD: 0,
    earnedUSD: 0,
    spentUSD: 0,
    withdrawnUSD: 0,
    pendingWithdrawUSD: 0
  }]));
  for (const row of walletLedger) {
    const wallet = walletByUser.get(row.userId);
    if (!wallet) continue;
    const amount = Number(row._sum.amountUSD || 0);
    wallet.balanceUSD += amount;
    if (row.type === "referral_bonus") wallet.earnedUSD += amount;
    if (row.type === "subscription_purchase") wallet.spentUSD += Math.abs(amount);
  }
  for (const row of withdrawals) {
    const wallet = walletByUser.get(row.userId);
    if (!wallet) continue;
    const amount = Number(row._sum.amountUSD || 0);
    if (row.status === "paid") wallet.withdrawnUSD = amount;
    if (row.status === "pending") wallet.pendingWithdrawUSD = amount;
  }

  const enriched = users.map((u) => {
    const s = statsByUser.get(u.id);
    const activeSub = activeSubByUser.get(u.id);
    return {
      ...u,
      isAdmin: isAdminEmail(u.email),
      activeSubscription: activeSub || null,
      wallet: Object.fromEntries(
        Object.entries(walletByUser.get(u.id)!).map(([key, value]) => [key, Number(value.toFixed(2))])
      ),
      gen: {
        total: u._count.generations,
        usedToday: todayByUser.get(u.id) || 0,
        inputTokens: s?._sum.inputTokens || 0,
        outputTokens: s?._sum.outputTokens || 0,
        costUSD: s?._sum.costUSD?.toString() || "0"
      }
    };
  });
  return NextResponse.json({ users: enriched });
}
