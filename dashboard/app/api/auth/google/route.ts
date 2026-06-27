import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/jwt";
import { isAdminEmail } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { createTrialSubscription } from "@/lib/trial";
import { applyReferralCode, ensureReferralCode } from "@/lib/referrals";

export const runtime = "nodejs";

function getGoogleClientId() {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
}

export async function POST(req: NextRequest) {
  try {
    await ensureRuntimeSchema();
    const clientId = getGoogleClientId();
    if (!clientId) {
      return NextResponse.json({ error: "GOOGLE_NOT_CONFIGURED" }, { status: 500 });
    }

    const { credential, referralCode } = await req.json().catch(() => ({}));
    if (typeof credential !== "string" || !credential) {
      return NextResponse.json({ error: "MISSING_CREDENTIAL" }, { status: 400 });
    }

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase().trim();
    const googleId = payload?.sub;
    if (!email || !googleId || !payload?.email_verified) {
      return NextResponse.json({ error: "GOOGLE_EMAIL_NOT_VERIFIED" }, { status: 401 });
    }

    const isAdmin = isAdminEmail(email);
    const displayName = payload.name || payload.given_name || null;
    const avatarUrl = payload.picture || null;
    const existing = await prisma.user.findUnique({ where: { email } });
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

    const token = await signToken({ sub: user.id, email: user.email });
    return NextResponse.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl || null, isAdmin }
    });
  } catch (error) {
    console.error("Google auth failed:", error);
    return NextResponse.json({ error: "GOOGLE_AUTH_FAILED" }, { status: 401 });
  }
}
