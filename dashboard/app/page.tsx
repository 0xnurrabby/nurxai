import Link from "next/link";
import type { Metadata } from "next";
import Navbar from "./components/Navbar";
import HeroMotion from "./components/HeroMotion";

const siteUrl = "https://www.nurxai.xyz";
const chromeStoreUrl =
  "https://chromewebstore.google.com/detail/odapbgkbdpalphekkmibliclmedgmlhb";

export const metadata: Metadata = {
  title: "AI Reply Generator for X and Twitter",
  description:
    "NurAi writes human-sounding X and Twitter replies in one click. Try the AI reply generator free for 3 days with 10 comments per day.",
  alternates: {
    canonical: "/"
  }
};

const audiences = [
  {
    title: "Crypto and Web3 builders",
    text: "Turn every useful X thread into a chance to be seen without sounding like a bot."
  },
  {
    title: "Growth-focused creators",
    text: "Reply faster, stay relevant, and keep your voice consistent across busy timelines."
  },
  {
    title: "Founders and marketers",
    text: "Keep up with customers, KOLs, competitors, and market conversations in minutes."
  }
];

const features = [
  {
    title: "X reply generator built for the real reply box",
    text: "NurAi opens beside X, reads the tweet or quote you are replying to, and prepares usable replies where you already work."
  },
  {
    title: "Human-sounding AI comments",
    text: "Short, witty, natural suggestions with fewer obvious AI patterns. You choose the angle before anything is posted."
  },
  {
    title: "GPT, Grok, and Gemini by plan",
    text: "Starter focuses on text replies. Pro adds image understanding. Premium adds the full AI stack for deeper context."
  },
  {
    title: "Privacy-first workflow",
    text: "No X password, no DM access, no auto-posting. NurAi only uses the public content you are actively replying to."
  }
];

const steps = [
  {
    title: "Install",
    text: "Add NurAi to Chrome, then sign in once from your dashboard."
  },
  {
    title: "Open any X reply",
    text: "Click reply on a tweet, quote, chart, meme, or long post."
  },
  {
    title: "Pick a suggestion",
    text: "Choose from four context-aware replies, regenerate if you want a new angle."
  },
  {
    title: "Use and send",
    text: "NurAi pastes one clean reply. You still press the final Reply button yourself."
  }
];

const productShots = [
  {
    src: "/product/reply-panel-context.webp",
    title: "Context from the original post",
    text: "NurAi reads the full X post and gives short replies that match the conversation."
  },
  {
    src: "/product/reply-panel-quote.webp",
    title: "Quote and thread awareness",
    text: "For quote-heavy posts, it keeps the reply relevant instead of writing generic praise."
  },
  {
    src: "/product/reply-panel-pasted.webp",
    title: "Clean one-click paste",
    text: "Click Use once, review the reply in X, then send when you are ready."
  }
];

const comparisonRows = [
  ["Works inside X without tab switching", "Yes", "No", "No"],
  ["Reads tweet context before writing", "Yes", "Manual", "Prompt needed"],
  ["Image and quote-tweet understanding", "Pro + Premium", "No", "Manual"],
  ["One clean paste into the reply box", "Yes", "Copy paste", "Copy paste"],
  ["Daily limits matched to plan value", "Yes", "No", "No"],
  ["Human tone controls", "7 styles", "Your time", "Prompt needed"]
];

