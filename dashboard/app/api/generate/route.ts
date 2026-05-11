import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CTX = 1500;

const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o":      { input: 2.50, output: 10.00 }
};

// ─── Context Enrichment (Vercel AI Gateway → Gemini) ─────────────────────────
//
// Send full tweet text to Gemini. Gemini uses its training knowledge to provide
// factual background about the topics mentioned.
// NO tool calling — tool calling with unimplemented tools silently returns empty.
// This runs for ALL plans when AI_GATEWAY_API_KEY is set in env.

async function enrichContext(tweetText: string): Promise<string | null> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return null;

  const model = process.env.AI_GATEWAY_MODEL || "google/gemini-3.1-flash-lite";

  try {
    const resp = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are a research assistant helping someone write informed Twitter replies. Given a tweet, provide concise factual background about the specific projects, people, tokens, or events mentioned. Be precise. If a crypto project/token is mentioned, give its actual facts (what it does, key stats, recent news). Never make up facts. If you don't know something specific, skip it.`
          },
          {
            role: "user",
            content: `Tweet:\n"${tweetText.slice(0, 1000)}"\n\nWhat are 3-5 key facts about the main subjects in this tweet that would help someone write a knowledgeable reply? Focus on specifics, not generalities.`
          }
        ],
        max_tokens: 400,
        temperature: 0.1
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!resp.ok) {
      console.warn("[enrich] gateway non-OK", resp.status);
      return null;
    }

    const data = await resp.json().catch(() => null);
    const text: string = data?.choices?.[0]?.message?.content || "";
    if (text && text.length > 30) {
      console.log("[enrich] got context, length:", text.length);
      return text.trim();
    }
    return null;
  } catch (e: any) {
    console.warn("[enrich] failed:", e?.message || "?");
    return null;
  }
}

// ─── Image Fetching ───────────────────────────────────────────────────────────

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  const candidates = [
    url,
    url.replace(/&name=\w+/, "&name=large"),
    url.replace(/[?&]name=\w+/, "?format=jpg&name=large"),
    url.replace(/&name=\w+/, "&name=medium"),
    url.replace(/[?&]name=\w+/, "")
  ];
  const seen = new Set<string>();
  const tries = candidates.filter(u => { if (seen.has(u)) return false; seen.add(u); return true; });

  for (const candidate of tries) {
    try {
      const resp = await fetch(candidate, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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
      if (!resp.ok) continue;
      const ct = (resp.headers.get("content-type") || "").split(";")[0].trim() || "image/jpeg";
      if (!ct.startsWith("image/")) continue;
      const buf = Buffer.from(await resp.arrayBuffer());
      if (!buf.length || buf.length > 10 * 1024 * 1024) continue;
      console.log("[vision] fetched", ct, buf.length, "bytes");
      return `data:${ct};base64,${buf.toString("base64")}`;
    } catch (e: any) {
      console.warn("[vision] fetch threw", e?.name, candidate.slice(0, 80));
    }
  }
  return null;
}

// ─── Style instruction ────────────────────────────────────────────────────────

