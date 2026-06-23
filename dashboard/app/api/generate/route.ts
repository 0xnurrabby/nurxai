import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUserFromHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";
import { google } from "@ai-sdk/google";
import { gateway, generateText } from "ai";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CTX = 1500;
const AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const GENERATION_MODEL = "openai/gpt-5.4-mini";
const IMAGE_FETCH_TIMEOUT_MS = getEnvInt("IMAGE_FETCH_TIMEOUT_MS", 5500, 1500, 12000);
const ENRICH_TIMEOUT_MS = getEnvInt("AI_GATEWAY_ENRICH_TIMEOUT_MS", 12000, 4000, 25000);
const ENRICH_ATTEMPTS = getEnvInt("AI_GATEWAY_ENRICH_ATTEMPTS", 1, 1, 2);
const SEARCH_TIMEOUT_MS = getEnvInt("AI_GATEWAY_SEARCH_TIMEOUT_MS", 9000, 3000, 20000);
const SEARCH_PROMPT_CHARS = getEnvInt("AI_GATEWAY_SEARCH_PROMPT_CHARS", 420, 240, 900);
const SEARCH_MAX_OUTPUT_TOKENS = getEnvInt("AI_GATEWAY_SEARCH_MAX_OUTPUT_TOKENS", 70, 40, 140);
const SEARCH_CACHE_TTL_MS = getEnvInt("AI_GATEWAY_SEARCH_CACHE_TTL_HOURS", 24, 1, 168) * 60 * 60 * 1000;
const GENERATION_TIMEOUT_MS = getEnvInt("AI_GATEWAY_GENERATION_TIMEOUT_MS", 35000, 10000, 50000);
const MAX_REPLY_CHARS = getEnvInt("MAX_REPLY_CHARS", 150, 90, 220);
const MIN_REPLY_COUNT = 3;

const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o":      { input: 2.50, output: 10.00 },
  "openai/gpt-5.4-mini": { input: 0.15, output: 0.60 },
  "xai/grok-4.1-fast-reasoning": { input: 0.20, output: 0.60 },
  "google/gemini-3.1-flash-lite": { input: 0.10, output: 0.40 },
  "google/gemini-3.1-flash-lite-preview": { input: 0.10, output: 0.40 }
};

type ImagePart = { type: "image_url"; image_url: { url: string; detail: "high" | "auto" } };
type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  generationIds: string[];
  calls: Array<{
    stage: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
    generationId?: string;
  }>;
};
type EnrichmentResult = { text: string | null; imageUsed: boolean; searchUsed: boolean; usage: AiUsage };
type SearchContextResult = { text: string | null; used: boolean; usage: AiUsage };
type RepairResult = { suggestions: string[]; usage: AiUsage };
type Plan = (typeof PLANS)[PlanKey];
type CachedSearchContext = { text: string | null; expiresAt: number };
type ImagePreparationResult = {
  imageParts: ImagePart[];
  imagesInlined: number;
  imagesUrlFallback: number;
};
type PersonalizationResult = {
  style: string;
  customNote: string | null;
  projectsContext: string;
};

declare global {
  var __nurxaiSearchContextCache: Map<string, CachedSearchContext> | undefined;
}

const searchContextCache =
  globalThis.__nurxaiSearchContextCache ?? (globalThis.__nurxaiSearchContextCache = new Map());

function getEnvInt(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.round(raw)));
}

function nowMs() {
  return Date.now();
}

function emptyUsage(): AiUsage {
  return { inputTokens: 0, outputTokens: 0, costUSD: 0, generationIds: [], calls: [] };
}

function addUsage(...items: AiUsage[]) {
  return items.reduce<AiUsage>((total, item) => ({
    inputTokens: total.inputTokens + item.inputTokens,
    outputTokens: total.outputTokens + item.outputTokens,
    costUSD: total.costUSD + item.costUSD,
    generationIds: [...total.generationIds, ...item.generationIds],
    calls: [...total.calls, ...item.calls]
  }), emptyUsage());
}

