import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";

export const runtime = "nodejs";

async function ownProject(userId: string, projectId: string) {
  const p = await prisma.project.findFirst({ where: { id: projectId, userId } });
  return p;
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const proj = await ownProject(session.sub, ctx.params.id);
  if (!proj) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json();
  const data: any = {};
  if (typeof body.name === "string") data.name = body.name.slice(0, 80);
  if (typeof body.active === "boolean") data.active = body.active;

  const updated = await prisma.project.update({ where: { id: ctx.params.id }, data });
  return NextResponse.json({ project: updated });
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const proj = await ownProject(session.sub, ctx.params.id);
  if (!proj) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.projectContext.deleteMany({ where: { projectId: ctx.params.id } });
  await prisma.project.delete({ where: { id: ctx.params.id } });
  return NextResponse.json({ ok: true });
}
