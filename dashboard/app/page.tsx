import Link from "next/link";
import type { Metadata } from "next";
import Navbar from "./components/Navbar";
import HeroMotion from "./components/HeroMotion";
import { formatPaygPrice, getPaygPricing, isPaygDiscounted, paygDiscountPercent } from "@/lib/payg-pricing";

export const dynamic = "force-dynamic";

const siteUrl = "https://nurxai.xyz";
const chromeStoreUrl =
  "https://chromewebstore.google.com/detail/odapbgkbdpalphekkmibliclmedgmlhb";

export const metadata: Metadata = {
  title: "Human-in-the-Loop X Copilot with Base x402",
  description:
    "NurAi is a human-in-the-loop communication copilot for X. Understand public post context, review four draft replies, and unlock Premium generations with x402 USDC payments on Base.",
  alternates: { canonical: "/" }
};

const professionalUseCases = [
  {
    title: "Founders and product teams",
    text: "Prepare thoughtful responses to customers, partners, product feedback, and market conversations without handing control to a bot."
  },
  {
    title: "Researchers and analysts",
    text: "Turn dense posts, charts, screenshots, and quoted threads into concise draft angles grounded in the visible source."
  },
  {
    title: "Community and support leads",
    text: "Draft clear, relevant responses faster while a human operator reviews tone, facts, and timing before publication."
  },
  {
    title: "Creators and independent professionals",
    text: "Spend less time staring at an empty composer and more time shaping a response that still sounds like you."
  }
];

const controlPrinciples = [
  {
    title: "User initiated",
    text: "NurAi runs only after you open a specific X reply and request help with that conversation."
  },
  {
    title: "Human approved",
    text: "You choose, edit, or ignore every draft. NurAi never presses X's final Reply button."
  },
  {
    title: "Public context only",
    text: "No X password, DMs, auto-following, auto-liking, timeline scraping, or private account access."
  },
  {
    title: "No background engagement",
    text: "No scheduled replies, engagement loops, autonomous campaigns, or unattended posting."
  }
];

const protocolSteps = [
  {
    label: "01 / REQUEST",
    title: "Ask for one Premium generation",
    text: "The user selects PAYG inside the extension for the active public conversation."
  },
  {
    label: "02 / HTTP 402",
    title: "Receive machine-readable terms",
    text: "NurAi returns the exact Base network, USDC asset, recipient, and atomic price for that request."
  },
  {
    label: "03 / AUTHORIZE",
    title: "Sign from an app-specific Base account",
    text: "A self-custodial Base Sub Account authorizes only the quoted amount. The extension pins every payment term."
  },
  {
    label: "04 / SETTLE",
    title: "Deliver the result and settle on Base",
    text: "Idempotent operation state protects the generation, and the result is returned after exact USDC settlement succeeds on Base."
  }
];

const productSteps = [
  {
    title: "Choose the conversation",
    text: "Open a reply composer on the post you want to respond to. Nothing runs across your timeline in the background."
  },
  {
    title: "Request context-aware drafts",
    text: "NurAi reads the active post, quote, links, and available visual context to prepare four distinct options."
  },
  {
    title: "Apply your judgment",
    text: "Review the wording, pick an option, regenerate, edit, or close the panel. The suggestion is not an action."
  },
  {
    title: "Publish from X yourself",
    text: "Clicking Use pastes the selected draft into the composer. You remain responsible for the final text and final click."
  }
];

const productShots = [
  {
    src: "/product/reply-panel-context.webp",
    title: "Active-post context",
    text: "The copilot works beside the reply composer and focuses on the conversation the user selected."
  },
  {
    src: "/product/reply-panel-quote.webp",
    title: "Quote and thread awareness",
    text: "Quoted material and visible thread context help drafts respond to the real subject instead of producing generic praise."
  },
  {
    src: "/product/reply-panel-pasted.webp",
    title: "Review before publication",
    text: "One selected draft is pasted into X for inspection. Nothing is posted without the user's final action."
  }
];

const comparisonRows = [
  ["Human chooses the conversation", "Always", "Always", "Prompt dependent"],
  ["Understands active post context", "Built in", "Manual reading", "Manual copy/paste"],
  ["Posts or engages autonomously", "Never", "Never", "Depends on integration"],
  ["Requires X password or DM access", "No", "No", "Varies"],
  ["Final publication control", "User", "User", "Varies"],
  ["Base-native per-use access", "x402 + USDC", "No", "No"]
];