function estimateCost(model: string, inputTokens: number, outputTokens: number) {
  const price = PRICES[model] || PRICES[GENERATION_MODEL];
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

function gatewayGenerationId(metadata: unknown): string | undefined {
  const id = (metadata as any)?.gateway?.generationId;
  return typeof id === "string" && id.startsWith("gen_") ? id : undefined;
}

async function usageFromGatewayInfo(stage: string, model: string, generationId?: string): Promise<AiUsage | null> {
  if (!generationId) return null;
  try {
    const info = await gateway.getGenerationInfo({ id: generationId });
    const inputTokens = Number(info.promptTokens || 0) + Number(info.cachedTokens || 0) + Number(info.cacheCreationTokens || 0);
    const outputTokens = Number(info.completionTokens || 0) + Number(info.reasoningTokens || 0);
    const costUSD = Number(info.totalCost || info.usage || 0);
    return {
      inputTokens,
      outputTokens,
      costUSD,
      generationIds: [generationId],
      calls: [{
        stage,
        model: info.model || model,
        inputTokens,
        outputTokens,
        costUSD,
        generationId
      }]
    };
  } catch (e: any) {
    console.warn("[metering] gateway lookup failed", stage, generationId, e?.message || "?");
    return null;
  }
}

async function usageFromOpenAIResponse(stage: string, model: string, data: any): Promise<AiUsage> {
  const rawId = typeof data?.id === "string" && data.id.startsWith("gen_") ? data.id : undefined;
  const generationId = gatewayGenerationId(data?.providerMetadata) || rawId;
  const fromGateway = await usageFromGatewayInfo(stage, model, generationId);
  if (fromGateway) return fromGateway;

  const inputTokens = Number(data?.usage?.prompt_tokens || data?.usage?.input_tokens || 0);
  const outputTokens = Number(data?.usage?.completion_tokens || data?.usage?.output_tokens || 0);
  const costUSD = estimateCost(model, inputTokens, outputTokens);
  return {
    inputTokens,
    outputTokens,
    costUSD,
    generationIds: generationId ? [generationId] : [],
    calls: [{
      stage,
      model,
      inputTokens,
      outputTokens,
      costUSD,
      ...(generationId ? { generationId } : {})
    }]
  };
}

async function usageFromAiSdkResult(stage: string, model: string, result: any): Promise<AiUsage> {
  const generationId = gatewayGenerationId(result?.providerMetadata);
  const fromGateway = await usageFromGatewayInfo(stage, model, generationId);
  if (fromGateway) return fromGateway;

  const usage = result?.totalUsage || result?.usage || {};
  const inputTokens = Number(usage.inputTokens || 0);
  const outputTokens = Number(usage.outputTokens || 0) + Number(usage.reasoningTokens || 0);
  const costUSD = estimateCost(model, inputTokens, outputTokens);
  return {
    inputTokens,
    outputTokens,
    costUSD,
    generationIds: generationId ? [generationId] : [],
    calls: [{
      stage,
      model,
      inputTokens,
      outputTokens,
      costUSD,
      ...(generationId ? { generationId } : {})
    }]
  };
}

// ─── Context Enrichment ───────────────────────────────────────────────────────
//
// Send extracted tweet context and images to Grok for X-native grounding.
// It must return nothing when the visible tweet/handles/links/images are ambiguous.
// This runs for every generation when AI_GATEWAY_API_KEY is set in env.

async function enrichContext(tweetText: string, imageParts: ImagePart[]): Promise<EnrichmentResult> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return { text: null, imageUsed: false, searchUsed: false, usage: emptyUsage() };

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

  for (let attempt = 0; attempt < ENRICH_ATTEMPTS; attempt++) {
    for (const model of models) {
      try {
        const resp = await fetch(AI_GATEWAY_URL, {
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
          signal: AbortSignal.timeout(ENRICH_TIMEOUT_MS)
        });

        if (!resp.ok) {
          lastStatus = resp.status;
          lastBody = await resp.text().catch(() => "");
          continue;
        }

        const data = await resp.json().catch(() => null);
        const text: string = data?.choices?.[0]?.message?.content || "";
        const cleaned = text.trim();
        const usage = await usageFromOpenAIResponse("grok-context", model, data);
        if (/^NO_VERIFIED_CONTEXT\b/i.test(cleaned)) return { text: null, imageUsed: hasImages, searchUsed: true, usage };
        if (cleaned && cleaned.length > 30) {
          console.log("[enrich] got context, length:", text.length, "model:", model, "attempt:", attempt + 1);
          return { text: cleaned, imageUsed: hasImages, searchUsed: true, usage };
        }
        return { text: null, imageUsed: hasImages, searchUsed: true, usage };
      } catch (e: any) {
        lastBody = e?.message || "?";
      }
    }
  }

  console.warn("[enrich] gateway failed after retries", lastStatus, lastBody.slice(0, 300));
  return { text: null, imageUsed: false, searchUsed: false, usage: emptyUsage() };
}

