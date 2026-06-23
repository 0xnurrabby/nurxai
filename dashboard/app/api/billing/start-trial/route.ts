import { NextRequest, NextResponse } from "next/server";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { ensureTrialSubscription } from "@/lib/trial";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await ensureRuntimeSchema();
    const session = await getSessionFromAuthHeader(req);
    if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const result = await ensureTrialSubscription(session.sub);
    if (result.state === "used") {
      return NextResponse.json(
        {
          error: "TRIAL_USED",
          message: "Free trial has already been used on this account. Pick Starter, Pro, or Premium to continue."
        },
        { status: 409 }
      );
    }
    if (result.state === "active") {
      return NextResponse.json(
        {
          error: "ACTIVE_SUBSCRIPTION",
          message: "You already have an active plan."
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      subscription: result.subscription
        ? {
            plan: result.subscription.plan,
            startsAt: result.subscription.startsAt.toISOString(),
            endsAt: result.subscription.endsAt.toISOString()
          }
        : null
    });
  } catch (error) {
    console.error("Start trial failed:", error);
    return NextResponse.json({ error: "SERVER_ERROR", message: "Could not start free trial." }, { status: 500 });
  }
}