function styleInstruction(style: string, customNote?: string | null): string {
  let base = "";
  switch (style) {
    case "funny":       base = "Lean funny/witty. Deadpan or dry humor works. Never cringe."; break;
    case "short":       base = "Max 60 characters. One punchy line."; break;
    case "productive":  base = "Add something useful: a data point, a nuance, a real question that advances the conversation."; break;
    case "professional":base = "Polished but still direct. No corporate fluff."; break;
    case "supportive":  base = "Empathetic, genuine. Acknowledge without being hollow."; break;
    case "contrarian":  base = "Push back or offer the opposite angle. Respectful but direct."; break;
    default:            base = "Casual, direct, like a smart friend in the space.";
  }
  if (customNote?.trim()) base += `\nPersonal note: "${customNote.trim()}"`;
  return base;
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildSystemPrompt(
  qualityTier: string,
  style: string,
  customNote: string | null,
  projectsContext: string,
  hasImage: boolean,
  enrichedContext: string | null
): string {
  const masterpiece = qualityTier === "masterpiece";

  return `You write Twitter/X replies. Your job: sound exactly like a real person who knows this topic well.

PERSONA: ${masterpiece
    ? "You are deep in crypto/tech. You've seen cycles. You have specific opinions. You notice details others miss. You're not trying to impress anyone."
    : "You know this space. You've been around. You have a take."}

━━ HARD BANNED (these are AI tells - never write them) ━━
PHRASES: "game-changer", "leveling up", "stepping up their game", "a symphony of", "music to my ears",
  "this is huge", "this is wild", "this is big", "ser this is", "Love that", "Love this",
  "Interesting take", "Great point", "Absolutely", "Indeed", "Props for", "Kudos",
  "team vibes", "transcend platforms", "tribute to adaptability", "leveling up hard",
  "next level", "this changes everything", "massive if true", "can't wait to see",
  "sounds like a game-changer", "curious about real-world apps"

PATTERNS:
- [Compliment] + [Question] is the #1 AI reply pattern. NEVER do it.
  BAD: "TEE-attested environments are a game-changer for inference security."
  BAD: "60T int4 NPU sounds like a game-changer for edge AI. Curious about real-world apps?"
  BAD: "13 new models and still counting? OpenGradient leveling up hard."
  BAD: "Claude Opus 4.7 sounds like a symphony of AI. Music to my ears."
- Hollow excitement with no substance
- Asking obvious questions the post already answers

━━ WHAT ACTUALLY WORKS ━━
Write like someone who's been in crypto/tech for years and has a specific reaction:
  GOOD: "verifiable inference for grok 4.20 and claude 4.7 on the same network. on-chain agents just got a serious upgrade"
  GOOD: "35b params at 15tps on a risc-v sbc. qwen3.5 is punching way above its weight class here"
  GOOD: "the full grok 4.20 family on-chain is interesting. latency at scale is the real question though"
  GOOD: "rare to see someone consistent on base since early. not just another post-and-ghost builder"
  GOOD: "coinbase talent in whatsapp groups now is honestly better signal than linkedin. hiring managers take note"

RULES:
1. Zero emojis.
2. Under 200 characters. Short usually wins.
3. Each of the 4 replies must be a different angle/tone/length. No two can feel related.
4. Reference something SPECIFIC from the post - a number, a name, a claim, a detail.
5. Have an actual take. Agree, disagree, add context, be skeptical - but have a position.
6. Lowercase is fine. Fragments are fine. "ngl", "tbh", "fr" sparingly (1 of 4 max).
7. No em-dashes (—).
${hasImage ? `
━━ IMAGE ━━
You can see the image fully. Reference SPECIFIC visual details in at least 2 of 4 replies.
Specific = "21h 29m on X", "94 TON → 119 USDT", "1435 day streak", exact text/numbers on screen.
Vague = "nice pic", "interesting image" (FORBIDDEN).
Never say you can't see it.` : ""}
${styleInstruction(style, customNote) !== "Casual, direct, like a smart friend in the space." ? `\n━━ STYLE ━━\n${styleInstruction(style, customNote)}` : ""}
${enrichedContext ? `\n━━ BACKGROUND (use if relevant, ignore if not about this exact topic) ━━\n${enrichedContext}` : ""}
${projectsContext ? `\n━━ YOUR EXPERTISE ━━\n${projectsContext}` : ""}

OUTPUT: JSON only. {"suggestions": ["reply1", "reply2", "reply3", "reply4"]}`;
}

// ─── Main Route ───────────────────────────────────────────────────────────────

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

  // ── Vision ───────────────────────────────────────────────────────────────────
  type ImagePart = { type: "image_url"; image_url: { url: string; detail: "high" | "auto" } };
  const imageParts: ImagePart[] = [];
  let imagesInlined = 0;
  let imagesUrlFallback = 0;

  if (plan.vision && rawImageUrls.length > 0) {
    for (const u of rawImageUrls.slice(0, 3)) {
      const dataUrl = await fetchImageAsDataUrl(u);
      if (dataUrl) {
        imagesInlined++;
        const detail: "high" | "auto" = plan.qualityTier === "masterpiece" ? "high" : "auto";
        imageParts.push({ type: "image_url", image_url: { url: dataUrl, detail } });
      } else {
        imagesUrlFallback++;
        imageParts.push({ type: "image_url", image_url: { url: u, detail: "auto" } });
      }
    }
    console.log("[vision] plan=", plan.key, "received=", rawImageUrls.length,
      "inlined=", imagesInlined, "url-fallback=", imagesUrlFallback);
  }
  const useVision = imageParts.length > 0;

  // ── Context enrichment via Gemini (always on when key is set) ─────────────────
  let enrichedContext: string | null = null;
  if (process.env.AI_GATEWAY_API_KEY) {
    enrichedContext = await enrichContext(context);
  } else {
    console.log("[enrich] skipped - AI_GATEWAY_API_KEY not set");
  }

  // ── User settings ─────────────────────────────────────────────────────────
  const isRegenerate = !!body?.regenerate;
  const previousSuggestions: string[] = Array.isArray(body?.previousSuggestions)
    ? body.previousSuggestions.filter((s: any) => typeof s === "string").slice(0, 12)
    : [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { replyStyle: true, customStyleNote: true }
  });
  const style = plan.allowStyles ? user?.replyStyle || "default" : "default";
  const customNote = plan.allowStyles ? user?.customStyleNote || null : null;

  // ── Project contexts ──────────────────────────────────────────────────────
  let projectsContext = "";
  if (plan.allowProjects) {
    const projects = await prisma.project.findMany({
      where: { userId, active: true },
      include: { contexts: { orderBy: { createdAt: "desc" }, take: 5 } }
    });
    if (projects.length) {
      projectsContext = projects
        .map(p => {
          const ctx = p.contexts.map(c => c.content).join("\n\n");
          return ctx ? `Project: ${p.name}\n${ctx}` : "";
        })
        .filter(Boolean).join("\n\n---\n\n").slice(0, 4000);
    }
  }

  const systemPrompt = buildSystemPrompt(
    plan.qualityTier, style, customNote,
    projectsContext, useVision, enrichedContext
  );

  // ── Build user message ────────────────────────────────────────────────────
  const regenerateNote = isRegenerate && previousSuggestions.length
    ? `\n\nAlready generated these - make 4 completely different ones, different angles:\n${previousSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
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
  // Lower temperature = less AI slop. 0.7 is the sweet spot.
  const temperature = isRegenerate ? 0.85 : masterpiece ? 0.78 : 0.70;
  const maxTokens = masterpiece ? 900 : 700;

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

  const price = PRICES[model] || PRICES["gpt-4o-mini"];
  const costUSD = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;

  const ctxHash = crypto.createHash("sha256").update(context).digest("hex").slice(0, 32);
  await prisma.generation.create({
    data: {
      userId, contextHash: ctxHash, suggestions: suggestions as any,
      inputTokens, outputTokens, costUSD: costUSD.toFixed(6),
      model, hadImage: useVision
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
    searchUsed: !!enrichedContext
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSuggestions(raw: string): string[] {
  try {
    const j = JSON.parse(raw);
    const arr = Array.isArray(j) ? j
      : Array.isArray(j.suggestions) ? j.suggestions
      : Array.isArray(j.replies) ? j.replies : [];
    return arr.filter((s: any) => typeof s === "string").map((s: string) => s.trim()).filter(Boolean).slice(0, 4);
  } catch {}
  return raw.split(/\n+/).map(s => s.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean).slice(0, 4);
}

function stripEmojis(s: string): string {
  return s
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}]/gu, "")
    .replace(/\s{2,}/g, " ").trim();
}
