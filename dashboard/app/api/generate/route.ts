import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUserFromHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { getSubscriptionDailyLimit } from "@/lib/subscription-limits";
import { requireSupportedExtensionVersion } from "@/lib/extension-version";
import { getCurrentSubscriptionForUser } from "@/lib/billing";
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
const ENRICH_MAX_TOKENS = getEnvInt("AI_GATEWAY_ENRICH_MAX_TOKENS", 260, 120, 450);
const SEARCH_TIMEOUT_MS = getEnvInt("AI_GATEWAY_SEARCH_TIMEOUT_MS", 9000, 3000, 20000);
const SEARCH_PROMPT_CHARS = getEnvInt("AI_GATEWAY_SEARCH_PROMPT_CHARS", 280, 160, 700);
const SEARCH_MAX_OUTPUT_TOKENS = getEnvInt("AI_GATEWAY_SEARCH_MAX_OUTPUT_TOKENS", 55, 32, 120);
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

function formatAiStack(usage: AiUsage) {
  const labels = new Set<string>();
  for (const call of usage.calls) {
    if (call.stage.startsWith("gpt")) labels.add("GPT");
    else if (call.stage.startsWith("grok")) labels.add("Grok");
    else if (call.stage.startsWith("gemini")) labels.add("Gemini");
  }
  return labels.size ? [...labels].join(" + ") : "GPT";
}

function estimateCost(model: string, inputTokens: number, outputTokens: number) {
  const price = PRICES[model] || PRICES[GENERATION_MODEL];
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

function gatewayRequestHeaders(apiKey: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "ai-gateway-protocol-version": "0.0.1"
  };
  const o11y: Array<[string, string]> = [
    ["VERCEL_DEPLOYMENT_ID", "ai-o11y-deployment-id"],
    ["VERCEL_ENV", "ai-o11y-environment"],
    ["VERCEL_REGION", "ai-o11y-region"],
    ["VERCEL_PROJECT_ID", "ai-o11y-project-id"]
  ];
  for (const [envName, headerName] of o11y) {
    const value = process.env[envName];
    if (value) headers[headerName] = value;
  }
  return headers;
}

function gatewayGenerationId(metadata: unknown): string | undefined {
  const id = (metadata as any)?.gateway?.generationId;
  return typeof id === "string" && id.startsWith("gen_") ? id : undefined;
}

