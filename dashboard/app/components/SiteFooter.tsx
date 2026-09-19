import Link from "next/link";
import { CHROME_STORE_URL, SUPPORT_EMAIL } from "@/lib/seo";

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t-2 border-ink/10 dark:border-nightInk/10">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <Link href="/" className="flex items-center gap-2 font-display text-xl font-black tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="NurAi" width={26} height={26} className="rounded-md border border-ink/80 dark:border-nightInk/80" />
            <span>NurAi</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed opacity-70">
            Human-in-the-loop reply drafts for X. You review, edit, and publish. No auto-posting, ever.
          </p>
        </div>

        <nav aria-label="Product" className="text-sm">
          <div className="font-black uppercase tracking-[0.12em] opacity-55">Product</div>
          <ul className="mt-3 space-y-2">
            <li><Link className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" href="/">Home</Link></li>
            <li><Link className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" href="/about">About NurAi</Link></li>
            <li><Link className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" href="/x-reply-extension">AI reply extension</Link></li>
            <li><Link className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" href="/pricing">Pricing</Link></li>
            <li><Link className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" href="/signup">Start free trial</Link></li>
            <li>
              <a className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer">
                Chrome Web Store
              </a>
            </li>
          </ul>
        </nav>

        <nav aria-label="Guides" className="text-sm">
          <div className="font-black uppercase tracking-[0.12em] opacity-55">Learn</div>
          <ul className="mt-3 space-y-2">
            <li><Link className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" href="/guides">All guides</Link></li>
            <li><Link className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" href="/guides/how-to-reply-on-x">How to reply on X</Link></li>
            <li><Link className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" href="/guides/reply-guy-strategy">Reply guy strategy</Link></li>
            <li><Link className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" href="/guides/is-ai-replying-safe-on-x">Is AI replying safe?</Link></li>
            <li><Link className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" href="/guides/best-ai-reply-tools-for-x">Best AI reply tools</Link></li>
          </ul>
        </nav>

        <nav aria-label="Trust" className="text-sm">
          <div className="font-black uppercase tracking-[0.12em] opacity-55">Trust</div>
          <ul className="mt-3 space-y-2">
            <li><Link className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" href="/terms">Terms of Service</Link></li>
            <li><Link className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" href="/privacy">Privacy Policy</Link></li>
            <li>
              <a className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-ink/10 py-4 text-center text-xs opacity-60 dark:border-nightInk/10">
        NurAi runs on your approval. Nothing is posted without your click.
      </div>
    </footer>
  );
}
