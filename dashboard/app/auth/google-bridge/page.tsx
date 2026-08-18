"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import GoogleSignInButton from "../../components/GoogleSignInButton";

const ALLOWED_RETURN_ORIGINS = new Set(["https://nurxai.xyz", "https://www.nurxai.xyz"]);

function GoogleBridgeInner() {
  const params = useSearchParams();
  const [message, setMessage] = useState("Continue with your Google account.");
  const returnOrigin = useMemo(() => {
    const requested = params.get("return_origin") || "";
    return ALLOWED_RETURN_ORIGINS.has(requested) ? requested : "https://nurxai.xyz";
  }, [params]);
  const referralCode = params.get("ref") || undefined;

  const finish = useCallback((token: string, user: any) => {
    if (!window.opener) {
      setMessage("Open Google sign-in from nurxai.xyz and try again.");
      return;
    }
    window.opener.postMessage({ type: "NURXAI_GOOGLE_SESSION", token, user }, returnOrigin);
    setMessage("Signed in. You can close this window.");
    window.setTimeout(() => window.close(), 500);
  }, [returnOrigin]);

  const fail = useCallback((error: string) => {
    setMessage(error);
    window.opener?.postMessage({ type: "NURXAI_GOOGLE_SESSION", error }, returnOrigin);
  }, [returnOrigin]);

  return (
    <main className="min-h-screen grid place-items-center px-5 py-12">
      <div className="nb-card p-7 w-full max-w-sm text-center">
        <h1 className="font-display font-black text-3xl">Sign in to NurAi</h1>
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
    <Suspense fallback={<main className="min-h-screen grid place-items-center">Loading...</main>}>
      <GoogleBridgeInner />
    </Suspense>
  );
}
