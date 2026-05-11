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
/**
 * Build a web search query from tweet context.
 * Strategy: always try to search — return null only for posts that are
 * purely personal/emotional with no identifiable entities worth searching.
 *
 * Anti-hallucination: we include enough context in the query so the search
 * engine finds the RIGHT project, not a similarly-named one.
 */
function extractSearchQuery(context: string): string | null {
  const clean = context.replace(/\[Card:[^\]]*\]|\[Quoted:[^\]]*\]/g, " ").trim();

  // 1. Crypto tickers ($MORPHO, $UNI, $ARC etc.)
  const tickers = clean.match(/\$[A-Z]{2,10}\b/g) || [];

  // 2. @mentions (project accounts)
  const mentions = (clean.match(/@[A-Za-z0-9_]{3,}/g) || [])
    .filter(m => !m.match(/^@(you|me|us|him|her|it|they|this|that)$/i));

  // 3. Named companies / projects (capitalized proper nouns that aren't common words)
  const namedEntities = (clean.match(/\b[A-Z][a-zA-Z]{2,}(?:\s[A-Z][a-zA-Z]{2,})?\b/g) || [])
    .filter(e => !["The", "This", "That", "With", "From", "When", "What", "How",
                   "Can", "Are", "Was", "For", "And", "But", "Not", "Its",
                   "Has", "Have", "Will", "Just", "Now", "New", "See", "Let"].includes(e));

  // 4. Dollar amounts / fundraising figures (context clues)
  const amounts = clean.match(/\$[\d.]+[BMK]?\b/g) || [];

  // Build query from most specific signals first
  if (tickers.length > 0) {
    const parts: string[] = [...tickers.slice(0, 2)];
    if (mentions[0]) parts.push(mentions[0]);
    else if (namedEntities[0]) parts.push(namedEntities[0]);
    if (amounts[0]) parts.push(amounts[0]);
    return parts.join(" ") + " crypto 2026";
  }

  if (mentions.length > 0 && (namedEntities.length > 0 || amounts.length > 0)) {
    const parts: string[] = [mentions[0]];
    if (namedEntities.length) parts.push(namedEntities.slice(0, 2).join(" "));
    if (amounts[0]) parts.push(amounts[0]);
    return parts.join(" ") + " crypto web3";
  }

  // 5. Fallback: if post has any named entities at all, search them
  if (namedEntities.length >= 2) {
    return namedEntities.slice(0, 3).join(" ") + " crypto";
  }

  if (mentions.length > 0) {
    // Single mention with some context words
    const contextWords = clean.split(/\s+/)
      .filter(w => w.length > 4 && !/^[a-z]/.test(w[0]))
      .slice(0, 3).join(" ");
    return `${mentions[0]} ${contextWords}`.trim();
  }

  // 6. Pure personal/generic post (quotes, motivational, dating, etc.) - skip search
  return null;
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

  // ── Image rules ────────────────────────────────────────────────────────────
  const imageSection = hasImage
    ? `AN IMAGE IS ATTACHED. You can see it fully.
RULES FOR IMAGE:
- Read what is actually IN the image: numbers, text on screen, UI elements, charts, objects, faces, brands, specific values.
- At least 2 of 4 replies MUST reference a SPECIFIC visual detail from the image. Not vague ("nice pic") - something precise ("21h 29m on X", "94 TON to 119 USDT", "1435 days streak", "Screen Time showing Base app at #2").
- The image is almost always the main point of the post. Engage with what you see in it, not just the caption text.
- NEVER say you can't see it, can't load it, or need more context about it.`
    : "";

  // ── Search context ─────────────────────────────────────────────────────────
  const searchSection = searchContext
    ? `BACKGROUND INFO FROM WEB (use naturally if relevant, ignore if not about this exact topic):
${searchContext}`
    : "";

  // ── Project knowledge ──────────────────────────────────────────────────────
  const projectSection = projectsContext
    ? `YOUR INSIDER KNOWLEDGE (weave in naturally when the tweet is in this space):
${projectsContext}`
    : "";

  // ── Style ──────────────────────────────────────────────────────────────────
  const styleNote = styleInstruction(style, customNote);

  // ── Quality tier framing ───────────────────────────────────────────────────
  const tierNote = masterpiece
    ? `You are someone with deep knowledge of crypto, tech, and internet culture. You have opinions. You notice things others miss. You don't try to sound smart - you just are. Your replies are the ones that get pinned.`
    : `You actually know what you're talking about. You've been in this space. You have a take.`;

  return `You write Twitter/X replies that pass as a real human - someone who knows the topic, has context, and has a genuine reaction.

${tierNote}

━━ WHAT KILLS A REPLY (never do these) ━━
- Pretending not to know something obvious. If Pavel Durov uses DeDust, you know what DeDust is. If someone posts a Screen Time screenshot, you can read the numbers. Never play dumb about context that's right there.
- AI openers: "Great point!", "Interesting take!", "Absolutely!", "Love this!", "I appreciate", "Indeed", "That's wild!", "This is huge". These are instant tells.
- Em-dashes (—). Use commas or periods instead.
- Asking questions you already know the answer to from the post ("what app is this?" when the screenshot shows the app name).
- Generic reactions that could apply to any post ("this is so relatable", "we've all been there").
- Hollow hype ("this changes everything", "massive if true", "ser this is big").
- Sycophancy. Real people don't cheer for everything.

━━ WHAT MAKES A REPLY GOOD ━━
- You reference something SPECIFIC from the post or image. A number, a name, a detail, a claim.
- You have an actual take: agree, push back, add info, ask something non-obvious, notice something funny.
- It sounds like you typed it in 10 seconds, not like you crafted it.
- Casual where casual fits: lowercase ok, "ngl", "tbh", "fr", "lol", "lmao" - but don't overdo it.
- Under 200 characters. Punchy beats long every time.
- Each of the 4 replies is a completely different angle. Different length, different tone, different entry point.

${imageSection ? `━━ IMAGE ━━\n${imageSection}\n` : ""}
${styleNote ? `━━ STYLE ━━\n${styleNote}\n` : ""}
${searchSection ? `━━ CONTEXT ━━\n${searchSection}\n` : ""}
${projectSection ? `━━ YOUR KNOWLEDGE ━━\n${projectSection}\n` : ""}

OUTPUT: JSON only. No explanation. No markdown.
{"suggestions": ["reply1", "reply2", "reply3", "reply4"]}`;
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

  // ── Web Search (all plans, always on when API key is set) ───────────────────
  let searchContext: string | null = null;
  if (process.env.AI_GATEWAY_API_KEY) {
    const searchQuery = extractSearchQuery(context);
    if (searchQuery) {
      searchContext = await searchWeb(searchQuery);
      if (searchContext) {
        console.log("[search] query:", searchQuery, "| context length:", searchContext.length);
      } else {
        console.log("[search] query attempted but no results:", searchQuery);
      }
    } else {
      console.log("[search] skipped - no searchable entities in post");
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
