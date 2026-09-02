import { SignJWT, jwtVerify } from "jose";

export type SessionToken = { sub: string; email: string; sv?: number };

function signingSecret() {
  const value = process.env.JWT_SECRET;
  if (!value || new TextEncoder().encode(value).length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 bytes.");
  }
  return new TextEncoder().encode(value);
}

export async function signToken(payload: SessionToken, expiresIn = "30d") {
  return await new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(signingSecret());
}

export async function verifyToken(token: string): Promise<SessionToken | null> {
  try {
    const { payload } = await jwtVerify(token, signingSecret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    if (payload.sv !== undefined && (!Number.isInteger(payload.sv) || Number(payload.sv) < 0)) return null;
    return { sub: payload.sub, email: payload.email, sv: payload.sv as number | undefined };
  } catch {
    return null;
  }
}
