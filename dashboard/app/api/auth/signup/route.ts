import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/jwt";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();
    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "MISSING" }, { status: 400 });
    }
    const e = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return NextResponse.json({ error: "BAD_EMAIL" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });

    const exists = await prisma.user.findUnique({ where: { email: e } });
    if (exists) return NextResponse.json({ error: "EMAIL_TAKEN" }, { status: 409 });

    const hash = await bcrypt.hash(password, 12);
    const isAdmin = isAdminEmail(e);
    const user = await prisma.user.create({
      data: { email: e, passwordHash: hash, name: name?.toString().slice(0, 60) || null, isAdmin }
    });

    await prisma.auditLog.create({ data: { userId: user.id, event: "signup" } });

    const token = await signToken({ sub: user.id, email: user.email });
    return NextResponse.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, isAdmin }
    });
  } catch {
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
