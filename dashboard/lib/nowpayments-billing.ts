import { NowPaymentsSDK, normalizePaymentStatus, PaymentStatus } from "@nowpaymentsio/nowpayments-sdk-nodejs";
import { prisma } from "@/lib/db";
import { PLANS, PlanKey } from "@/lib/plans";
import { activatePaidSubscription, getUpgradeQuote, paymentRawWithQuote } from "@/lib/billing";
import { creditReferralBonus } from "@/lib/referrals";

const FAILED_STATUSES: PaymentStatus[] = ["failed", "expired", "cancelled", "refunded"];

type PaymentPayload = Record<string, unknown>;
type UpdateSource = "webhook" | "user_reconcile" | "scheduled_reconcile";

function nowPaymentsKey() {
  return process.env.NOWPAYMENTS_API_KEY || process.env.NOWPAYMENTS_KEY;
}

export function nowPaymentsClient() {
  const apiKey = nowPaymentsKey();
  if (!apiKey) throw new Error("NOWPAYMENTS_API_KEY is not configured.");
  return new NowPaymentsSDK({
    apiKey,
    ipnSecret: process.env.NOWPAYMENTS_IPN_SECRET,
    email: process.env.NOWPAYMENTS_EMAIL,
    password: process.env.NOWPAYMENTS_PASSWORD,
    jwtToken: process.env.NOWPAYMENTS_JWT_TOKEN
  });
}

export function canDiscoverNowPaymentsByInvoice() {
  return Boolean(
    process.env.NOWPAYMENTS_JWT_TOKEN ||
    (process.env.NOWPAYMENTS_EMAIL && process.env.NOWPAYMENTS_PASSWORD)
  );
}

function recoverOrder(orderId: string) {
  const match = /^nurxai_(.+)_(trial|starter|pro|premium)_(\d+)$/.exec(orderId);
  if (!match) return null;
  return { userId: match[1], plan: match[2] as PlanKey };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function mergePaymentRaw(
  previous: unknown,
  payload: PaymentPayload,
  source: UpdateSource,
  extra: Record<string, unknown> = {}
) {
  return {
    ...objectValue(previous),
    ...extra,
    lastProviderUpdate: payload,
    lastProviderUpdateAt: new Date().toISOString(),
    lastProviderUpdateSource: source
  };
}

function providerId(payload: PaymentPayload, key: "payment_id" | "invoice_id") {
  const value = payload[key];
  return value === null || value === undefined ? "" : String(value).trim();
}

function validateCompletedPayment(payment: { amount: unknown; currency: string; providerId: string }, payload: PaymentPayload) {
  const orderId = String(payload.order_id || "").trim();
  if (orderId && orderId !== payment.providerId) return "ORDER_MISMATCH";

  const currency = String(payload.price_currency || "").trim().toUpperCase();
  if (currency && currency !== payment.currency.toUpperCase()) return "CURRENCY_MISMATCH";

  const expectedAmount = Number(payment.amount);
  const providerAmount = Number(payload.price_amount);
  if (Number.isFinite(providerAmount) && Math.abs(providerAmount - expectedAmount) > 0.011) {
    return "AMOUNT_MISMATCH";
  }
  return null;
}

async function activateSubscription(paymentId: string, rawStatus: string, payload: PaymentPayload, source: UpdateSource) {
  const existing = await prisma.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
  if (existing?.status === "confirmed") return { activated: false, status: "confirmed" };

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: paymentId, status: { notIn: ["confirmed", "activating"] } },
      data: { status: "activating" }
    });
    if (claimed.count === 0) {
      const existing = await tx.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
      return { activated: false, status: existing?.status || "waiting" };
    }

    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error("Payment disappeared during activation.");
    const plan = PLANS[payment.plan as PlanKey];
    if (!plan || plan.priceUSD <= 0) throw new Error("Payment has an invalid paid plan.");

    const activation = await activatePaidSubscription(tx, payment);
    if (!activation) throw new Error("Subscription activation failed.");
    const referralBonus = await creditReferralBonus(tx, payment);

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "confirmed",
        providerPaymentId: providerId(payload, "payment_id") || payment.providerPaymentId,
        txHash: String(payload.payin_hash || payload.payout_hash || payment.txHash || "").trim() || null,
        raw: mergePaymentRaw(payment.raw, payload, source, {
          normalizedStatus: "paid",
          rawStatus,
          activation: {
            kind: activation.kind,
            startsAt: activation.startsAt.toISOString(),
            endsAt: activation.endsAt.toISOString()
          }
        }) as any
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
          providerPaymentId: providerId(payload, "payment_id") || null,
          plan: payment.plan,
          billingMode: activation.kind,
          dailyLimit: plan.dailyLimit,
          referralBonusId: referralBonus?.ledger.id || null,
          referralBonusUSD: referralBonus ? Number(referralBonus.ledger.amountUSD) : 0,
          startsAt: activation.startsAt.toISOString(),
          endsAt: activation.endsAt.toISOString(),
          source
        } as any
      }
    });

    return { activated: true, status: "confirmed" };
  });
}

