import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey, REPLY_STYLES, ReplyStyle } from "@/lib/plans";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CTX = 1500;

// OpenAI prices (USD per 1M tokens) — update if OpenAI changes
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o": { input: 2.50, output: 10.00 }
};

/**
 * Download a Twitter image and return a base64 data URL.
 *
 * Why: when we hand `pbs.twimg.com/...` URLs to OpenAI, OpenAI's fetcher is
 * sometimes blocked by Twitter (rate-limit or hot-link rules). The model
 * silently falls back to "I can't see the image". By fetching server-side
 * and inlining as base64 we guarantee the model actually sees it.
 *
 * Returns null on any failure so the caller can fall back to URL passthrough.
 */
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  // We try a couple of variants because some sizes are rate-limited.
  const candidates = [
    url,
    url.replace(/&name=\w+/, "&name=large"),
    url.replace(/&name=\w+/, "&name=medium"),
    url.replace(/&name=\w+/, "")
  ];
  // De-duplicate while preserving order.
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
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://x.com/",
          "Sec-Fetch-Dest": "image",
          "Sec-Fetch-Mode": "no-cors",
          "Sec-Fetch-Site": "cross-site"
        },
        signal: AbortSignal.timeout(15000),
        redirect: "follow"
      });
      if (!resp.ok) {
        console.warn(
          "[vision] fetch non-OK",
          resp.status,
          candidate.slice(0, 90)
        );
        continue;
      }
      const ctHeader = resp.headers.get("content-type") || "";
      const ct = ctHeader.split(";")[0].trim() || "image/jpeg";
      if (!ct.startsWith("image/")) {
        console.warn("[vision] non-image content-type", ct, candidate.slice(0, 90));
        continue;
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length === 0) {
        console.warn("[vision] empty body", candidate.slice(0, 90));
        continue;
      }
      if (buf.length > 8 * 1024 * 1024) {
        console.warn("[vision] too large", buf.length, candidate.slice(0, 90));
        continue;
      }
      console.log(
        "[vision] fetched",
        ct,
        buf.length,
        "bytes from",
        candidate.slice(0, 90)
      );
      return `data:${ct};base64,${buf.toString("base64")}`;
    } catch (e: any) {
      console.warn(
        "[vision] fetch threw",
        e?.name || "?",
        e?.message || "?",
        candidate.slice(0, 90)
      );
      // try next candidate
    }
  }
  return null;
}

function styleInstruction(style: string, customNote?: string | null): string {
  let base = "";
  switch (style) {
    case "funny":
      base =
        "Style: WITTY and PLAYFUL. Light humor, clever wordplay, a touch of absurdity when fitting. Never cringe, never forced.";
      break;
    case "short":
      base =
        "Style: SHORT and PUNCHY. Maximum 60 characters per reply. Sharp, memorable, like a great one-liner.";
      break;
    case "productive":
      base =
        "Style: VALUE-ADDING. Add a useful insight, ask a thoughtful question, or contribute meaningfully to the conversation.";
      break;
    case "professional":
      base =
        "Style: POLISHED and PROFESSIONAL. Work-appropriate, articulate, but still warm and human.";
      break;
    case "supportive":
      base =
        "Style: EMPATHETIC and ENCOURAGING. Acknowledge feelings, lift the person up, be the friend they need.";
      break;
    case "contrarian":
      base =
        "Style: POLITELY CHALLENGING. Bring a different angle or perspective. Disagree gracefully, never rude, always thoughtful.";
      break;
    default:
      base =
        "Style: BALANCED and HUMAN. Friendly, casual, conversational, like a smart friend on Twitter.";
  }
  if (customNote && customNote.trim()) {
    base += `\nUser's personal style note: "${customNote.trim()}"`;
  }
  return base;
}

