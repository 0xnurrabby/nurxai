import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  ctx: { params: { id: string; contextId: string } }
) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const c = await prisma.projectContext.findFirst({
    where: { id: ctx.params.contextId, project: { userId: session.sub } }
  });
  if (!c) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.projectContext.delete({ where: { id: ctx.params.contextId } });
  return NextResponse.json({ ok: true });
}