export async function processNowPaymentsUpdate(
  payload: PaymentPayload,
  source: UpdateSource,
  options: { allowRecovery?: boolean } = {}
) {
  const orderId = String(payload.order_id || "").trim();
  if (!orderId) return { ok: false as const, error: "MISSING_ORDER_ID", status: "waiting" };

  let payment = await prisma.payment.findUnique({ where: { providerId: orderId } });
  if (!payment && options.allowRecovery) {
    const recovered = recoverOrder(orderId);
    if (!recovered) return { ok: false as const, error: "UNKNOWN_ORDER", status: "waiting" };
    const user = await prisma.user.findUnique({ where: { id: recovered.userId }, select: { id: true } });
    if (!user) return { ok: false as const, error: "UNKNOWN_USER", status: "waiting" };

    const plan = PLANS[recovered.plan];
    const quote = getUpgradeQuote(recovered.plan, null);
    payment = await prisma.payment.create({
      data: {
        userId: recovered.userId,
        provider: "nowpayments",
        providerId: orderId,
        providerPaymentId: providerId(payload, "payment_id") || null,
        amount: plan.priceUSD,
        currency: "USD",
        plan: recovered.plan,
        status: "waiting",
        raw: paymentRawWithQuote({ recoveredFromWebhook: true }, quote) as any
      }
    });
  }
  if (!payment || payment.provider !== "nowpayments") {
    return { ok: false as const, error: "UNKNOWN_ORDER", status: "waiting" };
  }

  const rawStatus = String(payload.payment_status || "").trim().toLowerCase();
  const normalizedStatus = normalizePaymentStatus(rawStatus);
  const paymentId = providerId(payload, "payment_id") || payment.providerPaymentId;

  if (normalizedStatus === "paid") {
    const validationError = validateCompletedPayment(payment, payload);
    if (validationError) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: paymentId || null,
          raw: mergePaymentRaw(payment.raw, payload, source, { normalizedStatus, validationError }) as any
        }
      });
      return { ok: false as const, error: validationError, status: payment.status };
    }

    const activation = await activateSubscription(payment.id, rawStatus, payload, source);
    return { ok: true as const, status: activation.status, normalizedStatus, activated: activation.activated };
  }

  const nextStatus = FAILED_STATUSES.includes(normalizedStatus) ? "failed" : "waiting";
  const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
  if (!fresh) return { ok: false as const, error: "UNKNOWN_ORDER", status: "waiting" };
  if (fresh.status === "activating") {
    return { ok: true as const, status: "activating", normalizedStatus, activated: false };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: fresh.status === "confirmed" ? "confirmed" : nextStatus,
      providerPaymentId: paymentId || null,
      raw: mergePaymentRaw(fresh.raw, payload, source, { normalizedStatus, rawStatus }) as any
    }
  });
  return {
    ok: true as const,
    status: fresh.status === "confirmed" ? "confirmed" : nextStatus,
    normalizedStatus,
    activated: false
  };
}

export async function reconcileNowPaymentsOrder(
  payment: {
    id: string;
    providerId: string;
    providerPaymentId: string | null;
    status: string;
    raw: unknown;
    lastReconciledAt?: Date | null;
  },
  source: Exclude<UpdateSource, "webhook">
) {
  if (payment.status === "confirmed") return { ok: true as const, status: "confirmed", activated: false };
  const raw = objectValue(payment.raw);
  const lastAttempt = payment.lastReconciledAt?.getTime() ||
    Date.parse(String(raw.lastProviderUpdateAt || raw.lastReconcileAt || ""));
  if (source === "user_reconcile" && Number.isFinite(lastAttempt) && Date.now() - lastAttempt < 10_000) {
    return { ok: true as const, status: payment.status, activated: false };
  }
  const lastUpdate = objectValue(raw.lastProviderUpdate);
  const invoiceId = String(
    raw.invoiceId ||
    raw.invoice_id ||
    lastUpdate.invoice_id ||
    (raw.invoice_url ? raw.id : "") ||
    ""
  ).trim();
  const storedProviderId = String(payment.providerPaymentId || "").trim();
  const storedIdIsInvoice = Boolean(invoiceId && storedProviderId === invoiceId);
  const paymentId = String(lastUpdate.payment_id || (!storedIdIsInvoice ? storedProviderId : "")).trim();

  await prisma.payment.updateMany({
    where: { id: payment.id, status: { notIn: ["confirmed", "activating"] } },
    data: { lastReconciledAt: new Date() }
  });

  async function recordAttempt(error: string) {
    const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
    if (fresh && fresh.status !== "confirmed" && fresh.status !== "activating") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          raw: {
            ...objectValue(fresh.raw),
            lastReconcileAt: new Date().toISOString(),
            lastReconcileError: error
          } as any
        }
      });
    }
    return fresh;
  }

  try {
    const client = nowPaymentsClient();
    let providerPayment: unknown;
    if (paymentId) {
      providerPayment = await client.getPaymentStatus(paymentId);
    } else if (invoiceId && canDiscoverNowPaymentsByInvoice()) {
      const listed = await client.listPayments({
        invoiceId,
        limit: 20,
        page: 0,
        sortBy: "created_at",
        orderBy: "desc"
      });
      providerPayment = listed.data.find((item) => item.order_id === payment.providerId);
      if (!providerPayment) {
        const fresh = await recordAttempt("PAYMENT_NOT_CREATED");
        return { ok: true as const, status: fresh?.status || payment.status, activated: false };
      }
    } else {
      const fresh = await recordAttempt("PAYMENT_ID_PENDING");
      return { ok: true as const, status: fresh?.status || payment.status, activated: false };
    }
    return processNowPaymentsUpdate(providerPayment as unknown as PaymentPayload, source);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : "Provider status lookup failed";
    const fresh = await recordAttempt(message);
    return { ok: false as const, error: "PROVIDER_LOOKUP_FAILED", status: fresh?.status || payment.status };
  }
}

export function paymentProviderStatus(raw: unknown) {
  const data = objectValue(raw);
  return String(data.normalizedStatus || objectValue(data.lastProviderUpdate).payment_status || "pending");
}
