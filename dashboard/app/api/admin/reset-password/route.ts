import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * Admin-only password reset for Telegram-based recovery.
 *
 * Two modes (mutually exclusive):
 *   { userId, newPassword }  -> set a new plaintext password (>=6 chars)
 *   { userId, passwordHash } -> set a pre-computed bcrypt hash directly
 *
 * Use newPassword for normal resets — generate something random, send to the
 * user via Telegram, they sign in and change it.
 * Use passwordHash when you already have the user's bcrypt hash from somewhere
 * (e.g. you exported it earlier) and want to restore it verbatim.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin)
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { userId, newPassword, passwordHash } = body || {};
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "MISSING_USER" }, { status: 400 });
  }

  let hash: string | null = null;
  if (typeof newPassword === "string" && newPassword.length >= 6) {
    hash = await bcrypt.hash(newPassword, 10);
  } else if (
    typeof passwordHash === "string" &&
    passwordHash.startsWith("$2") &&
    passwordHash.length >= 50
  ) {
    // Already a bcrypt hash. Accept verbatim.
    hash = passwordHash;
  } else {
    return NextResponse.json(
      {
        error: "BAD_PASSWORD",
        message:
          "Provide either newPassword (>=6 chars) or a bcrypt passwordHash starting with $2 (>= 50 chars)."
      },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hash }
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      event: "admin_password_reset",
      meta: {
        targetId: userId,
        targetEmail: target.email,
        method: typeof newPassword === "string" ? "newPassword" : "passwordHash"
      } as any
    }
  });

  return NextResponse.json({ ok: true, email: target.email });
}
