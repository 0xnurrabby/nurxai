import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { PLANS, PlanKey } from "@/lib/plans";

export const REFERRAL_BONUS_RATE = 0.1;
export const MIN_WITHDRAW_USD = 3;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type Tx = Prisma.TransactionClient | typeof prisma;

function cleanCode(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 24);
}

function makeReferralCode(length = 8) {
  let out = "";
  const bytes = randomBytes(length);
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

export function normalizeReferralCode(value: unknown) {
  return cleanCode(value);
}

export function cleanWithdrawAddress(value: unknown) {
  if (typeof value !== "string") return "";
  const address = value.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address : "";
}

export function cleanReferralNote(value: unknown, max = 500) {
  if (typeof value !== "string") return null;
  const note = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim().slice(0, max);
  return note || null;
}

export async function ensureReferralCode(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { referralCode: true }
  });
  if (!user) return null;
  if (user.referralCode) return user.referralCode;

  for (let attempt = 0; attempt < 8; attempt++) {
    const referralCode = makeReferralCode(attempt < 5 ? 8 : 10);
    try {
      await tx.user.update({ where: { id: userId }, data: { referralCode } });
      return referralCode;
    } catch (error: any) {
      if (error?.code !== "P2002") throw error;
    }
  }
  throw new Error("Could not allocate referral code");
}

export async function ensureAllReferralCodes(tx: Tx, take = 250) {
  const users = await tx.user.findMany({
    where: { referralCode: null },
    select: { id: true },
    take
  });
  for (const user of users) await ensureReferralCode(tx, user.id);
}

export async function applyReferralCode(tx: Tx, userId: string, rawCode: unknown) {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { ok: false as const, error: "BAD_REFERRAL_CODE" };

  const [user, referrer] = await Promise.all([
    tx.user.findUnique({ where: { id: userId }, select: { id: true, referredById: true, referralCode: true } }),
    tx.user.findUnique({ where: { referralCode: code }, select: { id: true, email: true, name: true, referralCode: true } })
  ]);
  if (!user) return { ok: false as const, error: "USER_NOT_FOUND" };
  if (!referrer) return { ok: false as const, error: "REFERRAL_NOT_FOUND" };
  if (referrer.id === userId) return { ok: false as const, error: "SELF_REFERRAL" };
  if (user.referredById) return { ok: false as const, error: "REFERRAL_ALREADY_SET" };

  await tx.user.update({
    where: { id: userId },
    data: { referredById: referrer.id, referredAt: new Date() }
  });

  return { ok: true as const, referrer };
}

export async function getWalletSummary(userId: string, tx: Tx = prisma) {
  const [rows, pendingWithdrawals, paidWithdrawals] = await Promise.all([
    tx.walletLedger.groupBy({
      by: ["type"],
      where: { userId },
      _sum: { amountUSD: true }
    }),
    tx.withdrawalRequest.aggregate({
      _sum: { amountUSD: true },
      where: { userId, status: "pending" }
    }),
    tx.withdrawalRequest.aggregate({
      _sum: { amountUSD: true },
      where: { userId, status: "paid" }
    })
  ]);
  const byType = new Map(rows.map((row) => [row.type, Number(row._sum.amountUSD || 0)]));
  const balanceUSD = rows.reduce((sum, row) => sum + Number(row._sum.amountUSD || 0), 0);
  return {
    balanceUSD: Number(balanceUSD.toFixed(2)),
    earnedUSD: Number((byType.get("referral_bonus") || 0).toFixed(2)),
    spentUSD: Math.abs(Number((byType.get("subscription_purchase") || 0).toFixed(2))),
    withdrawnUSD: Number(Number(paidWithdrawals._sum.amountUSD || 0).toFixed(2)),
    pendingWithdrawUSD: Number(Number(pendingWithdrawals._sum.amountUSD || 0).toFixed(2))
  };
}

export async function creditReferralBonus(
  tx: Tx,
  payment: { id: string; userId: string; plan: string; amount: Prisma.Decimal | number | string },
  options: { sourceType?: string; sourceId?: string; note?: string; adminId?: string | null } = {}
) {
  const buyer = await tx.user.findUnique({
    where: { id: payment.userId },
    select: {
      id: true,
      email: true,
      referredById: true,
      referredBy: { select: { id: true, email: true, referralCode: true } }
    }
  });
  if (!buyer?.referredById || buyer.referredById === payment.userId) return null;

  const sourceType = options.sourceType || "payment_referral_bonus";
  const sourceId = options.sourceId || payment.id;
  const amountUSD = Number(payment.amount);
  if (!Number.isFinite(amountUSD) || amountUSD <= 0) return null;

  const bonusUSD = Number((amountUSD * REFERRAL_BONUS_RATE).toFixed(2));
  if (bonusUSD <= 0) return null;

  try {
    const ledger = await tx.walletLedger.create({
      data: {
        userId: buyer.referredById,
        amountUSD: bonusUSD,
        type: "referral_bonus",
        sourceType,
        sourceId,
        adminId: options.adminId || null,
        note:
          options.note ||
          `10% referral bonus from ${buyer.email} ${payment.plan} purchase ($${amountUSD.toFixed(2)}).`
      }
    });
    return { ledger, referrerId: buyer.referredById, buyer };
  } catch (error: any) {
    if (error?.code === "P2002") return null;
    throw error;
  }
}

export async function createWalletPurchase(tx: Tx, userId: string, plan: PlanKey, amountUSD: number) {
  const selected = PLANS[plan];
  if (!selected || selected.priceUSD <= 0) return { ok: false as const, error: "BAD_PLAN" };
  const summary = await getWalletSummary(userId, tx);
  if (summary.balanceUSD + 0.0001 < amountUSD) return { ok: false as const, error: "INSUFFICIENT_BALANCE" };
  const ledger = await tx.walletLedger.create({
    data: {
      userId,
      amountUSD: -Number(amountUSD.toFixed(2)),
      type: "subscription_purchase",
      sourceType: "wallet_subscription_purchase",
      sourceId: `${userId}:${plan}:${Date.now()}`,
      note: `Paid $${amountUSD.toFixed(2)} from referral wallet for ${selected.name}.`
    }
  });
  return { ok: true as const, ledger };
}
