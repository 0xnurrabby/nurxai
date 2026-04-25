import { NextRequest, NextResponse } from "next/server";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { signToken } from "@/lib/jwt";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  await prisma.auditLog.create({ data: { userId: user.id, event: "extension_link" } });

  const token = await signToken({ sub: user.id, email: user.email }, "30d");
  return NextResponse.json({ token });
}
