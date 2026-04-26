import Link from "next/link";
import Navbar from "../components/Navbar";

export const metadata = {
  title: "Forgot password - NurAi"
};

export default function ForgotPassword() {
  return (
    <>
      <Navbar />
      <main className="max-w-md mx-auto px-5 py-12">
        <div className="nb-card p-7">
          <h1 className="font-display font-black text-3xl">Forgot password?</h1>
          <p className="mt-4 text-sm leading-relaxed">
            NurAi keeps things deliberately simple, so we don't auto-email
            password resets. Reach out to the maintainer on Telegram and your
            account will be unlocked within minutes.
          </p>

          <a
            href="https://t.me/Nur_Xai"
            target="_blank"
            rel="noopener noreferrer"
            className="nb-btn nb-btn-primary w-full mt-6 inline-flex items-center justify-center gap-2"
          >
            Message @Nur_Xai on Telegram
          </a>

          <div
            className="mt-5 p-3 rounded-md text-xs leading-relaxed border-2 border-ink/30 dark:border-nightInk/30"
            style={{ background: "var(--accent3)" }}
          >
            <strong>What to send:</strong>
            <ul className="mt-2 ml-4 list-disc space-y-1">
              <li>The email you signed up with</li>
              <li>Approximate signup date (if you remember)</li>
              <li>A new password you want to set</li>
            </ul>
            <p className="mt-2 opacity-80">
              We confirm your identity, set the new password, and reply with
              confirmation.
            </p>
          </div>

          <div className="mt-6 flex justify-between text-sm">
            <Link href="/login" className="font-bold underline">
              Back to sign in
            </Link>
            <Link
              href="/signup"
              className="opacity-70 hover:opacity-100 underline"
            >
              Create account
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
