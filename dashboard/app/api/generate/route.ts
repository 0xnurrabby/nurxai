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
// Send extracted tweet context to Gemini for strict background verification.
// It must return nothing when the visible tweet/handles/links are ambiguous.
// This runs for every generation when AI_GATEWAY_API_KEY is set in env.

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
            content: `You are a strict context verifier for Twitter/X reply generation.

Use only subjects that are directly visible in the extracted tweet context: exact @handles, display names, quoted tweet text, URLs, cashtags, tokens, or unambiguous project names.

Rules:
- Do not infer unrelated projects from generic words or same-name search results.
- Words like Base, agent, home, cloud, html, taxes, or protocol are generic unless the visible author/handle/URL/text makes the entity unambiguous.
- If you identify an X account, use the exact @handle from the extracted context. Never guess a username.
- If a project/person/token is not clearly the same entity as the tweet subject, do not mention it.
- If there is no reliable background to add, return exactly: NO_VERIFIED_CONTEXT.

Return 2-5 short bullet facts only when they are safe and directly tied to the visible tweet subject.`
          },
          {
            role: "user",
            content: `Extracted tweet context:\n"""\n${tweetText.slice(0, 1500)}\n"""\n\nVerify only the actual subject(s) of this tweet. If the context is too generic or ambiguous, return NO_VERIFIED_CONTEXT.`
          }
        ],
        max_tokens: 450,
        temperature: 0
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!resp.ok) {
      console.warn("[enrich] gateway non-OK", resp.status);
      return null;
    }

    const data = await resp.json().catch(() => null);
    const text: string = data?.choices?.[0]?.message?.content || "";
    const cleaned = text.trim();
    if (/^NO_VERIFIED_CONTEXT\b/i.test(cleaned)) return null;
    if (cleaned && cleaned.length > 30) {
      console.log("[enrich] got context, length:", text.length);
      return cleaned;
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

  return `You write Twitter/X replies that are indistinguishable from a real human who knows this topic.

${masterpiece
    ? "You're deep in crypto/tech. Seen cycles. Have opinions. Notice details others miss. Not trying to impress."
    : "You know this space. Been around. Have a take."}

━━ GROUNDING RULES ━━
Only reply from the visible tweet context and verified background below.
Never invent project/protocol/token/person names just because a generic word matches them.
If the post is short or ambiguous, stay literal and broad instead of adding unsupported specifics.
Every reply must reuse or clearly react to a concrete phrase, handle, ticker, number, product, claim, or image detail from the tweet.
Do not summarize the post with vague hype. Add a small grounded angle, caveat, or implication.
When referring to a visible X account/project, prefer the exact @handle from context over its display name.
Never guess usernames. Never use a username from a same-name project unless the handle/URL is visible or verified as the same entity.
BAD for "Base is home to all agents": mentioning Synadia, Hermes, OpenClaw, or any specific agent project not present in the tweet.
GOOD: talk about Base as an onchain home/ecosystem for agents without naming unsupported projects.

━━ ABSOLUTE BANS ━━
Never use these words/phrases (all AI tells caught in production):
"game-changer", "leveling up", "stepping up", "next level", "this changes everything",
"interesting to see", "curious about", "wonder about", "watching closely", "keen to see",
"any news driving this", "how's the X", "thoughts on", "worth keeping an eye",
"Love that", "Love this", "Great point", "Absolutely", "Indeed", "Props for", "Kudos",
"this is huge", "this is wild", "massive if true", "can't wait to see",
"solid move", "makes sense", "that's a big bet", "ambitious projections",
"movers and shakers", "some serious momentum", "no joke", "is no joke",
"vibes", "heating up", "ride the wave", "could ride", "might be the ticket",
"intriguing combo", "the future", "huge boost", "potential is clear", "real game changer"

Never end a reply with an unanswered question. Questions = AI slop unless answered immediately in Quick Q&A.
BAD: "$IMGN's 33.7% spike is wild. Any news driving this?"
BAD: "Auto-rebalancing is interesting. How's the fee structure?"
BAD: "cbBTC mix is solid. Wonder about long-term viability."
BAD: "Rewards streaming is unique. Curious about security measures."
Real people make statements. They don't interrogate the original poster.

Never use em-dash (—). Use period or comma instead.

━━ VISUAL LAYOUT ━━
Choose ONE layout lane for the whole batch based on the post. All 4 replies should feel like the same human wrote them in the same visual style. Vary the angle/wording, not the visual gimmick.

Default to Lane A unless the post clearly demands another lane.

Lane A - Standard Human (default, use for most posts):
- Either one clean sentence, or two short lines with one empty line between them.
- This is best for normal opinions, product updates, quote tweets, images, and most tech/crypto posts.
- Examples:
open gotchi's potential

bridging digital companions with real-world interactions

new class of actors needs a new class of financial systems fr

Lane B - Simple Stack (only for list/data/multi-item posts):
- Header line, then '~' bullets with NO empty lines.
- Use when the original post itself has a list, finalists, many companies, features, stats, or comparisons.
- Example:
agent economy
~ cloudflare: ai bots > humans
~ slack: agents > humans
~ nvidia: 100 agents/employee

Lane C - Drift (only for nuanced two-part takes):
- One line with 4-5 spaces between two related thoughts.
- Best for finance, policy, stablecoins, tradeoffs, or posts with two connected ideas.

Lane D - Casual Lowercase (only for simple community/hype posts):
- One lowercase sentence, no period, optionally ending with fr or tbh.

Avoid these unless the fit is painfully obvious: slash dividers, pure quotes, ALL CAPS punches, one-word vertical drops, curly notes, and "wait" interjections.
BAD: gotchios/kalqix/wlthxyz/lienfiapp/lendra/rogueaidotfun
BAD: wait.\n\nretro computer vibe
BAD: forcing every reply into a different visual structure.

━━ WHAT GOOD LOOKS LIKE ━━
open gotchi's potential

bridging digital companions with real-world interactions
new class of actors needs a new class of financial systems fr
v4 hooks needed an actual consumer-facing example like this
if $bnkr makes the yield engine real, the hook meta gets less abstract
agent economy
~ cloudflare: ai bots > humans
~ slack: agents > humans
~ nvidia: 100 agents/employee
stablecoins got the exit ramp    banks still want the old spread

━━ RULES ━━
1. Zero emojis.
2. Specific reference from the post in every reply - a number, name, claim, or detail.
3. Make a statement, take a position. Agree, disagree, add context, be skeptical.
4. Each of 4 replies = different angle and wording, but keep the same layout lane for the batch.
5. Lowercase ok. Fragments ok. Contractions ok (im, its, dont, wont).
6. "ngl", "tbh", "fr", "lemme", "gonna", "tbf" - use naturally, max 1-2 of 4 replies.
7. Under 280 chars total per reply (including line breaks).
8. Do not wrap replies or individual lines in quotation marks.
9. Do not name external projects/protocols/tools unless they appear in the tweet context or verified background.
10. Never include structure names or labels in the reply text.
11. Avoid filler adjectives. Prefer one specific noun from the tweet over broad words like future, potential, wave, vibes, boost.
${hasImage ? `
━━ IMAGE ━━
You can see it fully. At least 2 of 4 replies reference SPECIFIC visual details:
exact numbers, text on screen, bar chart values, brand names, UI elements shown.
Never vague ("nice pic"). Never say you can't see it.` : ""}
${styleInstruction(style, customNote) !== "Casual, direct, like a smart friend in the space." ? `\n━━ STYLE ━━\n${styleInstruction(style, customNote)}` : ""}
${enrichedContext ? `\n━━ CONTEXT (verified background - use if relevant) ━━\n${enrichedContext}` : ""}
${projectsContext ? `\n━━ YOUR EXPERTISE ━━\n${projectsContext}` : ""}

OUTPUT: JSON only. Use \\n\\n only for Lane A two-line replies. Use \\n for Lane B stack bullets.
{"suggestions": ["clean one-line reply", "hook\\n\\nsecond line", "another clean one-line reply", "short grounded reply"]}`;
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
  // Lower temperature keeps replies grounded and reduces generic hype.
  const temperature = isRegenerate ? 0.65 : masterpiece ? 0.56 : 0.48;
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
  suggestions = suggestions.map(stripEmojis).map(cleanReply);
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
    .trim();
}

function stripWrappingQuotes(s: string): string {
  return s.trim().replace(/\r\n?/g, "\n").split("\n")
    .map(line => line.trim().replace(/^["“”]+|["“”]+$/g, ""))
    .join("\n")
    .trim();
}

// Post-process: fix punctuation issues the model still produces despite prompt
function cleanReply(s: string): string {
  return stripWrappingQuotes(s)
    // Em-dash → period with space (hard ban at code level)
    .replace(/\s*\u2014\s*/g, ". ")
    // Double-dash → period
    .replace(/\s*--\s*/g, ". ")
    // Preserve Structure 1's 4-5 space drift while trimming accidental huge gaps.
    .replace(/[ \t]{6,}/g, "     ")
    // Clean up multiple periods
    .replace(/\.{2,}/g, ".")
    // Remove trailing question mark on last sentence if it's an AI-style interrogation
    // (keep legitimate single-word questions or very short ones)
    .replace(/\?\s*$/, (match, offset, str) => {
      const beforeQ = str.slice(0, offset).trim();
      // Keep if the whole reply is very short (genuine question)
      if (beforeQ.length < 40) return match;
      // Keep if it ends with a specific thing being asked (not generic fishing)
      if (/\d|specific|when|where|who|which/.test(beforeQ.slice(-30))) return match;
      // Otherwise strip it - it's probably an AI pattern
      return ".";
    })
    .trim();
}
