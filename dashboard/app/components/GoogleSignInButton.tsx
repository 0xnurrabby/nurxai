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
  onSuccess: (token: string, user: any) => void;
  onError: (message: string) => void;
  forceDirect?: boolean;
};

const SCRIPT_ID = "google-identity-services";
const GOOGLE_BRIDGE_ORIGIN = "https://www.nurxai.xyz";

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
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google login script failed."));
    document.head.appendChild(script);
  });
}

export default function GoogleSignInButton({ label = "continue_with", referralCode, onSuccess, onError, forceDirect = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const popupRef = useRef<Window | null>(null);
  const bridgeStateRef = useRef("");
  const [configured, setConfigured] = useState(true);
  const [useBridge, setUseBridge] = useState<boolean | null>(forceDirect ? false : null);

  useEffect(() => {
    if (forceDirect) return;
    const productionHost = window.location.hostname === "nurxai.xyz" || window.location.hostname === "www.nurxai.xyz";
    setUseBridge(productionHost && process.env.NEXT_PUBLIC_GOOGLE_DIRECT_AUTH !== "true");
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
          ux_mode: "popup",
          auto_select: false,
          callback: async (response: any) => {
            try {
              const r = await fetch("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential: response.credential, referralCode })
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
          const params = new URLSearchParams({ return_origin: window.location.origin, state });
          if (referralCode) params.set("ref", referralCode);
          popupRef.current = window.open(
            `${GOOGLE_BRIDGE_ORIGIN}/auth/google-bridge?${params}`,
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
