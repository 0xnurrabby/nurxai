import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromCookies } from "@/lib/auth-helpers";
import { signToken } from "@/lib/jwt";
import { isAdminEmail } from "@/lib/admin";
import { setSessionCookie } from "@/lib/session-cookie";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const auth = await getAuthUserFromCookies();
  if (!auth?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const user = auth.user;
  const token = await signToken({ sub: user.id, email: user.email, sv: user.sessionVersion });
  return setSessionCookie(NextResponse.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isAdmin: isAdminEmail(user.email)
    }
  }), token);
}
