import { NextRequest, NextResponse } from "next/server";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromAuthHeader(req);
    if (!session?.sub)
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { plan } = body;
    const p = PLANS[plan as PlanKey];
    if (!p) return NextResponse.json({ error: "BAD_PLAN" }, { status: 400 });

    const to = process.env.BASE_PAY_RECIPIENT;
    if (!to) {
      return NextResponse.json(
        {
          error: "BASE_PAY_NOT_CONFIGURED",
          message: "BASE_PAY_RECIPIENT env var is not set. Add it on Vercel and click Redeploy."
        },
        { status: 503 }
      );
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
      return NextResponse.json(
        {
          error: "BASE_PAY_BAD_ADDRESS",
          message: `BASE_PAY_RECIPIENT is not a valid 0x-prefixed 40-hex address.`
        },
        { status: 503 }
      );
    }

    const orderId = `nurxai_basepay_${session.sub}_${plan}_${Date.now()}`;

    // Safely create payment record
    try {
      await prisma.payment.create({
        data: {
          userId: session.sub,
          provider: "basepay",
          providerId: orderId,
          amount: p.priceUSD,
          currency: "USDC",
          plan,
          status: "waiting"
        }
      });
    } catch (dbErr) {
      console.error("DB Error in Base Pay Init:", dbErr);
      return NextResponse.json({ error: "DATABASE_ERROR", message: "Failed to log payment attempt." }, { status: 500 });
    }

    return NextResponse.json({
      orderId,
      amount: p.priceUSD,
      to
    });
  } catch (err) {
    console.error("General Base Pay Init Error:", err);
    return NextResponse.json({ error: "SERVER_ERROR", message: "Internal server error during init." }, { status: 500 });
  }
}
