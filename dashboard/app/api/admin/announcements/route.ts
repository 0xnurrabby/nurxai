import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensureRuntimeSchema();

  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
  const text = typeof body?.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (!text) return NextResponse.json({ error: "EMPTY_ANNOUNCEMENT" }, { status: 400 });

  const announcement = await prisma.announcement.create({
    data: {
      title: title || null,
      body: text,
      createdBy: admin.id
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      event: "admin_send_announcement",
      meta: { announcementId: announcement.id, title: title || null } as any
    }
  });

  return NextResponse.json({ announcement });
}