const faqs = [
  {
    q: "What is NurAi?",
    a: "NurAi is an AI reply generator for X and Twitter. It suggests short, human-sounding comments directly beside the X reply box."
  },
  {
    q: "Does NurAi auto-post replies?",
    a: "No. NurAi suggests and pastes text only after you choose it. You always review the reply and press the final Reply button yourself."
  },
  {
    q: "Is there a free trial?",
    a: "Yes. New accounts automatically get a free 3-day trial with 10 comment generations per day."
  },
  {
    q: "Which AI does each package use?",
    a: "Trial and Starter use GPT-powered text replies. Pro adds Grok for image understanding and project context. Premium uses GPT, Grok, and Gemini together for the deepest context."
  },
  {
    q: "Can NurAi understand images in tweets?",
    a: "Yes on Pro and Premium. NurAi can use attached images, charts, memes, and screenshots as context for better replies."
  },
  {
    q: "Will my current plan limits change?",
    a: "Existing buyers keep the limits they bought until that plan expires. New purchases use the current pricing and daily limits shown on the site."
  },
  {
    q: "Do you store my X password?",
    a: "Never. NurAi does not need your X password, DMs, or private account data."
  },
  {
    q: "How do payments work?",
    a: "Paid plans support Base Pay for USDC and NOWPayments for BTC, ETH, USDT, and many other coins. Access activates after payment confirmation."
  }
];

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "NurAi",
  applicationCategory: "BrowserApplication",
  operatingSystem: "Chrome, Edge, Brave, Opera",
  url: siteUrl,
  description:
    "NurAi is an AI reply generator for X and Twitter that creates human-sounding comments inside the X reply box.",
  offers: [
    {
      "@type": "Offer",
      name: "Trial",
      price: "0",
      priceCurrency: "USD",
      description: "3 days free with 10 comments per day"
    },
    {
      "@type": "Offer",
      name: "Starter",
      price: "5",
      priceCurrency: "USD",
      description: "55 comments per day"
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "10",
      priceCurrency: "USD",
      description: "130 comments per day with image understanding"
    },
    {
      "@type": "Offer",
      name: "Premium",
      price: "30",
      priceCurrency: "USD",
      description: "460 comments per day with the full AI stack"
    }
  ],
  sameAs: [chromeStoreUrl]
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a
    }
  }))
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "NurAi",
  url: siteUrl,
  description:
    "AI reply generator and Twitter comment generator for human-sounding X replies."
};

