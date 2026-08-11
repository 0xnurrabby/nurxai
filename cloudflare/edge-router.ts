type AppService = {
  fetch(request: Request): Promise<Response>;
};

type RoutingStore = {
  get(key: string): Promise<string | null>;
};

type Env = {
  APP: AppService;
  ROUTING: RoutingStore;
  VERCEL_ORIGIN: string;
};

type WorkerContext = {
  passThroughOnException(): void;
};

const MODE_KEY = "production-mode";
const MODE_CACHE_MS = 5 * 60 * 1000;
let cachedMode: "cloudflare" | "vercel" = "vercel";
let modeExpiresAt = 0;

async function routingMode(env: Env) {
  const now = Date.now();
  if (modeExpiresAt > now) return cachedMode;

  try {
    const stored = await env.ROUTING.get(MODE_KEY);
    cachedMode = stored === "cloudflare" ? "cloudflare" : "vercel";
  } catch {
    cachedMode = "vercel";
  }
  modeExpiresAt = now + MODE_CACHE_MS;
  return cachedMode;
}

function vercelRequest(request: Request, origin: string) {
  const target = new URL(request.url);
  const fallback = new URL(origin);
  target.protocol = fallback.protocol;
  target.host = fallback.host;

  const headers = new Headers(request.headers);
  headers.set("x-forwarded-host", new URL(request.url).host);
  return new Request(target, { method: request.method, headers, body: request.body, redirect: "manual" });
}

function markOrigin(response: Response, origin: "cloudflare" | "vercel") {
  const headers = new Headers(response.headers);
  headers.set("x-nurxai-origin", origin);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function fetchVercel(request: Request, env: Env) {
  return markOrigin(await fetch(vercelRequest(request, env.VERCEL_ORIGIN)), "vercel");
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerContext) {
    // If the lightweight router itself fails, Cloudflare can still reach the DNS origin.
    ctx.passThroughOnException();

    if (await routingMode(env) !== "cloudflare") {
      return fetchVercel(request, env);
    }

    try {
      const response = await env.APP.fetch(request);
      const canRetry = request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS";
      if (canRetry && response.status >= 500) return fetchVercel(request, env);
      return markOrigin(response, "cloudflare");
    } catch {
      const canRetry = request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS";
      if (canRetry) return fetchVercel(request, env);
      return Response.json(
        { error: "SERVICE_TEMPORARILY_UNAVAILABLE", message: "Please retry this request shortly." },
        { status: 503, headers: { "Retry-After": "5", "x-nurxai-origin": "cloudflare" } }
      );
    }
  }
};
