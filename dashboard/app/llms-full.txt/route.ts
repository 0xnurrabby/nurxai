import { GUIDES } from "@/lib/guides";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";

function blockToText(block: (typeof GUIDES)[number]["blocks"][number]): string {
  switch (block.type) {
    case "h2":
      return `## ${block.text}`;
    case "p":
      return block.text;
    case "quote":
      return `> ${block.text}`;
    case "ul":
      return block.items.map((item) => `- ${item}`).join("\n");
    case "ol":
      return block.items.map((item, index) => `${index + 1}. ${item}`).join("\n");
    case "table":
      return [
        `| ${block.headers.join(" | ")} |`,
        `| ${block.headers.map(() => "---").join(" | ")} |`,
        ...block.rows.map((row) => `| ${row.join(" | ")} |`)
      ].join("\n");
    default:
      return "";
  }
}

function stripLinks(text: string) {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
}

export function GET() {
  const lines: string[] = [];
  lines.push("# NurAi (NurXai) - full reference");
  lines.push("");
  lines.push(
    "NurAi is a human-in-the-loop AI reply assistant for X (Twitter). It reads the post you are replying to and drafts four context-aware replies in your voice. The user reviews, edits, and publishes, so nothing is ever posted automatically. It ships as a Chrome extension inside x.com and twitter.com, plus a web dashboard with plans and pay-per-use billing in USDC on Base."
  );
  lines.push("");
  lines.push("Brand: NurAi. Also written: NurXai, NurXAI.");
  lines.push(`Website: ${SITE_URL}`);
  lines.push(`Support: support@nurxai.xyz`);
  lines.push("");
  lines.push("Key facts:");
  lines.push("- Category: AI reply generator and writing assistant for X (Twitter).");
  lines.push("- Four different reply angles per post: insight, question, counterpoint, example.");
  lines.push("- No auto-posting, no mass replies, no comment automation. Human approval on every reply.");
  lines.push("- Platforms: Chrome, Edge, Brave, and other Chromium browsers.");
  lines.push("- Trial: 3 days free with a daily generation limit, no card required.");
  lines.push("- Pricing: pay per generation in USDC on Base with no daily limit, or fixed-duration plans.");
  lines.push("- Built for creators, founders, marketers, and community managers who reply at volume.");
  lines.push("");

  for (const guide of GUIDES) {
    lines.push("---");
    lines.push("");
    lines.push(`# ${guide.title}`);
    lines.push("");
    lines.push(`URL: ${SITE_URL}/guides/${guide.slug}`);
    lines.push(`Updated: ${guide.updated}`);
    lines.push("");
    lines.push(stripLinks(guide.intro));
    lines.push("");
    for (const block of guide.blocks) {
      lines.push(stripLinks(blockToText(block)));
      lines.push("");
    }
    lines.push("## Frequently asked");
    lines.push("");
    for (const faq of guide.faqs) {
      lines.push(`Q: ${faq.q}`);
      lines.push(`A: ${faq.a}`);
      lines.push("");
    }
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