function buildFaqs(currentPrice: string) {
  return [
    {
      q: "What is NurAi?",
      a: "NurAi is a human-in-the-loop communication copilot for X. It helps a user understand the active public conversation and prepare concise reply drafts without taking control of the account."
    },
    {
      q: "Is NurAi an auto-reply or engagement bot?",
      a: "No. NurAi does not schedule, auto-post, auto-like, auto-follow, or run engagement campaigns. It only prepares drafts after a user opens a specific reply composer."
    },
    {
      q: "Who sends the final reply?",
      a: "The user. A suggestion can be ignored, regenerated, edited, or pasted into the composer. NurAi never presses the final Reply button."
    },
    {
      q: "Why is NurAi built on Base?",
      a: "Base gives NurAi a fast, low-cost settlement layer for USDC micropayments. Base Account also supports an app-specific, self-custodial payment session without giving NurAi custody of the user's main wallet."
    },
    {
      q: "What does x402 add to the product?",
      a: `x402 makes Premium access part of the HTTP request itself. The client receives an exact price, authorizes ${currentPrice} USDC on Base at the current rate, and retries the protected request after verification. No prepaid credit bundle is required.`
    },
    {
      q: "Is the AI generation itself onchain?",
      a: "No. AI inference runs through hosted model providers. The access, payment authorization, exact USDC settlement, and transaction receipt form the onchain commerce layer on Base."
    },
    {
      q: "Does NurAi custody user funds?",
      a: "No. PAYG uses an app-specific Base Sub Account controlled by the user's local signer. Payment requests are pinned to Base mainnet, USDC, the quoted amount, and the configured recipient."
    },
    {
      q: "What data does NurAi access?",
      a: "Only the public post context the user is actively replying to and the account preferences needed for personalization. NurAi does not request the user's X password or DMs."
    },
    {
      q: "Can I use NurAi without PAYG?",
      a: "Yes. NurAi offers a free trial and fixed-duration plans for predictable usage. Base x402 PAYG is the flexible option for Premium generations without a daily business quota."
    }
  ];
}

