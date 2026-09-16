"use client";

import { useEffect, useState } from "react";

type ExtensionStatus = {
  ok?: boolean;
  installed?: boolean;
  enabled?: boolean;
  ready?: boolean;
  address?: string | null;
  expiresAt?: number | null;
};

type PaygConfig = {
  enabled: boolean;
  price: string;
  regularPrice: string;
  currentPrice: string;
  discountPercent: number;
  discounted: boolean;
};

const STORE_EXTENSION_ID = "odapbgkbdpalphekkmibliclmedgmlhb";
const PRICING_CACHE_KEY = "nurxai_payg_pricing_v1";
const EXTENSION_CACHE_KEY = "nurxai_payg_extension_status_v1";
const DEFAULT_CONFIG: PaygConfig = {
  enabled: true,
  price: "$0.009",
  regularPrice: "$0.009",
  currentPrice: "$0.009",
  discountPercent: 0,
  discounted: false
};

function bridgeMessage(type: "NURAI_PAYG_STATUS" | "NURAI_OPEN_PAYG_SETUP") {
  return new Promise<ExtensionStatus | null>((resolve) => {
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, 700);
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
    window.postMessage({ source: "nurai-dashboard", type, requestId }, window.location.origin);
  });
}

function storeExtensionMessage(type: "NURAI_PAYG_STATUS" | "NURAI_OPEN_PAYG_SETUP") {
  return new Promise<ExtensionStatus | null>((resolve) => {
    const runtime = (window as any).chrome?.runtime;
    if (!runtime?.sendMessage) return resolve(null);
    try {
      runtime.sendMessage(STORE_EXTENSION_ID, { type }, (response: ExtensionStatus) => {
        if ((window as any).chrome?.runtime?.lastError) return resolve(null);
        resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function extensionMessage(type: "NURAI_PAYG_STATUS" | "NURAI_OPEN_PAYG_SETUP") {
  return (await bridgeMessage(type)) || storeExtensionMessage(type);
}

export default function PaygWalletCard() {
  const [config, setConfig] = useState<PaygConfig>(DEFAULT_CONFIG);
  const [extension, setExtension] = useState<ExtensionStatus | null>(null);
  const [extensionChecked, setExtensionChecked] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let stopped = false;
    try {
      const cachedPricing = JSON.parse(localStorage.getItem(PRICING_CACHE_KEY) || "null");
      const cachedExtension = JSON.parse(localStorage.getItem(EXTENSION_CACHE_KEY) || "null");
      if (cachedPricing?.currentPrice) setConfig(cachedPricing);
      if (cachedExtension?.installed || cachedExtension?.ok) setExtension(cachedExtension);
    } catch {}
    const refreshPricing = () => fetch("/api/payg/config", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Pricing unavailable");
        return response.json();
      })
      .then((data) => {
        if (stopped) return;
        setConfig(data);
        try { localStorage.setItem(PRICING_CACHE_KEY, JSON.stringify(data)); } catch {}
      })
      .catch(() => {});
    const refreshExtension = () => extensionMessage("NURAI_PAYG_STATUS").then((response) => {
      if (stopped) return;
      if (response?.ok || response?.installed) {
        setExtension(response);
        try { localStorage.setItem(EXTENSION_CACHE_KEY, JSON.stringify(response)); } catch {}
      } else {
        setExtension(null);
        try { localStorage.removeItem(EXTENSION_CACHE_KEY); } catch {}
      }
      setExtensionChecked(true);
    });
    void refreshPricing();
    void refreshExtension();
    const pricingTimer = window.setInterval(refreshPricing, 30_000);
    const extensionTimer = window.setInterval(refreshExtension, 30_000);
    return () => {
      stopped = true;
      window.clearInterval(pricingTimer);
      window.clearInterval(extensionTimer);
    };
  }, []);

  useEffect(() => {
    if (!extension?.address) return;
    let stopped = false;
    const refresh = () => fetch(`/api/payg/balance?address=${encodeURIComponent(extension.address!)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => { if (!stopped && Number.isFinite(data.balance)) setBalance(data.balance); })
      .catch(() => {});
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [extension?.address]);

  async function openSetup() {
    setMessage("");
    const response = await extensionMessage("NURAI_OPEN_PAYG_SETUP");
    setMessage(response?.ok
      ? "Wallet setup opened."
      : "Install or reload the updated NurAi extension, then refresh this page.");
  }

  if (!config.enabled) return null;

  const ready = Boolean(extension?.ready);
  const discounted = config.discounted === true;
  return (
    <section className="nb-card p-4 mb-6" style={{ background: "color-mix(in srgb, var(--accent2) 34%, var(--card))" }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="nb-tag" style={{ background: ready ? "color-mix(in srgb, #86efac 60%, var(--card))" : "color-mix(in srgb, var(--card) 80%, transparent)" }}>
              {ready ? "READY" : "BASE"}
            </span>
            <h2 className="font-display font-black text-xl">Pay As You Go</h2>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2" aria-live="polite">
            {discounted && <span className="text-sm font-black line-through opacity-55">{config.regularPrice}</span>}
            <span className={discounted ? "payg-discount-price" : "text-lg font-black"}>
              {config.currentPrice || config.price} USDC
            </span>
            {discounted && <span className="payg-discount-badge">SAVE {config.discountPercent}%</span>}
            <span className="text-sm font-semibold">per Premium generation. No daily limit.</span>
          </div>
          {extension?.address && (
            <p className="mt-1 text-xs opacity-70 truncate max-w-xl">
              Wallet: <code>{extension.address}</code>
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          {extension?.address && (
            <div className="text-right leading-tight">
              <div className="font-display font-black text-xl">{balance === null ? "--" : balance.toFixed(3)}</div>
              <div className="text-xs font-bold">USDC</div>
            </div>
          )}
          <button type="button" className="nb-btn nb-btn-primary" onClick={openSetup} disabled={!extensionChecked && !extension}>
            {!extensionChecked && !extension ? "Checking wallet..." : ready ? "Manage wallet" : "Create / connect wallet"}
          </button>
        </div>
      </div>
      {message && <p className="text-xs font-bold mt-2">{message}</p>}
    </section>
  );
}
