import { NextRequest, NextResponse } from "next/server";
import { isValidEmail, normalizeEmail } from "@/lib/auth-validation";
import {
  OTP_EXPIRES_SECONDS,
  OTP_RESEND_SECONDS,
  OtpRateLimitError,
  requestEmailOtp,
  type OtpPurpose
} from "@/lib/email-otp";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const purpose = body.purpose as OtpPurpose;
    if (!isValidEmail(email)) return NextResponse.json({ error: "BAD_EMAIL" }, { status: 400 });
    if (purpose !== "signup" && purpose !== "password_reset") {
      return NextResponse.json({ error: "BAD_PURPOSE" }, { status: 400 });
    }

    await requestEmailOtp(req, email, purpose);
    return NextResponse.json({
      ok: true,
      message: "If this address is eligible, a code has been sent.",
      expiresIn: OTP_EXPIRES_SECONDS,
      resendAfter: OTP_RESEND_SECONDS
    }, { status: 202 });
  } catch (error) {
    if (error instanceof OtpRateLimitError) {
      return NextResponse.json(
        { error: "RATE_LIMITED", message: "Too many code requests. Try again later." },
        { status: 429, headers: { "Retry-After": String(error.retryAfter) } }
      );
    }
    console.error("OTP request failed:", error);
    return NextResponse.json({ error: "EMAIL_UNAVAILABLE", message: "Could not send a code right now." }, { status: 503 });
  }
}
