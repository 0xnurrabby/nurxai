import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";

export const runtime = "nodejs";

async function requireAdmin(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return null;
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user?.isAdmin) return null;
  return user;
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const user = await prisma.user.findUnique({
    where: { id: ctx.params.id },
    include: {
      subscriptions: { orderBy: { endsAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" }, take: 20 },
      usage: { orderBy: { day: "desc" }, take: 30 }
    }
  });
  if (!user) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json();
  const data: any = {};
  if (typeof body.name === "string") data.name = body.name.slice(0, 60);
  if (typeof body.isAdmin === "boolean") data.isAdmin = body.isAdmin;
  if (typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    data.email = body.email.toLowerCase().trim();
  }

  const user = await prisma.user.update({ where: { id: ctx.params.id }, data });

  await prisma.auditLog.create({
    data: { userId: admin.id, event: "admin_update_user", meta: { targetId: ctx.params.id, changes: data } as any }
  });
  return NextResponse.json({ user });
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (admin.id === ctx.params.id) {
    return NextResponse.json({ error: "CANT_DELETE_SELF" }, { status: 400 });
  }

  await prisma.usageLog.deleteMany({ where: { userId: ctx.params.id } });
  await prisma.subscription.deleteMany({ where: { userId: ctx.params.id } });
  await prisma.payment.deleteMany({ where: { userId: ctx.params.id } });
  await prisma.user.delete({ where: { id: ctx.params.id } });

  await prisma.auditLog.create({
    data: { userId: admin.id, event: "admin_delete_user", meta: { targetId: ctx.params.id } as any }
  });
  return NextResponse.json({ ok: true });
}
