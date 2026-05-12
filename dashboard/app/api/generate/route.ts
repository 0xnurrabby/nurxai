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

type ImagePart = { type: "image_url"; image_url: { url: string; detail: "high" | "auto" } };
type EnrichmentResult = { text: string | null; imageUsed: boolean; searchUsed: boolean };

// ─── Context Enrichment (Vercel AI Gateway → Grok) ───────────────────────────
//
// Send extracted tweet context and images to Grok for X-native grounding.
// It must return nothing when the visible tweet/handles/links/images are ambiguous.
// This runs for every generation when AI_GATEWAY_API_KEY is set in env.

async function enrichContext(tweetText: string, imageParts: ImagePart[]): Promise<EnrichmentResult> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return { text: null, imageUsed: false, searchUsed: false };

  const primaryModel = process.env.AI_GATEWAY_MODEL || "xai/grok-4.1-fast-reasoning";
  const fallbackModel = "xai/grok-4.1-fast-reasoning";
  const models = primaryModel === fallbackModel ? [primaryModel] : [primaryModel, fallbackModel];
  const hasImages = imageParts.length > 0;

  const userContent: any = hasImages
    ? [
        {
          type: "text",
          text: `Extracted tweet context:\n"""\n${tweetText.slice(0, 1500)}\n"""\n\nInspect the attached tweet image(s) too. Verify only the actual subject(s) of this tweet. If relevant, identify the X trend/narrative this post is reacting to. If the context is too generic or ambiguous, return NO_VERIFIED_CONTEXT.`
        },
        ...imageParts
      ]
    : `Extracted tweet context:\n"""\n${tweetText.slice(0, 1500)}\n"""\n\nVerify only the actual subject(s) of this tweet. If relevant, identify the X trend/narrative this post is reacting to. If the context is too generic or ambiguous, return NO_VERIFIED_CONTEXT.`;

  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const model of models) {
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
                content: `You are a strict X/Twitter context verifier for reply generation.

You are especially good at understanding why an X post was made, what trend it is referencing, which project/account/token it is actually about, and whether a visible claim is part of a current narrative.

Use only subjects that are directly visible in the extracted tweet context: exact @handles, display names, quoted tweet text, URLs, cashtags, tokens, or unambiguous project names. You may use your X/web knowledge to add background only when it is clearly tied to those visible subjects.

If image(s) are attached, inspect them carefully. Extract only concrete visual facts: visible text, numbers, UI labels, charts, logos, products, screenshots, people/objects, and how the visual changes the meaning of the post.

Rules:
- Do not infer unrelated projects from generic words or same-name search results.
- Words like Base, agent, home, cloud, html, taxes, or protocol are generic unless the visible author/handle/URL/text makes the entity unambiguous.
- If you identify an X account, use the exact @handle from the extracted context. Never guess a username.
- If a project/person/token is not clearly the same entity as the tweet subject, do not mention it.
- If the post appears to be reacting to a trend, explain the trend only if it is tied to visible handles/tickers/URLs/text.
- If using image context, mention only details actually visible in the image.
- Prefer concise context that helps form a personal opinion, not a long research note.
- If there is no reliable background to add, return exactly: NO_VERIFIED_CONTEXT.

Return 2-5 short bullets only when they are safe and directly tied to the visible tweet subject. If images were useful, include at least one bullet starting with "Visual:".`
              },
              {
                role: "user",
                content: userContent
              }
            ],
            max_tokens: 450
          }),
          signal: AbortSignal.timeout(20000)
        });

        if (!resp.ok) {
          lastStatus = resp.status;
          lastBody = await resp.text().catch(() => "");
          continue;
        }

        const data = await resp.json().catch(() => null);
        const text: string = data?.choices?.[0]?.message?.content || "";
        const cleaned = text.trim();
        if (/^NO_VERIFIED_CONTEXT\b/i.test(cleaned)) return { text: null, imageUsed: hasImages, searchUsed: true };
        if (cleaned && cleaned.length > 30) {
          console.log("[enrich] got context, length:", text.length, "model:", model, "attempt:", attempt + 1);
          return { text: cleaned, imageUsed: hasImages, searchUsed: true };
        }
        return { text: null, imageUsed: hasImages, searchUsed: true };
      } catch (e: any) {
        lastBody = e?.message || "?";
      }
    }
  }

  console.warn("[enrich] gateway failed after retries", lastStatus, lastBody.slice(0, 300));
  return { text: null, imageUsed: false, searchUsed: false };
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

  return `You write Twitter/X replies that sound like the user's own opinion, not a caption, summary, review, or analysis of the post.

${masterpiece
    ? "You're deep in crypto/tech. Seen cycles. You respond with personal takes, small judgments, and lived-in opinions. Not trying to impress."
    : "You know this space. You reply with a natural take, not a report."}

━━ VOICE ━━
Write as if the user is personally replying in public, from their own perspective.
The reply should share a take/opinion/reaction inspired by the post, not a neutral observation.
It should not explain what the post says, praise the post, or describe the author’s journey.
Prefer first-person or implied first-person when natural: "i'd...", "i would...", "my read is...", "the part i'd bet on...", "the underrated bit...", "the real unlock...".
Avoid sounding like an assistant giving feedback.

Perspective modes. Pick the one that fits the post, do not label it:
- Builder flex: if the post is about being recognized/followed by visible accounts, reply as if that would be a personal builder milestone.
- Personal bet: if it is a token/watchlist/ranking post, reply like the user is picking what catches their eye, not reporting the list.
- Skeptical angle: if the claim is broad, reply with the caveat or tradeoff the user notices.
- Meme read: if the post is a joke/image, reply to why the joke lands or what the image says about the market.
- Founder/operator take: if the post is product/infrastructure, reply with the practical unlock or bottleneck.

BAD: "That walk in Regent's Park sounds like a pivotal moment."
BAD: "The images capture the essence of your journey."
BAD: "Meeting X clearly set the stage for your journey."
GOOD: "the underrated part is how much distribution still comes from being in the right room"
GOOD: "base winning here is less about infra and more about giving builders a default home"
GOOD: "this is why consumer crypto keeps coming back to relationships, not just rails"

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
"intriguing combo", "the future", "huge boost", "potential is clear", "real game changer",
"sounds like", "captures the essence", "set the stage", "pivotal moment", "your journey",
"serious commitment", "impact is evident", "worth a deeper dive",
"feels like", "ngl", "curious to see", "nice to see", "strong move", "big unlock"

Never end a reply with an unanswered question. Questions = AI slop unless answered immediately in Quick Q&A.
BAD: "$IMGN's 33.7% spike is wild. Any news driving this?"
BAD: "Auto-rebalancing is interesting. How's the fee structure?"
BAD: "cbBTC mix is solid. Wonder about long-term viability."
BAD: "Rewards streaming is unique. Curious about security measures."
Real people make statements. They don't interrogate the original poster.

Never use em-dash (—). Use period or comma instead.

━━ VISUAL LAYOUT ━━
Choose ONE layout lane for the whole batch based on the post. All 4 replies should feel like the same human wrote them in the same visual style. Vary the angle/wording, not the visual gimmick.

Do not use the same lane for every kind of post. Pick from these rules:
- If the post has 3+ tickers, handles, numbered items, bullets, finalists, rankings, stats, or a watchlist, use Lane B.
- If the post is a finance/policy/market take with two connected ideas or a clear tradeoff, use Lane C.
- If the post is very short, casual, community/hype, or meme-like, use Lane D.
- Otherwise use Lane A for normal updates, product posts, image posts, and quote tweets.

Lane A - Standard Human (default, use for most posts):
- Either one clean sentence, or two short lines with one empty line between them.
- This is best for normal opinions, product updates, quote tweets, images, and most tech/crypto posts.
- Do not use the two-line blank-gap subtype for every post. Use it only when a hook + support line feels natural.

Lane B - Simple Stack (only for list/data/multi-item posts):
- Header line, then '~' bullets with NO empty lines.
- Use when the original post itself has a list, finalists, many companies, features, stats, or comparisons.
- For ticker/watchlist posts, make compact stack replies from the visible tickers/handles only.

Lane C - Drift (only for nuanced two-part takes):
- One line with 4-5 spaces between two related thoughts.
- Best for finance, policy, stablecoins, tradeoffs, or posts with two connected ideas.

Lane D - Casual Lowercase (only for simple community/hype posts):
- One lowercase sentence, no period, optionally ending with fr or tbh.

Avoid these unless the fit is painfully obvious: slash dividers, pure quotes, ALL CAPS punches, one-word vertical drops, curly notes, and "wait" interjections.
BAD: gotchios/kalqix/wlthxyz/lienfiapp/lendra/rogueaidotfun
BAD: wait.\n\nretro computer vibe
BAD: forcing every reply into a different visual structure.
No domain-specific examples are provided intentionally. Never copy wording from this prompt into a reply.

━━ RULES ━━
1. Zero emojis.
2. Specific reference from the post in every reply - a number, name, claim, or detail.
3. Make a statement from the user's point of view. Agree, disagree, add context, be skeptical, or share a personal read.
4. Each of 4 replies = different angle and wording, but keep the same layout lane for the batch.
5. Lowercase ok. Fragments ok. Contractions ok (im, its, dont, wont).
6. "tbh", "fr", "lemme", "gonna", "tbf" - use naturally, max 1 of 4 replies. Never use "ngl".
7. Under 280 chars total per reply (including line breaks).
8. Do not wrap replies or individual lines in quotation marks.
9. Do not name external projects/protocols/tools unless they appear in the tweet context or verified background.
10. Never include structure names or labels in the reply text.
11. Avoid filler adjectives. Prefer one specific noun from the tweet over broad words like future, potential, wave, vibes, boost.
12. Never write like you are evaluating the tweet. Write like you are adding your own opinion to the conversation.
13. Do not reuse the same opener, cadence, or pet phrase across the 4 replies. No repeated "i think", "tbh", "my read", or similar starts.
14. At least 2 replies should be from a clear self-perspective: what the user would bet on, care about, flex, doubt, or choose.
${hasImage ? `
━━ IMAGE ━━
Use the Grok-verified visual context below. At least 2 of 4 replies should reference concrete visual details if they matter:
exact numbers, text on screen, bar chart values, brand names, UI elements shown.
Never vague ("nice pic"). Never claim you personally inspected anything beyond the verified context.` : ""}
${styleInstruction(style, customNote) !== "Casual, direct, like a smart friend in the space." ? `\n━━ STYLE ━━\n${styleInstruction(style, customNote)}` : ""}
${enrichedContext ? `\n━━ CONTEXT (verified background - use if relevant) ━━\n${enrichedContext}` : ""}
${projectsContext ? `\n━━ YOUR EXPERTISE ━━\n${projectsContext}` : ""}

OUTPUT: JSON only. Use \\n\\n only for Lane A two-line replies. Use \\n for Lane B stack bullets.
{"suggestions": ["reply 1", "reply 2", "reply 3", "reply 4"]}`;
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

  // ── Vision image preparation for Grok ────────────────────────────────────────
  const imageParts: ImagePart[] = [];
  let imagesInlined = 0;
  let imagesUrlFallback = 0;

  if (rawImageUrls.length > 0) {
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
  // ── Context + image enrichment via Grok on Vercel AI Gateway ─────────────────
  let enrichedContext: string | null = null;
  let imageUsedByGrok = false;
  let searchUsedByGrok = false;
  const enrichment = await enrichContext(context, imageParts);
  enrichedContext = enrichment.text;
  imageUsedByGrok = enrichment.imageUsed;
  searchUsedByGrok = enrichment.searchUsed;

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
    projectsContext, imageUsedByGrok, enrichedContext
  );

  // ── Build user message ────────────────────────────────────────────────────
  const regenerateNote = isRegenerate && previousSuggestions.length
    ? `\n\nAlready generated these - make 4 completely different ones, different angles:\n${previousSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : "";

  const userMessage = {
    role: "user",
    content: `Tweet:\n"""\n${context}\n"""${regenerateNote}`
  };

  // ── Call OpenAI ───────────────────────────────────────────────────────────
  const model = plan.model;
  const masterpiece = plan.qualityTier === "masterpiece";
  // Keep enough entropy for human variation while Grok context keeps it grounded.
  const temperature = isRegenerate ? 0.78 : masterpiece ? 0.68 : 0.62;
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
  suggestions = suggestions
    .map(stripEmojis)
    .map(cleanReply)
    .filter(s => isAllowedReply(s, context));
  suggestions = dedupeReplyOpeners(suggestions);
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
      model, hadImage: imageUsedByGrok
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
    visionUsed: imageUsedByGrok,
    searchUsed: searchUsedByGrok
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

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9@$]+/g, " ").replace(/\s+/g, " ").trim();
}

function isAllowedReply(reply: string, context: string): boolean {
  if (!reply.trim()) return false;

  const normalizedReply = normalizeForCompare(reply);
  const normalizedContext = normalizeForCompare(context);
  const bannedPhrases = [
    "feels like",
    "ngl",
    "curious to see",
    "nice to see",
    "strong move",
    "big unlock",
    "sounds like",
    "captures the essence",
    "set the stage",
    "pivotal moment",
    "your journey",
    "serious commitment",
    "impact is evident",
    "worth a deeper dive",
    "ride the wave",
    "might be the ticket",
    "potential is clear"
  ];
  const leakedPromptPhrases = [
    "open gotchi potential",
    "bridging digital companions with real world interactions",
    "new class of actors needs a new class of financial systems",
    "v4 hooks needed an actual consumer facing example",
    "hook meta gets less abstract",
    "agent economy cloudflare ai bots humans slack agents humans nvidia 100 agents employee",
    "stablecoins got the exit ramp banks still want the old spread"
  ];

  if (bannedPhrases.some(phrase => normalizedReply.includes(phrase))) return false;
  if (leakedPromptPhrases.some(phrase => normalizedReply.includes(phrase))) return false;

  const contextSymbols = new Set(normalizedContext.match(/[@$][a-z0-9_]+/g) || []);
  const replySymbols = normalizedReply.match(/[@$][a-z0-9_]+/g) || [];
  if (replySymbols.some(symbol => !contextSymbols.has(symbol))) return false;

  return true;
}

function dedupeReplyOpeners(replies: string[]): string[] {
  const seen = new Set<string>();
  return replies.filter(reply => {
    const opener = normalizeForCompare(reply).split(" ").slice(0, 3).join(" ");
    if (!opener) return false;
    if (seen.has(opener)) return false;
    seen.add(opener);
    return true;
  });
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
