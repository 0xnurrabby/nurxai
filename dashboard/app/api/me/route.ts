import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const sub = await prisma.subscription.findFirst({
    where: { userId: user.id, status: "active", endsAt: { gt: new Date() } },
    orderBy: { endsAt: "desc" }
  });

  const day = new Date().toISOString().slice(0, 10);
  const usage = await prisma.usageLog.findUnique({
    where: { userId_day: { userId: user.id, day } }
  });

  const isAdmin = isAdminEmail(user.email);
  if (user.isAdmin !== isAdmin) {
    await prisma.user.update({ where: { id: user.id }, data: { isAdmin } });
  }

  const usageHistory = await prisma.usageLog.findMany({
    where: { userId: user.id },
    orderBy: { day: "desc" },
    take: 14
  });

  const totalUsage = await prisma.usageLog.aggregate({
    _sum: { count: true },
    where: { userId: user.id }
  });

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, isAdmin },
    subscription: sub
      ? {
          plan: sub.plan,
          startsAt: sub.startsAt.toISOString(),
          endsAt: sub.endsAt.toISOString(),
          dailyLimit: PLANS[sub.plan as PlanKey]?.dailyLimit ?? 0
        }
      : null,
    usageToday: usage?.count ?? 0,
    usageHistory,
    totalUsage: totalUsage._sum.count || 0
  });
}
