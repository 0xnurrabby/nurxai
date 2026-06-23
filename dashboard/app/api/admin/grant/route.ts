import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { PLANS, PlanKey } from "@/lib/plans";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

function parsePositiveDays(value: unknown) {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0 || days > 3650) return null;
  return Math.floor(days);
}

async function getActiveSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId, status: "active", endsAt: { gt: new Date() } },
    orderBy: { endsAt: "desc" }
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { userId, plan, days, action, endsAt } = await req.json().catch(() => ({}));
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "MISSING_USER" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });

  if (action === "revoke") {
    const result = await prisma.subscription.updateMany({
      where: { userId, status: "active" },
      data: { status: "revoked", endsAt: new Date() }
    });
    await prisma.auditLog.create({
      data: { userId: admin.id, event: "admin_revoke", meta: { targetId: userId, count: result.count } as any }
    });
    return NextResponse.json({ ok: true, action: "revoked", count: result.count });
  }

  if (action === "extend") {
    const extraDays = parsePositiveDays(days);
    if (!extraDays) return NextResponse.json({ error: "BAD_DAYS" }, { status: 400 });

    const active = await getActiveSubscription(userId);
    if (!active) return NextResponse.json({ error: "NO_ACTIVE_SUBSCRIPTION" }, { status: 400 });

    const updated = await prisma.subscription.update({
      where: { id: active.id },
      data: { endsAt: new Date(active.endsAt.getTime() + extraDays * DAY_MS) }
    });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        event: "admin_extend_subscription",
        meta: { targetId: userId, subscriptionId: active.id, days: extraDays, endsAt: updated.endsAt } as any
      }
    });
    return NextResponse.json({ ok: true, action: "extended", subscription: updated });
  }

  if (action === "setExpiry") {
    const date = new Date(endsAt);
    if (!endsAt || Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "BAD_ENDS_AT" }, { status: 400 });
    }

    const active = await getActiveSubscription(userId);
    if (!active) return NextResponse.json({ error: "NO_ACTIVE_SUBSCRIPTION" }, { status: 400 });

    const updated = await prisma.subscription.update({
      where: { id: active.id },
      data: { endsAt: date, status: date > new Date() ? "active" : "expired" }
    });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        event: "admin_set_subscription_expiry",
        meta: { targetId: userId, subscriptionId: active.id, endsAt: date.toISOString() } as any
      }
    });
    return NextResponse.json({ ok: true, action: "setExpiry", subscription: updated });
  }

  const selectedPlan = PLANS[plan as PlanKey];
  if (!selectedPlan) return NextResponse.json({ error: "BAD_PLAN" }, { status: 400 });

  const customDays = parsePositiveDays(days) || selectedPlan.days;

  await prisma.subscription.updateMany({
    where: { userId, status: "active" },
    data: { status: "replaced" }
  });

  const sub = await prisma.subscription.create({
    data: {
      userId,
      plan,
      status: "active",
      endsAt: new Date(Date.now() + customDays * DAY_MS)
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      event: "admin_grant",
      meta: { targetId: userId, plan, days: customDays, subscriptionId: sub.id } as any
    }
  });

  return NextResponse.json({ ok: true, action: "granted", subscription: sub });
}
