import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/jwt";
import { isAdminEmail } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { createTrialSubscription } from "@/lib/trial";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await ensureRuntimeSchema();
    const { email, password, name } = await req.json();
    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "MISSING" }, { status: 400 });
    }
    const e = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return NextResponse.json({ error: "BAD_EMAIL" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });

    const exists = await prisma.user.findUnique({
      where: { email: e },
      select: { id: true }
    });
    if (exists) return NextResponse.json({ error: "EMAIL_TAKEN" }, { status: 409 });

    const hash = await bcrypt.hash(password, 12);
    const isAdmin = isAdminEmail(e);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: e, passwordHash: hash, name: name?.toString().slice(0, 60) || null, isAdmin }
      });

      await tx.auditLog.create({ data: { userId: created.id, event: "signup" } });
      await createTrialSubscription(tx, created.id);
      return created;
    });

    const token = await signToken({ sub: user.id, email: user.email });
    return NextResponse.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, isAdmin }
    });
  } catch (error) {
    console.error("Signup failed:", error);
    return NextResponse.json({ error: "SERVER_ERROR", message: "Could not create account. Check database migrations." }, { status: 500 });
  }
}
