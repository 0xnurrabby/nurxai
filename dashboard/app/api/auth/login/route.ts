import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/jwt";
import { isAdminEmail } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { setSessionCookie } from "@/lib/session-cookie";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await ensureRuntimeSchema();
    const { email, password } = await req.json();
    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "MISSING" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true, passwordHash: true, name: true, avatarUrl: true, isAdmin: true }
    });
    if (!user) return NextResponse.json({ error: "INVALID" }, { status: 401 });
    if (!user.passwordHash) {
      return NextResponse.json({ error: "USE_GOOGLE_LOGIN" }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "INVALID" }, { status: 401 });

    await prisma.auditLog.create({ data: { userId: user.id, event: "login" } });
    const isAdmin = isAdminEmail(user.email);
    if (user.isAdmin !== isAdmin) {
      await prisma.user.update({ where: { id: user.id }, data: { isAdmin } });
    }

    const token = await signToken({ sub: user.id, email: user.email });
    return setSessionCookie(NextResponse.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, isAdmin }
    }), token);
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json({ error: "SERVER_ERROR", message: "Could not sign in right now." }, { status: 500 });
  }
}
