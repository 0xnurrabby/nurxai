import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { isValidPassword } from "@/lib/auth-validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin)
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { userId, newPassword } = body || {};
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "MISSING_USER" }, { status: 400 });
  }

  if (!isValidPassword(newPassword)) {
    return NextResponse.json(
      { error: "BAD_PASSWORD", message: "Password must be 8-72 UTF-8 bytes." },
      { status: 400 }
    );
  }
  const hash = await bcrypt.hash(newPassword, 12);

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hash, sessionVersion: { increment: 1 } }
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      event: "admin_password_reset",
      meta: {
        targetId: userId,
        targetEmail: target.email,
        method: "newPassword"
      } as any
    }
  });

  return NextResponse.json({ ok: true, email: target.email });
}
