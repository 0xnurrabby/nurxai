import { NextRequest, NextResponse } from "next/server";

type Bucket = {
  count: number;
  resetAt: number;
};

type RatePolicy = {
  name: string;
  windowMs: number;
  max: number;
  bodyLimitBytes: number;
  keyByAuth?: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __nurxaiRateBuckets: Map<string, Bucket> | undefined;
}

const buckets = globalThis.__nurxaiRateBuckets ?? (globalThis.__nurxaiRateBuckets = new Map());
const MINUTE = 60 * 1000;

function clientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "unknown";
}

function authKey(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return "";
  const token = auth.slice(7).trim();
  if (!token) return "";
  return `bearer:${token.slice(-32)}`;
}

function ratePolicy(pathname: string, method: string): RatePolicy {
  if (pathname === "/api/billing/webhook") {
    return { name: "webhook", windowMs: MINUTE, max: 120, bodyLimitBytes: 256 * 1024 };
  }
  if (pathname.startsWith("/api/auth/")) {
    return { name: "auth", windowMs: 15 * MINUTE, max: 5, bodyLimitBytes: 32 * 1024 };
  }
  if (pathname === "/api/generate") {
    // High enough for multi-tab / multi-user reply bursts. Plan daily quota still gates usage.
    return { name: "ai", windowMs: MINUTE, max: 120, bodyLimitBytes: 256 * 1024, keyByAuth: true };
  }
  if (pathname === "/api/chat") {
    return { name: "chat", windowMs: MINUTE, max: 30, bodyLimitBytes: 32 * 1024, keyByAuth: true };
  }
  if (pathname.startsWith("/api/admin/")) {
    return { name: "admin", windowMs: MINUTE, max: 120, bodyLimitBytes: 512 * 1024, keyByAuth: true };
  }
  if (pathname === "/api/settings") {
    return { name: "settings", windowMs: MINUTE, max: 60, bodyLimitBytes: 180 * 1024, keyByAuth: true };
  }
  if (pathname.startsWith("/api/billing/")) {
    return { name: "billing", windowMs: MINUTE, max: 30, bodyLimitBytes: 64 * 1024, keyByAuth: true };
  }
  if (method !== "GET" && method !== "HEAD") {
    return { name: "write", windowMs: MINUTE, max: 60, bodyLimitBytes: 256 * 1024, keyByAuth: true };
  }
  return { name: "read", windowMs: MINUTE, max: 180, bodyLimitBytes: 64 * 1024, keyByAuth: true };
}

function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function tooLarge(req: NextRequest, limit: number) {
  const raw = req.headers.get("content-length");
  if (!raw) return false;
  const length = Number(raw);
  return Number.isFinite(length) && length > limit;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const policy = ratePolicy(pathname, req.method);

  if (tooLarge(req, policy.bodyLimitBytes)) {
    return NextResponse.json(
      { error: "PAYLOAD_TOO_LARGE", message: "Request body is too large." },
      { status: 413 }
    );
  }

  const now = Date.now();
  prune(now);
  const identity = policy.keyByAuth ? authKey(req) || clientIp(req) : clientIp(req);
  const key = `${policy.name}:${identity}`;
  const current = buckets.get(key);
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + policy.windowMs };
  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > policy.max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many requests. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(policy.max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000))
        }
      }
    );
  }

  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Limit", String(policy.max));
  res.headers.set("X-RateLimit-Remaining", String(Math.max(0, policy.max - bucket.count)));
  res.headers.set("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
  return res;
}

export const config = {
  matcher: "/api/:path*"
};
