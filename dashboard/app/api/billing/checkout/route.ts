import { NextRequest, NextResponse } from "next/server";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { plan, payCurrency = "usdttrc20" } = await req.json();
  const p = PLANS[plan as PlanKey];
  if (!p) return NextResponse.json({ error: "BAD_PLAN" }, { status: 400 });

  const orderId = `nurxai_${session.sub}_${plan}_${Date.now()}`;

  try {
    const r = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: { "x-api-key": process.env.NOWPAYMENTS_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({
        price_amount: p.priceUSD,
        price_currency: "usd",
        pay_currency: payCurrency,
        order_id: orderId,
        order_description: `NurAi ${p.name}`,
        ipn_callback_url: `${process.env.PUBLIC_URL}/api/billing/webhook`,
        success_url: `${process.env.PUBLIC_URL}/dashboard?paid=1`,
        cancel_url: `${process.env.PUBLIC_URL}/pricing`
      })
    });
    const data = await r.json();
    if (!data.invoice_url) return NextResponse.json({ error: "PROVIDER" }, { status: 502 });

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
    return NextResponse.json({ url: data.invoice_url });
  } catch {
    return NextResponse.json({ error: "PROVIDER" }, { status: 502 });
  }
}
