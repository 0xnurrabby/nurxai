import type { Metadata } from "next";
import Navbar from "../components/Navbar";
import SiteFooter from "../components/SiteFooter";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The rules for using NurAi: acceptable use, subscriptions and x402 pay-per-use payments, referrals, and account responsibilities.",
  alternates: { canonical: "/terms" },
  openGraph: {
    url: "/terms",
    title: "Terms of Service | NurAi",
    description: "The rules for using NurAi, including payments, referrals, and acceptable use."
  }
};

export default function Terms() {
  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-5 py-12">
        <div className="nb-card p-8">
          <h1 className="font-display font-black text-4xl">Terms of Service</h1>
          <p className="opacity-70 mt-2">Last updated: August 2026</p>

          <h2 className="font-bold text-xl mt-6">1. Acceptance</h2>
          <p className="mt-2">
            By using NurAi, you agree to these terms. If you don&apos;t agree, don&apos;t use the service.
          </p>

          <h2 className="font-bold text-xl mt-6">2. Service description</h2>
          <p className="mt-2">
            NurAi is a human-in-the-loop Chrome extension and web service that
            prepares AI-generated reply suggestions for public conversations on X.
            You choose the conversation and draft, may edit or ignore it, and remain
            responsible for pressing X&apos;s final Reply button. NurAi does not auto-post.
          </p>

          <h2 className="font-bold text-xl mt-6">3. Account responsibility</h2>
          <p className="mt-2">
            You&apos;re responsible for keeping your account credentials secure.
            Don&apos;t share them. We&apos;re not liable for unauthorized account use.
          </p>

          <h2 className="font-bold text-xl mt-6">4. Acceptable use</h2>
          <p className="mt-2">You agree NOT to:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Use NurAi to spam, harass, or harm others</li>
            <li>Generate hate speech, threats, or illegal content</li>
            <li>Reverse-engineer, resell, or redistribute the service</li>
            <li>Use automated tools to bypass usage limits</li>
            <li>Violate X/Twitter&apos;s Terms of Service</li>
          </ul>
          <p className="mt-2">
            Violations result in immediate account termination without refund.
          </p>

          <h2 className="font-bold text-xl mt-6">5. Subscriptions & payments</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Fixed-duration plan payments may be processed through NOWPayments, Base Pay, or eligible referral wallet balance.</li>
            <li>PAYG Premium generations use x402 to authorize the exact quoted USDC amount and settle it on Base mainnet.</li>
            <li>PAYG prices may change for new operations. An operation keeps the payment terms quoted when it was created.</li>
            <li>Successful onchain settlements are final and public blockchain records cannot be deleted.</li>
            <li>Referral wallet balance can be used for NurAi subscriptions.</li>
            <li>Referral withdrawals are manually reviewed and require at least $3 available balance.</li>
            <li>Subscriptions are non-refundable once activated.</li>
            <li>Plans don&apos;t auto-renew. You manually re-purchase to continue.</li>
            <li>Daily usage limits reset at 00:00 UTC.</li>
          </ul>

          <h2 className="font-bold text-xl mt-6">6. Referrals</h2>
          <p className="mt-2">
            Referral bonuses are credited only after a referred account completes
            a confirmed paid subscription, or when an admin explicitly approves
            a referral bonus for a manual paid grant. Self-referrals, fake
            accounts, abuse, chargebacks, or suspicious activity may result in
            bonus removal and account suspension.
          </p>

          <h2 className="font-bold text-xl mt-6">7. Service availability</h2>
          <p className="mt-2">
            We aim for 99% uptime but don&apos;t guarantee uninterrupted service.
            Maintenance windows or outages involving hosting, AI model providers,
            Base, RPC services, or payment facilitators may cause temporary disruption.
          </p>

          <h2 className="font-bold text-xl mt-6">8. Limitation of liability</h2>
          <p className="mt-2">
            NurAi is provided &quot;as is&quot;. We&apos;re not liable for damages from
            using or being unable to use the service, including consequences
            of replies you choose to send. You&apos;re responsible for what you post.
          </p>

          <h2 className="font-bold text-xl mt-6">9. Changes to terms</h2>
          <p className="mt-2">
            We may update these terms. Continued use after changes means acceptance.
          </p>

          <h2 className="font-bold text-xl mt-6">10. Contact</h2>
          <p className="mt-2">
            Email <strong>support@nurxai.xyz</strong> or Telegram <strong>@Nur_Xai</strong>.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
