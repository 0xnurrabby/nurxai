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

export default function PlanCard({ plan }: { plan: Plan }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function buy() {
    setError("");
    setLoading(true);
    try {
      const token = localStorage.getItem("nurxai_jwt");
      if (!token) {
        window.location.href = `/login?next=${encodeURIComponent("/pricing")}`;
        return;
      }
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: plan.key, payCurrency: "usdttrc20" })
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Could not create invoice.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`nb-card p-6 flex flex-col ${plan.featured ? "ring-4 ring-ink dark:ring-nightInk" : ""}`}
      style={plan.featured ? { background: "var(--accent3)" } : undefined}
    >
      {plan.featured && (
        <div className="nb-tag mb-3 self-start" style={{ background: "var(--accent2)" }}>
          ⭐ BEST VALUE
        </div>
      )}
      <h3 className="font-display font-black text-2xl">{plan.name}</h3>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-display font-black text-4xl">${plan.priceUSD}</span>
        <span className="text-sm font-semibold opacity-70">
          / {plan.days === 1 ? "1 day" : plan.days < 30 ? `${plan.days} days` : "month"}
        </span>
      </div>

      <ul className="mt-4 space-y-2 flex-1">
        {plan.perks.map((p) => (
          <li key={p} className="flex items-start gap-2">
            <span className="font-black">✓</span>
            <span className="text-sm">{p}</span>
          </li>
        ))}
      </ul>

      <button
        className={`nb-btn mt-6 ${plan.featured ? "nb-btn-success" : "nb-btn-primary"}`}
        onClick={buy}
        disabled={loading}
      >
        {loading ? "Redirecting…" : `Buy ${plan.name}`}
      </button>
      {error && <p className="mt-3 text-sm font-semibold" style={{ color: "#b00020" }}>{error}</p>}
    </div>
  );
}
