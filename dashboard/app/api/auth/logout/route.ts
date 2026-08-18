import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session-cookie";
export const runtime = "nodejs";
export async function POST() {
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
