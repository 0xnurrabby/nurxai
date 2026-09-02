"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

function configuredOrigin(value: string | undefined, fallback: string) {
  try { return new URL(value || fallback).origin; } catch { return fallback; }
}

const APP_ORIGIN = configuredOrigin(process.env.NEXT_PUBLIC_APP_URL, "https://nurxai.xyz");
const BRIDGE_ORIGIN = configuredOrigin(process.env.NEXT_PUBLIC_GOOGLE_BRIDGE_ORIGIN, APP_ORIGIN);
const ALLOWED_RETURN_ORIGINS = new Set([APP_ORIGIN, BRIDGE_ORIGIN]);

function decodeState(value: string) {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const parsed = JSON.parse(atob(base64));
    return {
      nonce: typeof parsed.nonce === "string" ? parsed.nonce : "",
      returnOrigin: ALLOWED_RETURN_ORIGINS.has(parsed.returnOrigin) ? parsed.returnOrigin : APP_ORIGIN,
      referralCode: typeof parsed.referralCode === "string" ? parsed.referralCode : undefined
    };
  } catch {
    return { nonce: "", returnOrigin: APP_ORIGIN, referralCode: undefined };
  }
}

function GoogleBridgeCallbackInner() {
  const params = useSearchParams();
  const [message, setMessage] = useState("Completing Google sign-in...");
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    const code = params.get("code");
    const state = decodeState(params.get("state") || "");
    const error = params.get("error");
    const send = (data: Record<string, unknown>) => {
      window.opener?.postMessage({ type: "NURXAI_GOOGLE_SESSION", state: state.nonce, ...data }, state.returnOrigin);
    };
    if (error || !code || !state.nonce || !window.opener) {
      const reason = error === "access_denied" ? "Google sign-in was cancelled." : "Google sign-in could not be started. Please try again.";
      setMessage(reason);
      send({ error: reason });
      return;
    }
    fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code, referralCode: state.referralCode })
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Google sign-in could not be completed. Please try again.");
      send({ token: data.token, user: data.user });
      setMessage("Signed in. This window will close now.");
      window.setTimeout(() => window.close(), 400);
    }).catch((requestError) => {
      const reason = requestError?.message || "Google sign-in could not be completed. Please try again.";
      setMessage(reason);
      send({ error: reason });
    });
  }, [params]);

  return <main className="auth-stage grid min-h-screen place-items-center px-5 py-12"><div className="nb-card w-full max-w-sm p-7 text-center"><span className="nb-tag">GOOGLE ACCESS</span><h1 className="mt-5 font-display text-3xl font-black">Sign in to NurAi</h1><p className="mt-3 text-sm opacity-70">{message}</p></div></main>;
}

export default function GoogleBridgeCallback() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center font-black">Completing Google sign-in...</main>}><GoogleBridgeCallbackInner /></Suspense>;
}