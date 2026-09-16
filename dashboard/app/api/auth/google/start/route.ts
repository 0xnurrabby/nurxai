import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function appOrigin() {
  const raw = process.env.PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || "https://nurxai.xyz";
  return raw.replace(/\/+$/, "");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const referralCode = (url.searchParams.get("ref") || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 32);
  const accepted = url.searchParams.get("accepted") === "1";

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${appOrigin()}/signup?error=GOOGLE_NOT_CONFIGURED`);
  }

  const state = Buffer.from(
    JSON.stringify({ referralCode, acceptedTerms: accepted, startedAt: Date.now() })
  ).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appOrigin()}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account"
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
