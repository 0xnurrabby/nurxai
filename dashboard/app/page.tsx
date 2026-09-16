import Link from "next/link";
import type { Metadata } from "next";
import Navbar from "./components/Navbar";
import Reveal from "./components/Reveal";
import { formatPaygPrice, getPaygPricing, isPaygDiscounted, paygDiscountPercent } from "@/lib/payg-pricing";
import "./home.css";

export const dynamic = "force-dynamic";

const siteUrl = "https://nurxai.xyz";
const chromeStoreUrl =
  "https://chromewebstore.google.com/detail/odapbgkbdpalphekkmibliclmedgmlhb";

export const metadata: Metadata = {
  title: "AI reply drafts for X with human approval",
  description:
    "NurAi reads the X post you are replying to and drafts four thoughtful replies in your voice. You review, edit, and publish. Free 3-day trial, optional pay-per-use USDC on Base.",
  alternates: { canonical: "/" }
};

const steps = [
  {
    title: "Open any reply on X",
    text: "Start replying to a post, then launch NurAi from the extension beside the composer."
  },
  {
    title: "Get four drafts, not one",
    text: "NurAi reads the post, quote, links, and images, then drafts four distinct angles in your voice."
  },
  {
    title: "Publish the one you like",
    text: "Edit, regenerate, or ignore. Paste your pick into X and post it yourself."
  }
];

const features = [
  {
    icon: "context",
    tone: "",
    title: "Real context",
    text: "Text, quotes, links, and screenshots. Drafts are grounded in the actual conversation, not a template."
  },
  {
    icon: "angles",
    tone: "h-icon-mint",
    title: "Four angles, not one",
    text: "Compare genuinely different options instead of accepting the first generic suggestion."
  },
  {
    icon: "voice",
    tone: "h-icon-sun",
    title: "Sounds like you",
    text: "Personal styles and project context keep every draft close to your own voice."
  }
];

const controls = [
  ["User initiated", "Runs only when you ask, on the post you chose."],
  ["Human approved", "You edit, pick, or discard every draft."],
  ["Public context only", "No X password, no DMs, no timeline scraping."],
  ["No background actions", "No scheduled replies, likes, or follows. Ever."]
];

const protocolPoints = [
  ["Exact price before you sign", "The USDC amount, asset, network, and recipient are pinned in the request."],
  ["Settles on Base mainnet", "One small USDC payment per Premium generation, verifiable onchain."],
  ["No prepaid bundles", "Pay only when you use it. Fixed plans stay available if you prefer."]
];

const trustChips = ["No auto-posting", "No X password", "No background engagement", "You hit publish"];

