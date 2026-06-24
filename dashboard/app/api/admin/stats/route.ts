import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { PLAN_COST_MODEL, PLANS } from "@/lib/plans";
import { gateway } from "ai";

export const runtime = "nodejs";

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function summarizeGatewayRows(rows: any[] = []) {
  const sorted = [...rows].sort((a, b) => Number(b.totalCost || 0) - Number(a.totalCost || 0));
  const totals = sorted.reduce(
    (acc, row) => ({
      cost: acc.cost + Number(row.totalCost || 0),
      inputTokens: acc.inputTokens + Number(row.inputTokens || 0),
      outputTokens: acc.outputTokens + Number(row.outputTokens || 0),
      requests: acc.requests + Number(row.requestCount || 0)
    }),
    { cost: 0, inputTokens: 0, outputTokens: 0, requests: 0 }
  );

  return {
    ...totals,
    rows: sorted.slice(0, 8).map((row) => ({
      model: row.model || row.provider || row.tag || "unknown",
      cost: Number(row.totalCost || 0),
      inputTokens: Number(row.inputTokens || 0),
      outputTokens: Number(row.outputTokens || 0),
      requests: Number(row.requestCount || 0)
    }))
  };
}

async function getGatewaySpendReport(startDate: string, endDate: string) {
  if (!process.env.AI_GATEWAY_API_KEY) return null;
  try {
    const report = await Promise.race([
      gateway.getSpendReport({
        startDate,
        endDate,
        groupBy: "model"
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("gateway_report_timeout")), 3500))
    ]);
    return summarizeGatewayRows(report.results);
  } catch (e: any) {
    console.warn("[admin] gateway spend report failed", e?.message || "?");
    return null;
  }
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensureRuntimeSchema();

  const today = dayKey(new Date());
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const last30dKey = dayKey(last30d);

  const [
    totalUsers,
    activeSubs,
    totalPayments,
    todayUsage,
    revenue,
    tokensAll,
    tokensToday,
    tokens30d,
    costAll,
    generationCountAll,
    generationCountToday,
    generationCount30d,
    gatewaySpend30d
  ] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count({ where: { status: "active", endsAt: { gt: new Date() } } }),
    prisma.payment.count({ where: { status: "confirmed" } }),
    prisma.usageLog.aggregate({ _sum: { count: true }, where: { day: today } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "confirmed" } }),
    prisma.generation.aggregate({
      _sum: { inputTokens: true, outputTokens: true, costUSD: true }
    }),
    prisma.generation.aggregate({
      _sum: { inputTokens: true, outputTokens: true, costUSD: true },
      where: { createdAt: { gte: last24h } }
    }),
    prisma.generation.aggregate({
      _sum: { inputTokens: true, outputTokens: true, costUSD: true },
      where: { createdAt: { gte: last30d } }
    }),
    prisma.generation.aggregate({ _sum: { costUSD: true } }),
    prisma.generation.count(),
    prisma.generation.count({ where: { createdAt: { gte: last24h } } }),
    prisma.generation.count({ where: { createdAt: { gte: last30d } } }),
    getGatewaySpendReport(last30dKey, today)
  ]);

  const allCost = parseFloat(costAll._sum.costUSD?.toString() || "0");
  const revenueTotal = parseFloat(revenue._sum.amount?.toString() || "0");
  const avgCostPerComment = generationCountAll > 0 ? allCost / generationCountAll : 0;

  return NextResponse.json({
    totalUsers,
    activeSubs,
    totalPayments,
    todayUsage: todayUsage._sum.count || 0,
    totalComments: generationCountAll,
    revenue: revenue._sum.amount?.toString() || "0",
    tokens: {
      allTime: {
        input: tokensAll._sum.inputTokens || 0,
        output: tokensAll._sum.outputTokens || 0,
        cost: tokensAll._sum.costUSD?.toString() || "0"
      },
      today: {
        input: tokensToday._sum.inputTokens || 0,
        output: tokensToday._sum.outputTokens || 0,
        cost: tokensToday._sum.costUSD?.toString() || "0"
      },
      last30d: {
        input: tokens30d._sum.inputTokens || 0,
        output: tokens30d._sum.outputTokens || 0,
        cost: tokens30d._sum.costUSD?.toString() || "0"
      }
    },
    comments: {
      allTime: generationCountAll,
      today: generationCountToday,
      last30d: generationCount30d,
      avgCostUSD: avgCostPerComment.toFixed(6)
    },
    gatewaySpend: {
      last30d: gatewaySpend30d
    },
    planEconomics: {
      estimatedCostPerCommentUSD: PLAN_COST_MODEL.estimatedCostPerCommentUSD,
      targets: PLAN_COST_MODEL.targetProfitMargin,
      dailyLimits: {
        starter: PLANS.starter.dailyLimit,
        pro: PLANS.pro.dailyLimit,
        premium: PLANS.premium.dailyLimit
      }
    },
    profitMargin: {
      revenue: revenueTotal,
      cost: allCost,
      profit: revenueTotal - allCost
    }
  });
}
