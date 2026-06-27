import { NextRequest, NextResponse } from "next/server";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { PLANS, PlanKey } from "@/lib/plans";
import { prisma } from "@/lib/db";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { activatePaidSubscription } from "@/lib/billing";
import { creditReferralBonus } from "@/lib/referrals";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Base Pay verify (step 2 of 2).
 * The browser hands us the txHash returned by pay(). We verify against Base
 * mainnet RPC directly, no SDK on the server (keeps the bundle small and
 * avoids the bs58 / cdp-sdk webpack issues we hit before).
 *
 * USDC contract on Base mainnet: 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913
 *
 * We require:
 *   - Receipt status = success
 *   - A USDC Transfer log to BASE_PAY_RECIPIENT with at least the plan price
 *   - The same txHash has not already been used to confirm any other payment
 */

const BASE_RPC = "https://mainnet.base.org";
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function pad32(addr: string): string {
  return "0x" + "0".repeat(24) + addr.toLowerCase().replace(/^0x/, "");
}

async function rpc(method: string, params: any[]): Promise<any> {
  const r = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error(`RPC ${method} HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(`RPC ${method}: ${j.error.message}`);
  return j.result;
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();

  const { orderId, txHash, plan } = await req.json().catch(() => ({}));
  if (!orderId || !txHash)
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  if (!/^0x[a-fA-F0-9]{64}$/.test(String(txHash))) {
    return NextResponse.json({ error: "BAD_TX_HASH" }, { status: 400 });
  }

  const expectedRecipient = process.env.BASE_PAY_RECIPIENT;
  if (!expectedRecipient || !/^0x[a-fA-F0-9]{40}$/.test(expectedRecipient)) {
    return NextResponse.json(
      { error: "BASE_PAY_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  // Match the pending payment created by /init.
  const payment = await prisma.payment.findUnique({
    where: { providerId: orderId }
  });
  if (!payment || payment.userId !== session.sub) {
    return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
  }
  if (payment.status === "confirmed") {
    return NextResponse.json({ ok: true, alreadyConfirmed: true });
  }
  if (plan && plan !== payment.plan) {
    return NextResponse.json({ error: "PLAN_MISMATCH" }, { status: 400 });
  }

  const p = PLANS[payment.plan as PlanKey];
  if (!p) return NextResponse.json({ error: "BAD_PLAN" }, { status: 400 });
  if (p.priceUSD <= 0) {
    return NextResponse.json({ error: "FREE_PLAN", message: "Free trial does not require payment." }, { status: 400 });
  }

  // Replay protection: this txHash must not already be confirmed for another payment.
  const dupe = await prisma.payment.findFirst({
    where: { txHash: String(txHash), status: "confirmed" }
  });
  if (dupe) {
    return NextResponse.json({ error: "TX_ALREADY_USED" }, { status: 409 });
  }

  let receipt: any;
  try {
    receipt = await rpc("eth_getTransactionReceipt", [txHash]);
  } catch (e: any) {
    console.error("[basepay] base RPC failed:", e?.message);
    return NextResponse.json(
      {
        error: "VERIFY_FAILED",
        message: `Could not reach Base RPC: ${e?.message || "unknown"}`
      },
      { status: 502 }
    );
  }

  if (!receipt) {
    return NextResponse.json(
      {
        error: "TX_NOT_FOUND_YET",
        message: "Transaction is not yet visible on-chain. Try again in a moment."
      },
      { status: 202 }
    );
  }

  if (receipt.status !== "0x1") {
    return NextResponse.json(
      { error: "TX_FAILED", message: "Transaction reverted on chain." },
      { status: 400 }
    );
  }

  const expectedToTopic = pad32(expectedRecipient);
  const transferLog = (receipt.logs || []).find(
    (log: any) =>
      log.address?.toLowerCase() === USDC_BASE.toLowerCase() &&
      Array.isArray(log.topics) &&
      log.topics[0] === TRANSFER_TOPIC &&
      log.topics[2]?.toLowerCase() === expectedToTopic.toLowerCase()
  );

  if (!transferLog) {
    return NextResponse.json(
      {
        error: "RECIPIENT_OR_TOKEN_MISMATCH",
        message:
          "This transaction did not transfer USDC on Base to the configured NurAi address."
      },
      { status: 400 }
    );
  }

  // USDC has 6 decimals on Base.
  const rawAmount = BigInt(transferLog.data);
  const expectedAmountUSD = Number(payment.amount);
  if (!Number.isFinite(expectedAmountUSD) || expectedAmountUSD <= 0) {
    return NextResponse.json({ error: "BAD_PAYMENT_AMOUNT" }, { status: 500 });
  }
  const expectedAtomic = BigInt(Math.round(expectedAmountUSD * 1_000_000));
  const minAtomic = expectedAtomic - BigInt(10_000); // tolerate 1 cent rounding
  if (rawAmount < minAtomic) {
    return NextResponse.json(
      {
        error: "AMOUNT_TOO_LOW",
        paid: Number(rawAmount) / 1_000_000,
        expected: expectedAmountUSD
      },
      { status: 400 }
    );
  }

  const sender =
    "0x" + (transferLog.topics[1] || "").toString().slice(-40).toLowerCase();

  const activation = await prisma.$transaction(async (tx) => {
    const activated = await activatePaidSubscription(tx, payment);
    if (!activated) return null;

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "confirmed",
        txHash: String(txHash),
        payerAddr: sender
      }
    });

    const referralBonus = await creditReferralBonus(tx, payment);

    await tx.auditLog.create({
      data: {
        userId: session.sub,
        event: "subscription_activated",
        meta: {
          plan: payment.plan,
          billingMode: activated.kind,
          dailyLimit: p.dailyLimit,
          startsAt: activated.startsAt.toISOString(),
          endsAt: activated.endsAt.toISOString(),
          provider: "basepay",
          txHash,
          amount: expectedAmountUSD,
          referralBonusId: referralBonus?.ledger.id || null,
          referralBonusUSD: referralBonus ? Number(referralBonus.ledger.amountUSD) : 0
        } as any
      }
    });
    return activated;
  });

  if (!activation) {
    return NextResponse.json({ error: "ACTIVATION_FAILED" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    plan: payment.plan,
    billingMode: activation.kind,
    endsAt: activation.endsAt.toISOString()
  });
}
