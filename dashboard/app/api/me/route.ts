import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUserFromHeader } from "@/lib/auth-helpers";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { getSubscriptionDailyLimit } from "@/lib/subscription-limits";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await getAuthUserFromHeader(req);
  if (!auth?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = auth.user;
  const details = new URL(req.url).searchParams.get("details") || "summary";
  await ensureRuntimeSchema();

  const day = new Date().toISOString().slice(0, 10);
  const [sub, usage, profile] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId: user.id, status: "active", endsAt: { gt: new Date() } },
      orderBy: { endsAt: "desc" }
    }),
    prisma.usageLog.findUnique({
      where: { userId_day: { userId: user.id, day } },
      select: { count: true }
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true, name: true }
    })
  ]);

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

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: profile?.name ?? user.name, avatarUrl: profile?.avatarUrl || null, isAdmin },
    subscription: sub
      ? {
          plan: sub.plan,
          startsAt: sub.startsAt.toISOString(),
          endsAt: sub.endsAt.toISOString(),
          dailyLimit: getSubscriptionDailyLimit(sub)
        }
      : null,
    usageToday: usage?.count ?? 0,
    ...(includeUsageDetails
      ? {
          usageHistory,
          totalUsage: totalUsage?._sum?.count || 0
        }
      : {})
  });
}
