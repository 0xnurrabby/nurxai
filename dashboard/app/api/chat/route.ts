import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUserFromHeader } from "@/lib/auth-helpers";
import { isAdminEmail } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";

export const runtime = "nodejs";

function maskEmail(email: string) {
  const [rawName] = email.split("@");
  const name = rawName || "user";
  const visible = Math.max(2, Math.ceil(name.length * 0.7));
  const hidden = Math.max(1, name.length - visible);
  return `${name.slice(0, visible)}${"*".repeat(hidden)}`;
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

  const messages = await prisma.chatMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      user: { select: { id: true, email: true, name: true } }
    }
  });
  const ordered = messages.reverse();
  const premiumIds = await premiumUserIds([...new Set(ordered.map((m) => m.userId))]);

  return NextResponse.json({
    messages: ordered.map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      mine: message.userId === auth.user.id,
      author: {
        name: maskEmail(message.user.email),
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
    include: { user: { select: { id: true, email: true, name: true } } }
  });

  const premiumIds = await premiumUserIds([message.userId]);
  return NextResponse.json({
    message: {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      mine: true,
      author: {
        name: maskEmail(message.user.email),
        isAdmin: isAdminEmail(message.user.email),
        hasBadge: premiumIds.has(message.userId)
      }
    }
  });
}
