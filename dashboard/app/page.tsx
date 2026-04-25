import Link from "next/link";
import Navbar from "./components/Navbar";

export default function Home() {
  return (
    <>
      <Navbar />

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-5 py-16 md:py-24 text-center">
        <span className="nb-tag">CHROME EXTENSION • AI POWERED</span>
        <h1 className="mt-5 font-display font-black text-5xl md:text-7xl leading-tight">
          Reply on X like a{" "}
          <span style={{ background: "var(--accent3)", padding: "0 10px" }}>
            real human
          </span>
          .
        </h1>
        <p className="mt-6 max-w-2xl mx-auto text-lg">
          NurAi reads each tweet you reply to and instantly suggests 4 witty,
          contextual replies — emotion-aware, human-toned, never robotic.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="nb-btn nb-btn-primary text-lg">
            Start trial — $2
          </Link>
          <Link href="/pricing" className="nb-btn nb-btn-warn text-lg">
            See plans
          </Link>
        </div>
        <p className="mt-4 text-sm opacity-70">
          ⚡ Pay with crypto • No credit card • Cancel anytime
        </p>
      </section>

      {/* WHO IS THIS FOR */}
      <section className="max-w-6xl mx-auto px-5 py-12">
        <h2 className="font-display font-black text-3xl md:text-4xl text-center">
          Who is NurAi for?
        </h2>
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {[
            {
              title: "🚀 Crypto / Web3 builders",
              text: "Engage with 100s of tweets daily without burning out. Build your CT presence faster."
            },
            {
              title: "📈 Growth-focused creators",
              text: "Replies are the #1 way to grow on X. NurAi makes meaningful engagement effortless."
            },
            {
              title: "💼 Founders & marketers",
              text: "Spend less time crafting replies. More time on what actually matters."
            }
          ].map((x) => (
            <div key={x.title} className="nb-card p-6">
              <h3 className="font-display font-black text-xl">{x.title}</h3>
              <p className="mt-2">{x.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <h2 className="font-display font-black text-3xl md:text-4xl text-center">
          Why NurAi?
        </h2>
        <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { t: "Context-aware", d: "Reads the tweet's emotion, tone, and topic before suggesting." },
            { t: "Human-feel", d: "Casual, witty, micro-imperfect — never sounds like AI." },
            { t: "One-click paste", d: "Tap a suggestion to drop it into the X reply box, ready to send." },
            { t: "Privacy first", d: "No DMs, no history, no X password. Just the tweet you're replying to." }
          ].map((x) => (
            <div key={x.t} className="nb-card p-6">
              <h3 className="font-display font-black text-xl">{x.t}</h3>
              <p className="mt-2 text-sm">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <h2 className="font-display font-black text-3xl md:text-4xl text-center">
          How it works
        </h2>
        <div className="mt-10 grid md:grid-cols-4 gap-5">
          {[
            { n: "1", t: "Install", d: "Add NurAi from the Chrome Web Store. 30 seconds." },
            { n: "2", t: "Sign up", d: "Create an account here. Pick a plan or start trial." },
            { n: "3", t: "Open X", d: "Click reply on any tweet. NurAi panel opens automatically." },
            { n: "4", t: "Click & send", d: "Pick a suggestion, hit Reply. That's it." }
          ].map((x) => (
            <div key={x.n} className="nb-card p-6">
              <div
                className="font-display font-black text-3xl w-12 h-12 grid place-items-center border-2 border-ink dark:border-nightInk rounded-full"
                style={{ background: "var(--accent3)" }}
              >
                {x.n}
              </div>
              <h3 className="mt-4 font-display font-black text-xl">{x.t}</h3>
              <p className="mt-2 text-sm">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WHY PREMIUM */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="nb-card p-8 text-center" style={{ background: "var(--accent2)" }}>
          <span className="nb-tag" style={{ background: "var(--accent3)" }}>BEST VALUE</span>
          <h2 className="mt-4 font-display font-black text-3xl md:text-4xl">
            Why everyone picks Premium
          </h2>
          <p className="mt-3 max-w-2xl mx-auto">
            Pro gets you 250 comments/day for $10. Premium gets you{" "}
            <strong>1,500 comments/day for just $30</strong> — that's{" "}
            <strong>6× more replies</strong> for only 3× the price. Plus GPT-4o
            (the smarter model). No-brainer math.
          </p>
          <Link href="/pricing" className="nb-btn mt-6 inline-block">
            Compare plans →
          </Link>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <h2 className="font-display font-black text-3xl md:text-4xl text-center">
          What users say
        </h2>
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {[
            {
              name: "Ryan B.",
              text: "Always cautious about media tools, but NurAi was a relief — works directly on X without my login info. Replies sound incredibly natural."
            },
            {
              name: "Md Devil",
              text: "Honestly changed how I reply on X. Instead of overthinking, I click & choose. The AI gets my tone perfectly. Total game-changer."
            },
            {
              name: "Md. Rakib",
              text: "Working properly for a few days of testing — really helping me grow my X account."
            },
            {
              name: "King B.",
              text: "Setup was smooth, no shady permissions, and it just works. Even when I don't reply, it still reads the tweet correctly."
            },
            {
              name: "Abdullah",
              text: "Really helpful for X users."
            },
            {
              name: "Sarah K.",
              text: "I went from 200 followers to 3K in two months. Replies are everything on X, and NurAi makes them effortless."
            }
          ].map((r) => (
            <div key={r.name} className="nb-card p-6">
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s}>⭐</span>
                ))}
              </div>
              <p className="mt-3">{r.text}</p>
              <p className="mt-3 font-bold">— {r.name}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-5 py-16">
        <h2 className="font-display font-black text-3xl md:text-4xl text-center">
          Frequently asked
        </h2>
        <div className="mt-10 space-y-4">
          {[
            {
              q: "Do you store my X login or password?",
              a: "Never. NurAi runs entirely in your browser. We don't have access to your X password, DMs, or login session — only the public tweet text you're actively replying to."
            },
            {
              q: "Will Twitter/X ban me for using this?",
              a: "No. NurAi only suggests replies — you click 'Use' and send manually. It's no different from copying text from anywhere else. We never auto-post."
            },
            {
              q: "Why crypto-only payments?",
              a: "Crypto is global, fast, and lower-fee than card processors. We accept BTC, ETH, USDT, USDC, BNB, and 100+ coins via NOWPayments. Your subscription activates within minutes of confirmation."
            },
            {
              q: "What's the difference between Pro and Premium?",
              a: "Pro = 250 replies/day with GPT-4o-mini ($10/mo). Premium = 1,500 replies/day with GPT-4o, the smartest model ($30/mo). Premium replies are noticeably better and you get 6× more of them."
            },
            {
              q: "Can I cancel anytime?",
              a: "Yes. Just don't renew. Your access ends when your current period expires. No hidden fees, no auto-charges."
            },
            {
              q: "Does NurAi work on Twitter mobile or other browsers?",
              a: "Currently Chrome desktop only (and Chrome-based browsers like Brave, Edge). Mobile support is on the roadmap."
            },
            {
              q: "How accurate are the suggestions?",
              a: "NurAi uses GPT-4o-mini (Trial/Starter/Pro) and GPT-4o (Premium) — among the best language models available. Suggestions match the tweet's tone and emotion. You can regenerate anytime if you don't like the first set."
            },
            {
              q: "Is there a free trial?",
              a: "Yes. The $1.05 / 1-day trial gives you 200 replies — enough to test it for an entire day before committing."
            },
            {
              q: "Where is my data stored?",
              a: "Account info (email) is stored in our secure database (encrypted). Tweet text is sent to OpenAI for processing only — not stored. Read our Privacy Policy for full details."
            },
            {
              q: "How do I get help?",
              a: "Email support@nurxai.com or message us on Telegram @Nur_Xai. We respond within 24 hours."
            }
          ].map((f, i) => (
            <details key={i} className="nb-card p-5 cursor-pointer">
              <summary className="font-display font-black text-lg">
                {f.q}
              </summary>
              <p className="mt-3">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* SETUP HELP */}
      <section className="max-w-3xl mx-auto px-5 py-16">
        <h2 className="font-display font-black text-3xl md:text-4xl text-center">
          Setup in 60 seconds
        </h2>
        <div className="mt-10 nb-card p-7" style={{ background: "var(--accent3)" }}>
          <ol className="space-y-4 list-decimal pl-6">
            <li>
              <strong>Install the extension</strong> from the Chrome Web Store{" "}
              <a
                href="https://chromewebstore.google.com/detail/odapbgkbdpalphekkmibliclmedgmlhb"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-bold"
              >
                here
              </a>
              .
            </li>
            <li>
              <strong>Sign up</strong> on this site (use the button below).
            </li>
            <li>
              <strong>Pick a plan</strong> — start with the $1 trial.
            </li>
            <li>
              <strong>Click the NurAi icon</strong> in your Chrome toolbar — it auto-links to your account.
            </li>
            <li>
              <strong>Open X</strong>, click reply on any tweet — NurAi pops up with 4 suggestions.
            </li>
            <li>
              <strong>Click "Use"</strong> on any suggestion — it pastes into the reply box.
            </li>
          </ol>
          <div className="mt-6 flex gap-3 flex-wrap">
            <Link href="/signup" className="nb-btn nb-btn-primary">Sign up now</Link>
            <Link href="/pricing" className="nb-btn">View plans</Link>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="max-w-4xl mx-auto px-5 py-16 text-center">
        <h2 className="font-display font-black text-4xl md:text-5xl">
          Stop overthinking replies.
        </h2>
        <p className="mt-4 text-lg">
          Try NurAi for $2. If you don't love it, you've lost a buck.
        </p>
        <Link href="/signup" className="nb-btn nb-btn-primary mt-8 inline-block text-lg">
          Start trial →
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="border-t-2 border-ink dark:border-nightInk mt-12">
        <div className="max-w-6xl mx-auto px-5 py-8 grid md:grid-cols-3 gap-6 text-sm">
          <div>
            <div className="font-display font-black text-xl">NurAi</div>
            <p className="mt-2 opacity-70">AI reply suggestions for X/Twitter.</p>
          </div>
          <div>
            <div className="font-bold">Product</div>
            <ul className="mt-2 space-y-1">
              <li><Link href="/pricing" className="underline">Pricing</Link></li>
              <li><Link href="/signup" className="underline">Sign up</Link></li>
              <li>
                <a
                  href="https://chromewebstore.google.com/detail/odapbgkbdpalphekkmibliclmedgmlhb"
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
              <li>Email: support@nurxai.com</li>
              <li>Telegram: @Nur_Xai</li>
              <li><Link href="/privacy" className="underline">Privacy Policy</Link></li>
              <li><Link href="/terms" className="underline">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t-2 border-ink dark:border-nightInk">
          <div className="max-w-6xl mx-auto px-5 py-4 text-sm text-center opacity-70">
            © {new Date().getFullYear()} NurAi. Crypto payments via NOWPayments.
          </div>
        </div>
      </footer>
    </>
  );
}
