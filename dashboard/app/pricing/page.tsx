"use client";
import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import PlanCard from "../components/PlanCard";
import { PLANS } from "@/lib/plans";

export default function Pricing() {
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem("nurxai_jwt");
      if (!token) return;
      try {
        const r = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (r.ok) {
          const d = await r.json();
          if (d.subscription) {
            setCurrentPlan(d.subscription.plan);
            setEndsAt(d.subscription.endsAt);
          }
        }
      } catch {}
    })();
  }, []);

  async function cancelSubscription() {
    if (
      !confirm(
        "Cancel subscription? You'll keep access until the current period ends, but it won't renew automatically (note: NurAi never auto-renews anyway)."
      )
    )
      return;

    setCancelling(true);
    try {
      const token = localStorage.getItem("nurxai_jwt");
      const r = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (r.ok) {
        alert("✅ Subscription cancelled. Access remains until end date.");
        setCurrentPlan(null);
        setEndsAt(null);
      } else {
        alert("Failed to cancel.");
      }
    } catch {
      alert("Network error.");
    } finally {
      setCancelling(false);
    }
  }

  const order = ["trial", "starter", "pro", "premium"] as const;

  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-5 py-12">
        <h1 className="font-display font-black text-4xl md:text-5xl text-center">
          Pick your plan
        </h1>
        <p className="mt-3 text-center max-w-xl mx-auto">
          Pay with crypto (BTC, ETH, USDT, and more). Cancel anytime —
          subscription simply ends.
        </p>

        {currentPlan && (
          <div
            className="mt-8 nb-card p-5 flex flex-wrap items-center justify-between gap-3"
            style={{ background: "var(--accent2)" }}
          >
            <div>
              <div className="font-bold">
                You're currently on the{" "}
                <span className="uppercase">{currentPlan}</span> plan
              </div>
              {endsAt && (
                <div className="text-sm opacity-80 mt-1">
                  Active until {new Date(endsAt).toLocaleDateString()}
                </div>
              )}
            </div>
            <button
              className="nb-btn nb-btn-danger"
              onClick={cancelSubscription}
              disabled={cancelling}
            >
              {cancelling ? "Cancelling…" : "Cancel subscription"}
            </button>
          </div>
        )}

        <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {order.map((k) => (
            <PlanCard key={k} plan={PLANS[k]} currentPlan={currentPlan} />
          ))}
        </div>

        <div
          className="mt-10 nb-card p-6"
          style={{ background: "var(--accent3)" }}
        >
          <h3 className="font-display font-black text-xl">💡 Premium math</h3>
          <p className="mt-2 text-sm">
            Pro = 250 / day = $0.0013 per comment. Premium = 1,500 / day = $0.00067
            per comment. That's almost <strong>half the cost per comment</strong>,
            plus GPT-4o (a much smarter model).
          </p>
        </div>

        <div className="mt-6 nb-card p-6">
          <h3 className="font-display font-black text-xl">FAQ on billing</h3>
          <details className="mt-3 cursor-pointer">
            <summary className="font-bold">Will my plan auto-renew?</summary>
            <p className="mt-2 text-sm">
              No. NurAi never auto-charges. When your period ends, access stops
              and you can buy again anytime.
            </p>
          </details>
          <details className="mt-3 cursor-pointer">
            <summary className="font-bold">Can I upgrade mid-cycle?</summary>
            <p className="mt-2 text-sm">
              Yes. Buying a higher plan replaces your current one and adds the
              new period from today.
            </p>
          </details>
          <details className="mt-3 cursor-pointer">
            <summary className="font-bold">What if my payment fails?</summary>
            <p className="mt-2 text-sm">
              No charge happens until crypto confirms on-chain. If it fails,
              just retry — no money lost.
            </p>
          </details>
        </div>
      </main>
    </>
  );
}
