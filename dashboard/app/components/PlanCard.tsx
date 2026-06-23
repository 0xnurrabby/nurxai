"use client";
import { useState } from "react";

type Plan = {
  key: string;
  name: string;
  priceUSD: number;
  days: number;
  perks: readonly string[];
  featured?: boolean;
};

type Props = {
  plan: Plan;
  currentPlan?: string | null;
};

let basePayCache: any = null;
async function loadBasePay(): Promise<any> {
  if (basePayCache) return basePayCache;
  const url = "https://esm.sh/@base-org/account@2.5.4?bundle";
  // @ts-ignore
  basePayCache = await import(/* webpackIgnore: true */ url);
  return basePayCache;
}

export default function PlanCard({ plan, currentPlan }: Props) {
  const [loading, setLoading] = useState<"" | "base" | "nowp" | "trial">("");
  const [error, setError] = useState("");
  const [chooserOpen, setChooserOpen] = useState(false);
  const isCurrent = currentPlan === plan.key;
  const isFree = plan.priceUSD <= 0;

  function getToken(): string | null {
    return typeof window === "undefined"
      ? null
      : localStorage.getItem("nurxai_jwt");
  }

  function showError(data: any, fallback: string) {
    const msg =
      data?.message ||
      data?.details?.message ||
      (typeof data?.details === "string" ? data.details : null) ||
      data?.error ||
      fallback;
    setError(msg);
  }

  async function buyWithNowPayments() {
    setError("");
    setLoading("nowp");
    try {
      const token = getToken();
      if (!token) {
        window.location.href = `/login?next=${encodeURIComponent("/pricing")}`;
        return;
      }
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ plan: plan.key })
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid server response (${res.status}). Please check Vercel logs.`);
      }

      if (!res.ok || !data.url) {
        showError(data, "Could not create NowPayments invoice.");
        return;
      }
      setError(data.message || "Invoice created. Redirecting to secure crypto checkout...");
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || "Network error. Try again.");
    } finally {
      setLoading("");
    }
  }

  async function buyWithBasePay() {
    setError("");
    setLoading("base");
    try {
      const token = getToken();
      if (!token) {
        window.location.href = `/login?next=${encodeURIComponent("/pricing")}`;
        return;
      }

      const initRes = await fetch("/api/billing/base-pay/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ plan: plan.key })
      });

      const initText = await initRes.text();
      let init;
      try {
        init = JSON.parse(initText);
      } catch (e) {
        throw new Error(`Base Pay Init failed (${initRes.status}).`);
      }

      if (!initRes.ok) {
        showError(init, "Could not start Base Pay.");
        return;
      }

      let sdk: any;
      try {
        sdk = await loadBasePay();
      } catch (e: any) {
        setError("Could not load Base Pay SDK. Please check your internet or try NowPayments.");
        return;
      }
      
      const pay = sdk.pay || sdk.default?.pay;
      if (!pay) {
        setError("Base Pay SDK is unavailable.");
        return;
      }

      const result = await pay({
        amount: String(init.amount),
        to: init.to,
        testnet: false
      });

      const txHash = result?.id || result?.transactionHash || result?.txHash || result?.hash;
      if (!txHash) {
        setError("Payment was cancelled or failed.");
        return;
      }

      // 3) Verification Loop
      for (let i = 0; i < 8; i++) {
        const verifyRes = await fetch("/api/billing/base-pay/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            orderId: init.orderId,
            txHash,
            plan: plan.key
          })
        });
        
        const vText = await verifyRes.text();
        let verify = {};
        try { verify = JSON.parse(vText); } catch(e) {}

        if (verifyRes.ok) {
          window.location.href = "/dashboard?paid=1";
          return;
        }
        if (verifyRes.status !== 202) {
          showError(verify, "Verification failed.");
          return;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      
      setError("Payment is pending on-chain. Your plan will activate once confirmed.");
    } catch (e: any) {
      setError(e?.message || "Base Pay process failed.");
    } finally {
      setLoading("");
    }
  }

  async function startFreeTrial() {
    setError("");
    setLoading("trial");
    try {
      const token = getToken();
      if (!token) {
        window.location.href = "/signup";
        return;
      }

      const res = await fetch("/api/billing/start-trial", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data, "Could not start free trial.");
        return;
      }
      window.location.href = "/dashboard?trial=1";
    } catch (e: any) {
      setError(e?.message || "Network error. Try again.");
    } finally {
      setLoading("");
    }
  }

  const cardClass = isCurrent
    ? "nb-card nb-current p-6 flex flex-col"
    : plan.featured
    ? "nb-card nb-featured p-6 flex flex-col"
    : "nb-card p-6 flex flex-col";

  return (
    <div className={cardClass}>
      {isCurrent && (
        <div className="nb-tag mb-3 self-start" style={{ background: "var(--accent)" }}>
          CURRENT PLAN
        </div>
      )}
      {!isCurrent && plan.featured && (
        <div className="nb-tag mb-3 self-start" style={{ background: "var(--accent2)" }}>
          BEST VALUE
        </div>
      )}

      <h3 className="font-display font-black text-2xl">{plan.name}</h3>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-display font-black text-4xl">{isFree ? "Free" : `$${plan.priceUSD}`}</span>
        <span className="text-sm font-semibold opacity-70">
          / {plan.days === 1 ? "1 day" : plan.days < 30 ? `${plan.days} days` : "month"}
        </span>
      </div>

      <ul className="mt-4 space-y-2 flex-1">
        {plan.perks.map((p) => (
          <li key={p} className="flex items-start gap-2">
            <span className="font-black">+</span>
            <span className="text-sm">{p}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <button className="nb-btn mt-6" disabled>Active</button>
      ) : isFree ? (
        <button
          className="nb-btn nb-btn-primary mt-6"
          onClick={startFreeTrial}
          disabled={!!loading || !!currentPlan}
        >
          {loading === "trial" ? "Starting..." : currentPlan ? "Included with active plan" : "Start Free Trial"}
        </button>
      ) : !chooserOpen ? (
        <button
          className={`nb-btn mt-6 ${plan.featured ? "nb-btn-success" : "nb-btn-primary"}`}
          onClick={() => setChooserOpen(true)}
        >
          Buy {plan.name}
        </button>
      ) : (
        <div className="mt-6 space-y-2">
          <button
            className="nb-btn w-full font-bold"
            style={{ background: "#0000FF", color: "#fff" }}
            onClick={buyWithBasePay}
            disabled={!!loading}
          >
            {loading === "base" ? "Opening Base..." : "Pay with Base (USDC)"}
          </button>
          <button
            className="nb-btn nb-btn-primary w-full"
            onClick={buyWithNowPayments}
            disabled={!!loading}
          >
            {loading === "nowp" ? "Creating invoice..." : "Pay with BTC / ETH / USDT"}
          </button>
          <p className="text-xs opacity-70 leading-relaxed">
            You will choose the coin on NOWPayments. Access turns on automatically after the payment reaches final confirmation.
          </p>
          <button
            className="text-xs opacity-60 hover:opacity-100 underline mt-1"
            onClick={() => setChooserOpen(false)}
            disabled={!!loading}
          >
            cancel
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm font-semibold" style={{ color: "#b00020" }}>
          {error}
        </p>
      )}
    </div>
  );
}
