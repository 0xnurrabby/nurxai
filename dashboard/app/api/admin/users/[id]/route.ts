import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, isAdminEmail } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { ensureReferralCode, getWalletSummary } from "@/lib/referrals";
import { getCurrentSubscriptionForUser } from "@/lib/billing";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensureRuntimeSchema();
  await ensureReferralCode(prisma, ctx.params.id);

  const user = await prisma.user.findUnique({
    where: { id: ctx.params.id },
    include: {
      subscriptions: { orderBy: { endsAt: "desc" }, take: 20 },
      payments: { orderBy: { createdAt: "desc" }, take: 30 },
      usage: { orderBy: { day: "desc" }, take: 45 },
      projects: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { _count: { select: { contexts: true } } }
      },
      generations: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          model: true,
          usageDetails: true,
          inputTokens: true,
          outputTokens: true,
          costUSD: true,
          hadImage: true,
          createdAt: true
        }
      },
      subscriptionGifts: {
        where: { active: true },
        orderBy: { createdAt: "desc" },
        take: 30
      },
      referredBy: { select: { id: true, email: true, name: true, referralCode: true } },
      referrals: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, email: true, name: true, createdAt: true, payments: { where: { status: "confirmed" }, select: { id: true }, take: 1 } }
      },
      walletLedger: { orderBy: { createdAt: "desc" }, take: 30 },
      withdrawals: { orderBy: { createdAt: "desc" }, take: 20 },
      _count: { select: { payments: true, generations: true, projects: true } }
    }
  });
  if (!user) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const now = new Date();
  const activeSubscription = await getCurrentSubscriptionForUser(user.id, prisma, now);

  const [tokenTotals, auditLogs, wallet] = await Promise.all([
    prisma.generation.aggregate({
      _sum: { inputTokens: true, outputTokens: true, costUSD: true },
      where: { userId: user.id }
    }),
    prisma.auditLog.findMany({
      where: {
        OR: [{ userId: user.id }, { meta: { path: ["targetId"], equals: user.id } }]
      },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    getWalletSummary(user.id)
  ]);

  return NextResponse.json({
    user: {
      ...user,
      isAdmin: isAdminEmail(user.email),
      activeSubscription,
      totals: {
        inputTokens: tokenTotals._sum.inputTokens || 0,
        outputTokens: tokenTotals._sum.outputTokens || 0,
        costUSD: tokenTotals._sum.costUSD?.toString() || "0"
      },
      wallet,
      walletLedger: user.walletLedger.map((item) => ({ ...item, amountUSD: Number(item.amountUSD || 0) })),
      withdrawals: user.withdrawals.map((item) => ({ ...item, amountUSD: Number(item.amountUSD || 0) })),
      referrals: user.referrals.map((item) => ({ ...item, hasPaid: item.payments.length > 0, payments: undefined })),
      auditLogs
    }
  });
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensureRuntimeSchema();

  const body = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof body.name === "string") data.name = body.name.trim().slice(0, 60) || null;
  if (typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    data.email = body.email.toLowerCase().trim();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "NO_CHANGES" }, { status: 400 });
  }

  const before = await prisma.user.findUnique({ where: { id: ctx.params.id } });
  if (!before) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (data.email && isAdminEmail(before.email) && !isAdminEmail(data.email)) {
    return NextResponse.json(
      { error: "ADMIN_EMAIL_LOCKED", message: "Remove this email from ADMIN_EMAILS before changing it." },
      { status: 400 }
    );
  }

  const user = await prisma.user.update({
    where: { id: ctx.params.id },
    data: { ...data, isAdmin: data.email ? isAdminEmail(data.email) : isAdminEmail(before.email) }
  });

  await prisma.auditLog.create({
    data: { userId: admin.id, event: "admin_update_user", meta: { targetId: ctx.params.id, changes: data } as any }
  });
  return NextResponse.json({ user: { ...user, isAdmin: isAdminEmail(user.email) } });
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensureRuntimeSchema();

  if (admin.id === ctx.params.id) {
    return NextResponse.json({ error: "CANT_DELETE_SELF" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: ctx.params.id } });
  if (!target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (isAdminEmail(target.email)) {
    return NextResponse.json(
      { error: "ADMIN_EMAIL_LOCKED", message: "Remove this email from ADMIN_EMAILS before deleting this admin." },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: { userId: admin.id, event: "admin_delete_user", meta: { targetId: ctx.params.id, email: target.email } as any }
    });
    await tx.projectContext.deleteMany({ where: { project: { userId: ctx.params.id } } });
    await tx.project.deleteMany({ where: { userId: ctx.params.id } });
    await tx.announcementRead.deleteMany({ where: { userId: ctx.params.id } });
    await tx.chatMessage.deleteMany({ where: { userId: ctx.params.id } });
    await tx.subscriptionGift.deleteMany({ where: { userId: ctx.params.id } });
    await tx.withdrawalRequest.deleteMany({ where: { userId: ctx.params.id } });
    await tx.walletLedger.deleteMany({ where: { userId: ctx.params.id } });
    await tx.generation.deleteMany({ where: { userId: ctx.params.id } });
    await tx.usageLog.deleteMany({ where: { userId: ctx.params.id } });
    await tx.subscription.deleteMany({ where: { userId: ctx.params.id } });
    await tx.payment.deleteMany({ where: { userId: ctx.params.id } });
    await tx.auditLog.deleteMany({ where: { userId: ctx.params.id } });
    await tx.user.delete({ where: { id: ctx.params.id } });
  });

  return NextResponse.json({ ok: true });
}
