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
        "Cancel subscription? You will keep access until the current period ends, but it will not renew automatically (note: NurAi never auto-renews anyway)."
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
        alert("Subscription cancelled. Access remains until end date.");
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
        <p className="mt-3 text-center max-w-2xl mx-auto">
          Start with a free 3-day trial. Paid plans support{" "}
          <strong>Base Pay</strong> for one-tap USDC or{" "}
          <strong>NowPayments</strong> for BTC, ETH, USDT and 100+ other coins.
          Cancel anytime, subscription simply ends.
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
              {cancelling ? "Cancelling..." : "Cancel subscription"}
            </button>
          </div>
        )}

        <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {order.map((k) => (
            <PlanCard key={k} plan={PLANS[k]} currentPlan={currentPlan} />
          ))}
        </div>

        {/* Base Pay marketing block */}
        <div
          className="mt-10 nb-card p-6"
          style={{ background: "var(--accent2)" }}
        >
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <h3 className="font-display font-black text-2xl">
                Why pay with Base?
              </h3>
              <p className="mt-3 text-sm leading-relaxed">
                Base Pay is the fastest way to pay online with crypto. One
                tap. USDC settles in under 2 seconds on the Base chain. Zero
                gas for you, gas is sponsored. Zero card fees, zero FX, zero
                chargebacks. Pay directly from your Base Account or Coinbase
                Account, the full amount goes to NurAi, no middleman skimming.
              </p>
              <ul className="mt-4 text-sm space-y-1">
                <li>+ One-tap checkout, no card numbers, no copying addresses</li>
                <li>+ USDC = always 1 dollar, no volatility while paying</li>
                <li>+ Instant: most payments confirm in under 2 seconds</li>
                <li>+ You keep custody, NurAi never touches your wallet</li>
              </ul>
            </div>
            <div className="flex-1 min-w-[220px]">
              <h3 className="font-display font-black text-xl">
                Or pay any other crypto
              </h3>
              <p className="mt-3 text-sm leading-relaxed">
                Prefer BTC, ETH, USDT (TRC-20 / ERC-20), TON, SOL, BNB, or
                100+ other coins? NowPayments handles those. Slightly slower
                because it waits for on-chain confirmation, but works from
                any wallet.
              </p>
            </div>
          </div>
        </div>

        <div
          className="mt-6 nb-card p-6"
          style={{ background: "var(--accent3)" }}
        >
          <h3 className="font-display font-black text-xl">Premium math</h3>
          <p className="mt-2 text-sm">
            Pro = 150 / day = $0.0022 per comment. Premium = 500 / day =
            $0.002 per comment, with the full GPT + Grok + Gemini stack.
            Premium is dramatically better at picking up nuance, sarcasm,
            visual detail, and live context.
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
              No charge happens until the payment confirms. If it fails, just
              retry, no money lost.
            </p>
          </details>
          <details className="mt-3 cursor-pointer">
            <summary className="font-bold">
              Why are some features locked on lower plans?
            </summary>
            <p className="mt-2 text-sm">
              Each tier targets a different need. Trial gives 3 free days with
              10 comments per day. Starter unlocks all 7 personalization styles.
              Pro adds Grok-powered image understanding and project contexts.
              Premium adds the full GPT + Grok + Gemini stack, masterpiece
              quality and unlimited project contexts.
            </p>
          </details>
        </div>
      </main>
    </>
  );
}
