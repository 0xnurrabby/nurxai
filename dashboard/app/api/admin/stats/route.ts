import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user?.isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const [totalUsers, activeSubs, totalPayments, todayUsage] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count({ where: { status: "active", endsAt: { gt: new Date() } } }),
    prisma.payment.count({ where: { status: "confirmed" } }),
    prisma.usageLog.aggregate({
      _sum: { count: true },
      where: { day: new Date().toISOString().slice(0, 10) }
    })
  ]);

  const revenue = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: { status: "confirmed" }
  });

  return NextResponse.json({
    totalUsers,
    activeSubs,
    totalPayments,
    todayUsage: todayUsage._sum.count || 0,
    revenue: revenue._sum.amount?.toString() || "0"
  });
}
