import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "../components/Navbar";
import SiteFooter from "../components/SiteFooter";
import { breadcrumbSchema, faqSchema, CHROME_STORE_URL, SITE_URL } from "@/lib/seo";

const ABOUT_FAQS = [
  {
    q: "What is NurAi?",
    a: "NurAi is a human-in-the-loop AI reply assistant for X (Twitter). It reads the post you are replying to, drafts four context-aware replies in your voice, and leaves the final edit and publish action to you. It works as a Chrome extension inside x.com and twitter.com, plus a web dashboard for plans and usage."
  },
  {
    q: "Who makes NurAi?",
    a: "NurAi is built by the NurXai team. The product focus is simple: faster replying without automation, without spam, and without giving up your voice."
  },
  {
    q: "Does NurAi post replies automatically?",
    a: "No. NurAi never auto-posts, never mass replies, and never touches your account without your click. Automated posting at scale violates X's rules and risks your reach, so NurAi keeps a human in the loop on every reply."
  },
  {
    q: "How does NurAi make money?",
    a: "Two ways. A 3-day free trial leads into either pay-per-use pricing, where each premium generation is settled in USDC on Base using x402, or fixed-duration plans purchased with crypto. There are no automatic renewals."
  },
  {
    q: "Is NurAi safe to use on my X account?",
    a: "NurAi only suggests text. You edit and post every reply yourself from your own browser, so the behavior X sees is a normal human reply. NurAi never asks for your X password and never stores your DMs."
  }
];

export const metadata: Metadata = {
  title: "About NurAi: human-in-the-loop reply drafting for X",
  description:
    "NurAi is built by NurXai to help people reply better on X without automation. Learn what the product does, how it works, and the principles behind it.",
  alternates: { canonical: "/about" },
  openGraph: {
    url: "/about",
    title: "About NurAi: human-in-the-loop reply drafting for X",
    description: "What NurAi does, who builds it, and why human approval is the whole point.",
    type: "website"
  }
};

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(ABOUT_FAQS)) }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              breadcrumbSchema([
                { name: "Home", path: "/" },
                { name: "About", path: "/about" }
              ])
            )
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "AboutPage",
              name: "About NurAi",
              url: `${SITE_URL}/about`,
              description:
                "NurAi is a human-in-the-loop AI reply assistant for X, built by the NurXai team.",
              mainEntity: { "@id": `${SITE_URL}/#organization` }
            })
          }}
        />

        <nav aria-label="Breadcrumb" className="text-xs font-semibold opacity-60">
          <Link className="underline underline-offset-2" href="/">Home</Link>
          <span aria-hidden="true"> / </span>
          <span>About</span>
        </nav>

        <h1 className="mt-4 font-display text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          We build the assistant, <span className="font-serif italic">you write the reply</span>.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed opacity-80">
          NurAi (also known as NurXai) is a human-in-the-loop AI reply assistant for X.
          It exists because the hardest part of replying well is not typing speed, it is having
          something specific to say while the conversation is still young.
        </p>

        <section className="mt-10" aria-labelledby="what-we-build">
          <h2 id="what-we-build" className="font-display text-2xl font-black tracking-tight">What NurAi does</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-[15px] leading-relaxed opacity-85">
            <li>Reads the X post you chose, including quoted text, links, and image context.</li>
            <li>Drafts four replies with different angles: insight, question, counterpoint, example.</li>
            <li>Keeps your voice editable, so every reply sounds like you wrote it, because you did.</li>
            <li>Never posts on its own. There is no auto-reply mode and no bulk engagement.</li>
            <li>Runs in Chrome, Edge, Brave, and other Chromium browsers.</li>
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="principles">
          <h2 id="principles" className="font-display text-2xl font-black tracking-tight">Principles</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="nb-card p-5">
              <h3 className="font-display text-lg font-bold">Human in the loop</h3>
              <p className="mt-2 text-sm leading-relaxed opacity-75">
                Automation is easy to build and easy to punish. Approval keeps accounts healthy and replies worth reading.
              </p>
            </div>
            <div className="nb-card p-5">
              <h3 className="font-display text-lg font-bold">No dark patterns</h3>
              <p className="mt-2 text-sm leading-relaxed opacity-75">
                No auto-renewals, no hidden limits, no lock-in. Plans end when they end and pay-per-use charges only what you generate.
              </p>
            </div>
            <div className="nb-card p-5">
              <h3 className="font-display text-lg font-bold">Privacy by default</h3>
              <p className="mt-2 text-sm leading-relaxed opacity-75">
                We never ask for your X password, never read DMs, and never store the public context you process.
              </p>
            </div>
            <div className="nb-card p-5">
              <h3 className="font-display text-lg font-bold">Honest pricing</h3>
              <p className="mt-2 text-sm leading-relaxed opacity-75">
                Pay per generation in USDC on Base, or choose a fixed-duration plan. A free trial comes first.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="quick-facts">
          <h2 id="quick-facts" className="font-display text-2xl font-black tracking-tight">Quick facts</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-[15px] leading-relaxed opacity-85">
            <li>Product name: NurAi. Team and brand: NurXai.</li>
            <li>Category: AI reply generator and writing copilot for X (Twitter).</li>
            <li>Availability: <a className="font-semibold underline underline-offset-2" href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer">Chrome Web Store</a> plus the web app.</li>
            <li>Trial: 3 days free, no card required.</li>
            <li>Support: support@nurxai.xyz</li>
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="about-faq">
          <h2 id="about-faq" className="font-display text-2xl font-black tracking-tight">Frequently asked</h2>
          <div className="mt-3 space-y-2">
            {ABOUT_FAQS.map((faq) => (
              <details key={faq.q} className="nb-card p-4">
                <summary className="cursor-pointer font-bold">{faq.q}</summary>
                <p className="mt-2 text-sm leading-relaxed opacity-80">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <aside className="nb-card mt-10 p-6" style={{ background: "color-mix(in srgb, var(--accent) 18%, var(--card))" }}>
          <h2 className="font-display text-xl font-bold">See it on a real post</h2>
          <p className="mt-1.5 text-sm leading-relaxed opacity-80">
            Three days free, then pay only for what you generate. Nothing posts without your click.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/signup" className="nb-btn nb-btn-primary min-h-[44px]">Start free trial</Link>
            <Link href="/#how" className="nb-btn min-h-[44px]">How it works</Link>
          </div>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
