import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "./db";
import { verifyToken } from "./jwt";

export const COOKIE_NAME = "nurxai_session";

export async function getSessionFromCookies() {
  const c = (await cookies()).get(COOKIE_NAME);
  if (!c?.value) return null;
  return await verifyToken(c.value);
}

export async function getSessionFromAuthHeader(req: NextRequest) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7).trim() : req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifyToken(token);
}

export async function getAuthUserFromHeader(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
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
