import { NextRequest, NextResponse } from "next/server";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Base Pay init (step 1 of 2).
 * The browser asks the server for the canonical price + recipient before
 * popping the wallet, so the user can never tamper with what they pay.
 *
 * We also create a pending Payment row keyed by an orderId so the verify
 * step can match the on-chain transaction back to a specific user + plan.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { plan } = await req.json().catch(() => ({}));
  const p = PLANS[plan as PlanKey];
  if (!p) return NextResponse.json({ error: "BAD_PLAN" }, { status: 400 });

  const to = process.env.BASE_PAY_RECIPIENT;
  if (!to) {
    return NextResponse.json(
      {
        error: "BASE_PAY_NOT_CONFIGURED",
        message:
          "BASE_PAY_RECIPIENT env var is not set. Add it on Vercel and click Redeploy."
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

  return NextResponse.json({
    orderId,
    amount: p.priceUSD,
    to
  });
}
