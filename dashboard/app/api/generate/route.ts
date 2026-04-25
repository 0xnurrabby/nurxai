import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey, REPLY_STYLES, ReplyStyle } from "@/lib/plans";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 45;

const MAX_CTX = 1500;

// OpenAI prices (USD per 1M tokens) — update if OpenAI changes
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o": { input: 2.50, output: 10.00 }
};

function styleInstruction(style: string, customNote?: string | null): string {
  const s = REPLY_STYLES[style as ReplyStyle];
  let base = "";
  switch (style) {
    case "funny":
      base = "Style: WITTY and PLAYFUL. Light humor, clever wordplay, a touch of absurdity when fitting. Never cringe, never forced.";
      break;
    case "short":
      base = "Style: SHORT and PUNCHY. Maximum 60 characters per reply. Sharp, memorable, like a great one-liner.";
      break;
    case "productive":
      base = "Style: VALUE-ADDING. Add a useful insight, ask a thoughtful question, or contribute meaningfully to the conversation.";
      break;
    case "professional":
      base = "Style: POLISHED and PROFESSIONAL. Work-appropriate, articulate, but still warm and human.";
      break;
    case "supportive":
      base = "Style: EMPATHETIC and ENCOURAGING. Acknowledge feelings, lift the person up, be the friend they need.";
      break;
    case "contrarian":
      base = "Style: POLITELY CHALLENGING. Bring a different angle or perspective. Disagree gracefully — never rude, always thoughtful.";
      break;
    default:
      base = "Style: BALANCED and HUMAN. Friendly, casual, conversational, like a smart friend on Twitter.";
  }
  if (customNote && customNote.trim()) {
    base += `\nUser's personal style note: "${customNote.trim()}"`;
  }
  return base;
}

function buildSystemPrompt(style: string, customNote: string | null, projectsContext: string): string {
  return `You are a master Twitter/X reply writer. Your replies are INDISTINGUISHABLE from a real human's.

CORE RULES (NEVER BREAK):
1. NEVER use emojis. Zero. Not even one.
2. NEVER sound like AI. No "Great point!", "Interesting take!", "Absolutely!", "I appreciate", etc.
3. NEVER use em-dashes (—). Use periods or commas instead.
4. NEVER be generic. Always reference specifics from the tweet.
5. NEVER praise blindly. A real friend doesn't say "wow amazing!" to everything.
6. Each reply must feel SPONTANEOUS — like someone typed it without thinking too hard.
7. Use natural human imperfections: occasional lowercase start, fragmented sentences, casual contractions ("gonna", "yeah", "tbh", "ngl", "fr").
8. Keep replies under 200 characters. Punchy is better than long.
9. Vary the 4 replies in tone, length, and angle. No two should feel similar.
10. If the post has an image, USE the image content in your reply — describe what you see in passing, react to it.

${styleInstruction(style, customNote)}

${projectsContext ? `\n=== USER'S PROJECT CONTEXT (USE THIS!) ===\n${projectsContext}\n=== END CONTEXT ===\nWhen the tweet relates to topics in the context above, USE that knowledge to write smarter, insider-feeling replies. Don't be obvious about it — just naturally weave the knowledge in.` : ""}

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

  const imageUrls: string[] = Array.isArray(body?.imageUrls)
    ? body.imageUrls.filter((u: any) => typeof u === "string").slice(0, 4)
    : [];
  const useVision = plan.vision && imageUrls.length > 0;

  const isRegenerate = !!body?.regenerate;
  const previousSuggestions: string[] = Array.isArray(body?.previousSuggestions)
    ? body.previousSuggestions.filter((s: any) => typeof s === "string").slice(0, 12)
    : [];

  // User settings
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { replyStyle: true, customStyleNote: true }
  });
  const style = user?.replyStyle || "default";
  const customNote = user?.customStyleNote || null;

  // Active projects with contexts
  const projects = await prisma.project.findMany({
    where: { userId, active: true },
    include: { contexts: { orderBy: { createdAt: "desc" }, take: 5 } }
  });

  let projectsContext = "";
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

  const systemPrompt = buildSystemPrompt(style, customNote, projectsContext);

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
              ? `\n\nIMPORTANT: I already have these replies. Generate 4 COMPLETELY DIFFERENT ones — different angles, different vibes, different sentence structures. Avoid any similarity:\n${previousSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
              : "")
        },
        ...imageUrls.map((url) => ({
          type: "image_url",
          image_url: { url, detail: "auto" }
        }))
      ]
    };
  } else {
    userMessage = {
      role: "user",
      content:
        `Tweet text:\n"""${context}"""` +
        (isRegenerate && previousSuggestions.length
          ? `\n\nIMPORTANT: I already have these replies. Generate 4 COMPLETELY DIFFERENT ones — different angles, different vibes, different sentence structures. Avoid any similarity:\n${previousSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
          : "")
    };
  }

  const model = plan.model;

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
        temperature: isRegenerate ? 1.05 : 0.95,
        max_tokens: 700,
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
