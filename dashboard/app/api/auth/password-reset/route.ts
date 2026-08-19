import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { consumeEmailOtp } from "@/lib/email-otp";
import { isValidEmail, isValidPassword, normalizeEmail } from "@/lib/auth-validation";
import { consumeAuthRateLimit, trustedClientIp } from "@/lib/auth-rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return NextResponse.json({ error: "BAD_EMAIL" }, { status: 400 });
    if (!isValidPassword(body.newPassword)) {
      return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    }

    const ipLimit = await consumeAuthRateLimit({
      scope: "password-reset-complete-ip",
      identity: trustedClientIp(req),
      max: 15,
      windowMs: 15 * 60 * 1000
    });
    if (!ipLimit.allowed) {
      return NextResponse.json({ error: "RATE_LIMITED" }, {
        status: 429,
        headers: { "Retry-After": String(ipLimit.retryAfter) }
      });
    }
    const reset = await prisma.$transaction(async (tx) => {
      const verified = await consumeEmailOtp(tx, email, "password_reset", body.otp);
      if (!verified) return false;
      const passwordHash = await bcrypt.hash(body.newPassword, 12);
      const updated = await tx.user.updateMany({
        where: { email, passwordHash: { not: null } },
        data: { passwordHash, sessionVersion: { increment: 1 } }
      });
      if (updated.count !== 1) return false;
      const user = await tx.user.findUnique({ where: { email }, select: { id: true } });
      await tx.auditLog.create({ data: { userId: user?.id, event: "password_reset_completed" } });
      return true;
    });
    if (!reset) return NextResponse.json({ error: "INVALID_OTP" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Password reset failed:", error);
    return NextResponse.json({ error: "SERVER_ERROR", message: "Could not reset password right now." }, { status: 500 });
  }
}
