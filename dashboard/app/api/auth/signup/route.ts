import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/jwt";
import { isAdminEmail } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { createTrialSubscription } from "@/lib/trial";
import { applyReferralCode, ensureReferralCode } from "@/lib/referrals";
import { setSessionCookie } from "@/lib/session-cookie";
import { cleanName, isValidEmail, isValidPassword, normalizeEmail } from "@/lib/auth-validation";
import { consumeEmailOtp } from "@/lib/email-otp";
import { Prisma } from "@prisma/client";
import { consumeAuthRateLimit, trustedClientIp } from "@/lib/auth-rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await ensureRuntimeSchema();
    const { email, password, name, referralCode, otp } = await req.json();
    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "MISSING" }, { status: 400 });
    }
    const e = normalizeEmail(email);
    if (!isValidEmail(e)) return NextResponse.json({ error: "BAD_EMAIL" }, { status: 400 });
    if (!isValidPassword(password)) return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    if (typeof otp !== "string") return NextResponse.json({ error: "OTP_REQUIRED" }, { status: 400 });

    const ipLimit = await consumeAuthRateLimit({
      scope: "signup-complete-ip",
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
    const isAdmin = isAdminEmail(e);
    const user = await prisma.$transaction(async (tx) => {
      if (!await consumeEmailOtp(tx, e, "signup", otp)) return null;
      const hash = await bcrypt.hash(password, 12);
      const created = await tx.user.create({
        data: { email: e, passwordHash: hash, name: cleanName(name), isAdmin }
      });

      await ensureReferralCode(tx, created.id);
      if (referralCode) {
        const referral = await applyReferralCode(tx, created.id, referralCode);
        if (!referral.ok && referral.error !== "REFERRAL_NOT_FOUND") {
          await tx.auditLog.create({
            data: { userId: created.id, event: "signup_referral_ignored", meta: { error: referral.error } as any }
          });
        }
      }
      await tx.auditLog.create({ data: { userId: created.id, event: "signup" } });
      await createTrialSubscription(tx, created.id);
      return created;
    });
    if (!user) return NextResponse.json({ error: "INVALID_OTP" }, { status: 400 });

    const token = await signToken({ sub: user.id, email: user.email, sv: user.sessionVersion });
    return setSessionCookie(NextResponse.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl || null, isAdmin }
    }), token);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "EMAIL_TAKEN" }, { status: 409 });
    }
    console.error("Signup failed:", error);
    return NextResponse.json({ error: "SERVER_ERROR", message: "Could not create account right now." }, { status: 500 });
  }
}
