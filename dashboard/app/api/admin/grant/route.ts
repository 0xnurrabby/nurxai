import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { PLANS, PlanKey } from "@/lib/plans";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { creditReferralBonus } from "@/lib/referrals";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

function parsePositiveDays(value: unknown) {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0 || days > 3650) return null;
  return Math.floor(days);
}

function cleanNote(value: unknown) {
  if (typeof value !== "string") return null;
  const note = value.trim().slice(0, 500);
  return note || null;
}

async function getActiveSubscription(userId: string) {
  const now = new Date();
  return prisma.subscription.findFirst({
    where: { userId, status: "active", startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { endsAt: "desc" }
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensureRuntimeSchema();

  const { userId, plan, days, action, endsAt, note, grantReferralBonus, referralBonusBaseUSD } = await req.json().catch(() => ({}));
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

    const cleanedNote = cleanNote(note);

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id: active.id },
        data: { endsAt: new Date(active.endsAt.getTime() + extraDays * DAY_MS) }
      });
      const gift = await tx.subscriptionGift.create({
        data: {
          userId,
          subscriptionId: active.id,
          adminId: admin.id,
          days: extraDays,
          note: cleanedNote
        }
      });
      await tx.auditLog.create({
        data: {
          userId: admin.id,
          event: "admin_extend_subscription",
          meta: {
            targetId: userId,
            subscriptionId: active.id,
            giftId: gift.id,
            days: extraDays,
            note: cleanedNote,
            endsAt: updated.endsAt
          } as any
        }
      });
      return { updated, gift };
    });

    return NextResponse.json({ ok: true, action: "extended", subscription: result.updated, gift: result.gift });
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

  const result = await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { userId, status: "active" },
      data: { status: "replaced" }
    });

    const sub = await tx.subscription.create({
      data: {
        userId,
        plan,
        status: "active",
        dailyLimit: selectedPlan.dailyLimit,
        endsAt: new Date(Date.now() + customDays * DAY_MS)
      }
    });

    const bonusBase = Number(referralBonusBaseUSD);
    const bonusBaseUSD =
      Number.isFinite(bonusBase) && bonusBase > 0
        ? Number(bonusBase.toFixed(2))
        : selectedPlan.priceUSD;

    const referralBonus =
      grantReferralBonus === true && bonusBaseUSD > 0
        ? await creditReferralBonus(
            tx,
            { id: sub.id, userId, plan, amount: bonusBaseUSD },
            {
              sourceType: "admin_grant_referral_bonus",
              sourceId: sub.id,
              adminId: admin.id,
              note: `Manual admin-approved 10% referral bonus for ${selectedPlan.name} grant ($${bonusBaseUSD.toFixed(2)} base).`
            }
          )
        : null;

    await tx.auditLog.create({
      data: {
        userId: admin.id,
        event: "admin_grant",
        meta: {
          targetId: userId,
          plan,
          days: customDays,
          dailyLimit: selectedPlan.dailyLimit,
          subscriptionId: sub.id,
          referralBonusRequested: grantReferralBonus === true,
          referralBonusBaseUSD: bonusBaseUSD,
          referralBonusId: referralBonus?.ledger.id || null,
          referralBonusUSD: referralBonus ? Number(referralBonus.ledger.amountUSD) : 0
        } as any
      }
    });
    return { sub, referralBonus };
  });

  return NextResponse.json({
    ok: true,
    action: "granted",
    subscription: result.sub,
    referralBonus: result.referralBonus
      ? { id: result.referralBonus.ledger.id, amountUSD: Number(result.referralBonus.ledger.amountUSD) }
      : null
  });
}
