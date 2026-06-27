import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { cleanReferralNote, getWalletSummary } from "@/lib/referrals";

export const runtime = "nodejs";

function cleanMoney(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || Math.abs(amount) > 100000) return null;
  return Number(amount.toFixed(2));
}

function cleanTxHash(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, 140);
  return text || null;
}

function serializeWithdrawal(row: any) {
  return {
    ...row,
    amountUSD: Number(row.amountUSD || 0),
    createdAt: row.createdAt?.toISOString?.() || row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt,
    paidAt: row.paidAt?.toISOString?.() || row.paidAt || null,
    rejectedAt: row.rejectedAt?.toISOString?.() || row.rejectedAt || null
  };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensureRuntimeSchema();

  const status = new URL(req.url).searchParams.get("status") || "pending";
  const withdrawals = await prisma.withdrawalRequest.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true, name: true } } }
  });

  return NextResponse.json({ withdrawals: withdrawals.map(serializeWithdrawal) });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensureRuntimeSchema();

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "adjustBalance") {
    const userId = typeof body.userId === "string" ? body.userId : "";
    const amountUSD = cleanMoney(body.amountUSD);
    const note = cleanReferralNote(body.note, 500);
    if (!userId || amountUSD === null || amountUSD === 0) {
      return NextResponse.json({ error: "BAD_ADJUSTMENT" }, { status: 400 });
    }
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });

    const ledger = await prisma.walletLedger.create({
      data: {
        userId,
        amountUSD,
        type: "admin_adjustment",
        sourceType: "admin_adjustment",
        sourceId: `admin:${admin.id}:${userId}:${Date.now()}`,
        adminId: admin.id,
        note: note || `Admin ${amountUSD > 0 ? "added" : "removed"} $${Math.abs(amountUSD).toFixed(2)}.`
      }
    });
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        event: "admin_wallet_adjustment",
        meta: { targetId: userId, ledgerId: ledger.id, amountUSD, note } as any
      }
    });
    return NextResponse.json({ ok: true, ledger: { ...ledger, amountUSD: Number(ledger.amountUSD) } });
  }

  if (action === "withdrawPaid") {
    const id = typeof body.id === "string" ? body.id : "";
    const adminNote = cleanReferralNote(body.note, 500);
    const txHash = cleanTxHash(body.txHash);
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.withdrawalRequest.findUnique({ where: { id } });
      if (!request || request.status !== "pending") return null;
      const paid = await tx.withdrawalRequest.update({
        where: { id },
        data: {
          status: "paid",
          adminNote,
          txHash,
          paidAt: new Date(),
          noticeSeenAt: null,
          noticeClearAt: null
        }
      });
      await tx.walletLedger.updateMany({
        where: { userId: request.userId, sourceType: "withdrawal_request", sourceId: request.id, type: "withdrawal_hold" },
        data: {
          type: "withdrawal_paid",
          note: adminNote || `Withdrawal paid manually by admin.`
        }
      });
      await tx.auditLog.create({
        data: {
          userId: admin.id,
          event: "admin_withdrawal_paid",
          meta: { targetId: request.userId, withdrawalId: id, amountUSD: Number(request.amountUSD), txHash, note: adminNote } as any
        }
      });
      return paid;
    });
    if (!result) return NextResponse.json({ error: "WITHDRAWAL_NOT_PENDING" }, { status: 400 });
    return NextResponse.json({ ok: true, withdrawal: serializeWithdrawal(result) });
  }

  if (action === "withdrawReject") {
    const id = typeof body.id === "string" ? body.id : "";
    const adminNote = cleanReferralNote(body.note, 500);
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.withdrawalRequest.findUnique({ where: { id } });
      if (!request || request.status !== "pending") return null;
      const rejected = await tx.withdrawalRequest.update({
        where: { id },
        data: {
          status: "rejected",
          adminNote,
          rejectedAt: new Date(),
          noticeSeenAt: null,
          noticeClearAt: null
        }
      });
      await tx.walletLedger.updateMany({
        where: { userId: request.userId, sourceType: "withdrawal_request", sourceId: request.id, type: "withdrawal_hold" },
        data: {
          amountUSD: 0,
          type: "withdrawal_rejected",
          note: adminNote || "Withdrawal rejected; balance released."
        }
      });
      await tx.auditLog.create({
        data: {
          userId: admin.id,
          event: "admin_withdrawal_rejected",
          meta: { targetId: request.userId, withdrawalId: id, amountUSD: Number(request.amountUSD), note: adminNote } as any
        }
      });
      return rejected;
    });
    if (!result) return NextResponse.json({ error: "WITHDRAWAL_NOT_PENDING" }, { status: 400 });
    return NextResponse.json({ ok: true, withdrawal: serializeWithdrawal(result) });
  }

  if (action === "summary") {
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!userId) return NextResponse.json({ error: "MISSING_USER" }, { status: 400 });
    const summary = await getWalletSummary(userId);
    return NextResponse.json({ ok: true, wallet: summary });
  }

  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
