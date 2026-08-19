import crypto from "node:crypto";
import { canonicalSourceLanguage } from "@/lib/generation-language";

const OPERATION_PATTERN = /^[a-zA-Z0-9_-]{16,128}$/;

export function isPaygOperationId(value: unknown): value is string {
  return typeof value === "string" && OPERATION_PATTERN.test(value);
}

export function paygRequestHash(body: any) {
  const sourceLanguage = canonicalSourceLanguage(body?.sourceLanguage);
  const normalized = {
    context: String(body?.context || "").trim().slice(0, 1500),
    imageUrls: Array.isArray(body?.imageUrls)
      ? body.imageUrls.filter((value: unknown) => typeof value === "string").slice(0, 4)
      : [],
    regenerate: Boolean(body?.regenerate),
    previousSuggestions: Array.isArray(body?.previousSuggestions)
      ? body.previousSuggestions.filter((value: unknown) => typeof value === "string").slice(0, 12)
      : [],
    ...(sourceLanguage ? { sourceLanguage } : {})
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function grantSecret() {
  const secret = process.env.PAYG_INTERNAL_SECRET;
  if (!secret || secret.length < 32) throw new Error("PAYG internal signing secret is not configured.");
  return secret;
}

export function createPaygGrant(input: {
  operationId: string;
  userId: string;
  requestHash: string;
  leaseToken: string;
}) {
  const payload = Buffer.from(JSON.stringify({
    ...input,
    expiresAt: Date.now() + 5 * 60 * 1000
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", grantSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyPaygGrant(
  raw: string | null,
  expected: { userId: string; requestHash: string }
) {
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  const expectedSignature = crypto.createHmac("sha256", grantSecret()).update(payload).digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actualSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(actualSignature, expectedSignature)) {
    return null;
  }
  try {
    const grant = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      !isPaygOperationId(grant.operationId) ||
      grant.userId !== expected.userId ||
      grant.requestHash !== expected.requestHash ||
      !/^[a-f0-9]{32}$/.test(grant.leaseToken || "") ||
      !Number.isFinite(grant.expiresAt) ||
      grant.expiresAt < Date.now()
    ) return null;
    return grant as {
      operationId: string;
      userId: string;
      requestHash: string;
      leaseToken: string;
      expiresAt: number;
    };
  } catch {
    return null;
  }
}
