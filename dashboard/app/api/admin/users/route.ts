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

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("q") || "";

  const users = await prisma.user.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } }
          ]
        }
      : {},
    include: {
      subscriptions: {
        where: { status: "active", endsAt: { gt: new Date() } },
        orderBy: { endsAt: "desc" },
        take: 1
      },
      _count: { select: { payments: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return NextResponse.json({ users });
}
