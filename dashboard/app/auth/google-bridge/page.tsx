"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import GoogleSignInButton from "../../components/GoogleSignInButton";

const ALLOWED_RETURN_ORIGINS = new Set(["https://nurxai.xyz", "https://www.nurxai.xyz"]);

function GoogleBridgeInner() {
  const params = useSearchParams();
  const [message, setMessage] = useState("Choose the Google account you want to use.");
  const returnOrigin = useMemo(() => {
    const requested = params.get("return_origin") || "";
    return ALLOWED_RETURN_ORIGINS.has(requested) ? requested : "https://nurxai.xyz";
  }, [params]);
  const referralCode = params.get("ref") || undefined;
  const state = params.get("state") || "";

  const finish = useCallback((token: string, user: any) => {
    if (!window.opener || !state) {
      setMessage("Open Google sign-in from nurxai.xyz and try again.");
      return;
    }
    window.opener.postMessage({ type: "NURXAI_GOOGLE_SESSION", token, user, state }, returnOrigin);
    setMessage("Signed in. This window will close now.");
    window.setTimeout(() => window.close(), 400);
  }, [returnOrigin, state]);

  const fail = useCallback((error: string) => {
    setMessage(error);
    window.opener?.postMessage({ type: "NURXAI_GOOGLE_SESSION", error, state }, returnOrigin);
  }, [returnOrigin, state]);

  return (
    <main className="auth-stage grid min-h-screen place-items-center px-5 py-12">
      <div className="nb-card w-full max-w-sm p-7 text-center">
        <span className="nb-tag">GOOGLE ACCESS</span>
        <h1 className="mt-5 font-display text-3xl font-black">Sign in to NurAi</h1>
        <p className="mt-3 text-sm opacity-70">{message}</p>
        <div className="mt-6">
          <GoogleSignInButton
            forceDirect
            label="continue_with"
            referralCode={referralCode}
            onSuccess={finish}
            onError={fail}
          />
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
