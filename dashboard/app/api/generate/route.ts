import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_CTX = 800;

function buildPrompt(context: string) {
  return `You are a naturally witty, emotionally intelligent, and context-aware Twitter/X commenter.
You fully understand tone, emotion, and nuance like a real human — not like an AI imitating one.
Replies must sound spontaneous, effortless, and genuinely personal.

Read the tweet between the triple quotes carefully. Understand its emotion, tone and intent.
Then craft 4 unique, natural replies that sound authentic and emotionally aligned.

Rules:
1) Mirror the original emotion (sad → empathy, happy → joy, success → warm congrats).
2) ≤ 160 characters per reply. First letter capitalized.
3) Use 0–2 emojis only when they truly enhance emotion. Avoid spammy ones (✨🔥💅💥🦋💫).
4) Do NOT use em dashes unless absolutely needed.
5) Allow tiny imperfections (lowercase mid-sentence, missing period) for realism.
6) Rotate styles across the 4 replies: supportive, playful/witty, thoughtful, conversational.
7) GM/GN: respond in same tone if the tweet says GM/GN; never force.
8) If you disagree, do so diplomatically — never blunt or rude.
9) Avoid filler ("So true", "Interesting", "Great point") and brand-account vibe.
10) Reference specifics from the tweet (a keyword, mood, or detail) so it feels personal.

Output STRICTLY a JSON object: {"suggestions": ["reply1","reply2","reply3","reply4"]}.
No commentary, no preface, no markdown, no explanation.

Tweet:
"""${context}"""`;
}

function parse(raw: string): string[] {
  try {
    const j = JSON.parse(raw);
    const arr = Array.isArray(j) ? j : (Array.isArray(j.suggestions) ? j.suggestions : (Array.isArray(j.replies) ? j.replies : []));
    return arr.filter((s: any) => typeof s === "string").map((s: string) => s.trim()).filter(Boolean).slice(0, 4);
  } catch {}
  return raw.split(/\n+/).map(s => s.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean).slice(0, 4);
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

  let openaiResp: Response;
  try {
    openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: plan.model,
        messages: [
          { role: "system", content: "You output strictly a JSON object with key 'suggestions' that is an array of 4 short reply strings." },
          { role: "user", content: buildPrompt(context) }
        ],
        temperature: 0.9,
        max_tokens: 600,
        response_format: { type: "json_object" }
      })
    });
  } catch {
    return NextResponse.json({ error: "UPSTREAM" }, { status: 502 });
  }
  if (!openaiResp.ok) return NextResponse.json({ error: "UPSTREAM" }, { status: 502 });

  const data = await openaiResp.json().catch(() => null);
  const raw = data?.choices?.[0]?.message?.content || "";
  const suggestions = parse(raw);
  if (!suggestions.length) return NextResponse.json({ error: "EMPTY_SUGGESTIONS" }, { status: 502 });

  await prisma.usageLog.update({
    where: { userId_day: { userId, day } },
    data: { count: { increment: 1 } }
  });

  return NextResponse.json({
    suggestions,
    usage: { used: usage.count + 1, limit: plan.dailyLimit, plan: sub.plan }
  });
}
