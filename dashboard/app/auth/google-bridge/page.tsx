"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function configuredOrigin(value: string | undefined, fallback: string) {
  try { return new URL(value || fallback).origin; } catch { return fallback; }
}

const APP_ORIGIN = configuredOrigin(process.env.NEXT_PUBLIC_APP_URL, "https://nurxai.xyz");
const BRIDGE_ORIGIN = configuredOrigin(process.env.NEXT_PUBLIC_GOOGLE_BRIDGE_ORIGIN, APP_ORIGIN);
const ALLOWED_RETURN_ORIGINS = new Set([APP_ORIGIN, BRIDGE_ORIGIN]);
const GOOGLE_CALLBACK_URL = `${BRIDGE_ORIGIN}/auth/google-bridge/callback`;

function GoogleBridgeInner() {
  const params = useSearchParams();
  const [message, setMessage] = useState("Choose the Google account you want to use.");
  const returnOrigin = useMemo(() => {
    const requested = params.get("return_origin") || "";
    return ALLOWED_RETURN_ORIGINS.has(requested) ? requested : APP_ORIGIN;
  }, [params]);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  return (
    <main className="auth-stage grid min-h-screen place-items-center px-5 py-12">
      <div className="nb-card w-full max-w-sm p-7 text-center">
        <span className="nb-tag">GOOGLE ACCESS</span>
        <h1 className="mt-5 font-display text-3xl font-black">Sign in to NurAi</h1>
        <p className="mt-3 text-sm opacity-70">{message}</p>
        <div className="mt-6">
          <button
            type="button"
            className="nb-btn min-h-[44px] w-full gap-3"
            disabled={!clientId}
            onClick={() => {
              const state = crypto.randomUUID();
              const oauthState = btoa(JSON.stringify({ nonce: state, returnOrigin, referralCode: params.get("ref") || "" }))
                .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
              const oauth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
              oauth.search = new URLSearchParams({
                client_id: clientId || "",
                redirect_uri: GOOGLE_CALLBACK_URL,
                response_type: "code",
                scope: "openid email profile",
                state: oauthState,
                prompt: "select_account"
              }).toString();
              window.location.assign(oauth.toString());
            }}
          >
            <span className="font-black" aria-hidden="true">G</span>
            Continue with Google
          </button>
        </div>
      </div>
    </main>
  );
}

export default function GoogleBridge() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center font-black">Loading Google sign-in...</main>}>
      <GoogleBridgeInner />
    </Suspense>
  );
}