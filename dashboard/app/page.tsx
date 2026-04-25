import Link from "next/link";
import Navbar from "./components/Navbar";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-5 py-16">
        <section className="text-center">
          <span className="nb-tag">CHROME EXTENSION • AI POWERED</span>
          <h1 className="mt-5 font-display font-black text-5xl md:text-7xl leading-tight">
            Reply on X like a <span style={{ background: "var(--accent3)", padding: "0 8px" }}>real human</span>.
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg">
            NurAi reads each tweet you reply to and instantly suggests 4 witty, contextual replies — emotion-aware, human-toned, never robotic.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="nb-btn nb-btn-primary text-lg">Start free trial — $1</Link>
            <Link href="/pricing" className="nb-btn nb-btn-warn text-lg">See plans</Link>
          </div>
        </section>

        <section className="mt-24 grid md:grid-cols-3 gap-6">
          {[
            { t: "Context-aware", d: "Reads the tweet's emotion, tone, and topic before suggesting." },
            { t: "Human-feel", d: "Casual, witty, micro-imperfect — never sounds AI-polished." },
            { t: "One-click paste", d: "Tap a suggestion to drop it into the X reply box, ready to send." }
          ].map((x) => (
            <div key={x.t} className="nb-card p-6">
              <h3 className="font-display font-black text-xl">{x.t}</h3>
              <p className="mt-2">{x.d}</p>
            </div>
          ))}
        </section>

        <section className="mt-24 nb-card p-8 text-center" style={{ background: "var(--accent2)" }}>
          <h2 className="font-display font-black text-3xl">Why Premium?</h2>
          <p className="mt-3">
            Pro gets you 250 comments/day for $10. Premium gets you{" "}
            <strong>1,500 comments/day for just $30</strong> — that's <strong>6× more</strong> for only 3× the price. No-brainer.
          </p>
          <Link href="/pricing" className="nb-btn mt-6 inline-block">Compare plans →</Link>
        </section>
      </main>

      <footer className="border-t-2 border-ink dark:border-nightInk mt-20">
        <div className="max-w-6xl mx-auto px-5 py-6 flex justify-between text-sm">
          <span>© {new Date().getFullYear()} NurAi</span>
          <span>Crypto payments via NOWPayments</span>
        </div>
      </footer>
    </>
  );
}
