import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { PLAN_COST_MODEL } from "@/lib/plans";

export const runtime = "nodejs";

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensureRuntimeSchema();

  const today = dayKey(new Date());
  const now = new Date();
  const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const last30dKey = dayKey(last30d);
  const costPerComment = PLAN_COST_MODEL.estimatedCostPerCommentUSD;

  const [
    totalUsers,
    activeSubs,
    todayUsage,
    monthlyUsage,
    totalUsage
  ] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count({ where: { status: "active", startsAt: { lte: now }, endsAt: { gt: now } } }),
    prisma.usageLog.aggregate({ _sum: { count: true }, where: { day: today } }),
    prisma.usageLog.aggregate({ _sum: { count: true }, where: { day: { gte: last30dKey } } }),
    prisma.usageLog.aggregate({ _sum: { count: true } })
  ]);

  const todayComments = todayUsage._sum.count || 0;
  const monthlyComments = monthlyUsage._sum.count || 0;
  const totalComments = totalUsage._sum.count || 0;

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
      todayUSD: todayComments * costPerComment,
      monthlyUSD: monthlyComments * costPerComment,
      totalUSD: totalComments * costPerComment
    }
  });
}
