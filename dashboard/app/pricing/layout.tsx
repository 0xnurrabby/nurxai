import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing - X and Twitter AI Reply Plans",
  description:
    "Compare NurAi Trial, Starter, Pro, and Premium plans for AI-generated X and Twitter replies. Start free with 10 comments per day for 3 days.",
  alternates: {
    canonical: "/pricing"
  }
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
