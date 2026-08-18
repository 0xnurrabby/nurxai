import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromHeader } from "@/lib/auth-helpers";
import { signToken } from "@/lib/jwt";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await getAuthUserFromHeader(req);
  if (!auth?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = auth.user;

  await prisma.auditLog.create({ data: { userId: user.id, event: "extension_link" } });

  const token = await signToken({ sub: user.id, email: user.email }, "90d");
  return NextResponse.json({ token });
}
