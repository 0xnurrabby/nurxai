import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import {
  applyReferralCode,
  cleanReferralNote,
  cleanWithdrawAddress,
  ensureReferralCode,
  getWalletSummary,
  MIN_WITHDRAW_USD,
  normalizeReferralCode,
  REFERRAL_BONUS_RATE
} from "@/lib/referrals";
import { getPublicAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";

function serializeWithdrawal(row: any) {
  return {
    ...row,
    amountUSD: Number(row.amountUSD || 0),
    createdAt: row.createdAt?.toISOString?.() || row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt,
    paidAt: row.paidAt?.toISOString?.() || row.paidAt || null,
    rejectedAt: row.rejectedAt?.toISOString?.() || row.rejectedAt || null,
    noticeSeenAt: row.noticeSeenAt?.toISOString?.() || row.noticeSeenAt || null,
    noticeClearAt: row.noticeClearAt?.toISOString?.() || row.noticeClearAt || null
  };
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();

  const user = await prisma.$transaction(async (tx) => {
    await ensureReferralCode(tx, session.sub);
    return tx.user.findUnique({
      where: { id: session.sub },
      select: {
        id: true,
        referralCode: true,
        referredBy: { select: { id: true, email: true, name: true, referralCode: true } },
        _count: { select: { referrals: true } }
      }
    });
  });
  if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });

  const [summary, recentLedger, withdrawals, referredPaidUsers] = await Promise.all([
    getWalletSummary(session.sub),
    prisma.walletLedger.findMany({
      where: { userId: session.sub },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.withdrawalRequest.findMany({
      where: { userId: session.sub },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.user.count({
      where: {
        referredById: session.sub,
        payments: { some: { status: "confirmed" } }
      }
    })
  ]);

  return NextResponse.json({
    referral: {
      code: user.referralCode,
      link: `${getPublicAppUrl()}/signup?ref=${encodeURIComponent(user.referralCode || "")}`,
      referredBy: user.referredBy
        ? {
            email: user.referredBy.email,
            name: user.referredBy.name,
            code: user.referredBy.referralCode
          }
        : null,
      totalReferrals: user._count.referrals,
      paidReferrals: referredPaidUsers,
      bonusRate: REFERRAL_BONUS_RATE
    },
    wallet: summary,
    ledger: recentLedger.map((item) => ({
      ...item,
      amountUSD: Number(item.amountUSD || 0),
      createdAt: item.createdAt.toISOString()
    })),
    withdrawals: withdrawals.map(serializeWithdrawal),
    minWithdrawUSD: MIN_WITHDRAW_USD
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "applyReferral";

  if (action === "applyReferral") {
    const code = normalizeReferralCode(body.code);
    const result = await prisma.$transaction(async (tx) => {
      await ensureReferralCode(tx, session.sub);
      return applyReferralCode(tx, session.sub, code);
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          message:
            result.error === "REFERRAL_ALREADY_SET"
              ? "Referral is already locked on this account."
              : result.error === "SELF_REFERRAL"
              ? "You cannot use your own referral code."
              : "Referral code not found."
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, referrer: result.referrer });
  }

  if (action === "withdraw") {
    const amount = Number(body.amountUSD);
    const amountUSD = Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
    const address = cleanWithdrawAddress(body.address);
    const userNote = cleanReferralNote(body.note, 300);
    if (amountUSD < MIN_WITHDRAW_USD) {
      return NextResponse.json({ error: "MIN_WITHDRAW", message: `Minimum withdrawal is $${MIN_WITHDRAW_USD}.` }, { status: 400 });
    }
    if (!address) {
      return NextResponse.json({ error: "BAD_ADDRESS", message: "Use a valid BEP-20 USDT 0x address." }, { status: 400 });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const summary = await getWalletSummary(session.sub, tx);
        if (summary.balanceUSD + 0.0001 < amountUSD) {
          return { ok: false as const, error: "INSUFFICIENT_BALANCE" };
        }

        const request = await tx.withdrawalRequest.create({
          data: {
            userId: session.sub,
            amountUSD,
            address,
            userNote,
            status: "pending"
          }
        });
        const hold = await tx.walletLedger.create({
          data: {
            userId: session.sub,
            amountUSD: -amountUSD,
            type: "withdrawal_hold",
            sourceType: "withdrawal_request",
            sourceId: request.id,
            note: `Withdrawal request hold for $${amountUSD.toFixed(2)}.`
          }
        });
        return { ok: true as const, request, hold };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error, message: "Not enough available balance." }, { status: 402 });
    }

    return NextResponse.json({ ok: true, withdrawal: serializeWithdrawal(result.request) });
  }

  if (action === "markNoticeSeen") {
    const id = typeof body.id === "string" ? body.id : "";
    const clearAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const updated = await prisma.withdrawalRequest.updateMany({
      where: { id, userId: session.sub, status: { in: ["paid", "rejected"] }, noticeSeenAt: null },
      data: { noticeSeenAt: new Date(), noticeClearAt: clearAt }
    });
    return NextResponse.json({ ok: true, updated: updated.count });
  }

  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
