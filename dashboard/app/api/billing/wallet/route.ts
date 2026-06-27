import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { activatePaidSubscription, getUpgradeQuote, paymentRawWithQuote } from "@/lib/billing";
import { createWalletPurchase } from "@/lib/referrals";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();

  const { plan } = await req.json().catch(() => ({}));
  const selected = PLANS[plan as PlanKey];
  if (!selected || selected.priceUSD <= 0) return NextResponse.json({ error: "BAD_PLAN" }, { status: 400 });

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.subscription.findFirst({
      where: {
        userId: session.sub,
        status: "active",
        startsAt: { lte: new Date() },
        endsAt: { gt: new Date() }
      },
      orderBy: { endsAt: "desc" }
    });
    const quote = getUpgradeQuote(plan as PlanKey, current);
    const amountUSD = Number(quote.amountUSD.toFixed(2));
    if (amountUSD <= 0) return { ok: false as const, error: "BAD_AMOUNT" };

    const walletDebit = await createWalletPurchase(tx, session.sub, plan as PlanKey, amountUSD);
    if (!walletDebit.ok) return walletDebit;

    const payment = await tx.payment.create({
      data: {
        userId: session.sub,
        provider: "wallet",
        providerId: `nurxai_wallet_${session.sub}_${plan}_${Date.now()}`,
        amount: amountUSD,
        currency: "USD",
        plan,
        status: "waiting",
        raw: paymentRawWithQuote({ walletLedgerId: walletDebit.ledger.id }, quote) as any
      }
    });

    const activation = await activatePaidSubscription(tx, payment);
    if (!activation) return { ok: false as const, error: "ACTIVATION_FAILED" };

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "confirmed" }
    });

    await tx.walletLedger.update({
      where: { id: walletDebit.ledger.id },
      data: { sourceId: payment.id }
    });

    await tx.auditLog.create({
      data: {
        userId: session.sub,
        event: "wallet_subscription_activated",
        meta: {
          paymentId: payment.id,
          ledgerId: walletDebit.ledger.id,
          plan,
          amountUSD,
          billingMode: activation.kind,
          startsAt: activation.startsAt.toISOString(),
          endsAt: activation.endsAt.toISOString()
        } as any
      }
    });

    return {
      ok: true as const,
      payment,
      activation
    };
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        message: result.error === "INSUFFICIENT_BALANCE" ? "Not enough referral balance for this plan." : undefined
      },
      { status: result.error === "INSUFFICIENT_BALANCE" ? 402 : 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    plan,
    billingMode: result.activation.kind,
    endsAt: result.activation.endsAt.toISOString()
  });
}