export default async function Home() {
  const pricing = await getPaygPricing().catch(() => ({
    regularPriceUSD: "0.009000",
    currentPriceUSD: "0.009000",
    amountAtomic: "9000",
    revision: 1,
    updatedAt: new Date(0).toISOString()
  }));
  const currentPrice = formatPaygPrice(pricing.currentPriceUSD);
  const regularPrice = formatPaygPrice(pricing.regularPriceUSD);
  const discounted = isPaygDiscounted(pricing.regularPriceUSD, pricing.currentPriceUSD);
  const discountPercent = paygDiscountPercent(pricing.regularPriceUSD, pricing.currentPriceUSD);
  const faqs = buildFaqs(currentPrice);

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NurAi",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Chrome, Edge, Brave, Opera",
    url: siteUrl,
    description:
      "A human-in-the-loop X communication copilot with context-aware drafting and Base-native x402 USDC access.",
    featureList: [
      "Human-approved reply drafting",
      "Active-post and image context",
      "No autonomous posting",
      "Base Account payment session",
      "x402 USDC pay-per-use access"
    ],
    offers: [
      {
        "@type": "Offer",
        name: "Premium PAYG generation",
        price: pricing.currentPriceUSD,
        priceCurrency: "USD",
        description: "One Premium generation paid in USDC on Base through x402"
      },
      {
        "@type": "Offer",
        name: "Free trial",
        price: "0",
        priceCurrency: "USD",
        description: "3-day trial with human-controlled draft generation"
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
      acceptedAnswer: { "@type": "Answer", text: item.a }
    }))
  };

  return (
    <>
      <Navbar />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <main>
        <section className="hero-stage section-reveal relative overflow-hidden px-5 py-16 md:py-24 text-center">
          <HeroMotion />
          <div className="hero-content relative z-10 max-w-6xl mx-auto">
            <div className="hero-badges flex flex-wrap justify-center gap-2">
              <span className="nb-tag" style={{ background: "#b8e1ff" }}>BUILT ON BASE</span>
              <span className="nb-tag" style={{ background: "#c4f0c2" }}>x402 + USDC PAYG</span>
              <span className="nb-tag" style={{ background: "#fff89c" }}>HUMAN APPROVAL REQUIRED</span>
            </div>
            <h1 className="hero-title mt-6 font-display font-black text-[42px] sm:text-6xl md:text-7xl leading-[1.02] tracking-normal">
              Your judgment. Better context. <span className="hero-highlight">Onchain access.</span>
            </h1>
            <p className="hero-copy mt-6 max-w-3xl mx-auto text-lg md:text-xl">
              NurAi is a human-in-the-loop communication copilot for X. It helps professionals understand the active public conversation, prepare thoughtful reply drafts, and unlock Premium intelligence with USDC payments on Base.
            </p>
            <div className="hero-guardrails mt-7 flex flex-wrap justify-center gap-3 text-sm font-black">
              <span className="nb-card px-4 py-2">NO AUTO-POSTING</span>
              <span className="nb-card px-4 py-2">NO X PASSWORD</span>
              <span className="nb-card px-4 py-2">NO BACKGROUND ENGAGEMENT</span>
            </div>
            <div className="hero-actions mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="nb-btn nb-btn-primary text-lg">Try the copilot</Link>
              <a href="#base-x402" className="nb-btn text-lg">Explore Base x402</a>
            </div>
            <p className="mt-4 text-sm opacity-75">
              You select the post. You select the draft. You publish from X yourself.
            </p>
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-10 md:py-14">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ["Trigger", "User request", "Runs only on the active reply"],
              ["Decision", "Human review", "Choose, edit, regenerate, or ignore"],
              ["Action", "User publishes", "NurAi never sends the reply"],
              ["Commerce", "Base x402", "Exact USDC per Premium request"]
            ].map(([label, value, sub]) => (
              <div key={label} className="nb-card p-5 text-center">
                <div className="text-xs font-black opacity-60 tracking-widest">{label.toUpperCase()}</div>
                <div className="font-display font-black text-2xl mt-2">{value}</div>
                <div className="text-sm mt-2 opacity-75">{sub}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="base-x402" className="section-reveal max-w-6xl mx-auto px-5 py-14 scroll-mt-24">
          <div className="base-protocol-shell nb-card overflow-hidden">
            <div className="p-7 md:p-10 bg-[#0052ff] text-white">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="max-w-3xl">
                  <span className="inline-flex rounded-full border-2 border-white px-3 py-1 text-xs font-black tracking-widest">
                    BASE-NATIVE COMMERCE LAYER
                  </span>
                  <h2 className="mt-5 font-display font-black text-4xl md:text-6xl leading-[1.02]">
                    Premium intelligence, paid at the request layer.
                  </h2>
                  <p className="mt-5 text-lg text-white/85">
                    NurAi protects its Premium generation endpoint with x402. The payment terms travel with the HTTP request, a Base Sub Account authorizes exact USDC, and settlement is independently verifiable on Base.
                  </p>
                </div>
                <div className="protocol-price-card border-2 border-white rounded-2xl p-5 min-w-[220px] bg-white text-[#07142b]">
                  <div className="text-xs font-black tracking-widest">CURRENT PAYG</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    {discounted && <span className="line-through opacity-50 font-black">{regularPrice}</span>}
                    <strong className="font-display text-4xl">{currentPrice}</strong>
                  </div>
                  {discounted && <div className="mt-2 font-black text-green-700">{discountPercent}% below regular price</div>}
                  <div className="mt-2 text-sm font-bold">USDC / Premium generation</div>
                  <div className="mt-1 text-xs opacity-60">Base mainnet | no daily PAYG quota</div>
                </div>
              </div>
            </div>

            <div className="p-7 md:p-10">
              <div className="protocol-flow-grid grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {protocolSteps.map((step) => (
                  <article key={step.label} className="protocol-step nb-card p-5">
                    <div className="text-xs font-black text-[#0052ff] tracking-widest">{step.label}</div>
                    <h3 className="mt-3 font-display font-black text-xl">{step.title}</h3>
                    <p className="mt-2 text-sm opacity-80">{step.text}</p>
                  </article>
                ))}
              </div>
              <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                {[
                  ["No prepaid credits", "Use fixed plans when predictable access fits, or pay for one Premium request when it does not."],
                  ["Stablecoin clarity", "The client sees the exact atomic USDC amount, asset, network, and recipient before signing."],
                  ["Self-custodial session", "An app-specific Base Sub Account keeps payment authority separate from the user's main account."],
                  ["Programmatic settlement", "The same open HTTP payment pattern can support future authorized software and agent clients."]
                ].map(([title, text]) => (
                  <div key={title} className="border-l-4 border-[#0052ff] pl-4 py-1">
                    <h3 className="font-black">{title}</h3>
                    <p className="mt-1 opacity-75">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-14">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-8 items-center">
            <div>
              <span className="nb-tag">A COPILOT, NOT AN OPERATOR</span>
              <h2 className="mt-4 font-display font-black text-3xl md:text-5xl leading-tight">
                Assistance ends where account action begins.
              </h2>
              <p className="mt-4 text-lg">
                NurAi reduces the work between reading a complex post and drafting a relevant response. It does not replace the professional's judgment, identity, or responsibility for what gets published.
              </p>
              <div className="mt-6 grid sm:grid-cols-2 gap-3">
                {controlPrinciples.map((item) => (
                  <div key={item.title} className="nb-card p-4">
                    <h3 className="font-black">{item.title}</h3>
                    <p className="mt-1 text-sm opacity-80">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="product-showcase nb-card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/product/reply-panel-context.webp"
                alt="NurAi human-in-the-loop copilot beside an X reply composer"
                className="w-full h-auto"
                width={1280}
                height={709}
                loading="eager"
              />
            </div>
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-14">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <div>
              <span className="nb-tag" style={{ background: "var(--accent3)" }}>PROFESSIONAL WORKFLOWS</span>
              <h2 className="mt-4 font-display font-black text-3xl md:text-5xl">Built for people accountable for their words.</h2>
            </div>
            <p className="max-w-xl text-base opacity-80">
              The product optimizes preparation and context, not posting volume. It is most useful when relevance, tone, and human review matter.
            </p>
          </div>
          <div className="stagger-list mt-8 grid md:grid-cols-2 gap-5">
            {professionalUseCases.map((item) => (
              <article key={item.title} className="nb-card p-6">
                <h3 className="font-display font-black text-2xl">{item.title}</h3>
                <p className="mt-3">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-14">
          <h2 className="font-display font-black text-3xl md:text-5xl text-center">A deliberate workflow, end to end.</h2>
          <div className="stagger-list mt-10 grid md:grid-cols-4 gap-5">
            {productSteps.map((step, index) => (
              <article key={step.title} className="nb-card p-6">
                <div className="font-display font-black text-2xl w-11 h-11 grid place-items-center border-2 border-ink dark:border-nightInk rounded-full bg-[var(--accent3)] text-ink">
                  {index + 1}
                </div>
                <h3 className="mt-4 font-display font-black text-xl">{step.title}</h3>
                <p className="mt-2 text-sm">{step.text}</p>
              </article>
            ))}
          </div>
          <div className="mt-8 grid md:grid-cols-3 gap-5">
            {productShots.map((shot) => (
              <article key={shot.src} className="nb-card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shot.src}
                  alt={`${shot.title} in the NurAi human-controlled workflow`}
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

        <section className="section-reveal max-w-6xl mx-auto px-5 py-14">
          <div className="nb-card overflow-hidden">
            <div className="p-7 md:p-10 bg-[var(--accent2)]">
              <span className="nb-tag bg-white">HONEST ARCHITECTURE</span>
              <h2 className="mt-4 font-display font-black text-3xl md:text-5xl">AI assistance offchain. Commerce onchain.</h2>
              <p className="mt-4 max-w-3xl text-lg">
                NurAi separates the intelligence layer from the payment layer instead of making vague "fully onchain AI" claims.
              </p>
            </div>
            <div className="grid md:grid-cols-2 border-t-2 border-ink dark:border-nightInk">
              <div className="p-7 md:p-9 md:border-r-2 border-ink dark:border-nightInk">
                <div className="text-xs font-black tracking-widest opacity-60">APPLICATION LAYER</div>
                <h3 className="mt-2 font-display font-black text-2xl">Context and drafting</h3>
                <p className="mt-3">Public post context, optional visual understanding, user style, and hosted GPT, Grok, and Gemini inference produce drafts for human review.</p>
              </div>
              <div className="p-7 md:p-9">
                <div className="text-xs font-black tracking-widest text-[#0052ff]">BASE COMMERCE LAYER</div>
                <h3 className="mt-2 font-display font-black text-2xl">Access and settlement</h3>
                <p className="mt-3">Base Account, x402 payment requirements, exact USDC authorization, CDP facilitator verification, replay-safe operation state, and an onchain receipt.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-14">
          <div className="nb-card overflow-hidden">
            <div className="p-7 md:p-9">
              <span className="nb-tag">PRODUCT BOUNDARIES</span>
              <h2 className="mt-4 font-display font-black text-3xl md:text-4xl">What NurAi does, and what it deliberately does not do.</h2>
            </div>
            <div className="overflow-x-auto border-t-2 border-ink dark:border-nightInk">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b-2 border-ink dark:border-nightInk">
                    <th className="text-left p-4">Capability</th>
                    <th className="text-left p-4 bg-[var(--accent3)] text-ink">NurAi</th>
                    <th className="text-left p-4">Manual workflow</th>
                    <th className="text-left p-4">Generic AI</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row[0]} className="border-t-2 border-ink/20 dark:border-nightInk/20">
                      {row.map((cell, index) => (
                        <td key={`${row[0]}-${index}`} className={`p-4 ${index === 1 ? "font-black" : ""}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="section-reveal max-w-6xl mx-auto px-5 py-14">
          <div className="grid md:grid-cols-2 gap-5">
            <div className="nb-card p-7 md:p-9">
              <span className="nb-tag">PREDICTABLE ACCESS</span>
              <h2 className="mt-4 font-display font-black text-3xl">Trial and fixed-duration plans</h2>
              <p className="mt-3">Use a daily allowance when recurring, predictable access fits your workflow. Plans never auto-renew.</p>
              <Link href="/pricing" className="nb-btn mt-6 inline-flex">Compare plans</Link>
            </div>
            <div className="nb-card p-7 md:p-9 bg-[#0052ff] text-white border-white">
              <span className="inline-flex rounded-full border-2 border-white px-3 py-1 text-xs font-black">FLEXIBLE ACCESS</span>
              <h2 className="mt-4 font-display font-black text-3xl">Base x402 PAYG</h2>
              <p className="mt-3 text-white/85">Authorize one Premium generation at the current exact USDC price. No prepaid bundle and no daily PAYG business quota.</p>
              <div className="mt-5 font-display font-black text-4xl">{currentPrice} <span className="text-lg">USDC</span></div>
            </div>
          </div>
        </section>

        <section className="section-reveal max-w-3xl mx-auto px-5 py-14">
          <h2 className="font-display font-black text-3xl md:text-5xl text-center">Questions, answered plainly.</h2>
          <div className="stagger-list mt-10 space-y-4">
            {faqs.map((item) => (
              <details key={item.q} className="nb-card p-5 cursor-pointer">
                <summary className="font-display font-black text-lg">{item.q}</summary>
                <p className="mt-3">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="section-reveal max-w-5xl mx-auto px-5 py-16 text-center">
          <span className="nb-tag bg-[var(--accent3)]">LIVE PRODUCT ON BASE MAINNET</span>
          <h2 className="mt-5 font-display font-black text-4xl md:text-6xl">Write with assistance. Publish with judgment.</h2>
          <p className="mt-5 text-lg max-w-2xl mx-auto">Start with the human-controlled workflow, then use Base-native PAYG whenever you need the full Premium context stack.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="nb-btn nb-btn-primary text-lg">Start free</Link>
            <a href={chromeStoreUrl} target="_blank" rel="noopener noreferrer" className="nb-btn text-lg">View Chrome extension</a>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-ink dark:border-nightInk mt-12">
        <div className="max-w-6xl mx-auto px-5 py-8 grid md:grid-cols-3 gap-6 text-sm">
          <div>
            <div className="font-display font-black text-xl">NurAi</div>
            <p className="mt-2 opacity-70">Human-in-the-loop communication assistance with Base-native x402 access.</p>
          </div>
          <div>
            <div className="font-bold">Product</div>
            <ul className="mt-2 space-y-1">
              <li><Link href="/pricing" className="underline">Pricing and access</Link></li>
              <li><Link href="/signup" className="underline">Create account</Link></li>
              <li><a href={chromeStoreUrl} target="_blank" rel="noopener noreferrer" className="underline">Chrome extension</a></li>
              <li><a href="https://www.x402.org/" target="_blank" rel="noopener noreferrer" className="underline">About x402</a></li>
            </ul>
          </div>
          <div>
            <div className="font-bold">Trust and support</div>
            <ul className="mt-2 space-y-1">
              <li>Email: probably.nothing.to.say@gmail.com</li>
              <li>Telegram: @Nur_Xai</li>
              <li><Link href="/privacy" className="underline">Privacy Policy</Link></li>
              <li><Link href="/terms" className="underline">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t-2 border-ink dark:border-nightInk">
          <div className="max-w-6xl mx-auto px-5 py-4 text-sm text-center opacity-70">
            Copyright {new Date().getFullYear()} NurAi. x402 USDC settlement on Base mainnet.
          </div>
        </div>
      </footer>
    </>
  );
}
