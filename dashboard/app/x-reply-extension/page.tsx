import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "../components/Navbar";
import SiteFooter from "../components/SiteFooter";
import { breadcrumbSchema, CHROME_STORE_URL, faqSchema, softwareApplicationSchema } from "@/lib/seo";

const FAQS = [
  {
    q: "What is the NurAi X reply extension?",
    a: "NurAi is a Chrome extension and web app that reads the X post you are replying to and drafts four thoughtful replies in your voice. You pick one, edit it, and post it yourself. It never posts for you."
  },
  {
    q: "Does it work on twitter.com and x.com?",
    a: "Yes. NurAi works on both x.com and twitter.com in Chrome, Edge, Brave, and other Chromium browsers. It appears inside the reply box where you already write."
  },
  {
    q: "Is this an auto reply bot?",
    a: "No. NurAi does not auto-post, does not mass reply, and never touches your account without your click. Automation like that violates X's rules and risks your reach. NurAi keeps a human in the loop on every reply."
  },
  {
    q: "How much does it cost?",
    a: "Start with a 3-day free trial that includes a daily generation limit. After the trial, pay per premium generation in USDC on Base with no daily limit, or choose a fixed-duration plan if you prefer a monthly style."
  },
  {
    q: "Why four drafts instead of one?",
    a: "One draft forces you to accept whatever the model thought of first. Four angles (insight, question, counterpoint, example) let you pick the one that matches your voice and the conversation, which is how replies actually earn profile clicks."
  }
];

export const metadata: Metadata = {
  title: "AI reply extension for X and Twitter",
  description:
    "NurAi is the human-in-the-loop AI reply extension for X. Four context-aware drafts inside the reply box, in your voice, posted only by you. Free 3-day trial, then pay per use.",
  alternates: { canonical: "/x-reply-extension" },
  keywords: [
    "AI reply extension for X",
    "twitter reply extension",
    "X comment generator",
    "AI reply generator for Twitter",
    "reply assistant for X",
    "Chrome extension for X replies"
  ],
  openGraph: {
    url: "/x-reply-extension",
    title: "AI reply extension for X and Twitter",
    description:
      "Four context-aware reply drafts inside X, in your voice. You review, edit, and post. Human in the loop, always.",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "AI reply extension for X and Twitter",
    description: "Four context-aware reply drafts inside X, in your voice. Human in the loop, always."
  }
};

const FEATURES = [
  "Context-aware reply drafting for X posts",
  "Four different reply angles per post",
  "Voice-matched phrasing you can edit",
  "Human approval required before posting",
  "No auto-posting and no mass replies",
  "Chromium browser support (Chrome, Edge, Brave)",
  "USDC pay-per-use on Base plus fixed plans",
  "Three-day free trial"
];

export default function XReplyExtensionPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema(FEATURES, 0.009)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(FAQS)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              breadcrumbSchema([
                { name: "Home", path: "/" },
                { name: "AI reply extension for X", path: "/x-reply-extension" }
              ])
            )
          }}
        />

        <nav aria-label="Breadcrumb" className="text-xs font-semibold opacity-60">
          <Link className="underline underline-offset-2" href="/">Home</Link>
          <span aria-hidden="true"> / </span>
          <span>AI reply extension for X</span>
        </nav>

        <section className="mt-6 max-w-3xl">
          <span className="nb-tag">CHROME EXTENSION</span>
          <h1 className="mt-4 font-display text-4xl font-black leading-tight tracking-tight sm:text-5xl">
            The AI reply extension for X that keeps <span className="font-serif italic">you</span> in charge.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed opacity-80">
            NurAi sits inside the X reply box, reads the post you are answering, and offers four thoughtful drafts.
            You choose, edit, and publish. Nothing posts without your click, which keeps your voice authentic and
            your account inside X&apos;s rules.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/signup" className="nb-btn nb-btn-primary min-h-[48px]">Start free trial</Link>
            <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer" className="nb-btn min-h-[48px]">
              Get the extension
            </a>
          </div>
        </section>

        <section className="mt-12" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="font-display text-3xl font-black tracking-tight">How it works</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="nb-card p-6">
              <span className="text-xs font-black uppercase tracking-[0.12em] opacity-55">Step 1</span>
              <h3 className="mt-2 font-display text-lg font-bold">Open any post on X</h3>
              <p className="mt-2 text-sm leading-relaxed opacity-75">Click reply like you normally do. NurAi appears in the composer, no tab switching.</p>
            </div>
            <div className="nb-card p-6">
              <span className="text-xs font-black uppercase tracking-[0.12em] opacity-55">Step 2</span>
              <h3 className="mt-2 font-display text-lg font-bold">Get four drafts, not one</h3>
              <p className="mt-2 text-sm leading-relaxed opacity-75">Each draft takes a different angle: an insight, a question, a counterpoint, a concrete example.</p>
            </div>
            <div className="nb-card p-6">
              <span className="text-xs font-black uppercase tracking-[0.12em] opacity-55">Step 3</span>
              <h3 className="mt-2 font-display text-lg font-bold">Publish the one you like</h3>
              <p className="mt-2 text-sm leading-relaxed opacity-75">Edit it into your voice and post it yourself. The final word is always yours.</p>
            </div>
          </div>
        </section>

        <section className="mt-12 max-w-3xl" aria-labelledby="why-nurai">
          <h2 id="why-nurai" className="font-display text-3xl font-black tracking-tight">Why human approval beats auto reply</h2>
          <p className="mt-3 text-[15px] leading-relaxed opacity-80">
            Auto reply tools promise volume, but volume is not the bottleneck. Repetitive, context-free replies get skimmed past,
            and automated posting at scale runs into X&apos;s automation rules and reach limits. The replies that actually grow an
            account are specific, varied, and written as if a person meant them, because a person did.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed opacity-85">
            <li>Drafts that read the actual post, not a template.</li>
            <li>Four angles so you are never stuck with one generic option.</li>
            <li>Every reply edited and posted by you, which keeps behavior human.</li>
            <li>No daily limit on pay-per-use, so you can reply at your own pace.</li>
          </ul>
          <p className="mt-4 text-sm leading-relaxed opacity-70">
            Read more in our guide: <Link className="font-semibold underline underline-offset-2" href="/guides/is-ai-replying-safe-on-x">is using AI to reply on X safe?</Link>
          </p>
        </section>

        <section className="mt-12" aria-labelledby="extension-faq">
          <h2 id="extension-faq" className="font-display text-3xl font-black tracking-tight">Frequently asked</h2>
          <div className="mt-4 space-y-2">
            {FAQS.map((faq) => (
              <details key={faq.q} className="nb-card p-5">
                <summary className="cursor-pointer font-bold">{faq.q}</summary>
                <p className="mt-2 text-sm leading-relaxed opacity-80">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="nb-card mt-12 p-7 text-center" style={{ background: "color-mix(in srgb, var(--accent) 18%, var(--card))" }}>
          <h2 className="font-display text-2xl font-black">Try it on your next reply</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed opacity-80">
            Three days free. Then pay only for the generations you use. No card required to start.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="nb-btn nb-btn-primary min-h-[48px]">Start free trial</Link>
            <Link href="/pricing" className="nb-btn min-h-[48px]">See pricing</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
