"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";

function ExtensionAuthInner() {
  const params = useSearchParams();
  const router = useRouter();
  const extId = params.get("ext_id");
  const [status, setStatus] = useState("Checking…");

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem("nurxai_jwt");
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
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!r.ok) {
          setStatus("Could not verify session. Please sign in again.");
          return;
        }
        const data = await r.json();
        const user = JSON.parse(localStorage.getItem("nurxai_user") || "null");

        if (extId && (window as any).chrome?.runtime?.sendMessage) {
          await new Promise<void>((resolve) => {
            try {
              (window as any).chrome.runtime.sendMessage(
                extId,
                { type: "NURAI_SET_TOKEN", token: data.token, user },
                () => resolve()
              );
              setTimeout(resolve, 1500);
            } catch {
              resolve();
            }
          });
          setStatus("✓ Connected! You can close this tab and return to X.");
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
