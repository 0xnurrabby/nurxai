import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, isAdminEmail } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";

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
      _count: { select: { payments: true, generations: true, projects: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  // Aggregate per-user token + cost in a single query.
  const userIds = users.map((u) => u.id);
  const stats =
    userIds.length === 0
      ? []
      : await prisma.generation.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds } },
          _sum: { inputTokens: true, outputTokens: true, costUSD: true }
        });
  const statsByUser = new Map(stats.map((s) => [s.userId, s]));

  // Today's per-user usage (from UsageLog).
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const todayUsage =
    userIds.length === 0
      ? []
      : await prisma.usageLog.findMany({
          where: { userId: { in: userIds }, day: today },
          select: { userId: true, count: true }
        });
  const todayByUser = new Map(todayUsage.map((u) => [u.userId, u.count]));

  const enriched = users.map((u) => {
    const s = statsByUser.get(u.id);
    const activeSub = u.subscriptions.find((sub) => sub.status === "active" && sub.startsAt <= now && sub.endsAt > now);
    return {
      ...u,
      isAdmin: isAdminEmail(u.email),
      activeSubscription: activeSub || null,
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
