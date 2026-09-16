"use client";
import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import PlanCard from "../components/PlanCard";
import { PLANS } from "@/lib/plans";

export default function Pricing() {
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [paygPricing, setPaygPricing] = useState<{
    currentPrice: string;
    regularPrice: string;
    discounted: boolean;
    discountPercent: number;
  } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    void fetch("/api/payg/config", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data?.currentPrice) return;
        setPaygPricing({
          currentPrice: data.currentPrice,
          regularPrice: data.regularPrice,
          discounted: Boolean(data.discounted),
          discountPercent: Number(data.discountPercent || 0)
        });
      })
      .catch(() => null);

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
          setWalletBalance(Number(d.wallet?.balanceUSD || 0));
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
  const currentPlanPriceUSD =
    currentPlan && currentPlan in PLANS
      ? PLANS[currentPlan as keyof typeof PLANS].priceUSD
      : null;

  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-5 py-12">
        <h1 className="font-display font-black text-4xl md:text-5xl text-center">
          Pick your <span className="h-accent">plan.</span>
        </h1>
        <p className="mt-3 text-center max-w-2xl mx-auto">
          Start with a free 3-day trial, buy 30 days of predictable access, or
          use Base x402 PAYG for one Premium generation at a time. Fixed plans support{" "}
          <strong>Base Pay</strong> for one-tap USDC or{" "}
          <strong>NOWPayments</strong> for other supported assets and never auto-renew.
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
            <PlanCard
              key={k}
              plan={PLANS[k]}
              currentPlan={currentPlan}
              currentPlanPriceUSD={currentPlanPriceUSD}
              currentPlanEndsAt={endsAt}
              walletBalanceUSD={walletBalance}
            />
          ))}
        </div>

        <div className="mt-10 nb-card overflow-hidden">
          <div className="grid md:grid-cols-[1fr_auto] items-center gap-6 p-6 md:p-8 bg-[#0052ff] text-white">
            <div>
              <div className="text-xs font-black tracking-widest">BASE x402 PAYG</div>
              <h2 className="mt-2 font-display font-black text-3xl">Premium access without a daily PAYG quota</h2>
              <p className="mt-3 max-w-3xl text-white/85">
                Choose PAYG in the extension, review the exact quote, and authorize only that USDC amount from an app-specific Base Sub Account. The result is returned after settlement succeeds on Base mainnet.
              </p>
            </div>
            <div className="min-w-[220px] rounded-xl border-2 border-white bg-white p-5 text-[#07142b]">
              <div className="text-xs font-black tracking-widest">LIVE PRICE</div>
              <div className="mt-2 flex items-baseline gap-2">
                {paygPricing?.discounted && <span className="font-black opacity-50 line-through">{paygPricing.regularPrice}</span>}
                <strong className="font-display text-4xl">{paygPricing?.currentPrice || "Live quote"}</strong>
              </div>
              {paygPricing?.discounted && (
                <div className="mt-2 font-black text-green-700">{paygPricing.discountPercent}% below regular price</div>
              )}
              <div className="mt-2 text-sm font-bold">USDC / Premium generation</div>
            </div>
          </div>
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
                Base Pay provides a direct USDC checkout for fixed-duration
                plans. Review the amount in your Base or Coinbase Account,
                authorize it yourself, and wait for onchain confirmation before
                NurAi activates access.
              </p>
              <ul className="mt-4 text-sm space-y-1">
                <li>+ One-tap checkout, no card numbers, no copying addresses</li>
                <li>+ Exact USDC amount shown before authorization</li>
                <li>+ Onchain payment confirmation on Base</li>
                <li>+ You keep control of the account used to pay</li>
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
            Starter = 28 / day, Pro = 67 / day, and Premium = 233 / day
            with the full GPT + Grok + Gemini stack. Premium gives the most
            comments per dollar and the strongest context engine while keeping
            generation quality stable. Existing buyers keep the daily limit
            they purchased until that plan expires.
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
              Yes. Upgrades charge only the difference from your current paid
              plan and switch your active plan after payment confirmation. Your
              current expiry date stays the same.
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
              quality and deeper project context memory.
            </p>
          </details>
        </div>
      </main>
    </>
  );
}
