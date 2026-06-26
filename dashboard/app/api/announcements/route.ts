import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUserFromHeader } from "@/lib/auth-helpers";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { requireSupportedExtensionVersion } from "@/lib/extension-version";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const versionBlock = requireSupportedExtensionVersion(req);
  if (versionBlock) return versionBlock;

  const auth = await getAuthUserFromHeader(req);
  if (!auth?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      reads: {
        where: { userId: auth.user.id },
        select: { readAt: true }
      }
    }
  });

  const items = announcements.map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    createdAt: item.createdAt,
    readAt: item.reads[0]?.readAt || null
  }));

  return NextResponse.json({
    announcements: items,
    unreadCount: items.filter((item) => !item.readAt).length
  });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUserFromHeader(req);
  if (!auth?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((id: any) => typeof id === "string").slice(0, 100)
    : [];
  if (ids.length === 0) return NextResponse.json({ ok: true });

  await prisma.$transaction(
    ids.map((announcementId) =>
      prisma.announcementRead.upsert({
        where: { announcementId_userId: { announcementId, userId: auth.user.id } },
        create: { announcementId, userId: auth.user.id },
        update: { readAt: new Date() }
      })
    )
  );

  return NextResponse.json({ ok: true });
}
