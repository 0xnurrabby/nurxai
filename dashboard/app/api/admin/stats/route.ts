import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user?.isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const today = new Date().toISOString().slice(0, 10);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeSubs,
    totalPayments,
    todayUsage,
    revenue,
    tokensAll,
    tokensToday,
    tokens30d,
    costAll
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
    prisma.generation.aggregate({ _sum: { costUSD: true } })
  ]);

  return NextResponse.json({
    totalUsers,
    activeSubs,
    totalPayments,
    todayUsage: todayUsage._sum.count || 0,
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
    profitMargin: {
      revenue: parseFloat(revenue._sum.amount?.toString() || "0"),
      cost: parseFloat(costAll._sum.costUSD?.toString() || "0"),
      profit:
        parseFloat(revenue._sum.amount?.toString() || "0") -
        parseFloat(costAll._sum.costUSD?.toString() || "0")
    }
  });
}
