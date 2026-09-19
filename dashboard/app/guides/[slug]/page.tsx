import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "../../components/Navbar";
import SiteFooter from "../../components/SiteFooter";
import { GUIDES, getGuide, type GuideBlock } from "@/lib/guides";
import { articleSchema, breadcrumbSchema, faqSchema } from "@/lib/seo";

type GuideParams = { slug: string };

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<GuideParams> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guides/${guide.slug}` },
    keywords: guide.tags,
    openGraph: {
      url: `/guides/${guide.slug}`,
      title: guide.title,
      description: guide.description,
      type: "article",
      publishedTime: guide.published,
      modifiedTime: guide.updated
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.description
    }
  };
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (!match) return <Fragment key={index}>{part}</Fragment>;
        const [, label, href] = match;
        if (href.startsWith("http")) {
          return (
            <a key={index} href={href} className="font-semibold underline underline-offset-2" target="_blank" rel="noopener noreferrer">
              {label}
            </a>
          );
        }
        return (
          <Link key={index} href={href} className="font-semibold underline underline-offset-2">
            {label}
          </Link>
        );
      })}
    </>
  );
}

function Block({ block }: { block: GuideBlock }) {
  if (block.type === "h2") {
    return <h2 className="mt-8 font-display text-2xl font-black tracking-tight">{block.text}</h2>;
  }
  if (block.type === "p") {
    return (
      <p className="mt-3 text-[15px] leading-relaxed opacity-85">
        <Inline text={block.text} />
      </p>
    );
  }
  if (block.type === "quote") {
    return (
      <blockquote className="mt-4 border-l-4 border-[var(--accent)] pl-4 font-serif text-lg italic opacity-90">
        {block.text}
      </blockquote>
    );
  }
  if (block.type === "ul") {
    return (
      <ul className="mt-3 list-disc space-y-2 pl-6 text-[15px] leading-relaxed opacity-85">
        {block.items.map((item, index) => (
          <li key={index}>
            <Inline text={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (block.type === "ol") {
    return (
      <ol className="mt-3 list-decimal space-y-2 pl-6 text-[15px] leading-relaxed opacity-85">
        {block.items.map((item, index) => (
          <li key={index}>
            <Inline text={item} />
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr>
            {block.headers.map((header) => (
              <th key={header} className="border-b-2 border-ink/20 px-3 py-2 text-left font-black dark:border-nightInk/20">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b border-ink/10 px-3 py-2 align-top opacity-85 dark:border-nightInk/10">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function GuidePage({ params }: { params: Promise<GuideParams> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const updated = new Date(guide.updated).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const related = guide.related.map((relatedSlug) => getGuide(relatedSlug)).filter(Boolean);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              articleSchema({
                slug: guide.slug,
                title: guide.title,
                description: guide.description,
                published: guide.published,
                updated: guide.updated,
                section: guide.tags[0]
              })
            )
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              breadcrumbSchema([
                { name: "Home", path: "/" },
                { name: "Guides", path: "/guides" },
                { name: guide.h1, path: `/guides/${guide.slug}` }
              ])
            )
          }}
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(guide.faqs)) }} />

        <nav aria-label="Breadcrumb" className="text-xs font-semibold opacity-60">
          <Link className="underline underline-offset-2" href="/">Home</Link>
          <span aria-hidden="true"> / </span>
          <Link className="underline underline-offset-2" href="/guides">Guides</Link>
          <span aria-hidden="true"> / </span>
          <span>{guide.tags[0]}</span>
        </nav>

        <article className="mt-4">
          <h1 className="font-display text-4xl font-black leading-tight tracking-tight">{guide.h1}</h1>
          <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] opacity-55">
            Updated {updated} / {guide.readingMinutes} min read
          </p>
          <p className="mt-5 text-lg leading-relaxed opacity-80">{guide.intro}</p>

          {guide.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}

          <section className="mt-10" aria-labelledby="guide-faq">
            <h2 id="guide-faq" className="font-display text-2xl font-black tracking-tight">Frequently asked</h2>
            <div className="mt-3 space-y-2">
              {guide.faqs.map((faq) => (
                <details key={faq.q} className="nb-card p-4">
                  <summary className="cursor-pointer font-bold">{faq.q}</summary>
                  <p className="mt-2 text-sm leading-relaxed opacity-80">{faq.a}</p>
                </details>
              ))}
            </div>
          </section>

          <aside className="nb-card mt-10 p-6" style={{ background: "color-mix(in srgb, var(--accent) 18%, var(--card))" }}>
            <h2 className="font-display text-xl font-bold">Draft your next reply with NurAi</h2>
            <p className="mt-1.5 text-sm leading-relaxed opacity-80">
              Four context-aware drafts per X post, in your voice. You review, edit, and publish. Three days free.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/signup" className="nb-btn nb-btn-primary min-h-[44px]">Start free trial</Link>
              <Link href="/x-reply-extension" className="nb-btn min-h-[44px]">See the extension</Link>
            </div>
          </aside>
        </article>

        {related.length > 0 && (
          <section className="mt-12" aria-labelledby="related-guides">
            <h2 id="related-guides" className="font-display text-2xl font-black tracking-tight">Keep reading</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {related.map((item) => (
                <Link key={item!.slug} href={`/guides/${item!.slug}`} className="nb-card p-5">
                  <span className="text-[11px] font-black uppercase tracking-[0.12em] opacity-55">{item!.tags[0]}</span>
                  <h3 className="mt-2 font-display text-lg font-bold leading-snug">{item!.h1}</h3>
                  <p className="mt-2 text-sm leading-relaxed opacity-70">{item!.description}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
