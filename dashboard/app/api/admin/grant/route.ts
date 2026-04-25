import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";

export const runtime = "nodejs";

async function requireAdmin(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return null;
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user?.isAdmin) return null;
  return user;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { userId, plan, days, action } = await req.json();
  if (!userId) return NextResponse.json({ error: "MISSING_USER" }, { status: 400 });

  if (action === "revoke") {
    await prisma.subscription.updateMany({
      where: { userId, status: "active" },
      data: { status: "revoked", endsAt: new Date() }
    });
    await prisma.auditLog.create({
      data: { userId: admin.id, event: "admin_revoke", meta: { targetId: userId } as any }
    });
    return NextResponse.json({ ok: true, action: "revoked" });
  }

  const p = PLANS[plan as PlanKey];
  if (!p) return NextResponse.json({ error: "BAD_PLAN" }, { status: 400 });

  const customDays = typeof days === "number" && days > 0 ? days : p.days;

  await prisma.subscription.updateMany({
    where: { userId, status: "active" },
    data: { status: "replaced" }
  });

  const endsAt = new Date(Date.now() + customDays * 24 * 60 * 60 * 1000);
  const sub = await prisma.subscription.create({
    data: { userId, plan, status: "active", endsAt }
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      event: "admin_grant",
      meta: { targetId: userId, plan, days: customDays } as any
    }
  });

  return NextResponse.json({ ok: true, subscription: sub });
}
