import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUserFromHeader } from "@/lib/auth-helpers";
import { isAdminEmail } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";

export const runtime = "nodejs";
const CHAT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CHAT_HISTORY_LIMIT = 300;
let lastCleanupAt = 0;

function cleanDisplayName(name?: string | null) {
  const clean = String(name || "").replace(/[\x00-\x1F\x7F]/g, "").trim();
  return clean.slice(0, 32) || "NurAi user";
}

function cutoffDate() {
  return new Date(Date.now() - CHAT_TTL_MS);
}

async function deleteExpiredMessages() {
  const now = Date.now();
  if (now - lastCleanupAt < 10 * 60 * 1000) return;
  lastCleanupAt = now;
  await prisma.chatMessage.deleteMany({
    where: { createdAt: { lt: cutoffDate() } }
  });
}

async function premiumUserIds(userIds: string[]) {
  if (userIds.length === 0) return new Set<string>();
  const subs = await prisma.subscription.findMany({
    where: {
      userId: { in: userIds },
      status: "active",
      endsAt: { gt: new Date() },
      plan: { in: ["pro", "premium"] }
    },
    select: { userId: true }
  });
  return new Set(subs.map((sub) => sub.userId));
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUserFromHeader(req);
  if (!auth?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();
  await deleteExpiredMessages();
  const searchParams = new URL(req.url).searchParams;
  const markRead = searchParams.get("markRead") === "1";
  const summaryOnly = searchParams.get("summary") === "1";

  const viewer = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { chatReadAt: true }
  });
  const lastReadAt = viewer?.chatReadAt || new Date(0);
  const computedUnread = markRead
    ? 0
    : await prisma.chatMessage.count({
        where: {
          userId: { not: auth.user.id },
          createdAt: { gt: lastReadAt, gte: cutoffDate() }
        }
      });
  if (markRead) {
    await prisma.user.update({
      where: { id: auth.user.id },
      data: { chatReadAt: new Date() }
    });
  }
  if (summaryOnly) {
    return NextResponse.json({ unreadCount: computedUnread, messages: [] });
  }

  const messages = await prisma.chatMessage.findMany({
    where: { createdAt: { gte: cutoffDate() } },
    orderBy: { createdAt: "desc" },
    take: CHAT_HISTORY_LIMIT,
    include: {
      user: { select: { id: true, email: true, name: true, avatarUrl: true } }
    }
  });
  const ordered = messages.reverse();
  const premiumIds = await premiumUserIds([...new Set(ordered.map((m) => m.userId))]);

  return NextResponse.json({
    unreadCount: computedUnread,
    messages: ordered.map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      mine: message.userId === auth.user.id,
      author: {
        name: cleanDisplayName(message.user.name),
        avatarUrl: message.user.avatarUrl,
        isAdmin: isAdminEmail(message.user.email),
        hasBadge: premiumIds.has(message.userId)
      }
    }))
  });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUserFromHeader(req);
  if (!auth?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();
  await deleteExpiredMessages();

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.body === "string"
    ? body.body.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim().slice(0, 500)
    : "";
  if (!text) return NextResponse.json({ error: "EMPTY_MESSAGE" }, { status: 400 });

  const message = await prisma.chatMessage.create({
    data: {
      userId: auth.user.id,
      body: text
    },
    include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } }
  });

  const premiumIds = await premiumUserIds([message.userId]);
  return NextResponse.json({
    message: {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      mine: true,
      author: {
        name: cleanDisplayName(message.user.name),
        avatarUrl: message.user.avatarUrl,
        isAdmin: isAdminEmail(message.user.email),
        hasBadge: premiumIds.has(message.userId)
      }
    }
  });
}
