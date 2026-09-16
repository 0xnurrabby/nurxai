import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/jwt";
import { isAdminEmail } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { createTrialSubscription } from "@/lib/trial";
import { applyReferralCode, ensureReferralCode } from "@/lib/referrals";
import { setSessionCookie } from "@/lib/session-cookie";
import { TERMS_VERSION } from "@/lib/legal";

export const runtime = "nodejs";

function appOrigin() {
  const raw = process.env.PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || "https://nurxai.xyz";
  return raw.replace(/\/+$/, "");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state") || "";

  let state: { referralCode?: string; acceptedTerms?: boolean } = {};
  try {
    state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
  } catch {
    state = {};
  }

  const fail = (reason: string) =>
    NextResponse.redirect(`${appOrigin()}/login?error=${encodeURIComponent(reason)}`);

  try {
    if (!code) return fail("GOOGLE_CANCELLED");

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return fail("GOOGLE_NOT_CONFIGURED");

    const client = new OAuth2Client(clientId, clientSecret, `${appOrigin()}/api/auth/google/callback`);
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) return fail("GOOGLE_NO_ID_TOKEN");

    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase().trim();
    const googleId = payload?.sub;
    if (!email || !googleId || !payload?.email_verified) return fail("GOOGLE_EMAIL_NOT_VERIFIED");

    await ensureRuntimeSchema();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing?.googleId && existing.googleId !== googleId) return fail("GOOGLE_ACCOUNT_MISMATCH");
    if (!existing && state.acceptedTerms !== true) return fail("TERMS_REQUIRED");

    const isAdmin = isAdminEmail(email);
    const displayName = payload?.name || payload?.given_name || null;
    const avatarUrl = payload?.picture || null;

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
            data: { email, googleId, authProvider: "google", isAdmin, name: displayName, avatarUrl }
          });
          await ensureReferralCode(tx, created.id);
          if (state.referralCode) {
            const referral = await applyReferralCode(tx, created.id, state.referralCode);
            if (!referral.ok && referral.error !== "REFERRAL_NOT_FOUND") {
              await tx.auditLog.create({
                data: { userId: created.id, event: "signup_referral_ignored", meta: { error: referral.error } as any }
              });
            }
          }
          await tx.auditLog.create({ data: { userId: created.id, event: "signup" } });
          await tx.auditLog.create({
            data: {
              userId: created.id,
              event: "terms_accepted",
              meta: { version: TERMS_VERSION, source: "google_redirect" } as any
            }
          });
          await createTrialSubscription(tx, created.id);
          return created;
        });

    if (existing && !existing.referralCode) {
      await ensureReferralCode(prisma, user.id);
    }

    await prisma.auditLog.create({
      data: { userId: user.id, event: "google_login", meta: { email, googleId, via: "redirect" } as any }
    });

    const token = await signToken({ sub: user.id, email: user.email, sv: user.sessionVersion });
    return setSessionCookie(NextResponse.redirect(`${appOrigin()}/dashboard`), token);
  } catch (error) {
    console.error("Google redirect auth failed:", error);
    return fail("GOOGLE_AUTH_FAILED");
  }
}
