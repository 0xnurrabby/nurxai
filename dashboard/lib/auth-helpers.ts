import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { verifyToken } from "./jwt";

export const COOKIE_NAME = "nurxai_session";

export async function getSessionFromCookies() {
  const c = cookies().get(COOKIE_NAME);
  if (!c?.value) return null;
  return await verifyToken(c.value);
}

export async function getSessionFromAuthHeader(req: NextRequest) {
  const a = req.headers.get("authorization") || "";
  if (!a.startsWith("Bearer ")) return null;
  return await verifyToken(a.slice(7));
}
