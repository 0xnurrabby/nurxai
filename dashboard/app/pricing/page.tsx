import Navbar from "../components/Navbar";
import PlanCard from "../components/PlanCard";
import { PLANS } from "@/lib/plans";

export default function Pricing() {
  const order = ["trial", "starter", "pro", "premium"] as const;
  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-5 py-12">
        <h1 className="font-display font-black text-4xl md:text-5xl text-center">Pick your plan</h1>
        <p className="mt-3 text-center max-w-xl mx-auto">
          Pay with crypto (BTC, ETH, USDT, and more). Cancel anytime — subscription simply ends.
        </p>

        <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {order.map((k) => (
            <PlanCard key={k} plan={PLANS[k]} />
          ))}
        </div>

        <div className="mt-10 nb-card p-6" style={{ background: "var(--accent3)" }}>
          <h3 className="font-display font-black text-xl">💡 Premium math</h3>
          <p className="mt-2 text-sm">
            Pro = 250 / day = $0.0013 per comment. Premium = 1,500 / day = $0.00067 per comment.
            That's almost <strong>half the cost per comment</strong>, plus GPT-4o (a much smarter model).
          </p>
        </div>
      </main>
    </>
  );
}
