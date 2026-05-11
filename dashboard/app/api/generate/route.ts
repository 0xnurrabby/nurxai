import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey, ReplyStyle } from "@/lib/plans";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CTX = 1500;

// OpenAI prices (USD per 1M tokens)
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o": { input: 2.50, output: 10.00 }
};

// ─── Web Search (Vercel AI Gateway → OpenAI-compatible) ─────────────────────
//
// Vercel AI Gateway endpoint: https://ai-gateway.vercel.sh/v1/chat/completions
// Auth: Bearer AI_GATEWAY_API_KEY (from Vercel dashboard → AI Gateway → API Keys)
// Model: google/gemini-2.0-flash-001 supports google_search tool for grounding
//
// Anti-hallucination guard: results are passed as raw context to the main model.
// The main model is told to ignore context if it's about a different project.

async function searchWeb(query: string): Promise<string | null> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.AI_GATEWAY_MODEL || "google/gemini-3.1-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a factual research assistant. Given a search query, find and summarize the most relevant factual information. Be concise. Focus only on verifiable facts. If the query involves a crypto token or project, only report facts about THAT specific project - never confuse it with other projects sharing similar names.`
          },
          {
            role: "user",
            content: `Search query: "${query}"\n\nReturn a short factual summary (3-5 sentences max) with the most important recent facts. If you're unsure which specific project is being asked about (e.g. multiple projects with same ticker), say so.`
          }
        ],
        tools: [{ type: "function", function: { name: "google_search", description: "Search the web", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } }],
        tool_choice: "auto",
        max_tokens: 300,
        temperature: 0.1
      }),
      signal: AbortSignal.timeout(9000)
    });

    if (!resp.ok) {
      console.warn("[search] gateway non-OK", resp.status, await resp.text().catch(() => ""));
      return null;
    }

    const data = await resp.json().catch(() => null);
    const text: string = data?.choices?.[0]?.message?.content || "";
    if (text && text.length > 20) {
      console.log("[search] got context, length:", text.length);
      return text.trim();
    }
    return null;
  } catch (e: any) {
    console.warn("[search] failed:", e?.message || "?");
    return null;
  }
}

/**
 * Extract searchable entities from tweet context.
 * Returns null if there's nothing specific worth searching.
 * 
 * Anti-hallucination: We only search if we find clearly identifiable
 * project names, tokens, or people. Generic posts don't need search.
 */
function extractSearchQuery(context: string): string | null {
  // Look for crypto token tickers: $TOKEN
  const tickers = context.match(/\$[A-Z]{2,10}\b/g);
  // Look for @mentions of non-personal accounts (projects/protocols)
  const mentions = context.match(/@[A-Za-z0-9_]+/g);
  // Look for protocol/project names (capitalized multi-char words not common English)
  const projectKeywords = context.match(/\b(?:Protocol|Network|Finance|Labs|DAO|DEX|NFT|Layer|Chain|Bridge|Vault|Stake|Yield|Liquidity|Token|Coin|AI|Agent|inference|TEE|zkVM|rollup|mainnet|testnet)\b/gi);

  // Crypto/tech heavy post - worth searching
  if (tickers && tickers.length > 0) {
    // Find the most prominent ticker + any project mentions
    const mainTicker = tickers[0];
    const mainMention = mentions?.find(m => !m.match(/@[Ee]arn[Bb]y|@\d/)) || "";
    return `${mainTicker} ${mainMention} crypto project 2025 2026`.trim();
  }

  if (projectKeywords && projectKeywords.length >= 2 && mentions && mentions.length > 0) {
    return `${mentions[0]} ${projectKeywords.slice(0, 2).join(" ")} crypto web3`.trim();
  }

  return null; // No clear searchable entity - don't search
}

// ─── Image Fetching ──────────────────────────────────────────────────────────

