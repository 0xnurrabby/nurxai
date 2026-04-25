import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PLANS, PlanKey } from "@/lib/plans";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Only allow if DEV_ADMIN_KEY matches
  const adminKey = req.headers.get("x-admin-key");
  if (!process.env.DEV_ADMIN_KEY || adminKey !== process.env.DEV_ADMIN_KEY) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { plan } = await req.json();
  const p = PLANS[plan as PlanKey];
  if (!p) return NextResponse.json({ error: "BAD_PLAN" }, { status: 400 });

  const endsAt = new Date(Date.now() + p.days * 24 * 60 * 60 * 1000);
  await prisma.subscription.create({
    data: { userId: session.sub, plan, status: "active", endsAt }
  });

  return NextResponse.json({ ok: true, endsAt });
}
