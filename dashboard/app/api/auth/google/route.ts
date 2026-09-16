import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/jwt";
import { isAdminEmail } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { createTrialSubscription } from "@/lib/trial";
import { applyReferralCode, ensureReferralCode } from "@/lib/referrals";
import { TERMS_VERSION } from "@/lib/legal";
import { setSessionCookie } from "@/lib/session-cookie";

export const runtime = "nodejs";

function getGoogleClientId() {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
}

function getGoogleRedirectUri() {
  const bridge = (process.env.NEXT_PUBLIC_GOOGLE_BRIDGE_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || "https://nurxai.xyz").replace(/\/+$/, "");
  return `${bridge}/auth/google-bridge/callback`;
}

export async function POST(req: NextRequest) {
  try {
    await ensureRuntimeSchema();
    const clientId = getGoogleClientId();
    if (!clientId) {
      return NextResponse.json({ error: "GOOGLE_NOT_CONFIGURED" }, { status: 500 });
    }

const { credential, code, referralCode, acceptedTerms } = await req.json().catch(() => ({}));
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    let ticket;
    if (typeof code === "string" && code) {
      if (!clientSecret) {
        console.error("Google auth failed: GOOGLE_CLIENT_SECRET is not configured.");
        return NextResponse.json({ error: "GOOGLE_NOT_CONFIGURED", message: "Google sign-in is not configured correctly on the server. Please check GOOGLE_CLIENT_SECRET." }, { status: 500 });
      }
      const client = new OAuth2Client(clientId, clientSecret, getGoogleRedirectUri());
      const { tokens } = await client.getToken(code);
      if (!tokens.id_token) return NextResponse.json({ error: "GOOGLE_AUTH_FAILED", message: "Google did not return a verified identity." }, { status: 401 });
      ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
    } else if (typeof credential === "string" && credential) {
      const client = new OAuth2Client(clientId);
      ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    } else {
      return NextResponse.json({ error: "MISSING_CREDENTIAL" }, { status: 400 });
    }
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase().trim();
    const googleId = payload?.sub;
    if (!email || !googleId || !payload?.email_verified) {
      return NextResponse.json({ error: "GOOGLE_EMAIL_NOT_VERIFIED", message: "Google could not verify this email address." }, { status: 401 });
    }

    const isAdmin = isAdminEmail(email);
    const displayName = payload.name || payload.given_name || null;
    const avatarUrl = payload.picture || null;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing?.googleId && existing.googleId !== googleId) {
      return NextResponse.json({ error: "GOOGLE_ACCOUNT_MISMATCH" }, { status: 409 });
    }
    if (!existing && acceptedTerms !== true) {
      return NextResponse.json(
        { error: "TERMS_REQUIRED", message: "Please accept the Terms of Service and Privacy Policy to create your account." },
        { status: 400 }
      );
    }
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            googleId,
            authProvider: "google",
            isAdmin,
            name: existing.name ? undefined : displayName || undefined,
            avatarUrl: existing.avatarUrl ? undefined : avatarUrl || undefined
          }
        })
      : await prisma.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              email,
              googleId,
              authProvider: "google",
              isAdmin,
              name: displayName,
              avatarUrl
            }
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
          await createTrialSubscription(tx, created.id);
          await tx.auditLog.create({
            data: {
              userId: created.id,
              event: "terms_accepted",
              meta: { version: TERMS_VERSION, source: "google" } as any
            }
          });
          return created;
        });

    if (existing && !existing.referralCode) {
      await ensureReferralCode(prisma, user.id);
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        event: "google_login",
        meta: { email, googleId } as any
      }
    });

    const token = await signToken({ sub: user.id, email: user.email, sv: user.sessionVersion });
    return setSessionCookie(NextResponse.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl || null, isAdmin }
    }), token);
  } catch (error) {
    console.error("Google auth failed:", error);
    return NextResponse.json({ error: "GOOGLE_AUTH_FAILED" }, { status: 401 });
  }
}