/**
 * Download a Twitter image and return a base64 data URL.
 * Tries multiple size variants to bypass rate-limiting.
 * Returns null on failure so the caller can fall back to URL passthrough.
 */
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  const candidates = [
    url,
    url.replace(/&name=\w+/, "&name=large"),
    url.replace(/[?&]name=\w+/, "?format=jpg&name=large"),
    url.replace(/&name=\w+/, "&name=medium"),
    url.replace(/[?&]name=\w+/, "")
  ];
  const seen = new Set<string>();
  const tries = candidates.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  for (const candidate of tries) {
    try {
      const resp = await fetch(candidate, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://x.com/",
          "Sec-Fetch-Dest": "image",
          "Sec-Fetch-Mode": "no-cors",
          "Sec-Fetch-Site": "cross-site",
          "Cache-Control": "no-cache"
        },
        signal: AbortSignal.timeout(18000),
        redirect: "follow"
      });
      if (!resp.ok) {
        console.warn("[vision] fetch non-OK", resp.status, candidate.slice(0, 90));
        continue;
      }
      const ctHeader = resp.headers.get("content-type") || "";
      const ct = ctHeader.split(";")[0].trim() || "image/jpeg";
      if (!ct.startsWith("image/")) {
        console.warn("[vision] non-image content-type", ct);
        continue;
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length === 0) continue;
      if (buf.length > 10 * 1024 * 1024) continue; // 10MB limit
      console.log("[vision] fetched", ct, buf.length, "bytes");
      return `data:${ct};base64,${buf.toString("base64")}`;
    } catch (e: any) {
      console.warn("[vision] fetch threw", e?.name, candidate.slice(0, 90));
    }
  }
  return null;
}

// ─── Prompt Building ─────────────────────────────────────────────────────────

function styleInstruction(style: string, customNote?: string | null): string {
  let base = "";
  switch (style) {
    case "funny":
      base = "Tone: witty and playful. Clever wordplay or light absurdity when it fits naturally. Never forced or cringe.";
      break;
    case "short":
      base = "Tone: short and punchy. Max 60 characters. One sharp, memorable line. No filler.";
      break;
    case "productive":
      base = "Tone: adds real value. Contribute a useful insight, share a relevant data point, or ask a question that advances the conversation meaningfully.";
      break;
    case "professional":
      base = "Tone: polished and professional. Work-appropriate, articulate, still warm and direct.";
      break;
    case "supportive":
      base = "Tone: empathetic and genuine. Acknowledge what they're going through. No hollow positivity.";
      break;
    case "contrarian":
      base = "Tone: thoughtfully challenging. Bring a different angle or push back on an assumption. Respectful but direct.";
      break;
    default:
      base = "Tone: casual and human. Like a smart friend who actually read the post.";
  }
  if (customNote && customNote.trim()) {
    base += `\nPersonal style note: "${customNote.trim()}"`;
  }
  return base;
}

function buildSystemPrompt(
  qualityTier: string,
  style: string,
  customNote: string | null,
  projectsContext: string,
  hasImage: boolean,
  searchContext: string | null
): string {
  const masterpiece = qualityTier === "masterpiece";

  const qualityInstruction = masterpiece
    ? `You write at the level of someone who has deep knowledge of the topic, has thought about it seriously, and has a distinctive voice. Replies feel researched and specific, yet casual - like someone who knows the space tweeting off the top of their head. Not trying to be clever, just genuinely engaged.`
    : `Replies feel like they came from someone who actually read the post and has a real opinion. Specific, direct, no filler.`;

  const searchSection = searchContext
    ? `\n=== VERIFIED CONTEXT FROM WEB ===\n${searchContext}\n=== END CONTEXT ===\nUse facts from above naturally if relevant. Do NOT fabricate data that isn't there. If context is about a different project than the tweet, ignore it entirely.`
    : "";

  const projectSection = projectsContext
    ? `\n=== YOUR PROJECT KNOWLEDGE ===\n${projectsContext}\n=== END ===\nIf the tweet relates to these topics, weave in your expertise naturally. Like an insider, not a promoter.`
    : "";

  const imageSection = hasImage
    ? `IMAGE IS ATTACHED - you can see it fully.
- At least 2 replies MUST reference something SPECIFIC and CONCRETE from the image: a specific number, label, UI element, text on screen, face, object, color, chart value, etc.
- Never say or imply you can't see it. Never be vague ("nice pic", "love this image").
- The image usually IS the main context. Engage with what's actually in it.`
    : "Text-only post. Focus on the words.";

  return `You generate Twitter/X replies that are indistinguishable from a real human who knows what they're talking about.

${qualityInstruction}

HARD RULES - never break:
1. Zero emojis.
2. Zero AI phrases: "Great point!", "Absolutely!", "Interesting take!", "Love this!", "I appreciate", "Indeed", "Totally", "100%". These are instant tells.
3. Zero em-dashes. Use commas, periods, or short hyphens.
4. Zero generic replies. Every reply must reference something specific from the post.
5. Sound like you've thought about this topic before. Not like you're seeing it for the first time.
6. Under 200 characters. Short is almost always better.
7. Vary all 4 replies: different angle, different length, different level of seriousness. No two should feel related.
8. Use casual human patterns naturally: lowercase start, contractions, "ngl", "tbh", "fr", "honestly", short fragments. Don't overdo it - 1-2 replies max with heavy slang.
9. Don't be a sycophant. Real people agree, disagree, question, add context - not just validate.
10. If you'd need to make up a fact to sound smart, don't. A simple direct reaction is better than invented statistics.

${imageSection}

${styleInstruction(style, customNote)}
${searchSection}
${projectSection}

OUTPUT: JSON only: {"suggestions": ["reply1", "reply2", "reply3", "reply4"]}`;
}

