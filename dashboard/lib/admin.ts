import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";

function parseAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return parseAdminEmails().includes(email.toLowerCase().trim());
}

export async function requireAdmin(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return null;

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || !isAdminEmail(user.email)) return null;

  if (!user.isAdmin) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isAdmin: true }
    });
    user.isAdmin = true;
  }

  return user;
}
