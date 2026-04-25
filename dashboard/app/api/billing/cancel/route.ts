import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const result = await prisma.subscription.updateMany({
    where: {
      userId: session.sub,
      status: "active",
      endsAt: { gt: new Date() }
    },
    data: { status: "cancelled" }
  });

  await prisma.auditLog.create({
    data: {
      userId: session.sub,
      event: "user_cancelled_subscription",
      meta: { count: result.count } as any
    }
  });

  return NextResponse.json({ ok: true, cancelled: result.count });
}
