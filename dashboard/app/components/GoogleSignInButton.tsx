"use client";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: any) => void;
          renderButton: (element: HTMLElement, options: any) => void;
        };
      };
    };
  }
}

type Props = {
  label?: "signin_with" | "signup_with" | "continue_with";
  referralCode?: string;
  acceptedTerms?: boolean;
  onSuccess: (token: string, user: any) => void;
  onError: (message: string) => void;
  forceDirect?: boolean;
};

const SCRIPT_ID = "google-identity-services";
const GOOGLE_BRIDGE_ORIGIN = (process.env.NEXT_PUBLIC_GOOGLE_BRIDGE_ORIGIN || "").replace(/\/+$/, "");
const GOOGLE_CALLBACK_PATH = "/auth/google-bridge/callback";

function encodeOAuthState(value: Record<string, string>) {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function loadGoogleScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google login script failed.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client?hl=en";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google login script failed."));
    document.head.appendChild(script);
  });
}

export default function GoogleSignInButton({ label = "continue_with", referralCode, acceptedTerms, onSuccess, onError, forceDirect = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const popupRef = useRef<Window | null>(null);
  const bridgeStateRef = useRef("");
  const [configured, setConfigured] = useState(true);
  const [useBridge, setUseBridge] = useState<boolean | null>(forceDirect ? false : null);

  useEffect(() => {
    if (forceDirect) return;
    const directAuth = process.env.NEXT_PUBLIC_GOOGLE_DIRECT_AUTH !== "false";
    setUseBridge(!directAuth && Boolean(GOOGLE_BRIDGE_ORIGIN));
  }, [forceDirect]);

  useEffect(() => {
    if (!useBridge) return;
    function receiveGoogleSession(event: MessageEvent) {
      if (
        event.origin !== GOOGLE_BRIDGE_ORIGIN
        || event.source !== popupRef.current
        || event.data?.type !== "NURXAI_GOOGLE_SESSION"
        || event.data?.state !== bridgeStateRef.current
      ) return;
      if (event.data.error) {
        onError(event.data.error);
        return;
      }
      if (typeof event.data.token !== "string" || !event.data.user) return;
      void fetch("/api/auth/session", { credentials: "include", cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Could not establish your NurAi session.");
          const session = await response.json();
          onSuccess(session.token, session.user);
        })
        .catch((error) => onError(error?.message || "Google sign-in could not be completed."));
    }
    window.addEventListener("message", receiveGoogleSession);
    return () => window.removeEventListener("message", receiveGoogleSession);
  }, [onError, onSuccess, useBridge]);

  useEffect(() => {
    if (useBridge !== false) return;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setConfigured(false);
      return;
    }

    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          locale: "en",
          ux_mode: "popup",
          auto_select: false,
          callback: async (response: any) => {
            try {
              const r = await fetch("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential: response.credential, referralCode, acceptedTerms: acceptedTerms === true })
              });
              const d = await r.json().catch(() => ({}));
              if (!r.ok) {
                onError(d.message || "Google sign-in could not be completed. Please try again.");
                return;
              }
              onSuccess(d.token, d.user);
            } catch {
              onError("Google login failed. Try again.");
            }
          }
        });
        ref.current.innerHTML = "";
        window.google.accounts.id.renderButton(ref.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: label,
          logo_alignment: "left",
          width: Math.min(360, ref.current.clientWidth || 360)
        });
      })
      .catch((error: any) => onError(error?.message || "Google login unavailable."));

    return () => {
      cancelled = true;
    };
  }, [label, onError, onSuccess, referralCode, useBridge]);

  if (useBridge === null) return <div className="min-h-[44px]" />;

  if (useBridge) {
    return (
      <button
        type="button"
        className="nb-btn min-h-[44px] w-full gap-3"
        onClick={() => {
           const state = crypto.randomUUID();
           bridgeStateRef.current = state;
           const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
           if (!clientId) {
             onError("Google login is not configured.");
             return;
           }
           const oauthState = encodeOAuthState({
             nonce: state,
             returnOrigin: window.location.origin,
             referralCode: referralCode || ""
           });
           const params = new URLSearchParams({
             client_id: clientId,
             redirect_uri: `${GOOGLE_BRIDGE_ORIGIN}${GOOGLE_CALLBACK_PATH}`,
             response_type: "code",
             scope: "openid email profile",
             state: oauthState,
             prompt: "select_account"
           });
           popupRef.current = window.open(
             `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
             "nurxai-google-signin",
             "popup=yes,width=520,height=700"
          );
          if (!popupRef.current) onError("Allow popups for NurAi, then try Google sign-in again.");
        }}
      >
        <span className="font-black" aria-hidden="true">G</span>
        {label === "signup_with" ? "Sign up with Google" : "Sign in with Google"}
      </button>
    );
  }

  if (!configured) {
    return (
      <div className="nb-card p-3 text-sm" style={{ background: "var(--accent3)" }}>
        Google login needs NEXT_PUBLIC_GOOGLE_CLIENT_ID.
      </div>
    );
  }

  return <div ref={ref} className="min-h-[44px] w-full grid place-items-center overflow-hidden" />;
}
