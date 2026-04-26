import { NextRequest, NextResponse } from "next/server";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromAuthHeader(req);
    if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { plan } = body;
    const p = PLANS[plan as PlanKey];
    if (!p) return NextResponse.json({ error: "BAD_PLAN" }, { status: 400 });

    const orderId = `nurxai_${session.sub}_${plan}_${Date.now()}`;
    const baseUrl = process.env.PUBLIC_URL || "https://nurx.ai"; // Fallback domain

    if (!process.env.NOWPAYMENTS_KEY) {
      return NextResponse.json({ error: "CONFIG_ERROR", message: "NOWPAYMENTS_KEY is not set." }, { status: 500 });
    }

    const r = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "x-api-key": process.env.NOWPAYMENTS_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        price_amount: p.priceUSD,
        price_currency: "usd",
        order_id: orderId,
        order_description: `NurAi ${p.name} Plan`,
        ipn_callback_url: `${baseUrl}/api/billing/webhook`,
        success_url: `${baseUrl}/dashboard?paid=1`,
        cancel_url: `${baseUrl}/pricing`,
        is_fixed_rate: false,
        is_fee_paid_by_user: false
      })
    });

    const data = await r.json().catch(() => null);
    
    if (!r.ok || !data?.invoice_url) {
      console.error("NOWPayments API Error:", data);
      return NextResponse.json({ 
        error: "PROVIDER_ERROR", 
        message: data?.message || "Payment provider rejected the request.",
        details: data 
      }, { status: 502 });
    }

    try {
      await prisma.payment.create({
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
    } catch (dbErr) {
      console.error("DB Error in NowPayments Checkout:", dbErr);
    }

    return NextResponse.json({ url: data.invoice_url });
  } catch (e) {
    console.error("Checkout crash:", e);
    return NextResponse.json({ error: "SERVER_ERROR", message: "Unexpected server error." }, { status: 500 });
  }
}
