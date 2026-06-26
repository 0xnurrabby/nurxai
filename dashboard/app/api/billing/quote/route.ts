import { NextRequest, NextResponse } from "next/server";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";
import { getCurrentSubscription, getUpgradeQuote } from "@/lib/billing";
import { ensureRuntimeSchema } from "@/lib/schema-guard";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();

  const { plan } = await req.json().catch(() => ({}));
  const selected = PLANS[plan as PlanKey];
  if (!selected) return NextResponse.json({ error: "BAD_PLAN" }, { status: 400 });

  const current = await getCurrentSubscription(session.sub);
  const quote = getUpgradeQuote(plan as PlanKey, current);
  return NextResponse.json({
    quote: {
      kind: quote.kind,
      amountUSD: Number(quote.amountUSD.toFixed(2)),
      currentPlan: quote.currentPlan,
      targetPlan: quote.targetPlan,
      startsAt: quote.startsAt instanceof Date ? quote.startsAt.toISOString() : quote.startsAt,
      endsAt: quote.endsAt instanceof Date ? quote.endsAt.toISOString() : quote.endsAt
    }
  });
}
