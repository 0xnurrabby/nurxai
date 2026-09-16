"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORE_EXTENSION_ID = "odapbgkbdpalphekkmibliclmedgmlhb";
const STORE_URL = `https://chromewebstore.google.com/detail/${STORE_EXTENSION_ID}`;
const DISMISS_KEY = "nurxai_extension_gate_dismissed";
const COUNTDOWN_START = 4;

type ExtensionStatus = { ok?: boolean; installed?: boolean; enabled?: boolean; ready?: boolean };

function bridgeStatus() {
  return new Promise<ExtensionStatus | null>((resolve) => {
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, 900);
    function onMessage(event: MessageEvent) {
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        event.data?.source !== "nurai-extension" ||
        event.data?.type !== "NURAI_DASHBOARD_RESPONSE" ||
        event.data?.requestId !== requestId
      ) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(event.data.response || null);
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "nurai-dashboard", type: "NURAI_PAYG_STATUS", requestId }, window.location.origin);
  });
}

function storeStatus() {
  return new Promise<ExtensionStatus | null>((resolve) => {
    const runtime = (window as any).chrome?.runtime;
    if (!runtime?.sendMessage) return resolve(null);
    try {
      runtime.sendMessage(STORE_EXTENSION_ID, { type: "NURAI_PAYG_STATUS" }, (response: ExtensionStatus) => {
        if ((window as any).chrome?.runtime?.lastError) return resolve(null);
        resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export default function ExtensionGate() {
  const [status, setStatus] = useState<"checking" | "missing" | "connected">("checking");
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  const [dismissed, setDismissed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const redirected = useRef(false);

  const check = useCallback(async () => {
    setStatus("checking");
    const found = (await bridgeStatus()) || (await storeStatus());
    setStatus(found?.ok || found?.installed ? "connected" : "missing");
  }, []);

  useEffect(() => {
    setMobile(isMobile());
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {}
    void check();
  }, [check]);

  useEffect(() => {
    if (status !== "missing" || dismissed || mobile || redirected.current) return;
    if (countdown <= 0) {
      redirected.current = true;
      window.location.href = STORE_URL;
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [status, dismissed, mobile, countdown]);

  function dismiss() {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch {}
  }

  if (status === "checking") {
    return <div className="mt-4 h-14 nb-skeleton" aria-hidden="true" />;
  }

  if (status === "connected") {
    return null;
  }

  if (dismissed) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ring)] px-4 py-3 text-sm">
        <span className="opacity-75">Chrome extension not detected yet.</span>
        <span className="flex gap-2">
          <a className="nb-btn" href={STORE_URL} target="_blank" rel="noopener noreferrer">Install extension</a>
          <button type="button" className="nb-btn nb-btn-primary" onClick={() => void check()}>I installed it</button>
        </span>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-[var(--ring)] p-5" style={{ background: "color-mix(in srgb, var(--accent) 20%, var(--card))" }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-55">One step left</div>
          <h2 className="mt-1 font-display text-xl font-bold">Add the NurAi Chrome extension</h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed opacity-75">
            NurAi lives in your X reply box. Install it once, come back to this tab, and your suggestions are ready.
          </p>
          {mobile ? (
            <p className="mt-2 text-xs opacity-60">Extensions run on desktop Chrome. Open this page on your computer to finish setup.</p>
          ) : (
            <p className="mt-2 text-xs opacity-60">
              Taking you to the Chrome Web Store in {countdown}s. If nothing happens, use the install button.
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a className="nb-btn nb-btn-primary" href={STORE_URL} target="_blank" rel="noopener noreferrer">
            Install free extension
          </a>
          <button type="button" className="nb-btn" onClick={() => void check()}>I installed it</button>
          {!mobile && <button type="button" className="nb-btn" onClick={dismiss}>Not now</button>}
        </div>
      </div>
    </div>
  );
}
