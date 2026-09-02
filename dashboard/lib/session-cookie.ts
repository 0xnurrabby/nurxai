import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth-helpers";

const THIRTY_DAYS = 30 * 24 * 60 * 60;

function sessionCookieOptions(maxAge: number) {
  const domain = process.env.SESSION_COOKIE_DOMAIN?.trim().replace(/^\./, "");
  const secureSetting = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  const secure = process.env.NODE_ENV === "production" || secureSetting === "true";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    ...(domain ? { domain } : {})
  };
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, sessionCookieOptions(THIRTY_DAYS));
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", sessionCookieOptions(0));
  return response;
}
