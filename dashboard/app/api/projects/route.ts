import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

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

  const { name } = await req.json();
  if (!name || typeof name !== "string") return NextResponse.json({ error: "MISSING_NAME" }, { status: 400 });

  const project = await prisma.project.create({
    data: { userId: session.sub, name: name.slice(0, 80) }
  });
  return NextResponse.json({ project });
}