export default function Home() {
  return (
    <>
      <Navbar />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />

      <main>
        <section className="hero-stage section-reveal relative overflow-hidden px-5 py-14 md:py-20 text-center">
          <HeroMotion />
          <div className="hero-content relative z-10 max-w-6xl mx-auto">
            <div className="hero-badges flex flex-wrap justify-center gap-2">
              <span className="nb-tag">FREE TRIAL - 10 REPLIES / DAY</span>
              <span className="nb-tag" style={{ background: "var(--accent2)" }}>
                BUILT FOR X / TWITTER
              </span>
              <span className="nb-tag" style={{ background: "var(--accent4)" }}>
                GPT + GROK + GEMINI
              </span>
            </div>
            <h1 className="hero-title mt-5 font-display font-black text-[44px] sm:text-6xl md:text-7xl leading-[1.05] tracking-normal">
              AI replies for X that sound{" "}
              <span className="hero-highlight">actually human</span>.
            </h1>
            <p className="hero-copy mt-6 max-w-3xl mx-auto text-lg">
              NurAi is an X and Twitter AI reply generator that reads the post,
              understands the context, and gives you short, natural comments you
              can use in one click.
            </p>
            <div className="hero-actions mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="nb-btn nb-btn-primary text-lg">
                Start free trial
              </Link>
              <Link href="/pricing" className="nb-btn nb-btn-warn text-lg">
                Compare plans
              </Link>
            </div>
            <p className="mt-4 text-sm opacity-75">
              3 days free. 10 comments per day. No credit card. You always send
              the final reply yourself.
            </p>
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-10 md:py-14">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ["Trial", "10/day", "Free for 3 days"],
              ["Starter", "55/day", "Text replies + styles"],
              ["Pro", "130/day", "Image understanding"],
              ["Premium", "460/day", "Full AI context stack"]
            ].map(([label, value, sub]) => (
              <div key={label} className="nb-card p-5 text-center">
                <div className="text-sm font-black opacity-70">{label}</div>
                <div className="font-display font-black text-3xl mt-1">{value}</div>
                <div className="text-sm mt-1 opacity-75">{sub}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-12">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-8 items-center">
            <div>
              <span className="nb-tag">REAL PRODUCT FLOW</span>
              <h2 className="mt-4 font-display font-black text-3xl md:text-5xl leading-tight">
                See the reply before you send it.
              </h2>
              <p className="mt-4 text-lg max-w-xl">
                Users do not want another generic AI dashboard. They want the
                fastest path from a live X post to a reply that feels like them.
                NurAi stays beside the composer, shows options, and keeps the
                final decision in your hands.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  "4 suggestions per generation",
                  "One-click paste, not auto-post",
                  "Works on posts, quotes, and long threads",
                  "Built for short human replies"
                ].map((item) => (
                  <div key={item} className="nb-card p-4 font-bold text-sm">
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="product-showcase nb-card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/product/reply-panel-context.webp"
                alt="NurAi AI reply generator panel beside the X reply composer"
                className="w-full h-auto"
                width={1280}
                height={709}
                loading="eager"
              />
            </div>
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-12">
          <h2 className="font-display font-black text-3xl md:text-4xl text-center">
            Built for people who grow through replies
          </h2>
          <div className="stagger-list mt-10 grid md:grid-cols-3 gap-5">
            {audiences.map((item) => (
              <div key={item.title} className="nb-card p-6">
                <h3 className="font-display font-black text-xl">{item.title}</h3>
                <p className="mt-2">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-12">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <span className="nb-tag">WHY NURAI</span>
              <h2 className="mt-4 font-display font-black text-3xl md:text-4xl">
                Fast replies without generic AI smell.
              </h2>
            </div>
            <p className="max-w-xl text-sm md:text-base">
              The goal is not longer comments. The goal is useful, contextual,
              human replies that you can confidently post in public.
            </p>
          </div>
          <div className="stagger-list mt-8 grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((item) => (
              <div key={item.title} className="nb-card p-6">
                <h3 className="font-display font-black text-xl">{item.title}</h3>
                <p className="mt-2 text-sm">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-12">
          <h2 className="font-display font-black text-3xl md:text-4xl text-center">
            How it works in 60 seconds
          </h2>
          <div className="stagger-list mt-10 grid md:grid-cols-4 gap-5">
            {steps.map((step, index) => (
              <div key={step.title} className="nb-card p-6">
                <div
                  className="font-display font-black text-3xl w-12 h-12 grid place-items-center border-2 border-ink dark:border-nightInk rounded-full"
                  style={{ background: "var(--accent3)" }}
                >
                  {index + 1}
                </div>
                <h3 className="mt-4 font-display font-black text-xl">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-12">
          <div className="grid md:grid-cols-3 gap-5">
            {productShots.map((shot) => (
              <article key={shot.src} className="nb-card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shot.src}
                  alt={`${shot.title} in the NurAi X reply generator`}
                  className="w-full aspect-[16/9] object-cover object-top border-b-2 border-ink dark:border-nightInk"
                  width={1280}
                  height={720}
                  loading="lazy"
                />
                <div className="p-5">
                  <h3 className="font-display font-black text-xl">{shot.title}</h3>
                  <p className="mt-2 text-sm">{shot.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-12">
          <div className="nb-card overflow-hidden">
            <div className="p-6 md:p-8" style={{ background: "var(--accent2)" }}>
              <span className="nb-tag" style={{ background: "var(--accent3)" }}>
                COMPARISON
              </span>
              <h2 className="mt-4 font-display font-black text-3xl md:text-4xl">
                Why not just use a normal AI chat app?
              </h2>
              <p className="mt-3 max-w-3xl">
                Chat apps can write replies, but they make you copy context,
                explain tone, switch tabs, paste manually, and clean up the
                result. NurAi is made for the X reply workflow.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-y-2 border-ink dark:border-nightInk">
                    <th className="text-left p-4">Feature</th>
                    <th className="text-left p-4 bg-[var(--accent3)] text-ink">
                      NurAi
                    </th>
                    <th className="text-left p-4">Manual typing</th>
                    <th className="text-left p-4">Generic AI chat</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr
                      key={row[0]}
                      className="border-t-2 border-ink/20 dark:border-nightInk/20"
                    >
                      {row.map((cell, index) => (
                        <td
                          key={`${row[0]}-${index}`}
                          className={`p-4 ${index === 1 ? "font-black" : ""}`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-12">
          <div className="nb-card p-8 text-center" style={{ background: "var(--accent2)" }}>
            <span className="nb-tag" style={{ background: "var(--accent3)" }}>
              BEST VALUE
            </span>
            <h2 className="mt-4 font-display font-black text-3xl md:text-4xl">
              Premium is for serious reply work.
            </h2>
            <p className="mt-3 max-w-2xl mx-auto">
              Starter gives 55 comments per day. Pro gives 130 with image
              understanding. Premium gives <strong>460 comments per day</strong>{" "}
              and the full GPT, Grok, and Gemini stack for deeper context,
              nuance, and cleaner replies.
            </p>
            <Link href="/pricing" className="nb-btn mt-6 inline-block">
              See pricing
            </Link>
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-12">
          <h2 className="font-display font-black text-3xl md:text-4xl text-center">
            What users say
          </h2>
          <div className="stagger-list mt-10 grid md:grid-cols-3 gap-5">
            {[
              {
                name: "Ryan B.",
                text: "Works directly on X without my login info. Replies sound natural and the workflow is simple."
              },
              {
                name: "Md Devil",
                text: "Instead of overthinking, I click and choose. The AI gets my tone and keeps replies short."
              },
              {
                name: "Md. Rakib",
                text: "Working properly for X. It helps me reply faster and stay active."
              },
              {
                name: "King B.",
                text: "Setup was smooth, no shady permissions, and it reads the tweet correctly."
              },
              {
                name: "Abdullah",
                text: "Really helpful for X users."
              },
              {
                name: "Sarah K.",
                text: "Replies are everything on X, and NurAi makes them easier to keep up with."
              }
            ].map((review) => (
              <div key={review.name} className="nb-card p-6">
                <div className="text-sm font-bold opacity-70">5/5</div>
                <p className="mt-3">{review.text}</p>
                <p className="mt-3 font-bold">- {review.name}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section-reveal max-w-3xl mx-auto px-5 py-12">
          <h2 className="font-display font-black text-3xl md:text-4xl text-center">
            Frequently asked questions
          </h2>
          <div className="stagger-list mt-10 space-y-4">
            {faqs.map((item) => (
              <details key={item.q} className="nb-card p-5 cursor-pointer">
                <summary className="font-display font-black text-lg">
                  {item.q}
                </summary>
                <p className="mt-3">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="section-reveal max-w-3xl mx-auto px-5 py-12">
          <h2 className="font-display font-black text-3xl md:text-4xl text-center">
            Setup in 60 seconds
          </h2>
          <div className="mt-10 nb-card p-7" style={{ background: "var(--accent3)" }}>
            <ol className="space-y-4 list-decimal pl-6">
              <li>
                Install the extension from the Chrome Web Store{" "}
                <a
                  href={chromeStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-bold"
                >
                  here
                </a>
                .
              </li>
              <li>Sign up on this site. Your 3-day trial starts automatically.</li>
              <li>Open X or Twitter and click reply on any post.</li>
              <li>Choose a NurAi suggestion and click Use once.</li>
              <li>Review the pasted reply, then send it from X yourself.</li>
            </ol>
            <div className="mt-6 flex gap-3 flex-wrap">
              <Link href="/signup" className="nb-btn nb-btn-primary">
                Sign up now
              </Link>
              <Link href="/pricing" className="nb-btn">
                View plans
              </Link>
            </div>
          </div>
        </section>

        <section className="section-reveal max-w-4xl mx-auto px-5 py-14 text-center">
          <h2 className="font-display font-black text-4xl md:text-5xl">
            Stop overthinking X replies.
          </h2>
          <p className="mt-4 text-lg">
            Try NurAi free for 3 days. If it saves your time and improves your
            replies, upgrade when you need more daily comments.
          </p>
          <Link href="/signup" className="nb-btn nb-btn-primary mt-8 inline-block text-lg">
            Start free trial
          </Link>
        </section>
      </main>

      <footer className="border-t-2 border-ink dark:border-nightInk mt-12">
        <div className="max-w-6xl mx-auto px-5 py-8 grid md:grid-cols-3 gap-6 text-sm">
          <div>
            <div className="font-display font-black text-xl">NurAi</div>
            <p className="mt-2 opacity-70">
              AI reply generator and Twitter comment generator for X.
            </p>
          </div>
          <div>
            <div className="font-bold">Product</div>
            <ul className="mt-2 space-y-1">
              <li>
                <Link href="/pricing" className="underline">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/signup" className="underline">
                  Sign up
                </Link>
              </li>
              <li>
                <a
                  href={chromeStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Chrome Store
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="font-bold">Support</div>
            <ul className="mt-2 space-y-1">
              <li>Email: probably.nothing.to.say@gmail.com</li>
              <li>Telegram: @Nur_Xai</li>
              <li>
                <Link href="/privacy" className="underline">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="underline">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t-2 border-ink dark:border-nightInk">
          <div className="max-w-6xl mx-auto px-5 py-4 text-sm text-center opacity-70">
            Copyright {new Date().getFullYear()} NurAi. Crypto payments via
            NOWPayments and Base Pay.
          </div>
        </div>
      </footer>
    </>
  );
}
