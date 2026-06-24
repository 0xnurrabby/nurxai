import { NextRequest, NextResponse } from "next/server";
import { NowPaymentsSDK, normalizePaymentStatus, PaymentStatus } from "@nowpaymentsio/nowpayments-sdk-nodejs";
import { prisma } from "@/lib/db";
import { PLANS, PlanKey } from "@/lib/plans";
import { ensureRuntimeSchema } from "@/lib/schema-guard";

export const runtime = "nodejs";

const PAID_STATUSES: PaymentStatus[] = ["paid"];
const FAILED_STATUSES: PaymentStatus[] = ["failed", "expired", "cancelled", "refunded"];

function getNowPaymentsKey() {
  return process.env.NOWPAYMENTS_API_KEY || process.env.NOWPAYMENTS_KEY || "webhook-only";
}

function recoverOrder(orderId: string) {
  const match = /^nurxai_(.+)_(trial|starter|pro|premium)_(\d+)$/.exec(orderId);
  if (!match) return null;
  return { userId: match[1], plan: match[2] as PlanKey };
}

function mergeRaw(previous: unknown, body: Record<string, unknown>) {
  const existing =
    previous && typeof previous === "object" && !Array.isArray(previous)
      ? (previous as Record<string, unknown>)
      : {};
  return {
    ...existing,
    lastWebhook: body,
    lastWebhookAt: new Date().toISOString()
  };
}

async function activateSubscription(paymentId: string, rawStatus: string | null, body: Record<string, unknown>) {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status === "confirmed") return;

    const plan = PLANS[payment.plan as PlanKey];
    if (!plan) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { raw: mergeRaw(payment.raw, { ...body, ignoredReason: "BAD_PLAN" }) as any }
      });
      return;
    }

    const existing = await tx.subscription.findFirst({
      where: { userId: payment.userId, status: "active", endsAt: { gt: new Date() } },
      orderBy: { endsAt: "desc" }
    });
    const baseDate = existing ? existing.endsAt : new Date();
    const endsAt = new Date(baseDate.getTime() + plan.days * 24 * 60 * 60 * 1000);

    if (existing) {
      await tx.subscription.update({
        where: { id: existing.id },
        data: { status: "replaced" }
      });
    }

    await tx.subscription.create({
      data: {
        userId: payment.userId,
        plan: payment.plan,
        status: "active",
        dailyLimit: plan.dailyLimit,
        endsAt
      }
    });

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "confirmed",
        providerPaymentId:
          String(body.payment_id || body.invoice_id || payment.providerPaymentId || "").trim() || null,
        txHash: String(body.payin_hash || body.payout_hash || payment.txHash || "").trim() || null,
        raw: mergeRaw(payment.raw, { ...body, normalizedStatus: "paid", rawStatus }) as any
      }
    });

    await tx.auditLog.create({
      data: {
        userId: payment.userId,
        event: "subscription_activated",
        meta: {
          provider: "nowpayments",
          paymentId: payment.id,
          orderId: payment.providerId,
          providerPaymentId: body.payment_id || body.invoice_id || null,
          plan: payment.plan,
          dailyLimit: plan.dailyLimit,
          endsAt: endsAt.toISOString()
        } as any
      }
    });
  });
}

export async function POST(req: NextRequest) {
  await ensureRuntimeSchema();
  const raw = await req.text();
  const sig = req.headers.get("x-nowpayments-sig") || "";
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "MISSING_IPN_SECRET" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
  }

  const sdk = new NowPaymentsSDK({
    apiKey: getNowPaymentsKey(),
    ipnSecret: secret
  });

  let event;
  try {
    event = sdk.parseWebhook(body, sig);
  } catch (error) {
    console.error("Invalid NOWPayments webhook signature:", error);
    return NextResponse.json({ ok: false, error: "BAD_SIGNATURE" }, { status: 401 });
  }

  if (event.type !== "payment.status_changed") {
    return NextResponse.json({ ok: true, ignored: "unknown_event" });
  }

  const orderId = event.payment.order_id || String(body.order_id || "");
  if (!orderId) return NextResponse.json({ ok: true, ignored: "missing_order_id" });

  let payment = await prisma.payment.findUnique({ where: { providerId: orderId } });
  if (!payment) {
    const recovered = recoverOrder(orderId);
    if (!recovered) return NextResponse.json({ ok: true, ignored: "unknown_order" });

    const plan = PLANS[recovered.plan];
    payment = await prisma.payment.create({
      data: {
        userId: recovered.userId,
        provider: "nowpayments",
        providerId: orderId,
        providerPaymentId: event.payment.payment_id || event.payment.invoice_id || null,
        amount: plan.priceUSD,
        currency: "USD",
        plan: recovered.plan,
        status: "waiting",
        raw: { recoveredFromWebhook: true, firstWebhook: body } as any
      }
    });
  }

  const rawStatus = event.payment.payment_status || String(body.payment_status || "");
  const normalizedStatus = event.payment.status || normalizePaymentStatus(rawStatus);

  if (PAID_STATUSES.includes(normalizedStatus)) {
    await activateSubscription(payment.id, rawStatus, body);
  } else if (FAILED_STATUSES.includes(normalizedStatus)) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "failed",
        providerPaymentId: event.payment.payment_id || event.payment.invoice_id || payment.providerPaymentId,
        raw: mergeRaw(payment.raw, { ...body, normalizedStatus }) as any
      }
    });
  } else {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "waiting",
        providerPaymentId: event.payment.payment_id || event.payment.invoice_id || payment.providerPaymentId,
        raw: mergeRaw(payment.raw, { ...body, normalizedStatus }) as any
      }
    });
  }

  return NextResponse.json({ ok: true, status: normalizedStatus });
}
