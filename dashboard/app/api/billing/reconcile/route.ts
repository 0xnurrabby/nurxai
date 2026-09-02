import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { canDiscoverNowPaymentsByInvoice, reconcileNowPaymentsOrder } from "@/lib/nowpayments-billing";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secrets = [process.env.CRON_SECRET, process.env.BILLING_RECONCILE_SECRET].filter(Boolean);
  return Boolean(token) && secrets.some((secret) => token === secret);
}

async function reconcile(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();

  const baseWhere = {
    provider: "nowpayments",
    status: { in: ["waiting", "failed"] },
    createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  } satisfies Prisma.PaymentWhereInput;
  const knownPayments = await prisma.payment.findMany({
    where: {
      ...baseWhere,
      providerPaymentId: { not: null },
    },
    orderBy: [
      { lastReconciledAt: { sort: "asc", nulls: "first" } },
      { createdAt: "asc" }
    ],
    take: 25
  });
  const invoicePayments = canDiscoverNowPaymentsByInvoice()
    ? await prisma.payment.findMany({
        where: { ...baseWhere, providerPaymentId: null },
        orderBy: [
          { lastReconciledAt: { sort: "asc", nulls: "first" } },
          { createdAt: "asc" }
        ],
        take: 25
      })
    : [];
  const payments = [...knownPayments, ...invoicePayments];

  const summary = { checked: 0, activated: 0, processing: 0, errors: 0 };
  for (const payment of payments) {
    const result = await reconcileNowPaymentsOrder(payment, "scheduled_reconcile");
    summary.checked += 1;
    if (result.ok && result.status === "confirmed") summary.activated += result.activated ? 1 : 0;
    else if (result.ok) summary.processing += 1;
    else summary.errors += 1;
  }

  return NextResponse.json({ ok: true, ...summary });
}

export const GET = reconcile;
export const POST = reconcile;