function searchableTweetText(tweetText: string) {
  return tweetText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^Author:/i.test(line))
    .join("\n");
}

function compactTweetForSearch(tweetText: string) {
  const lines = tweetText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const searchableLines = searchableTweetText(tweetText)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const signalLines = lines.filter((line) =>
    !/^Author:/i.test(line) &&
    /https?:\/\/|[@$][A-Za-z0-9_]+|\b(today|yesterday|tomorrow|now|just|breaking|launch|launched|airdrop|claim|mint|mainnet|testnet|partnership|hack|exploit|listing|delist|token|price|market|funding|acquired|merger|sec|etf|fed|cpi|fomc)\b/i.test(line)
  );

  const selected = (signalLines.length ? signalLines : searchableLines.length ? searchableLines : lines).slice(0, 8).join("\n");
  return selected.slice(0, SEARCH_PROMPT_CHARS);
}

function shouldUseWebSearch(tweetText: string, plan: Plan) {
  if (plan.qualityTier !== "masterpiece") return false;
  if (process.env.AI_GATEWAY_SEARCH_MODE === "off") return false;
  if (process.env.AI_GATEWAY_SEARCH_MODE === "always") return true;

  const compact = compactTweetForSearch(tweetText);
  const searchable = searchableTweetText(tweetText);
  if (compact.length < 18) return false;

  return /https?:\/\/|[@$][A-Za-z0-9_]+|\b(today|yesterday|tomorrow|now|latest|breaking|just|announced|launch(?:ed|ing)?|airdrop|claim|mint|mainnet|testnet|partnership|hack|exploit|listing|delist|token|price|market|funding|acquired|merger|sec|etf|fed|cpi|fomc|election|lawsuit|earnings)\b/i.test(searchable);
}

function searchCacheKey(tweetText: string) {
  const compact = compactTweetForSearch(tweetText).toLowerCase().replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(compact).digest("hex").slice(0, 32);
}

