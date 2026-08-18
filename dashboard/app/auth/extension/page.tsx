"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
import { restoreBrowserSession } from "@/lib/client-session";

const NURAI_EXTENSION_ID = "odapbgkbdpalphekkmibliclmedgmlhb";

function ExtensionAuthInner() {
  const params = useSearchParams();
  const router = useRouter();
  const extId = params.get("ext_id");
  const [status, setStatus] = useState("Checking…");

  useEffect(() => {
    (async () => {
      if (extId && extId !== NURAI_EXTENSION_ID) {
        setStatus("This connection link is not for the NurAi extension.");
        return;
      }
      const token = localStorage.getItem("nurxai_jwt") || (await restoreBrowserSession())?.token;
      if (!token) {
        const next = encodeURIComponent(
          window.location.pathname + window.location.search
        );
        router.replace(`/login?next=${next}`);
        return;
      }
      try {
        const r = await fetch("/api/extension/token", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Client-Version": "2.0.17"
          }
        });
        if (!r.ok) {
          setStatus("Could not verify session. Please sign in again.");
          return;
        }
        const data = await r.json();
        const user = JSON.parse(localStorage.getItem("nurxai_user") || "null");

        if (extId === NURAI_EXTENSION_ID && (window as any).chrome?.runtime?.sendMessage) {
          const connected = await new Promise<boolean>((resolve) => {
            let settled = false;
            const finish = (value: boolean) => {
              if (settled) return;
              settled = true;
              resolve(value);
            };
            try {
              (window as any).chrome.runtime.sendMessage(
                NURAI_EXTENSION_ID,
                { type: "NURAI_SET_TOKEN", token: data.token, user },
                (response: any) => {
                  if ((window as any).chrome.runtime.lastError) return finish(false);
                  finish(response?.ok === true);
                }
              );
              setTimeout(() => finish(false), 1500);
            } catch {
              finish(false);
            }
          });
          setStatus(connected
            ? "Connected! You can close this tab and return to X."
            : "Could not reach the extension. Reload it, then try Connect again.");
        } else {
          setStatus("Signed in. Open the NurAi extension to continue.");
        }
      } catch {
        setStatus("Network error. Please try again.");
      }
    })();
  }, [extId, router]);

  return (
    <div className="nb-card p-7 text-center" style={{ background: "var(--accent3)" }}>
      <h1 className="font-display font-black text-3xl">NurAi</h1>
      <p className="mt-4">{status}</p>
    </div>
  );
}

export default function ExtensionAuth() {
  return (
    <>
      <Navbar />
      <main className="max-w-md mx-auto px-5 py-12">
        <Suspense
          fallback={
            <div className="nb-card p-7 text-center">
              <h1 className="font-display font-black text-3xl">NurAi</h1>
              <p className="mt-4">Loading…</p>
            </div>
          }
        >
          <ExtensionAuthInner />
        </Suspense>
      </main>
    </>
  );
}
