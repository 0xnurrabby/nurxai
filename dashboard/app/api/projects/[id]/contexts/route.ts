import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";

export const runtime = "nodejs";

async function getActivePlan(userId: string) {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: "active", endsAt: { gt: new Date() } },
    orderBy: { endsAt: "desc" }
  });
  if (!sub) return null;
  return PLANS[sub.plan as PlanKey] || null;
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const plan = await getActivePlan(session.sub);
  if (!plan) return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 402 });
  if (!plan.allowProjects) {
    return NextResponse.json(
      {
        error: "PLAN_LOCKED",
        feature: "projects",
        message: "Project Contexts are available on Pro and above. Upgrade to unlock."
      },
      { status: 403 }
    );
  }

  const proj = await prisma.project.findFirst({
    where: { id: ctx.params.id, userId: session.sub }
  });
  if (!proj) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { content } = await req.json();
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "MISSING_CONTENT" }, { status: 400 });
  }

  const c = await prisma.projectContext.create({
    data: { projectId: ctx.params.id, content: content.slice(0, 5000) }
  });
  return NextResponse.json({ context: c });
}