// ─── Main Route ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const userId = session.sub;

  const sub = await prisma.subscription.findFirst({
    where: { userId, status: "active", endsAt: { gt: new Date() } },
    orderBy: { endsAt: "desc" }
  });
  if (!sub) return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 402 });

  const plan = PLANS[sub.plan as PlanKey];
  if (!plan) return NextResponse.json({ error: "BAD_PLAN" }, { status: 402 });

  const day = new Date().toISOString().slice(0, 10);
  const usage = await prisma.usageLog.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, count: 0 },
    update: {}
  });
  if (usage.count >= plan.dailyLimit) {
    return NextResponse.json({ error: "QUOTA_EXCEEDED", limit: plan.dailyLimit }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  let context = String(body?.context || "").trim();
  if (!context) return NextResponse.json({ error: "EMPTY_CONTEXT" }, { status: 400 });
  context = context.slice(0, MAX_CTX);

  const rawImageUrls: string[] = Array.isArray(body?.imageUrls)
    ? body.imageUrls.filter((u: any) => typeof u === "string").slice(0, 4)
    : [];

  // ── Vision ──────────────────────────────────────────────────────────────────
  type ImagePart = { type: "image_url"; image_url: { url: string; detail: "high" | "auto" } };
  const imageParts: ImagePart[] = [];
  let imagesInlined = 0;
  let imagesUrlFallback = 0;

  if (plan.vision && rawImageUrls.length > 0) {
    for (const u of rawImageUrls.slice(0, 3)) {
      const dataUrl = await fetchImageAsDataUrl(u);
      if (dataUrl) {
        imagesInlined++;
        // Use "high" detail for Premium (gpt-4o), "auto" for Pro (gpt-4o-mini)
        const detail: "high" | "auto" = plan.qualityTier === "masterpiece" ? "high" : "auto";
        imageParts.push({ type: "image_url", image_url: { url: dataUrl, detail } });
      } else {
        imagesUrlFallback++;
        imageParts.push({ type: "image_url", image_url: { url: u, detail: "auto" } });
      }
    }
    console.log(
      "[vision] plan=", plan.key,
      "received=", rawImageUrls.length,
      "inlined=", imagesInlined,
      "url-fallback=", imagesUrlFallback
    );
  }
  const useVision = imageParts.length > 0;

  // ── Web Search (Starter+ plans only, skip for trial to save cost) ───────────
  let searchContext: string | null = null;
  if (plan.key !== "trial" && process.env.AI_GATEWAY_API_KEY) {
    const searchQuery = extractSearchQuery(context);
    if (searchQuery) {
      searchContext = await searchWeb(searchQuery);
      if (searchContext) {
        console.log("[search] query:", searchQuery, "| context length:", searchContext.length);
      }
    }
  }

  // ── Regenerate context ────────────────────────────────────────────────────
  const isRegenerate = !!body?.regenerate;
  const previousSuggestions: string[] = Array.isArray(body?.previousSuggestions)
    ? body.previousSuggestions.filter((s: any) => typeof s === "string").slice(0, 12)
    : [];

  // ── User settings ─────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { replyStyle: true, customStyleNote: true }
  });
  const style = plan.allowStyles ? user?.replyStyle || "default" : "default";
  const customNote = plan.allowStyles ? user?.customStyleNote || null : null;

  // ── Project contexts (Pro+) ───────────────────────────────────────────────
  let projectsContext = "";
  if (plan.allowProjects) {
    const projects = await prisma.project.findMany({
      where: { userId, active: true },
      include: { contexts: { orderBy: { createdAt: "desc" }, take: 5 } }
    });
    if (projects.length) {
      projectsContext = projects
        .map((p) => {
          const ctx = p.contexts.map((c) => c.content).join("\n\n");
          return ctx ? `Project: ${p.name}\n${ctx}` : "";
        })
        .filter(Boolean)
        .join("\n\n---\n\n")
        .slice(0, 4000);
    }
  }

  const systemPrompt = buildSystemPrompt(
    plan.qualityTier,
    style,
    customNote,
    projectsContext,
    useVision,
    searchContext
  );

  // ── Build user message ────────────────────────────────────────────────────
  const regenerateNote =
    isRegenerate && previousSuggestions.length
      ? `\n\nThese are the previous replies - generate 4 completely different ones with different angles and structure:\n${previousSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "";

  let userMessage: any;
  if (useVision) {
    userMessage = {
      role: "user",
      content: [
        { type: "text", text: `Tweet:\n"""\n${context}\n"""${regenerateNote}` },
        ...imageParts
      ]
    };
  } else {
    userMessage = {
      role: "user",
      content: `Tweet:\n"""\n${context}\n"""${regenerateNote}`
    };
  }

  // ── Call OpenAI ───────────────────────────────────────────────────────────
  const model = plan.model;
  const masterpiece = plan.qualityTier === "masterpiece";
  const maxTokens = masterpiece ? 1000 : 750;
  const temperature = isRegenerate ? 1.05 : masterpiece ? 1.0 : 0.9;

  let openaiResp: Response;
  try {
    openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          userMessage
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" }
      }),
      signal: AbortSignal.timeout(45000)
    });
  } catch {
    return NextResponse.json({ error: "UPSTREAM" }, { status: 502 });
  }

  if (!openaiResp.ok) {
    const errBody = await openaiResp.text().catch(() => "");
    console.error("OpenAI error:", openaiResp.status, errBody);
    return NextResponse.json({ error: "UPSTREAM" }, { status: 502 });
  }

  const data = await openaiResp.json().catch(() => null);
  const raw = data?.choices?.[0]?.message?.content || "";
  const inputTokens = data?.usage?.prompt_tokens || 0;
  const outputTokens = data?.usage?.completion_tokens || 0;

  let suggestions = parseSuggestions(raw);
  suggestions = suggestions.map(stripEmojis);
  if (!suggestions.length) {
    return NextResponse.json({ error: "EMPTY_SUGGESTIONS" }, { status: 502 });
  }

  // ── Log & track ───────────────────────────────────────────────────────────
  const price = PRICES[model] || PRICES["gpt-4o-mini"];
  const costUSD =
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output;

  const ctxHash = crypto.createHash("sha256").update(context).digest("hex").slice(0, 32);
  await prisma.generation.create({
    data: {
      userId,
      contextHash: ctxHash,
      suggestions: suggestions as any,
      inputTokens,
      outputTokens,
      costUSD: costUSD.toFixed(6),
      model,
      hadImage: useVision
    }
  });

  await prisma.usageLog.update({
    where: { userId_day: { userId, day } },
    data: { count: { increment: 1 } }
  });

  return NextResponse.json({
    suggestions,
    usage: { used: usage.count + 1, limit: plan.dailyLimit, plan: sub.plan },
    model,
    visionUsed: useVision,
    searchUsed: !!searchContext
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSuggestions(raw: string): string[] {
  try {
    const j = JSON.parse(raw);
    const arr = Array.isArray(j)
      ? j
      : Array.isArray(j.suggestions)
      ? j.suggestions
      : Array.isArray(j.replies)
      ? j.replies
      : [];
    return arr
      .filter((s: any) => typeof s === "string")
      .map((s: string) => s.trim())
      .filter(Boolean)
      .slice(0, 4);
  } catch {}
  return raw
    .split(/\n+/)
    .map((s) => s.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

function stripEmojis(s: string): string {
  return s
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}]/gu,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}