function buildFaqs(currentPrice: string) {
  return [
    {
      q: "What exactly is NurAi?",
      a: "NurAi is a Chrome extension with a companion dashboard. It reads the X post you are replying to and suggests four thoughtful reply drafts. You decide what gets published."
    },
    {
      q: "Is this an auto-reply or engagement bot?",
      a: "No. NurAi never schedules, posts, likes, follows, or sends DMs. It only prepares drafts after you open a specific reply composer and ask for help."
    },
    {
      q: "Who sends the final reply?",
      a: "You do. NurAi pastes your chosen draft into X's composer. The final review and the final click are always yours."
    },
    {
      q: "What data does NurAi need?",
      a: "Only the public post context you are actively replying to and the preferences you set. No X password, no DMs, no private account access."
    },
    {
      q: "Why is Base and x402 part of this?",
      a: `x402 makes payment part of the request itself on Base. Premium generations cost ${currentPrice} USDC per use, shown exactly before you authorize, with no subscription required.`
    },
    {
      q: "Can I use NurAi without crypto?",
      a: "Yes. There is a free 3-day trial and fixed-duration plans for predictable usage. Base x402 pay-per-use is optional."
    }
  ];
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function FeatureIcon({ name }: { name: string }) {
  if (name === "angles") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="7" height="7" rx="2" />
        <rect x="13" y="4" width="7" height="7" rx="2" />
        <rect x="4" y="13" width="7" height="7" rx="2" />
        <rect x="13" y="13" width="7" height="7" rx="2" />
      </svg>
    );
  }
  if (name === "voice") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4z" />
        <path d="M6 11v0a6 6 0 0 0 12 0v0" />
        <path d="M12 19v2" />
        <path d="M8.5 21h7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h8A2.5 2.5 0 0 1 17 6.5v5a2.5 2.5 0 0 1-2.5 2.5H9l-5 3.5z" />
      <path d="M9 9h6" />
      <path d="M9 12h3.5" />
    </svg>
  );
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
      "A human-in-the-loop X reply copilot that drafts thoughtful replies from real post context, with human approval and optional Base x402 USDC pay-per-use.",
    featureList: [
      "Human-approved reply drafting",
      "Active-post, quote, and image context",
      "Four distinct draft angles",
      "No autonomous posting",
      "x402 USDC pay-per-use on Base"
    ],
    offers: [
      {
        "@type": "Offer",
        name: "Premium generation",
        price: pricing.currentPriceUSD,
        priceCurrency: "USD",
        description: "One Premium generation paid in USDC on Base through x402"
      },
      {
        "@type": "Offer",
        name: "Free trial",
        price: "0",
        priceCurrency: "USD",
        description: "3-day trial with human-controlled reply drafting"
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
    <div className="home-shell">
      <Navbar />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <main>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="h-hero">
          <div className="h-hero-glow" aria-hidden="true" />
          <div className="h-hero-grid" aria-hidden="true" />
          <div className="h-container h-hero-inner">
            <span className="h-pill h-anim h-d1">
              <span className="h-pill-dot" />
              Built on Base · x402 USDC
            </span>
            <h1 className="h-h1 h-anim h-d2">
              Understand any X post. <em>Reply like yourself.</em>
            </h1>
            <p className="h-sub h-anim h-d3">
              NurAi is a Chrome copilot for X. It reads the post you are replying to, including
              text, quotes, and images, then drafts four thoughtful replies in your voice. You
              choose, edit, and publish.
            </p>
            <div className="h-actions h-anim h-d4">
              <Link href="/signup" className="h-btn h-btn-primary">
                Start free trial
              </Link>
              <a href={chromeStoreUrl} target="_blank" rel="noopener noreferrer" className="h-btn h-btn-ghost">
                Add to Chrome
              </a>
            </div>
            <p className="h-micro h-anim h-d5">
              3-day free trial · No credit card · Nothing is ever auto-posted
            </p>
            <div className="h-chips h-anim h-d5">
              {trustChips.map((chip) => (
                <span key={chip} className="h-chip">
                  <CheckIcon />
                  {chip}
                </span>
              ))}
            </div>

            <div className="h-frame-wrap h-anim h-d6">
              <div className="h-frame-glow" aria-hidden="true" />
              <figure className="h-frame h-float">
                <div className="h-frame-bar">
                  <span className="h-dot" />
                  <span className="h-dot" />
                  <span className="h-dot" />
                  <span className="h-frame-url">x.com · reply composer + NurAi panel</span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/product/reply-panel-context.webp"
                  alt="NurAi drafting four reply options beside an X reply composer"
                  width={1280}
                  height={709}
                  loading="eager"
                />
              </figure>
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────── */}
        <section id="how" className="h-section scroll-mt-24">
          <div className="h-container">
            <Reveal>
              <span className="h-eyebrow">How it works</span>
              <h2 className="h-h2">Three steps. You stay in charge.</h2>
            </Reveal>
            <div className="h-grid-3">
              {steps.map((step, index) => (
                <Reveal key={step.title} delay={index * 90} className="h-card">
                  <span className="h-step-num">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="h-h3">{step.title}</h3>
                  <p className="h-p">{step.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────── */}
        <section className="h-section" style={{ paddingTop: 0 }}>
          <div className="h-container">
            <Reveal>
              <span className="h-eyebrow">Why it feels different</span>
              <h2 className="h-h2">Assistance you would actually sign your name to.</h2>
            </Reveal>
            <div className="h-grid-3">
              {features.map((feature, index) => (
                <Reveal key={feature.title} delay={index * 90} className="h-card">
                  <span className={`h-icon ${feature.tone}`}>
                    <FeatureIcon name={feature.icon} />
                  </span>
                  <h3 className="h-h3">{feature.title}</h3>
                  <p className="h-p">{feature.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Human control band ───────────────────────────────── */}
        <section className="h-section" style={{ paddingTop: 0 }}>
          <div className="h-container">
            <Reveal className="h-band">
              <div>
                <span className="h-eyebrow">Human in the loop</span>
                <h2 className="h-h2">A copilot, never an autopilot.</h2>
                <p className="h-p">
                  NurAi prepares. You decide. It never posts, likes, follows, or messages on your behalf,
                  and it never asks for your X password. Think of it as a sharp colleague who drafts,
                  while you keep the keys.
                </p>
              </div>
              <div className="h-checks">
                {controls.map(([title, text]) => (
                  <div key={title} className="h-check">
                    <strong>{title}</strong>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Base x402 ────────────────────────────────────────── */}
        <section id="base-x402" className="h-section scroll-mt-24" style={{ paddingTop: 0 }}>
          <div className="h-container">
            <Reveal className="h-base">
              <div className="h-base-head">
                <div>
                  <span className="h-base-badge">Base-native access</span>
                  <h2 className="h-h2">Pay only when you use it.</h2>
                  <p className="h-p">
                    Premium generations unlock through x402, the open payment standard on Base.
                    You see the exact price, authorize that exact USDC amount from a self-custodial app
                    account, and your drafts arrive once settlement completes.
                  </p>
                </div>
                <div className="h-price">
                  <span className="h-eyebrow">Current pay-as-you-go</span>
                  <div className="h-price-value">
                    {discounted && <s style={{ opacity: 0.45, fontSize: "1.2rem" }}>{regularPrice}</s>}
                    {currentPrice}
                    <small>/ Premium reply</small>
                  </div>
                  <p className="h-pricing-note">
                    {discounted
                      ? `${discountPercent}% below the regular rate right now. Free trial and fixed plans are also available.`
                      : "USDC on Base mainnet. Free trial and fixed plans are also available."}
                  </p>
                </div>
              </div>
              <div className="h-base-body">
                {protocolPoints.map(([title, text]) => (
                  <div key={title} className="h-point">
                    <strong>{title}</strong>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Pricing strip ────────────────────────────────────── */}
        <section className="h-section" style={{ paddingTop: 0 }}>
          <div className="h-container">
            <Reveal>
              <span className="h-eyebrow">Simple pricing</span>
              <h2 className="h-h2">Start free. Pay per use, or by the month.</h2>
            </Reveal>
            <div className="h-pricing">
              <Reveal delay={0} className="h-card">
                <span className="h-pricing-label">Free trial</span>
                <div className="h-pricing-value">3 days</div>
                <p className="h-pricing-note">Full drafting workflow, no credit card required.</p>
              </Reveal>
              <Reveal delay={90} className="h-card">
                <span className="h-pricing-label">Monthly plans</span>
                <div className="h-pricing-value">from $5</div>
                <p className="h-pricing-note">Predictable daily allowance for regular use. Never auto-renews.</p>
              </Reveal>
              <Reveal delay={180} className="h-card">
                <span className="h-pricing-label">Pay as you go</span>
                <div className="h-pricing-value">{currentPrice}/use</div>
                <p className="h-pricing-note">Premium generations in USDC on Base, settled per request.</p>
              </Reveal>
            </div>
            <Reveal delay={120} className="h-actions" >
              <Link href="/pricing" className="h-btn h-btn-ghost">
                Compare all plans
              </Link>
            </Reveal>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────── */}
        <section className="h-section" style={{ paddingTop: 0 }}>
          <div className="h-container" style={{ maxWidth: 820 }}>
            <Reveal>
              <span className="h-eyebrow">FAQ</span>
              <h2 className="h-h2">Questions, answered plainly.</h2>
            </Reveal>
            <Reveal className="h-faq-list" delay={80}>
              {faqs.map((item) => (
                <details key={item.q} className="h-faq">
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────── */}
        <section className="h-section" style={{ paddingTop: 0 }}>
          <div className="h-container">
            <Reveal className="h-cta">
              <span className="h-eyebrow">Live on Base mainnet</span>
              <h2 className="h-h2" style={{ maxWidth: "22ch", marginInline: "auto" }}>
                Ready to reply with real context?
              </h2>
              <p className="h-p" style={{ maxWidth: "46ch", marginInline: "auto" }}>
                Install the extension, start free, and keep every final decision in your hands.
              </p>
              <div className="h-actions">
                <Link href="/signup" className="h-btn h-btn-primary">
                  Start free trial
                </Link>
                <a href={chromeStoreUrl} target="_blank" rel="noopener noreferrer" className="h-btn h-btn-ghost">
                  Add to Chrome
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer>
        <div className="h-container" style={{ paddingTop: 40, paddingBottom: 32 }}>
          <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <div className="font-display text-lg font-bold">NurAi</div>
              <p className="h-pricing-note" style={{ maxWidth: "34ch" }}>
                Human-in-the-loop reply drafting for X, with optional USDC pay-per-use on Base.
              </p>
            </div>
            <div>
              <div className="h-footer-heading">Product</div>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/pricing">Pricing and access</Link></li>
                <li><Link href="/signup">Create account</Link></li>
                <li><a href={chromeStoreUrl} target="_blank" rel="noopener noreferrer">Chrome extension</a></li>
                <li><a href="https://www.x402.org/" target="_blank" rel="noopener noreferrer">About x402</a></li>
              </ul>
            </div>
            <div>
              <div className="h-footer-heading">Trust and support</div>
              <ul className="mt-3 space-y-2 text-sm">
                <li>probably.nothing.to.say@gmail.com</li>
                <li>Telegram: @Nur_Xai</li>
                <li><Link href="/privacy">Privacy Policy</Link></li>
                <li><Link href="/terms">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="border-t" style={{ borderColor: "var(--h-ring)" }}>
          <div className="h-container py-5 text-center text-sm" style={{ color: "color-mix(in srgb, var(--ink) 55%, transparent)" }}>
            Copyright {new Date().getFullYear()} NurAi · x402 USDC settlement on Base mainnet
          </div>
        </div>
      </footer>
    </div>
  );
}
