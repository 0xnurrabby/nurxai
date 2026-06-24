import Navbar from "../components/Navbar";

export default function Privacy() {
  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-5 py-12">
        <div className="nb-card p-8">
          <h1 className="font-display font-black text-4xl">Privacy Policy</h1>
          <p className="opacity-70 mt-2">Last updated: June 2026</p>

          <h2 className="font-bold text-xl mt-6">What we collect</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Email address for account login and billing notifications</li>
            <li>Encrypted password, never stored as plain text</li>
            <li>Tweet text you are actively replying to, only when you use NurAi</li>
            <li>Your current public X username when you generate replies</li>
            <li>Daily usage count for billing and quota enforcement</li>
            <li>Per-X-username generation counts for quota, abuse prevention, and support</li>
            <li>Crypto payment metadata such as transaction ID and plan purchased</li>
          </ul>

          <h2 className="font-bold text-xl mt-6">What we do not collect</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Your X/Twitter login credentials</li>
            <li>Your DMs or private messages</li>
            <li>Your browsing history</li>
            <li>Tweets you did not actively reply to</li>
            <li>Generated reply text after the response is returned to you</li>
            <li>Your IP address or location beyond standard server logs</li>
            <li>Your crypto wallet address, which is handled by the payment processor</li>
          </ul>

          <h2 className="font-bold text-xl mt-6">How we use your data</h2>
          <p className="mt-2">
            Tweet text is sent through our AI gateway to generate reply suggestions.
            We do not store the tweet text or generated reply text. Email is used
            for login, account recovery, and important service announcements.
            Public X usernames are used to show account-level usage, prevent quota
            abuse, and help support subscription issues.
          </p>

          <h2 className="font-bold text-xl mt-6">Third-party services</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Vercel</strong> - hosts our application and AI gateway.</li>
            <li><strong>AI providers</strong> - generate and ground reply suggestions through Vercel AI Gateway.</li>
            <li><strong>NOWPayments</strong> - processes crypto subscription payments.</li>
            <li><strong>Supabase</strong> - provides our PostgreSQL database.</li>
          </ul>

          <h2 className="font-bold text-xl mt-6">Data retention</h2>
          <p className="mt-2">
            Account data and usage counters are retained as long as your account
            exists. Generated reply text is not retained. You may request deletion
            at any time. After deletion, all personal data is permanently removed
            within 30 days.
          </p>

          <h2 className="font-bold text-xl mt-6">Your rights</h2>
          <p className="mt-2">
            You can request access to, correction of, or deletion of your data
            by emailing <strong>probably.nothing.to.say@gmail.com</strong>.
          </p>

          <h2 className="font-bold text-xl mt-6">Security</h2>
          <p className="mt-2">
            All data is transmitted over HTTPS. Passwords are hashed with bcrypt.
            JWT tokens have 30-day expiry. Database access is restricted to our
            backend only.
          </p>

          <h2 className="font-bold text-xl mt-6">Contact</h2>
          <p className="mt-2">
            Questions? Email <strong>probably.nothing.to.say@gmail.com</strong> or message us
            on Telegram <strong>@Nur_Xai</strong>.
          </p>
        </div>
      </main>
    </>
  );
}
