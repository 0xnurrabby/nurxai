import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";
import { ensureRuntimeSchema } from "@/lib/schema-guard";

export const runtime = "nodejs";

async function getActivePlan(userId: string) {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: "active", endsAt: { gt: new Date() } },
    orderBy: { endsAt: "desc" }
  });
  if (!sub) return null;
  return PLANS[sub.plan as PlanKey] || null;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();

  const projects = await prisma.project.findMany({
    where: { userId: session.sub },
    include: { contexts: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();

  // PLAN GATE: only Pro+ can create projects.
  const plan = await getActivePlan(session.sub);
  if (!plan) return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 402 });
  if (!plan.allowProjects) {
    return NextResponse.json(
      {
        error: "PLAN_LOCKED",
        feature: "projects",
        message:
          "Project Contexts are available on Pro and above. Upgrade to unlock."
      },
      { status: 403 }
    );
  }

  const { name } = await req.json().catch(() => ({}));
  if (!name || typeof name !== "string") return NextResponse.json({ error: "MISSING_NAME" }, { status: 400 });

  const project = await prisma.project.create({
    data: { userId: session.sub, name: name.slice(0, 80) }
  });
  return NextResponse.json({ project });
}
