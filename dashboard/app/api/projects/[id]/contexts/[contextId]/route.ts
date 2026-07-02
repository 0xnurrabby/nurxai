import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";

export const runtime = "nodejs";

type ProjectContextItemRouteContext = { params: Promise<{ id: string; contextId: string }> };

export async function DELETE(
  req: NextRequest,
  ctx: ProjectContextItemRouteContext
) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { contextId } = await ctx.params;

  const c = await prisma.projectContext.findFirst({
    where: { id: contextId, project: { userId: session.sub } }
  });
  if (!c) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.projectContext.delete({ where: { id: contextId } });
  return NextResponse.json({ ok: true });
}
