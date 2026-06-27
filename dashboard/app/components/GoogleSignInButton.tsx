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
  next?: string;
  label?: "signin_with" | "signup_with" | "continue_with";
  referralCode?: string;
  onSuccess: (token: string, user: any) => void;
  onError: (message: string) => void;
};

const SCRIPT_ID = "google-identity-services";

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

export default function GoogleSignInButton({ label = "continue_with", referralCode, onSuccess, onError }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
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
          callback: async (response: any) => {
            try {
              const r = await fetch("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential: response.credential, referralCode })
              });
              const d = await r.json().catch(() => ({}));
              if (!r.ok) {
                onError(d.error || "Google login failed.");
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
  }, [label, onError, onSuccess, referralCode]);

  if (!configured) {
    return (
      <div className="nb-card p-3 text-sm" style={{ background: "var(--accent3)" }}>
        Google login needs NEXT_PUBLIC_GOOGLE_CLIENT_ID.
      </div>
    );
  }

  return <div ref={ref} className="min-h-[44px] grid place-items-center" />;
}
