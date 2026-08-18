import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { decodeJwt } from "jose";
import { prisma } from "./db";
import { verifyToken } from "./jwt";

export const COOKIE_NAME = "nurxai_session";
const LEGACY_STORE_VERSION = "2.0.17";
const LEGACY_AUTH_CHECK_URL = "https://nurxai.nurw3b.workers.dev/api/announcements";

type Session = { sub: string; email: string };

declare global {
  // eslint-disable-next-line no-var
  var __nurxaiLegacyExtensionSessions: Map<string, { session: Session | null; expiresAt: number }> | undefined;
}

const legacySessions = globalThis.__nurxaiLegacyExtensionSessions ??
  (globalThis.__nurxaiLegacyExtensionSessions = new Map());

class LegacyExtensionAuthUnavailableError extends Error {
  constructor() {
    super("Legacy extension authentication is temporarily unavailable.");
    this.name = "LegacyExtensionAuthUnavailableError";
  }
}

function cacheLegacySession(cacheKey: string, session: Session | null, expiresAt: number) {
  if (legacySessions.size >= 1000) legacySessions.clear();
  legacySessions.set(cacheKey, { session, expiresAt });
}

async function tokenFingerprint(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyLegacyStoreExtensionToken(req: NextRequest, token: string): Promise<Session | null> {
  if (process.env.VERCEL !== "1" || req.headers.get("x-client-version") !== LEGACY_STORE_VERSION) return null;
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return null;

  const cacheKey = await tokenFingerprint(token);
  const cached = legacySessions.get(cacheKey);
  if (cached?.expiresAt && cached.expiresAt > Date.now()) return cached.session;
  if (cached) legacySessions.delete(cacheKey);

  let session: Session;
  let tokenExpiresAt: number;
  try {
    const payload = decodeJwt(token);
    const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
    const email = typeof payload.email === "string" ? payload.email.toLowerCase().trim() : "";
    tokenExpiresAt = Number(payload.exp) * 1000;
    if (!sub || sub.length > 200 || !email || email.length > 320) return null;
    if (!Number.isFinite(tokenExpiresAt) || tokenExpiresAt <= Date.now()) return null;
    session = { sub, email };
  } catch {
    return null;
  }

  try {
    const response = await fetch(LEGACY_AUTH_CHECK_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Client-Version": LEGACY_STORE_VERSION
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(6000)
    });
    if (response.status === 401 || response.status === 403 || response.status === 426) {
      cacheLegacySession(cacheKey, null, Date.now() + 30_000);
      return null;
    }
    if (!response.ok) throw new LegacyExtensionAuthUnavailableError();
    await response.body?.cancel();

    cacheLegacySession(cacheKey, session, Math.min(tokenExpiresAt, Date.now() + 5 * 60 * 1000));
    return session;
  } catch (error) {
    if (error instanceof LegacyExtensionAuthUnavailableError) throw error;
    throw new LegacyExtensionAuthUnavailableError();
  }
}

export async function getSessionFromCookies() {
  const c = (await cookies()).get(COOKIE_NAME);
  if (!c?.value) return null;
  return await verifyToken(c.value);
}

export async function getSessionFromAuthHeader(req: NextRequest) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7).trim() : "";
  if (!token) return null;
  return await verifyToken(token) || await verifyLegacyStoreExtensionToken(req, token);
}

async function getAuthUserFromSession(session: Session | null) {
  if (!session?.sub && !session?.email) return null;
  const select = { id: true, email: true, name: true, isAdmin: true };

  if (session.sub) {
    const user = await prisma.user.findUnique({ where: { id: session.sub }, select });
    if (user) return { session, user };
  }

  const email = session.email?.toLowerCase().trim();
  if (!email) return null;

  const user = await prisma.user.findUnique({ where: { email }, select });
  if (!user) return null;

  return { session, user };
}

export async function getAuthUserFromHeader(req: NextRequest) {
  return getAuthUserFromSession(await getSessionFromAuthHeader(req));
}

export async function getAuthUserFromCookies() {
  return getAuthUserFromSession(await getSessionFromCookies());
}