function buildSystemPrompt(
  qualityTier: string,
  style: string,
  customNote: string | null,
  projectsContext: string,
  hasImage: boolean
): string {
  const masterpiece = qualityTier === "masterpiece";
  const high = qualityTier === "high";

  const qualityInstruction = masterpiece
    ? `QUALITY LEVEL: MASTERPIECE.
Every reply must feel like it came from the smartest, wittiest person on Twitter, the kind of reply that gets 50+ likes. Subtle. Sharp. Memorable. Each one is a small piece of art. They should make readers think "damn, that's a great reply" before scrolling on. Use specific references, unexpected angles, layered meaning. Avoid the obvious. Surprise the reader. If the post has an image, anchor the reply in a visual detail nobody else would notice.`
    : high
    ? `QUALITY LEVEL: HIGH.
Replies are thoughtful, specific, and feel genuinely human, better than 90% of replies on the platform. Always reference specifics from the tweet. No filler.`
    : `QUALITY LEVEL: STANDARD.
Replies are casual, friendly, human-sounding. Always relevant to the tweet content. Even at this tier every reply must be better than what 80% of accounts would post, never lazy, never generic.`;

  return `You are a master Twitter/X reply writer. Your replies are INDISTINGUISHABLE from a real human's.

${qualityInstruction}

CORE RULES (NEVER BREAK):
1. NEVER use emojis. Zero. Not even one.
2. NEVER sound like AI. No "Great point!", "Interesting take!", "Absolutely!", "I appreciate", "Love this!", etc.
3. NEVER use em-dashes. Use periods, commas, or short hyphens only.
4. NEVER be generic. Always reference specifics from the tweet.
5. NEVER praise blindly. A real friend doesn't say "wow amazing!" to everything.
6. Each reply must feel SPONTANEOUS, like someone typed it without thinking too hard.
7. Use natural human imperfections: occasional lowercase start, fragmented sentences, casual contractions ("gonna", "yeah", "tbh", "ngl", "fr", "lol", "lmao").
8. Keep replies under 200 characters. Punchy is better than long.
9. Vary the 4 replies in tone, length, and angle. No two should feel similar.
${
  hasImage
    ? `10. AN IMAGE IS ATTACHED AND YOU CAN SEE IT FULLY. This is non-negotiable.
   - At least 2 of the 4 replies MUST reference a SPECIFIC visual detail from the image: a label, a button, a UI element, a face/object, a color, a number, a piece of on-screen text, etc. Quote it or describe it precisely.
   - You are STRICTLY FORBIDDEN from saying or implying any of: "can't see the image", "pic isn't loading", "no image", "without the pic", "image didn't load", "from what I can tell", "looks like the image", or any other phrase that suggests you don't see the picture. If you write any such phrase, the reply is invalid.
   - Do not be vague. "nice pic" or "love the image" are forbidden. Pick something concrete you actually see.
   - The image is the joke/context most of the time. Engage with what is IN it, not just the tweet text.`
    : "10. This is a text-only post. Focus on the words."
}

${styleInstruction(style, customNote)}

${
  projectsContext
    ? `\n=== USER'S PROJECT KNOWLEDGE ===\n${projectsContext}\n=== END KNOWLEDGE ===\nWhen the tweet relates to topics above, USE that knowledge to write smarter, insider-feeling replies. Don't be obvious. Just naturally weave it in like an insider would.`
    : ""
}

OUTPUT FORMAT:
Strictly a JSON object: {"suggestions": ["reply1", "reply2", "reply3", "reply4"]}
No commentary. No markdown. Just JSON.`;
}

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

  // PLAN GATE: only Pro/Premium can use vision. Even if the extension sent
  // images, we ignore them for non-vision plans. For vision-eligible plans
  // we download the images server-side and inline as base64 data URLs so
  // OpenAI does not have to fetch from twimg.com (which it sometimes can't).
  // If our server-side fetch fails we still hand the raw URL to OpenAI as a
  // last-resort fallback rather than dropping vision entirely.
  type ImagePart = { type: "image_url"; image_url: { url: string; detail: "auto" } };
  const imageParts: ImagePart[] = [];
  let imagesInlined = 0;
  let imagesUrlFallback = 0;
  if (plan.vision && rawImageUrls.length > 0) {
    for (const u of rawImageUrls.slice(0, 3)) {
      const dataUrl = await fetchImageAsDataUrl(u);
      if (dataUrl) {
        imagesInlined++;
        imageParts.push({ type: "image_url", image_url: { url: dataUrl, detail: "auto" } });
      } else {
        imagesUrlFallback++;
        imageParts.push({ type: "image_url", image_url: { url: u, detail: "auto" } });
      }
    }
  }
  const useVision = imageParts.length > 0;
  if (plan.vision && rawImageUrls.length > 0) {
    console.log(
      "[vision] plan=",
      plan.key,
      "received=",
      rawImageUrls.length,
      "inlined=",
      imagesInlined,
      "url-fallback=",
      imagesUrlFallback
    );
  }

  const isRegenerate = !!body?.regenerate;
  const previousSuggestions: string[] = Array.isArray(body?.previousSuggestions)
    ? body.previousSuggestions.filter((s: any) => typeof s === "string").slice(0, 12)
    : [];

  // PLAN GATE: only Starter+ can use non-default styles or custom notes.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { replyStyle: true, customStyleNote: true }
  });
  const style = plan.allowStyles ? user?.replyStyle || "default" : "default";
  const customNote = plan.allowStyles ? user?.customStyleNote || null : null;

  // PLAN GATE: only Pro+ can use project contexts.
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
    useVision
  );

  let userMessage: any;
  if (useVision) {
    userMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text:
            `Tweet text:\n"""${context}"""` +
            (isRegenerate && previousSuggestions.length
              ? `\n\nIMPORTANT: I already have these replies. Generate 4 COMPLETELY DIFFERENT ones, different angles, different vibes, different sentence structures. Avoid any similarity:\n${previousSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
              : "")
        },
        ...imageParts
      ]
    };
  } else {
    userMessage = {
      role: "user",
      content:
        `Tweet text:\n"""${context}"""` +
        (isRegenerate && previousSuggestions.length
          ? `\n\nIMPORTANT: I already have these replies. Generate 4 COMPLETELY DIFFERENT ones, different angles, different vibes, different sentence structures. Avoid any similarity:\n${previousSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
          : "")
    };
  }

  const model = plan.model;
  const masterpiece = plan.qualityTier === "masterpiece";
  const maxTokens = masterpiece ? 900 : 700;
  const temperature = isRegenerate ? 1.1 : masterpiece ? 1.0 : 0.95;

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
      })
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
  // Strip emojis defensively
  suggestions = suggestions.map(stripEmojis);
  if (!suggestions.length) {
    return NextResponse.json({ error: "EMPTY_SUGGESTIONS" }, { status: 502 });
  }

  // Calculate cost
  const price = PRICES[model] || PRICES["gpt-4o-mini"];
  const costUSD = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;

  // Save generation log
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

  // Increment usage
  await prisma.usageLog.update({
    where: { userId_day: { userId, day } },
    data: { count: { increment: 1 } }
  });

  return NextResponse.json({
    suggestions,
    usage: { used: usage.count + 1, limit: plan.dailyLimit, plan: sub.plan },
    model,
    visionUsed: useVision
  });
}

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

// Defensive emoji stripper
function stripEmojis(s: string): string {
  return s
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}]/gu,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}
