import { NextRequest, NextResponse } from "next/server";
import { NowPaymentsSDK, isSDKError } from "@nowpaymentsio/nowpayments-sdk-nodejs";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";
import { prisma } from "@/lib/db";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { getCurrentSubscription, getUpgradeQuote, paymentRawWithQuote } from "@/lib/billing";

export const runtime = "nodejs";

function getNowPaymentsKey() {
  return process.env.NOWPAYMENTS_API_KEY || process.env.NOWPAYMENTS_KEY;
}

function getPublicUrl() {
  return (process.env.PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || "https://nurxai.xyz").replace(/\/+$/, "");
}

export async function POST(req: NextRequest) {
  try {
    await ensureRuntimeSchema();
    const session = await getSessionFromAuthHeader(req);
    if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { plan } = body;
    const p = PLANS[plan as PlanKey];
    if (!p) return NextResponse.json({ error: "BAD_PLAN" }, { status: 400 });
    if (p.priceUSD <= 0) {
      return NextResponse.json(
        { error: "FREE_PLAN", message: "Trial is free. Create an account or start the free trial from the pricing page." },
        { status: 400 }
      );
    }

    const current = await getCurrentSubscription(session.sub);
    const quote = getUpgradeQuote(plan as PlanKey, current);
    const amountUSD = Number(quote.amountUSD.toFixed(2));
    if (amountUSD <= 0) {
      return NextResponse.json({ error: "BAD_AMOUNT" }, { status: 400 });
    }

    const orderId = `nurxai_${session.sub}_${plan}_${Date.now()}`;
    const baseUrl = getPublicUrl();
    const apiKey = getNowPaymentsKey();

    if (!apiKey) {
      return NextResponse.json(
        { error: "CONFIG_ERROR", message: "NOWPAYMENTS_API_KEY is not set." },
        { status: 500 }
      );
    }

    const payment = await prisma.payment.create({
      data: {
        userId: session.sub,
        provider: "nowpayments",
        providerId: orderId,
        amount: amountUSD,
        currency: "USD",
        plan,
        status: "waiting",
        raw: paymentRawWithQuote(null, quote) as any
      }
    });

    const sdk = new NowPaymentsSDK({
      apiKey,
      ipnSecret: process.env.NOWPAYMENTS_IPN_SECRET,
      ipnCallbackUrl: `${baseUrl}/api/billing/webhook`,
      successUrl: `${baseUrl}/dashboard?paid=1&order=${encodeURIComponent(orderId)}`,
      cancelUrl: `${baseUrl}/pricing?cancelled=1`
    });

    try {
      const checkout = await sdk.createCheckout({
        amount: amountUSD,
        currency: "usd",
        orderId,
        description:
          quote.kind === "upgrade"
            ? `NurAi upgrade from ${quote.currentPlan} to ${p.name}`
            : `NurAi ${p.name} Plan`,
        fixedRate: false,
        feePaidByUser: false
      });

      if (!checkout.invoice_url) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "failed", raw: { error: "Missing NOWPayments invoice_url", checkout } as any }
        });
        return NextResponse.json(
          { error: "PROVIDER_ERROR", message: "Payment provider did not return an invoice URL." },
          { status: 502 }
        );
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: checkout.id || null,
          raw: paymentRawWithQuote(checkout, quote) as any
        }
      });

      return NextResponse.json({
        url: checkout.invoice_url,
        invoiceId: checkout.id,
        orderId,
        amount: amountUSD,
        billingMode: quote.kind,
        message: "Invoice created. Your subscription activates after the payment is fully confirmed."
      });
    } catch (providerErr: any) {
      console.error("NOWPayments checkout error:", providerErr);
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "failed",
          raw: {
            error: isSDKError(providerErr) ? providerErr.toJSON() : providerErr?.message || "Unknown provider error"
          } as any
        }
      });

      return NextResponse.json(
        {
          error: "PROVIDER_ERROR",
          message: providerErr?.message || "Payment provider rejected the request.",
          details: isSDKError(providerErr) ? providerErr.toJSON() : undefined
        },
        { status: 502 }
      );
    }
  } catch (e) {
    console.error("Checkout crash:", e);
    return NextResponse.json({ error: "SERVER_ERROR", message: "Unexpected server error." }, { status: 500 });
  }
}
