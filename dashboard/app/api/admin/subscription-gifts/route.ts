import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { ensureRuntimeSchema } from "@/lib/schema-guard";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDays(value: unknown) {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0 || days > 3650) return null;
  return Math.floor(days);
}

function cleanNote(value: unknown) {
  if (typeof value !== "string") return null;
  const note = value.trim().slice(0, 500);
  return note || null;
}

function addDays(current: Date, deltaDays: number) {
  return new Date(current.getTime() + deltaDays * DAY_MS);
}

function subscriptionStatusFor(endsAt: Date) {
  return endsAt > new Date() ? "active" : "expired";
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensureRuntimeSchema();

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const nextDays = parseDays(body.days);
  const note = cleanNote(body.note);
  if (!id) return NextResponse.json({ error: "MISSING_GIFT" }, { status: 400 });
  if (!nextDays) return NextResponse.json({ error: "BAD_DAYS" }, { status: 400 });

  const gift = await prisma.subscriptionGift.findUnique({
    where: { id },
    include: { subscription: true }
  });
  if (!gift || !gift.active) return NextResponse.json({ error: "GIFT_NOT_FOUND" }, { status: 404 });
  if (gift.subscription.status !== "active" || gift.subscription.endsAt <= new Date()) {
    return NextResponse.json({ error: "SUBSCRIPTION_NOT_ACTIVE" }, { status: 400 });
  }

  const deltaDays = nextDays - gift.days;
  const result = await prisma.$transaction(async (tx) => {
    const nextEndsAt = addDays(gift.subscription.endsAt, deltaDays);
    const subscription = deltaDays === 0
      ? gift.subscription
      : await tx.subscription.update({
          where: { id: gift.subscriptionId },
          data: {
            endsAt: nextEndsAt,
            status: subscriptionStatusFor(nextEndsAt)
          }
        });
    const updatedGift = await tx.subscriptionGift.update({
      where: { id },
      data: { days: nextDays, note }
    });
    await tx.auditLog.create({
      data: {
        userId: admin.id,
        event: "admin_update_subscription_gift",
        meta: {
          targetId: gift.userId,
          subscriptionId: gift.subscriptionId,
          giftId: gift.id,
          previousDays: gift.days,
          days: nextDays,
          deltaDays,
          note
        } as any
      }
    });
    return { gift: updatedGift, subscription };
  });

  return NextResponse.json({ ok: true, ...result });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensureRuntimeSchema();

  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "MISSING_GIFT" }, { status: 400 });

  const gift = await prisma.subscriptionGift.findUnique({
    where: { id },
    include: { subscription: true }
  });
  if (!gift || !gift.active) return NextResponse.json({ error: "GIFT_NOT_FOUND" }, { status: 404 });
  if (gift.subscription.status !== "active" || gift.subscription.endsAt <= new Date()) {
    return NextResponse.json({ error: "SUBSCRIPTION_NOT_ACTIVE" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const nextEndsAt = addDays(gift.subscription.endsAt, -gift.days);
    const subscription = await tx.subscription.update({
      where: { id: gift.subscriptionId },
      data: {
        endsAt: nextEndsAt,
        status: subscriptionStatusFor(nextEndsAt)
      }
    });
    const removedGift = await tx.subscriptionGift.update({
      where: { id },
      data: { active: false }
    });
    await tx.auditLog.create({
      data: {
        userId: admin.id,
        event: "admin_remove_subscription_gift",
        meta: {
          targetId: gift.userId,
          subscriptionId: gift.subscriptionId,
          giftId: gift.id,
          days: gift.days,
          note: gift.note
        } as any
      }
    });
    return { gift: removedGift, subscription };
  });

  return NextResponse.json({ ok: true, ...result });
}
