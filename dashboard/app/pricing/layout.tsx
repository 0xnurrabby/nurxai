import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing - Plans and Base x402 PAYG",
  description:
    "Compare NurAi's free trial, fixed-duration plans, and Base x402 USDC PAYG for human-controlled, context-aware X drafting.",
  alternates: {
    canonical: "/pricing"
  }
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
