import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "../components/Navbar";
import SiteFooter from "../components/SiteFooter";
import { GUIDES } from "@/lib/guides";
import { breadcrumbSchema } from "@/lib/seo";

export const metadata: Metadata = {
  title: "X and Twitter reply guides: grow with better conversations",
  description:
    "Practical guides on replying on X: how to write replies people read, the reply guy strategy, safe use of AI drafts, reply length, and how the tools compare.",
  alternates: { canonical: "/guides" },
  openGraph: {
    url: "/guides",
    title: "X and Twitter reply guides: grow with better conversations",
    description:
      "Practical guides on replying on X: reply writing, growth strategy, safety, reply length, and tool comparisons.",
    type: "website"
  }
};

export default function GuidesHub() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Guides", path: "/guides" }])) }}
        />
        <div className="max-w-2xl">
          <span className="nb-tag">GUIDES</span>
          <h1 className="mt-4 font-display text-4xl font-black tracking-tight sm:text-5xl">
            Reply better. Grow <span className="font-serif italic">deliberately</span>.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed opacity-75">
            Everything we have learned about turning X conversations into an audience: writing, timing,
            safety, and the tools that help without taking the wheel.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {GUIDES.map((guide) => (
            <article key={guide.slug} className="nb-card flex h-full flex-col p-6">
              <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.12em] opacity-55">
                <span>{guide.readingMinutes} min read</span>
                <span aria-hidden="true">/</span>
                <span>{guide.tags[0]}</span>
              </div>
              <h2 className="mt-3 font-display text-xl font-bold leading-snug">
                <Link href={`/guides/${guide.slug}`} className="underline decoration-transparent decoration-2 underline-offset-4 transition hover:decoration-current">
                  {guide.h1}
                </Link>
              </h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed opacity-75">{guide.description}</p>
              <Link href={`/guides/${guide.slug}`} className="mt-4 text-sm font-black underline underline-offset-4">
                Read the guide
              </Link>
            </article>
          ))}
        </div>

        <div className="nb-card mt-8 flex flex-wrap items-center justify-between gap-4 p-6" style={{ background: "color-mix(in srgb, var(--accent) 18%, var(--card))" }}>
          <div>
            <h2 className="font-display text-xl font-bold">Want the drafts without the busywork?</h2>
            <p className="mt-1 text-sm opacity-75">Four context-aware replies per post, reviewed and posted by you.</p>
          </div>
          <Link href="/signup" className="nb-btn nb-btn-primary min-h-[44px]">Start your free trial</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
