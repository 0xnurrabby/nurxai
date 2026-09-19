import type { Metadata } from "next";
import SiteFooter from "../components/SiteFooter";

export const metadata: Metadata = {
  title: "Pricing - Plans and Base x402 PAYG",
  description:
    "Compare NurAi's free trial, fixed-duration plans, and Base x402 USDC PAYG for human-controlled, context-aware X drafting.",
  alternates: {
    canonical: "/pricing"
  },
  openGraph: {
    url: "/pricing",
    title: "Pricing - Plans and Base x402 PAYG | NurAi",
    description:
      "Free 3-day trial, fixed-duration plans, or pay per generation in USDC on Base. No auto-posting, no hidden limits."
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing - Plans and Base x402 PAYG | NurAi",
    description: "Free 3-day trial, fixed-duration plans, or pay per generation in USDC on Base."
  }
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SiteFooter />
    </>
  );
}
