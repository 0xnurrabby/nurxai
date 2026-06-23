import { NextRequest, NextResponse } from "next/server";
import { NowPaymentsSDK, isSDKError } from "@nowpaymentsio/nowpayments-sdk-nodejs";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";
import { prisma } from "@/lib/db";
import { ensureRuntimeSchema } from "@/lib/schema-guard";

export const runtime = "nodejs";

function getNowPaymentsKey() {
  return process.env.NOWPAYMENTS_API_KEY || process.env.NOWPAYMENTS_KEY;
}

function getPublicUrl() {
  return (process.env.PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.nurxai.xyz").replace(/\/+$/, "");
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
        amount: p.priceUSD,
        currency: "USD",
        plan,
        status: "waiting"
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
        amount: p.priceUSD,
        currency: "usd",
        orderId,
        description: `NurAi ${p.name} Plan`,
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
          raw: checkout as any
        }
      });

      return NextResponse.json({
        url: checkout.invoice_url,
        invoiceId: checkout.id,
        orderId,
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
