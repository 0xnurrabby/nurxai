import Navbar from "../components/Navbar";

export default function Privacy() {
  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-5 py-12">
        <div className="nb-card p-8">
          <h1 className="font-display font-black text-4xl">Privacy Policy</h1>
          <p className="opacity-70 mt-2">Last updated: October 2025</p>

          <h2 className="font-bold text-xl mt-6">What we collect</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Email address (for account login & billing notifications)</li>
            <li>Encrypted password (never stored as plain text)</li>
            <li>Tweet text you're actively replying to (only when you use NurAi)</li>
            <li>Daily usage count (for billing/quota purposes)</li>
            <li>Crypto payment metadata (transaction ID, plan purchased)</li>
          </ul>

          <h2 className="font-bold text-xl mt-6">What we DO NOT collect</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Your X/Twitter login credentials</li>
            <li>Your DMs or private messages</li>
            <li>Your browsing history</li>
            <li>Tweets you didn't actively reply to</li>
            <li>Your IP address or location (beyond standard server logs)</li>
            <li>Your crypto wallet address (handled by NOWPayments, not us)</li>
          </ul>

          <h2 className="font-bold text-xl mt-6">How we use your data</h2>
          <p className="mt-2">
            Tweet text is sent to OpenAI&apos;s API to generate reply suggestions.
            We do not store the tweet text. Email is used only for login,
            account recovery, and important service announcements.
          </p>

          <h2 className="font-bold text-xl mt-6">Third-party services</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>OpenAI</strong> — generates AI reply suggestions. Per their API policy, they don&apos;t train on or store our requests.</li>
            <li><strong>NOWPayments</strong> — processes crypto subscription payments.</li>
            <li><strong>Vercel</strong> — hosts our application.</li>
            <li><strong>Neon</strong> — provides our PostgreSQL database (encrypted at rest).</li>
          </ul>

          <h2 className="font-bold text-xl mt-6">Data retention</h2>
          <p className="mt-2">
            Account data is retained as long as your account exists. You may
            request deletion at any time. After deletion, all personal data is
            permanently removed within 30 days.
          </p>

          <h2 className="font-bold text-xl mt-6">Your rights</h2>
          <p className="mt-2">
            You can request access to, correction of, or deletion of your data
            by emailing <strong>support@nurxai.com</strong>.
          </p>

          <h2 className="font-bold text-xl mt-6">Security</h2>
          <p className="mt-2">
            All data is transmitted over HTTPS. Passwords are hashed with bcrypt.
            JWT tokens have 30-day expiry. Database access is restricted to
            our backend only.
          </p>

          <h2 className="font-bold text-xl mt-6">Contact</h2>
          <p className="mt-2">
            Questions? Email <strong>support@nurxai.com</strong> or message us
            on Telegram <strong>@Nur_Xai</strong>.
          </p>
        </div>
      </main>
    </>
  );
}