async function usageFromGatewayInfo(stage: string, model: string, generationId?: string): Promise<AiUsage | null> {
  if (!generationId) return null;
  try {
    const info = await gateway.getGenerationInfo({ id: generationId });
    const inputTokens = Number(info.promptTokens || 0);
    const outputTokens = Number(info.completionTokens || 0) + Number(info.reasoningTokens || 0);
    const gatewayCost = Number(info.totalCost ?? info.usage);
    const costUSD = Number.isFinite(gatewayCost) ? gatewayCost : estimateCost(info.model || model, inputTokens, outputTokens);
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

async function enrichContext(tweetText: string, imageParts: ImagePart[], plan: Plan): Promise<EnrichmentResult> {
  if (!plan.vision) return { text: null, imageUsed: false, searchUsed: false, usage: emptyUsage() };
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
          headers: gatewayRequestHeaders(apiKey),
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
            max_tokens: ENRICH_MAX_TOKENS
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
    /https?:\/\/|\$[A-Za-z][A-Za-z0-9_]{1,12}\b|\b(today|yesterday|tomorrow|now|latest|just|breaking|announce|announced|launch|launched|airdrop|claim|mint|mainnet|testnet|partnership|hack|exploit|listing|delist|token|price|market|funding|acquired|merger|sec|etf|fed|cpi|fomc|earnings|lawsuit)\b/i.test(line)
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

  const hasUrl = /https?:\/\//i.test(searchable);
  const hasTicker = /\$[A-Za-z][A-Za-z0-9_]{1,12}\b/.test(searchable);
  const hasCurrentSignal =
    /\b(today|yesterday|tomorrow|now|latest|breaking|just|announced|launch(?:ed|ing)?|airdrop|claim|mint|mainnet|testnet|partnership|hack|exploit|listing|delist|price|market|funding|acquired|merger|sec|etf|fed|cpi|fomc|election|lawsuit|earnings|vote|snapshot)\b/i.test(searchable);
  const hasEntitySignal = /https?:\/\/|\$[A-Za-z][A-Za-z0-9_]{1,12}\b|@[A-Za-z0-9_]{2,20}\b|\b[A-Z][A-Za-z0-9]{2,}\b/.test(searchable);

  return hasUrl || hasTicker || (hasCurrentSignal && hasEntitySignal);
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

function isPrivateIPv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 0
  );
}

function isSafeImageUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (host.includes(":")) return false;
    if (isPrivateIPv4(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function imageCandidates(url: string) {
  if (!isSafeImageUrl(url)) return [];
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
  const urls = rawImageUrls.filter(isSafeImageUrl).slice(0, limit);
  if (!urls.length) return { imageParts: [], imagesInlined: 0, imagesUrlFallback: 0 };
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

  return `You write public X/Twitter replies as a real person with taste.

Goal: 4 usable reply options that sound like different human instincts on the same post.
Not a summary. Not a review. Not a caption. Not "AI slop".

${masterpiece
    ? "You are fluent in crypto, tech, markets, product, and internet culture. You notice the real lever, risk, or tell. You do not force cleverness."
    : "You know the internet well. You react with a clean personal take, not a report."}

LANGUAGE
- Detect the language(s) of the original post.
- Write every reply in that same language.
- If the post mixes languages, match the dominant public-facing language and keep proper nouns/handles as written.
- Preserve the post's register: casual stays casual, sharp stays sharp, technical stays technical.
- Never translate into English unless the post is English.

VOICE
- Sound like a founder, operator, trader, builder, or sharp reply guy who actually has a take.
- Prefer lived judgment over polished phrasing.
- First person only when it feels natural. Not every reply needs "I".
- Specific beats clever. Concrete beats abstract.
- Short is good. Flat is bad. Template is worse.

WHAT GOOD REPLIES DO
Pick a real angle from the post, then do one of these:
1. Name the real lever / bottleneck / unlock.
2. Point at the part that actually matters more than the headline.
3. Add a practical caveat without killing the point.
4. Make a clean personal call: what you'd watch, ship, ignore, or double down on.
5. React to a concrete image/detail if the image is doing real work.

WHAT BAD REPLIES DO
- Rephrase the post.
- Praise the poster ("great point", "love this", "this is huge").
- Use the same skeleton 4 times with different nouns.
- Invent projects, products, people, numbers, or motives not present in the tweet/context.
- End with fishing questions.
- Sound like an assistant evaluating content.

HARD BANS
Never use these tells:
"game-changer", "leveling up", "stepping up", "next level", "this changes everything",
"interesting to see", "curious about", "wonder about", "watching closely", "keen to see",
"any news driving this", "how's the", "thoughts on", "worth keeping an eye",
"Love that", "Love this", "Great point", "Absolutely", "Indeed", "Props for", "Kudos",
"this is huge", "this is wild", "massive if true", "can't wait to see",
"solid move", "makes sense", "that's a big bet", "ambitious projections",
"movers and shakers", "some serious momentum", "no joke", "is no joke",
"vibes", "heating up", "ride the wave", "could ride", "might be the ticket",
"intriguing combo", "the future", "huge boost", "potential is clear", "real game changer",
"sounds like", "captures the essence", "set the stage", "pivotal moment", "your journey",
"serious commitment", "impact is evident", "worth a deeper dive",
"feels like", "ngl", "curious to see", "nice to see", "strong move", "big unlock",
"the part i'd bet on", "the part i'd care about", "the real test is", "the real edge is",
"the only part i'd", "the part i'd actually", "i'd bet on", "tbh"

Also ban these sentence molds even if the nouns change:
- "the X is the part i'd ..."
- "X is the part i'd bet on ..."
- "the real test is whether ..."
- "X matters more than Y, tbh"
- "i'd take X over Y every time"

ANTI-TEMPLATE RULES
- Do not start 2+ replies with the same 2-3 words.
- Do not reuse "i'd", "tbh", "fr", "the real", "the only", "matters more" across the batch.
- Across the 4 replies, vary sentence shape:
  one direct judgment, one concrete detail reaction, one tradeoff/caveat, one short instinct call.
- No more than one reply may begin with "I" / "I'd" / "I'm".
- Max one reply may use filler like "fr" if the post is already casual. Prefer zero.
- Never force a house style. Different posts need different energy.

LENGTH / SHAPE
- Default: 1 sentence, roughly 6-18 words, under ${MAX_REPLY_CHARS} chars.
- Use 2 short lines only if the post itself is list-like or the contrast is cleaner that way.
- No emojis.
- No em dash.
- No trailing unanswered question.
- No quotation marks wrapping the whole reply.
- Bullets / "~" stacks only if the original post is clearly a list/watchlist/ranking.

GROUNDING
- Use only the visible tweet and verified background below.
- Every reply must attach to a concrete phrase, number, product, handle, claim, or image detail.
- Prefer exact visible @handles over display names.
- If context is thin, stay broad and literal. Do not invent specifics.
- If an image is present and verified, at least 1-2 replies can use a real visual detail. Never invent one.

${hasImage ? `IMAGE
Use the verified visual context. Reference only details that are actually there: numbers, UI labels, chart direction, jersey color, product screen, etc.
Never say "nice pic". Never claim you personally inspected anything beyond the verified context.` : ""}

${styleInstruction(style, customNote) !== "Casual, direct, like a smart friend in the space." ? `STYLE
${styleInstruction(style, customNote)}` : ""}
${grokContext ? `GROK CONTEXT (use silently if relevant)
${grokContext}` : ""}
${webContext ? `WEB CONTEXT (use silently if relevant)
${webContext}` : ""}
${projectsContext ? `USER EXPERTISE
${projectsContext}` : ""}

OUTPUT
Return JSON only:
{"suggestions": ["reply 1", "reply 2", "reply 3", "reply 4"]}
4 distinct human replies. Same language as the post. No explanation.`;
}

// ─── Main Route ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const requestStarted = nowMs();
  const requestId = crypto.randomUUID().slice(0, 8);
  const versionBlock = requireSupportedExtensionVersion(req, { requireHeader: true });
  if (versionBlock) return versionBlock;
  const [auth, body] = await Promise.all([
    getAuthUserFromHeader(req),
    req.json().catch(() => ({}))
  ]);
  if (!auth?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const userId = auth.user.id;

  let context = String(body?.context || "").trim();
  if (!context) return NextResponse.json({ error: "EMPTY_CONTEXT" }, { status: 400 });
  context = context.slice(0, MAX_CTX);
  await ensureRuntimeSchema();

  const rawImageUrls: string[] = Array.isArray(body?.imageUrls)
    ? body.imageUrls.filter((u: any) => typeof u === "string").slice(0, 4)
    : [];

  const day = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const dbStarted = nowMs();
  const [sub, usage] = await Promise.all([
    getCurrentSubscriptionForUser(userId, prisma, now),
    prisma.usageLog.findUnique({
      where: { userId_day: { userId, day } },
      select: { count: true }
    })
  ]);
  const dbMs = nowMs() - dbStarted;
  if (!sub) return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 402 });

  const plan = PLANS[sub.plan as PlanKey];
  if (!plan) return NextResponse.json({ error: "BAD_PLAN" }, { status: 402 });
  const dailyLimit = getSubscriptionDailyLimit(sub);

  const usageCount = usage?.count ?? 0;
  if (usageCount >= dailyLimit) {
    return NextResponse.json({ error: "QUOTA_EXCEEDED", limit: dailyLimit }, { status: 429 });
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
    enrichContext(context, imagePrep.imageParts, plan),
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
    ? `\n\nPrevious suggestions already used for this post. Write 4 fresh ones with totally different openings, rhythms, and angles. Do not reuse phrases like "i'd bet", "tbh", "the real test", or any opener from the list below:\n${previousSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
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
  // Slightly higher entropy reduces template collapse; grounding still comes from context.
  const temperature = isRegenerate ? 0.9 : masterpiece ? 0.78 : 0.74;
  const maxTokens = masterpiece ? 480 : 420;

  let gatewayResp: Response;
  try {
    gatewayResp = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: gatewayRequestHeaders(apiKey),
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
  const aiStack = formatAiStack(aiUsage);
  const writeStarted = nowMs();
  await prisma.$transaction(async (tx) => {
    await tx.generation.create({
      data: {
        userId,
        contextHash: ctxHash,
        suggestions: [] as any,
        usageDetails: {
          inputTokens: Math.round(aiUsage.inputTokens),
          outputTokens: Math.round(aiUsage.outputTokens),
          costUSD: Number(aiUsage.costUSD.toFixed(6)),
          calls: aiUsage.calls.map((call) => ({
            ...call,
            inputTokens: Math.round(call.inputTokens),
            outputTokens: Math.round(call.outputTokens),
            costUSD: Number(call.costUSD.toFixed(6))
          }))
        } as any,
        inputTokens: Math.round(aiUsage.inputTokens),
        outputTokens: Math.round(aiUsage.outputTokens),
        costUSD: aiUsage.costUSD.toFixed(6),
        model: aiStack,
        hadImage: hadVerifiedImageContext
      }
    });

    await tx.usageLog.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, count: 1 },
      update: { count: { increment: 1 } }
    });

  });
  const writeMs = nowMs() - writeStarted;

  console.log("[generate]", requestId, "plan=", plan.key, "total=", nowMs() - requestStarted,
    "db=", dbMs, "image=", imageMs, "enrich=", enrichMs, "personalization=", personalizationMs,
    "write=", writeMs, "vision=", hadVerifiedImageContext, "grok=", enrichment.searchUsed, "gemini=", webSearch.used,
    "aiTokens=", aiUsage.inputTokens + aiUsage.outputTokens, "aiCost=", aiUsage.costUSD.toFixed(6),
    "aiCalls=", aiUsage.calls.length);

  return NextResponse.json({
    suggestions,
    usage: { used: usageCount + 1, limit: dailyLimit, plan: sub.plan },
    aiStack,
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
      headers: gatewayRequestHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `Rewrite bad X replies into 4 short human replies.

Rules:
- match the original post language exactly
- each reply under ${MAX_REPLY_CHARS} chars, aim 6-16 words
- one sentence each unless a clean two-line contrast is better
- no bullets, no lists, no explanation
- no questions at the end
- no template openers like "i'd bet", "tbh", "the real test", "the part i'd"
- sound like different real people with distinct instincts
- keep only names/handles/claims visible in the tweet`
          },
          {
            role: "user",
            content: `Tweet:\n"""\n${context}\n"""\n\nBad/long replies:\n${rawSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}${isRegenerate && previousSuggestions.length ? `\n\nAvoid these previous replies:\n${previousSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : ""}\n\nReturn JSON only: {"suggestions":["...","...","...","..."]}`
          }
        ],
        temperature: 0.7,
        max_tokens: 340
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
    "potential is clear",
    "i d bet",
    "id bet",
    "i would bet",
    "the part i d",
    "the part id",
    "the only part i d",
    "the only part id",
    "the real test is",
    "the real edge is",
    "the real unlock",
    "the underrated bit",
    "the underrated part",
    "matters more than",
    "every time",
    "tbh"
  ];
  const bannedPatterns = [
    /\bthe\b.+\bpart i(?:'|\u2019)?d\b/i,
    /\bi(?:'|\u2019)?d bet\b/i,
    /\bthe real (?:test|edge|unlock|issue|lever)\b/i,
    /\bmatters more than\b/i,
    /\bevery time\b/i,
    /\btbh\b/i
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
  if (bannedPatterns.some((pattern) => pattern.test(reply))) return false;
  if (leakedPromptPhrases.some(phrase => normalizedReply.includes(phrase))) return false;

  const contextSymbols = new Set(normalizedContext.match(/[@$][a-z0-9_]+/g) || []);
  const replySymbols = normalizedReply.match(/[@$][a-z0-9_]+/g) || [];
  if (replySymbols.some(symbol => !contextSymbols.has(symbol))) return false;

  return true;
}

function replyOpenerKey(reply: string): string {
  return normalizeForCompare(reply).split(" ").slice(0, 3).join(" ");
}

function replySkeleton(reply: string): string {
  return normalizeForCompare(reply)
    .replace(/[@$][a-z0-9_]+/g, "#entity")
    .replace(/\b\d+(?:\.\d+)?%?\b/g, "#num")
    .replace(/\b(?:i|id|im|my|me|we|our)\b/g, "#self")
    .replace(/\b(?:the|a|an|and|or|to|of|for|on|in|is|are|that|this|it)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeReplyOpeners(replies: string[]): string[] {
  const seenOpeners = new Set<string>();
  const seenSkeletons = new Set<string>();
  let firstPersonCount = 0;

  return replies.filter((reply) => {
    const opener = replyOpenerKey(reply);
    if (!opener) return false;
    if (seenOpeners.has(opener)) return false;

    const skeleton = replySkeleton(reply);
    if (skeleton && seenSkeletons.has(skeleton)) return false;

    const startsFirstPerson = /^(i|i'd|i\u2019m|im|i am|my)\b/i.test(reply.trim());
    if (startsFirstPerson) {
      if (firstPersonCount >= 1) return false;
      firstPersonCount += 1;
    }

    seenOpeners.add(opener);
    if (skeleton) seenSkeletons.add(skeleton);
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
