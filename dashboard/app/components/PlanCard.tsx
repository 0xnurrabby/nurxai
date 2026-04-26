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

// We import the Base Pay browser SDK lazily from a CDN so we never bundle
// the heavy Coinbase CDP dependency on Vercel. The import only runs when
// the user actually clicks "Pay with Base", so it does not affect first
// page load or any other route.
let basePayCache: any = null;
async function loadBasePay(): Promise<any> {
  if (basePayCache) return basePayCache;
  const url = "https://esm.sh/@base-org/account@2.5.4?bundle";
  // @ts-ignore - dynamic remote ESM, no static type for this URL
  basePayCache = await import(/* webpackIgnore: true */ url);
  return basePayCache;
}

export default function PlanCard({ plan, currentPlan }: Props) {
  const [loading, setLoading] = useState<"" | "base" | "nowp">("");
  const [error, setError] = useState("");
  const [chooserOpen, setChooserOpen] = useState(false);
  const isCurrent = currentPlan === plan.key;

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
      const data = await res.json();
      if (!res.ok || !data.url) {
        showError(data, "Could not create invoice.");
        return;
      }
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

      // 1) Server-canonical order (so the user can't tamper with price/recipient).
      const initRes = await fetch("/api/billing/base-pay/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ plan: plan.key })
      });
      const init = await initRes.json();
      if (!initRes.ok) {
        showError(init, "Could not start Base Pay.");
        return;
      }

      // 2) Load SDK + open wallet popup.
      let sdk: any;
      try {
        sdk = await loadBasePay();
      } catch (e: any) {
        setError(
          "Could not load Base Pay (network blocked the SDK). Try the NowPayments option below."
        );
        return;
      }
      const pay = sdk.pay || sdk.default?.pay;
      if (!pay) {
        setError("Base Pay SDK is unavailable. Try NowPayments.");
        return;
      }

      const result = await pay({
        amount: String(init.amount),
        to: init.to,
        testnet: false
      });
      const txHash =
        result?.id || result?.transactionHash || result?.txHash || result?.hash;
      if (!txHash) {
        setError("Payment was cancelled.");
        return;
      }

      // 3) Server verifies the on-chain tx and grants the plan.
      // Retry briefly because fresh txs can take a moment to appear on the RPC.
      for (let i = 0; i < 6; i++) {
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
        const verify = await verifyRes.json().catch(() => ({}));
        if (verifyRes.ok) {
          window.location.href = "/dashboard?paid=1";
          return;
        }
        if (verifyRes.status !== 202) {
          // Hard failure — show the actual reason.
          showError(verify, "Could not verify payment.");
          return;
        }
        // 202 = tx not yet on-chain. Wait and try again.
        await new Promise((r) => setTimeout(r, 2500));
      }
      setError(
        "Payment is taking longer than usual to confirm. If it does confirm on chain your plan will activate, otherwise contact @Nur_Xai."
      );
    } catch (e: any) {
      setError(e?.message || "Base Pay failed.");
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
        <div
          className="nb-tag mb-3 self-start"
          style={{ background: "var(--accent)" }}
        >
          CURRENT PLAN
        </div>
      )}
      {!isCurrent && plan.featured && (
        <div
          className="nb-tag mb-3 self-start"
          style={{ background: "var(--accent2)" }}
        >
          BEST VALUE
        </div>
      )}

      <h3 className="font-display font-black text-2xl">{plan.name}</h3>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-display font-black text-4xl">
          ${plan.priceUSD}
        </span>
        <span className="text-sm font-semibold opacity-70">
          /{" "}
          {plan.days === 1
            ? "1 day"
            : plan.days < 30
            ? `${plan.days} days`
            : "month"}
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
        <button className="nb-btn mt-6" disabled>
          Active
        </button>
      ) : !chooserOpen ? (
        <button
          className={`nb-btn mt-6 ${
            plan.featured ? "nb-btn-success" : "nb-btn-primary"
          }`}
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
            {loading === "nowp"
              ? "Redirecting..."
              : "Pay with BTC / ETH / USDT (NowPayments)"}
          </button>
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
        <p
          className="mt-3 text-sm font-semibold"
          style={{ color: "#b00020" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
