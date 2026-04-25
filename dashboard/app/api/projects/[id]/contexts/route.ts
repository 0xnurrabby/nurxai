import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

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