async function searchContext(tweetText: string, plan: Plan): Promise<SearchContextResult> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return { text: null, used: false, usage: emptyUsage() };
  if (!shouldUseWebSearch(tweetText, plan)) return { text: null, used: false, usage: emptyUsage() };

  const cacheKey = searchCacheKey(tweetText);
  const cached = searchContextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { text: cached.text, used: Boolean(cached.text), usage: emptyUsage() };
  }

  const primaryModel = process.env.AI_GATEWAY_SEARCH_MODEL || "google/gemini-3.1-flash-lite";
  const fallbackModel = "google/gemini-3.1-flash-lite-preview";
  const models = primaryModel === fallbackModel ? [primaryModel] : [primaryModel, fallbackModel];
  let lastBody = "";
  const searchPrompt = compactTweetForSearch(tweetText);

  for (const model of models) {
    try {
      const result = await generateText({
        model,
        system: `Identify only current public facts needed to ground an X reply.
No reply ideas. No summary. No guesses.
Return NO_WEB_CONTEXT if web lookup adds nothing.
Otherwise return max 2 bullets, under 12 words each.`,
        prompt: searchPrompt,
        tools: {
          google_search: google.tools.googleSearch({
            searchTypes: { webSearch: {} }
          })
        },
        maxOutputTokens: SEARCH_MAX_OUTPUT_TOKENS,
        temperature: 0,
        abortSignal: AbortSignal.timeout(SEARCH_TIMEOUT_MS)
      });

      const cleaned = result.text.trim();
      const usage = await usageFromAiSdkResult("gemini-web-context", model, result);
      if (!cleaned || /^NO_WEB_CONTEXT\b/i.test(cleaned)) {
        searchContextCache.set(cacheKey, { text: null, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
        return { text: null, used: true, usage };
      }

      const text = cleaned
        .split(/\n+/)
        .map((line) => line.replace(/^[-*•]\s*/, "- ").trim())
        .filter(Boolean)
        .slice(0, 2)
        .join("\n")
        .slice(0, 220);
      searchContextCache.set(cacheKey, { text, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
      return { text, used: true, usage };
    } catch (e: any) {
      lastBody = e?.message || "?";
    }
  }

  console.warn("[search] gateway failed", lastBody.slice(0, 300));
  return { text: null, used: false, usage: emptyUsage() };
}

// ─── Image Fetching ───────────────────────────────────────────────────────────

function imageCandidates(url: string) {
  const candidates = [
    url,
    url.replace(/&name=\w+/, "&name=large"),
    url.replace(/[?&]name=\w+/, "?format=jpg&name=large"),
    url.replace(/&name=\w+/, "&name=medium"),
    url.replace(/[?&]name=\w+/, "")
  ];
  const seen = new Set<string>();
  return candidates.filter(u => {
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}

async function fetchImageCandidate(candidate: string, signal: AbortSignal): Promise<string | null> {
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
      signal,
      redirect: "follow"
    });
    if (!resp.ok) return null;
    const ct = (resp.headers.get("content-type") || "").split(";")[0].trim() || "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length || buf.length > 10 * 1024 * 1024) return null;
    console.log("[vision] fetched", ct, buf.length, "bytes");
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch (e: any) {
    if (e?.name !== "AbortError") {
      console.warn("[vision] fetch threw", e?.name, candidate.slice(0, 80));
    }
    return null;
  }
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  const tries = imageCandidates(url);
  if (!tries.length) return null;

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const winner = Promise.any(
      tries.map(async (candidate) => {
        const dataUrl = await fetchImageCandidate(candidate, controller.signal);
        if (!dataUrl) throw new Error("image_fetch_failed");
        return dataUrl;
      })
    ).catch(() => null);

    const budget = new Promise<null>((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, IMAGE_FETCH_TIMEOUT_MS);
    });

    return await Promise.race([winner, budget]);
  } finally {
    if (timeout) clearTimeout(timeout);
    controller.abort();
  }
}

async function prepareImages(rawImageUrls: string[], plan: Plan): Promise<ImagePreparationResult> {
  if (!plan.vision || rawImageUrls.length === 0) {
    return { imageParts: [], imagesInlined: 0, imagesUrlFallback: 0 };
  }

  const limit = plan.qualityTier === "masterpiece" ? 3 : 2;
  const urls = rawImageUrls.slice(0, limit);
  const detail: "high" | "auto" = plan.qualityTier === "masterpiece" ? "high" : "auto";
  const dataUrls = await Promise.all(urls.map((u) => fetchImageAsDataUrl(u)));

  let imagesInlined = 0;
  let imagesUrlFallback = 0;
  const imageParts = dataUrls.map((dataUrl, index) => {
    if (dataUrl) {
      imagesInlined++;
      return { type: "image_url" as const, image_url: { url: dataUrl, detail } };
    }
    imagesUrlFallback++;
    return { type: "image_url" as const, image_url: { url: urls[index], detail: "auto" as const } };
  });

  return { imageParts, imagesInlined, imagesUrlFallback };
}

async function loadPersonalization(userId: string, plan: Plan): Promise<PersonalizationResult> {
  const userPromise = prisma.user.findUnique({
    where: { id: userId },
    select: { replyStyle: true, customStyleNote: true }
  });

  const projectsPromise = plan.allowProjects
    ? prisma.project.findMany({
        where: { userId, active: true },
        select: {
          name: true,
          contexts: {
            orderBy: { createdAt: "desc" },
            take: plan.qualityTier === "masterpiece" ? 8 : 5,
            select: { content: true }
          }
        },
        take: plan.qualityTier === "masterpiece" ? 12 : 5
      })
    : Promise.resolve([]);

  const [user, projects] = await Promise.all([userPromise, projectsPromise]);
  const style = plan.allowStyles ? user?.replyStyle || "default" : "default";
  const customNote = plan.allowStyles ? user?.customStyleNote || null : null;

  const projectsContext = projects.length
    ? projects
        .map((p) => {
          const ctx = p.contexts.map((c) => c.content).join("\n\n");
          return ctx ? `Project: ${p.name}\n${ctx}` : "";
        })
        .filter(Boolean)
        .join("\n\n---\n\n")
        .slice(0, plan.qualityTier === "masterpiece" ? 5000 : 3500)
    : "";

  return { style, customNote, projectsContext };
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
  grokContext: string | null,
  webContext: string | null
): string {
  const masterpiece = qualityTier === "masterpiece";

  return `You write Twitter/X replies that sound like the user's own opinion, not a caption, summary, review, or analysis of the post.

Most replies should be short enough to fit in a reply box without wrapping much.
Default shape: 1 sentence, 8-18 words, under ${MAX_REPLY_CHARS} characters.
Long reply = bad output unless the original tweet is a long technical list.
Do not explain the post back to the author. Do not write mini-threads.

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
BAD: "the part i'd care about is the key-holder gate on the feed, that's where the action gets real and not just social chatter"
BAD: "bunnies as onchain action feeds is the right primitive if the unlock path stays clean for holders and agents"
BAD: "~ Builder Spotlight on Base Hub is the kind of distribution i'd want\n~ @project leaning into signals, recommendations, and executable actions is the useful part"
GOOD: "the underrated part is how much distribution still comes from being in the right room"
GOOD: "base winning here is less about infra and more about giving builders a default home"
GOOD: "this is why consumer crypto keeps coming back to relationships, not just rails"
GOOD: "the key-holder gate is the part i'd actually bet on"
GOOD: "onchain feeds only matter if people can act from them"
GOOD: "Base Hub is quietly becoming a real distribution layer"

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
- One clean sentence. Only use two short lines if both lines are under 45 characters.
- This is best for normal opinions, product updates, quote tweets, images, and most tech/crypto posts.
- Do not use the two-line blank-gap subtype for normal product posts like "Builder Spotlight".

Lane B - Simple Stack (only for list/data/multi-item posts):
- Header line, then '~' bullets with NO empty lines.
- Use only when the original post itself has a visible list, finalists, many companies, features, stats, or comparisons.
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
7. Hard length cap: under ${MAX_REPLY_CHARS} chars total per reply. Aim 60-120.
8. Do not wrap replies or individual lines in quotation marks.
9. Do not name external projects/protocols/tools unless they appear in the tweet context or verified background.
10. Never include structure names or labels in the reply text.
11. Avoid filler adjectives. Prefer one specific noun from the tweet over broad words like future, potential, wave, vibes, boost.
12. Never write like you are evaluating the tweet. Write like you are adding your own opinion to the conversation.
13. Do not reuse the same opener, cadence, or pet phrase across the 4 replies. No repeated "i think", "tbh", "my read", or similar starts.
14. At least 2 replies should be from a clear self-perspective: what the user would bet on, care about, flex, doubt, or choose.
15. Do not use more than one comma unless the reply is still under 110 chars.
16. Never use bullets, "~", numbered lines, or 3+ line replies unless the original tweet is clearly a list post.
${hasImage ? `
━━ IMAGE ━━
Use the Grok-verified visual context below. At least 2 of 4 replies should reference concrete visual details if they matter:
exact numbers, text on screen, bar chart values, brand names, UI elements shown.
Never vague ("nice pic"). Never claim you personally inspected anything beyond the verified context.` : ""}
${styleInstruction(style, customNote) !== "Casual, direct, like a smart friend in the space." ? `\n━━ STYLE ━━\n${styleInstruction(style, customNote)}` : ""}
${grokContext ? `\n━━ GROK CONTEXT (use silently, if relevant) ━━\n${grokContext}` : ""}
${webContext ? `\n━━ GOOGLE WEB CONTEXT VIA GEMINI (use silently, if relevant) ━━\n${webContext}` : ""}
${projectsContext ? `\n━━ YOUR EXPERTISE ━━\n${projectsContext}` : ""}

OUTPUT: JSON only. 4 short replies. No explanation. No bullets unless the original tweet is a visible list.
{"suggestions": ["reply 1", "reply 2", "reply 3", "reply 4"]}`;
}

// ─── Main Route ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const requestStarted = nowMs();
  const requestId = crypto.randomUUID().slice(0, 8);
  const [auth, body] = await Promise.all([
    getAuthUserFromHeader(req),
    req.json().catch(() => ({}))
  ]);
  if (!auth?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const userId = auth.user.id;

  let context = String(body?.context || "").trim();
  if (!context) return NextResponse.json({ error: "EMPTY_CONTEXT" }, { status: 400 });
  context = context.slice(0, MAX_CTX);

  const rawImageUrls: string[] = Array.isArray(body?.imageUrls)
    ? body.imageUrls.filter((u: any) => typeof u === "string").slice(0, 4)
    : [];

  const day = new Date().toISOString().slice(0, 10);
  const dbStarted = nowMs();
  const [sub, usage] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId, status: "active", endsAt: { gt: new Date() } },
      orderBy: { endsAt: "desc" }
    }),
    prisma.usageLog.findUnique({
      where: { userId_day: { userId, day } },
      select: { count: true }
    })
  ]);
  const dbMs = nowMs() - dbStarted;
  if (!sub) return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 402 });

  const plan = PLANS[sub.plan as PlanKey];
  if (!plan) return NextResponse.json({ error: "BAD_PLAN" }, { status: 402 });

  const usageCount = usage?.count ?? 0;
  if (usageCount >= plan.dailyLimit) {
    return NextResponse.json({ error: "QUOTA_EXCEEDED", limit: plan.dailyLimit }, { status: 429 });
  }

  // ── Vision image preparation for Grok ────────────────────────────────────────
  const personalizationStarted = nowMs();
  const personalizationPromise = loadPersonalization(userId, plan).catch((e: any) => {
    console.warn("[generate]", requestId, "personalization failed", e?.message || "?");
    return { style: "default", customNote: null, projectsContext: "" };
  });
  const imageStarted = nowMs();
  const imagePrep = await prepareImages(rawImageUrls, plan);
  const imageMs = nowMs() - imageStarted;

  if (rawImageUrls.length > 0) {
    console.log("[vision]", requestId, "plan=", plan.key, "received=", rawImageUrls.length,
      "inlined=", imagePrep.imagesInlined, "url-fallback=", imagePrep.imagesUrlFallback, "ms=", imageMs);
  }
  // ── Context + image enrichment ───────────────────────────────────────────────
  const enrichStarted = nowMs();
  const [enrichment, webSearch] = await Promise.all([
    enrichContext(context, imagePrep.imageParts),
    searchContext(context, plan)
  ]);
  const enrichedContext = enrichment.text;
  const webContext = webSearch.text;
  const imageUsedByGrok = enrichment.imageUsed;
  const searchUsedByGrok = enrichment.searchUsed || webSearch.used;
  const hadVerifiedImageContext = Boolean(enrichedContext && imageUsedByGrok);
  const enrichMs = nowMs() - enrichStarted;
  let aiUsage = addUsage(enrichment.usage, webSearch.usage);

  // ── User settings ─────────────────────────────────────────────────────────
  const isRegenerate = !!body?.regenerate;
  const previousSuggestions: string[] = Array.isArray(body?.previousSuggestions)
    ? body.previousSuggestions.filter((s: any) => typeof s === "string").slice(0, 12)
    : [];

  const { style, customNote, projectsContext } = await personalizationPromise;
  const personalizationMs = nowMs() - personalizationStarted;

  // ── Project contexts ──────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(
    plan.qualityTier, style, customNote,
    projectsContext, hadVerifiedImageContext, enrichedContext, webContext
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
  const model = process.env.AI_GATEWAY_GENERATION_MODEL || plan.model || GENERATION_MODEL;
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI_GATEWAY_NOT_CONFIGURED" }, { status: 500 });
  }
  const masterpiece = plan.qualityTier === "masterpiece";
  // Keep enough entropy for human variation while Grok context keeps it grounded.
  const temperature = isRegenerate ? 0.72 : masterpiece ? 0.58 : 0.55;
  const maxTokens = masterpiece ? 420 : 360;

  let gatewayResp: Response;
  try {
    gatewayResp = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          userMessage
        ],
        temperature,
        max_tokens: maxTokens
      }),
      signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS)
    });
  } catch {
    return NextResponse.json({ error: "UPSTREAM" }, { status: 502 });
  }

  if (!gatewayResp.ok) {
    const errBody = await gatewayResp.text().catch(() => "");
    console.error("AI provider error:", gatewayResp.status, errBody);
    return NextResponse.json({ error: "UPSTREAM" }, { status: 502 });
  }

  const data = await gatewayResp.json().catch(() => null);
  const raw = data?.choices?.[0]?.message?.content || "";
  const generationUsage = await usageFromOpenAIResponse("gpt-reply", model, data);
  aiUsage = addUsage(aiUsage, generationUsage);

  let suggestions = sanitizeSuggestions(parseSuggestions(raw), context);
  if (suggestions.length < MIN_REPLY_COUNT) {
    const repair = await repairSuggestions({
      apiKey,
      model,
      context,
      rawSuggestions: parseSuggestions(raw),
      previousSuggestions,
      isRegenerate
    });
    suggestions = repair.suggestions;
    aiUsage = addUsage(aiUsage, repair.usage);
  }
  if (suggestions.length < MIN_REPLY_COUNT) {
    suggestions = sanitizeSuggestions(parseSuggestions(raw).map(forceShortReply), context);
  }
  if (!suggestions.length) {
    return NextResponse.json({ error: "EMPTY_SUGGESTIONS" }, { status: 502 });
  }

  const ctxHash = crypto.createHash("sha256").update(context).digest("hex").slice(0, 32);
  const writeStarted = nowMs();
  await Promise.all([
    prisma.generation.create({
      data: {
        userId, contextHash: ctxHash, suggestions: suggestions as any,
        inputTokens: Math.round(aiUsage.inputTokens),
        outputTokens: Math.round(aiUsage.outputTokens),
        costUSD: aiUsage.costUSD.toFixed(6),
        model: "GPT + Grok + Gemini",
        hadImage: hadVerifiedImageContext
      }
    }),
    prisma.usageLog.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, count: 1 },
      update: { count: { increment: 1 } }
    })
  ]);
  const writeMs = nowMs() - writeStarted;

  console.log("[generate]", requestId, "plan=", plan.key, "total=", nowMs() - requestStarted,
    "db=", dbMs, "image=", imageMs, "enrich=", enrichMs, "personalization=", personalizationMs,
    "write=", writeMs, "vision=", hadVerifiedImageContext, "grok=", enrichment.searchUsed, "gemini=", webSearch.used,
    "aiTokens=", aiUsage.inputTokens + aiUsage.outputTokens, "aiCost=", aiUsage.costUSD.toFixed(6),
    "aiCalls=", aiUsage.calls.length);

  return NextResponse.json({
    suggestions,
    usage: { used: usageCount + 1, limit: plan.dailyLimit, plan: sub.plan },
    aiStack: "GPT + Grok + Gemini",
    visionUsed: hadVerifiedImageContext,
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

function isListLikeContext(context: string) {
  const lines = context.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const bulletish = lines.filter((line) => /^[-*~•]|\d+[.)]\s|[@$][a-z0-9_]+/i.test(line)).length;
  const symbolCount = (context.match(/[@$][A-Za-z0-9_]+/g) || []).length;
  return bulletish >= 3 || symbolCount >= 4 || /\btop\s+\d+|watchlist|finalists|rankings?\b/i.test(context);
}

function isShortHumanReply(reply: string, context: string) {
  const trimmed = reply.trim();
  if (!trimmed) return false;
  if (trimmed.length > MAX_REPLY_CHARS) return false;
  if (trimmed.split(/\s+/).length > 26) return false;
  if (!isListLikeContext(context) && /(^|\n)\s*(~|-|\d+[.)])\s/.test(trimmed)) return false;
  if (!isListLikeContext(context) && trimmed.split("\n").filter(Boolean).length > 2) return false;
  if ((trimmed.match(/,/g) || []).length > 1 && trimmed.length > 110) return false;
  return true;
}

