import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { consumeAuthRateLimit, trustedClientIp } from "@/lib/auth-rate-limit";

export type OtpPurpose = "signup" | "password_reset";

export const OTP_EXPIRES_SECONDS = 10 * 60;
export const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

export class OtpRateLimitError extends Error {
  constructor(public retryAfter: number) {
    super("OTP rate limit exceeded.");
  }
}

function otpPepper() {
  const pepper = process.env.OTP_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("OTP_PEPPER is not configured.");
  return pepper;
}

function hashCode(id: string, email: string, purpose: OtpPurpose, code: string) {
  return crypto.createHmac("sha256", otpPepper())
    .update(`${id}|${email}|${purpose}|${code}`)
    .digest("hex");
}

function otpEmail(code: string, purpose: OtpPurpose) {
  const action = purpose === "signup" ? "verify your email" : "reset your password";
  return {
    subject: purpose === "signup" ? "Verify your NurAi email" : "Reset your NurAi password",
    text: `Use ${code} to ${action}. This code expires in 10 minutes. If you did not request it, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0f1419"><p style="font-weight:800">NURAI SECURITY CHECK</p><h1 style="font-size:26px">${action[0].toUpperCase() + action.slice(1)}</h1><p>Your one-time code is:</p><div style="font-size:36px;font-weight:900;letter-spacing:10px;padding:18px 20px;border:2px solid #0f1419;border-radius:12px;background:#fff89c;text-align:center">${code}</div><p style="margin-top:20px">It expires in 10 minutes. If you did not request this, you can safely ignore the email.</p></div>`
  };
}

export async function requestEmailOtp(req: NextRequest, email: string, purpose: OtpPurpose) {
  const ipLimit = await consumeAuthRateLimit({
    scope: "otp-send-ip",
    identity: trustedClientIp(req),
    max: 10,
    windowMs: 60 * 60 * 1000
  });
  if (!ipLimit.allowed) throw new OtpRateLimitError(ipLimit.retryAfter);
  const emailLimit = await consumeAuthRateLimit({
    scope: `otp-send-${purpose}`,
    identity: email,
    max: 3,
    windowMs: 15 * 60 * 1000
  });
  if (!emailLimit.allowed) throw new OtpRateLimitError(emailLimit.retryAfter);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${email}|${purpose}`}, 0))::text`;
    const existing = await tx.emailOtpChallenge.findUnique({
      where: { email_purpose: { email, purpose } },
      select: { sentAt: true }
    });
    if (existing?.sentAt && Date.now() - existing.sentAt.getTime() < OTP_RESEND_SECONDS * 1000) return;

    const user = await tx.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true }
    });
    const eligible = purpose === "signup" ? !user : Boolean(user?.passwordHash);
    if (!eligible) return;

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) throw new Error("Resend email delivery is not configured.");

    const id = crypto.randomUUID();
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_SECONDS * 1000);
    await tx.emailOtpChallenge.upsert({
      where: { email_purpose: { email, purpose } },
      create: { id, email, purpose, codeHash: hashCode(id, email, purpose, code), expiresAt },
      update: {
        id,
        codeHash: hashCode(id, email, purpose, code),
        expiresAt,
        sentAt: null,
        attempts: 0,
        consumedAt: null
      }
    });

    const message = otpEmail(code, purpose);
    const { error } = await new Resend(apiKey).emails.send({ from, to: email, ...message });
    if (error) throw new Error(`Resend rejected OTP email: ${error.name}`);

    await tx.emailOtpChallenge.update({ where: { id }, data: { sentAt: new Date() } });
  });
}

export async function consumeEmailOtp(
  tx: Prisma.TransactionClient,
  email: string,
  purpose: OtpPurpose,
  value: unknown
) {
  const code = typeof value === "string" ? value.trim() : "";
  if (!/^\d{6}$/.test(code)) return false;

  const challenge = await tx.emailOtpChallenge.findUnique({
    where: { email_purpose: { email, purpose } }
  });
  const now = new Date();
  if (
    !challenge?.sentAt || challenge.consumedAt || challenge.expiresAt <= now
    || challenge.attempts >= OTP_MAX_ATTEMPTS
  ) return false;

  const expected = hashCode(challenge.id, email, purpose, code);
  const matches = crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(challenge.codeHash, "hex"));
  if (!matches) {
    await tx.emailOtpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } }
    });
    return false;
  }

  const consumed = await tx.emailOtpChallenge.updateMany({
    where: {
      id: challenge.id,
      codeHash: challenge.codeHash,
      sentAt: { not: null },
      consumedAt: null,
      expiresAt: { gt: now },
      attempts: { lt: OTP_MAX_ATTEMPTS }
    },
    data: { consumedAt: now }
  });
  return consumed.count === 1;
}
