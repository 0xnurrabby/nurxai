import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUserFromHeader } from "@/lib/auth-helpers";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { getSubscriptionDailyLimit } from "@/lib/subscription-limits";
import { isAdminEmail } from "@/lib/admin";
import { ensureReferralCode, getWalletSummary, REFERRAL_BONUS_RATE } from "@/lib/referrals";
import { getCurrentSubscriptionForUser } from "@/lib/billing";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await getAuthUserFromHeader(req);
  if (!auth?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = auth.user;
  const details = new URL(req.url).searchParams.get("details") || "summary";
  await ensureRuntimeSchema();

  const day = new Date().toISOString().slice(0, 10);
  const now = new Date();
  await ensureReferralCode(prisma, user.id);
  const [sub, usage, profile, wallet, withdrawals] = await Promise.all([
    getCurrentSubscriptionForUser(user.id, prisma, now),
    prisma.usageLog.findUnique({
      where: { userId_day: { userId: user.id, day } },
      select: { count: true }
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        avatarUrl: true,
        name: true,
        referralCode: true,
        referredBy: { select: { email: true, name: true, referralCode: true } },
        _count: { select: { referrals: true } }
      }
    }),
    getWalletSummary(user.id),
    prisma.withdrawalRequest.findMany({
      where: {
        userId: user.id,
        status: { in: ["paid", "rejected"] },
        OR: [{ noticeClearAt: null }, { noticeClearAt: { gt: now } }]
      },
      orderBy: { updatedAt: "desc" },
      take: 5
    })
  ]);
  const giftsPromise = sub
    ? prisma.subscriptionGift.findMany({
        where: { userId: user.id, subscriptionId: sub.id, active: true },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, days: true, note: true, createdAt: true, updatedAt: true }
      })
    : Promise.resolve([]);

  const isAdmin = isAdminEmail(user.email);
  if (user.isAdmin !== isAdmin) {
    void prisma.user.update({ where: { id: user.id }, data: { isAdmin } }).catch(() => {});
  }
  const includeUsageDetails = details === "full" || details === "usage";
  const [usageHistory, totalUsage] = includeUsageDetails
    ? await Promise.all([
        prisma.usageLog.findMany({
          where: { userId: user.id },
          orderBy: { day: "desc" },
          take: 14
        }),
        prisma.usageLog.aggregate({
          _sum: { count: true },
          where: { userId: user.id }
        })
      ])
    : [[], null as Awaited<ReturnType<typeof prisma.usageLog.aggregate>> | null];
  const gifts = await giftsPromise;

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: profile?.name ?? user.name, avatarUrl: profile?.avatarUrl || null, isAdmin },
    referral: {
      code: profile?.referralCode || null,
      link: profile?.referralCode ? `${(process.env.PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.nurxai.xyz").replace(/\/+$/, "")}/signup?ref=${encodeURIComponent(profile.referralCode)}` : null,
      referredBy: profile?.referredBy || null,
      totalReferrals: profile?._count.referrals || 0,
      bonusRate: REFERRAL_BONUS_RATE
    },
    wallet,
    withdrawalNotices: withdrawals.map((item) => ({
      id: item.id,
      amountUSD: Number(item.amountUSD || 0),
      status: item.status,
      adminNote: item.adminNote,
      txHash: item.txHash,
      paidAt: item.paidAt?.toISOString() || null,
      rejectedAt: item.rejectedAt?.toISOString() || null,
      createdAt: item.createdAt.toISOString()
    })),
    subscription: sub
      ? {
          plan: sub.plan,
          startsAt: sub.startsAt.toISOString(),
          endsAt: sub.endsAt.toISOString(),
          dailyLimit: getSubscriptionDailyLimit(sub)
        }
      : null,
    usageToday: usage?.count ?? 0,
    subscriptionGifts: gifts.map((gift) => ({
      ...gift,
      createdAt: gift.createdAt.toISOString(),
      updatedAt: gift.updatedAt.toISOString()
    })),
    ...(includeUsageDetails
      ? {
          usageHistory,
          totalUsage: totalUsage?._sum?.count || 0
        }
      : {})
  });
}