function sanitizeSuggestions(list: string[], context: string): string[] {
  const cleaned = list
    .map(stripEmojis)
    .map(cleanReply)
    .filter((s) => isShortHumanReply(s, context))
    .filter((s) => isAllowedReply(s, context));

  return dedupeReplyOpeners(cleaned).slice(0, 4);
}

function forceShortReply(reply: string) {
  const firstLine = cleanReply(reply).split(/\n+/).find((line) => line.trim() && !/^\s*(~|-|\d+[.)])\s/.test(line)) || "";
  const firstSentence = firstLine.split(/(?<=[.!])\s+/)[0] || firstLine;
  const words = firstSentence.trim().split(/\s+/).slice(0, 18).join(" ");
  return words.length > MAX_REPLY_CHARS ? words.slice(0, MAX_REPLY_CHARS - 1).trim() : words;
}

async function repairSuggestions({
  apiKey,
  model,
  context,
  rawSuggestions,
  previousSuggestions,
  isRegenerate
}: {
  apiKey: string;
  model: string;
  context: string;
  rawSuggestions: string[];
  previousSuggestions: string[];
  isRegenerate: boolean;
}): Promise<RepairResult> {
  try {
    const resp = await fetch(AI_GATEWAY_URL, {
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
            content: `Rewrite bad X replies into 4 short human replies.

Rules:
- each reply under ${MAX_REPLY_CHARS} chars, aim 8-16 words
- one sentence each
- no bullets, no lists, no explanation
- no questions at the end
- sound like a real person with a small opinion
- keep only names/handles/claims visible in the tweet`
          },
          {
            role: "user",
            content: `Tweet:\n"""\n${context}\n"""\n\nBad/long replies:\n${rawSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}${isRegenerate && previousSuggestions.length ? `\n\nAvoid these previous replies:\n${previousSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : ""}\n\nReturn JSON only: {"suggestions":["...","...","...","..."]}`
          }
        ],
        temperature: 0.45,
        max_tokens: 280
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (!resp.ok) return { suggestions: [], usage: emptyUsage() };
    const data = await resp.json().catch(() => null);
    const raw = data?.choices?.[0]?.message?.content || "";
    const usage = await usageFromOpenAIResponse("gpt-repair", model, data);
    return { suggestions: sanitizeSuggestions(parseSuggestions(raw), context), usage };
  } catch {
    return { suggestions: [], usage: emptyUsage() };
  }
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
