import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensureRuntimeSchema();

  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeSubs,
    todayUsage,
    monthlyUsage,
    totalUsage,
    paygToday,
    paygMonthly,
    paygTotal
  ] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count({ where: { status: "active", startsAt: { lte: now }, endsAt: { gt: now } } }),
    prisma.generation.aggregate({ _count: { _all: true }, _sum: { costUSD: true }, where: { createdAt: { gte: today } } }),
    prisma.generation.aggregate({ _count: { _all: true }, _sum: { costUSD: true }, where: { createdAt: { gte: last30d } } }),
    prisma.generation.aggregate({ _count: { _all: true }, _sum: { costUSD: true } }),
    prisma.paygGeneration.aggregate({
      _count: { _all: true },
      _sum: { quotedCurrentPriceUSD: true },
      where: { status: "completed", updatedAt: { gte: today } }
    }),
    prisma.paygGeneration.aggregate({
      _count: { _all: true },
      _sum: { quotedCurrentPriceUSD: true },
      where: { status: "completed", updatedAt: { gte: last30d } }
    }),
    prisma.paygGeneration.aggregate({
      _count: { _all: true },
      _sum: { quotedCurrentPriceUSD: true },
      where: { status: "completed" }
    })
  ]);

  const todayComments = todayUsage._count._all;
  const monthlyComments = monthlyUsage._count._all;
  const totalComments = totalUsage._count._all;
  const todayCost = Number(todayUsage._sum.costUSD || 0);
  const monthlyCost = Number(monthlyUsage._sum.costUSD || 0);
  const totalCost = Number(totalUsage._sum.costUSD || 0);
  const costPerComment = totalComments ? totalCost / totalComments : 0;

  return NextResponse.json({
    totalUsers,
    activeSubs,
    todayUsage: todayComments,
    totalComments,
    commentCost: {
      perCommentUSD: costPerComment,
      todayComments,
      monthlyComments,
      totalComments,
      todayUSD: todayCost,
      monthlyUSD: monthlyCost,
      totalUSD: totalCost
    },
    paygRevenue: {
      todayCount: paygToday._count._all,
      monthlyCount: paygMonthly._count._all,
      totalCount: paygTotal._count._all,
      todayUSD: Number(paygToday._sum.quotedCurrentPriceUSD || 0),
      monthlyUSD: Number(paygMonthly._sum.quotedCurrentPriceUSD || 0),
      totalUSD: Number(paygTotal._sum.quotedCurrentPriceUSD || 0)
    }
  });
}
