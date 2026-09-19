import type { Metadata } from "next";
import Navbar from "../components/Navbar";
import SiteFooter from "../components/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What NurAi collects, what it never collects, how reply context is processed, and how your account data is handled.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    url: "/privacy",
    title: "Privacy Policy | NurAi",
    description: "What NurAi collects, what it never collects, and how your data is handled."
  }
};

export default function Privacy() {
  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-5 py-12">
        <div className="nb-card p-8">
          <h1 className="font-display font-black text-4xl">Privacy Policy</h1>
          <p className="opacity-70 mt-2">Last updated: September 2026</p>

          <h2 className="font-bold text-xl mt-6">What we collect</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Email address for account login and billing notifications</li>
            <li>Encrypted password, never stored as plain text</li>
            <li>Public post text, quoted text, links, card text, and images from the conversation you actively ask NurAi to process</li>
            <li>Daily usage count for billing and quota enforcement</li>
            <li>Crypto payment metadata such as wallet address, network, asset, amount, transaction ID, and plan or PAYG operation</li>
            <li>Referral codes, referral attribution, wallet ledger entries, and withdrawal requests</li>
            <li>BEP-20 USDT withdrawal address if you request a referral payout</li>
            <li>Dashboard announcements and global chat messages you send or read</li>
          </ul>

          <h2 className="font-bold text-xl mt-6">What we do not collect</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Your X/Twitter login credentials</li>
            <li>Your DMs or private messages</li>
            <li>Your browsing history</li>
            <li>Tweets you did not actively reply to</li>
            <li>Your IP address or location beyond standard server logs</li>
            <li>Your wallet private keys or seed phrase; the PAYG signer is created as a local, non-extractable key</li>
          </ul>

          <h2 className="font-bold text-xl mt-6">How we use your data</h2>
          <p className="mt-2">
            Selected public context is sent through our AI gateway to generate reply suggestions.
            We do not store the raw public context. Standard plan generations do not
            store generated reply text; PAYG operations may cache the generated result
            so retries return the same result without duplicate generation or settlement. Email is used
            for login, account recovery, and important service announcements.
            Announcements and global chat are stored so users can read updates
            and community messages inside the dashboard. Referral and withdrawal
            records are used to calculate bonuses, prevent duplicate credits,
            process manual payouts, and keep an audit trail.
          </p>

          <h2 className="font-bold text-xl mt-6">Third-party services</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Render</strong> - hosts our application and API.</li>
            <li><strong>Vercel AI Gateway</strong> - routes generation requests to AI model providers.</li>
            <li><strong>Resend</strong> - delivers transactional email such as login codes and billing notices.</li>
            <li><strong>Neon</strong> - provides our managed PostgreSQL database.</li>
            <li><strong>NOWPayments</strong> - processes crypto subscription payments.</li>
            <li><strong>Base, Base Account, and the x402 facilitator</strong> - provide self-custodial account access, USDC authorization, verification, and onchain settlement.</li>
          </ul>

          <h2 className="font-bold text-xl mt-6">Data retention</h2>
          <p className="mt-2">
            Account data and usage counters are retained as long as your account
            exists. PAYG operation records, including a cached response and payment
            receipt, may be retained for idempotency, billing, security, and support.
            You may request deletion at any time. Personal data is removed within 30
            days except records we must retain for security or legal reasons and
            immutable transaction data already published on a public blockchain.
          </p>

          <h2 className="font-bold text-xl mt-6">Your rights</h2>
          <p className="mt-2">
            You can request access to, correction of, or deletion of your data
            by emailing <strong>support@nurxai.xyz</strong>.
          </p>

          <h2 className="font-bold text-xl mt-6">Security</h2>
          <p className="mt-2">
            All data is transmitted over HTTPS. Passwords are hashed with bcrypt.
            JWT tokens have 30-day expiry. Database access is restricted to our
            backend only.
          </p>

          <h2 className="font-bold text-xl mt-6">Contact</h2>
          <p className="mt-2">
            Questions? Email <strong>support@nurxai.xyz</strong> or message us
            on Telegram <strong>@Nur_Xai</strong>.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
