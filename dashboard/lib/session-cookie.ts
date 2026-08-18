import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth-helpers";

const THIRTY_DAYS = 30 * 24 * 60 * 60;

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    domain: "nurxai.xyz",
    maxAge: THIRTY_DAYS
  });
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    domain: "nurxai.xyz",
    maxAge: 0
  });
  return response;
}
