import Navbar from "../components/Navbar";

export default function Terms() {
  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-5 py-12">
        <div className="nb-card p-8">
          <h1 className="font-display font-black text-4xl">Terms of Service</h1>
          <p className="opacity-70 mt-2">Last updated: October 2025</p>

          <h2 className="font-bold text-xl mt-6">1. Acceptance</h2>
          <p className="mt-2">
            By using NurAi, you agree to these terms. If you don&apos;t agree, don&apos;t use the service.
          </p>

          <h2 className="font-bold text-xl mt-6">2. Service description</h2>
          <p className="mt-2">
            NurAi is a Chrome extension and web service that provides AI-generated
            reply suggestions for tweets on X/Twitter.
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
            <li>Payments are processed via NOWPayments in cryptocurrency.</li>
            <li>Subscriptions are non-refundable once activated.</li>
            <li>Plans don&apos;t auto-renew. You manually re-purchase to continue.</li>
            <li>Daily usage limits reset at 00:00 UTC.</li>
          </ul>

          <h2 className="font-bold text-xl mt-6">6. Service availability</h2>
          <p className="mt-2">
            We aim for 99% uptime but don&apos;t guarantee uninterrupted service.
            Maintenance windows or third-party (OpenAI, Vercel) outages may
            cause temporary disruption.
          </p>

          <h2 className="font-bold text-xl mt-6">7. Limitation of liability</h2>
          <p className="mt-2">
            NurAi is provided &quot;as is&quot;. We&apos;re not liable for damages from
            using or being unable to use the service, including consequences
            of replies you choose to send. You&apos;re responsible for what you post.
          </p>

          <h2 className="font-bold text-xl mt-6">8. Changes to terms</h2>
          <p className="mt-2">
            We may update these terms. Continued use after changes means acceptance.
          </p>

          <h2 className="font-bold text-xl mt-6">9. Contact</h2>
          <p className="mt-2">
            Email <strong>support@nurxai.com</strong> or Telegram <strong>@Nur_Xai</strong>.
          </p>
        </div>
      </main>
    </>
  );
}
