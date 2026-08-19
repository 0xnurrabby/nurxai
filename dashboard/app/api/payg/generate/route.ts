import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { NextAdapter } from "@x402/next";
import { encodePaymentResponseHeader } from "@x402/core/http";
import { extractPaymentIdentifier } from "@x402/extensions/payment-identifier";
import { Prisma, type PaygGeneration } from "@prisma/client";
import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";
import { prisma } from "@/lib/db";
import { ensurePaygSchema } from "@/lib/schema-guard";
import { getAuthUserFromHeader } from "@/lib/auth-helpers";
import { createPaygGrant, isPaygOperationId, paygRequestHash } from "@/lib/payg-operation";
import {
  getPaygConfig,
  PAYG_USDC_ADDRESS
} from "@/lib/payg-config";
import { getPaygPricing } from "@/lib/payg-pricing";
import { getPaygX402Server } from "@/lib/x402-server";
import { POST as generate } from "@/app/api/generate/route";

export const runtime = "nodejs";
export const maxDuration = 60;

const LEASE_MS = 90_000;
const AUTHORIZATION_USED = parseAbiItem("event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)");
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type StoredPayment = {
  paymentPayload: any;
  paymentRequirements: any;
  declaredExtensions?: any;
};
type PaygServer = Awaited<ReturnType<typeof getPaygX402Server>>;

function pendingResponse(error: string, seconds = 2) {
  return NextResponse.json(
    { error, retryable: true },
    { status: 202, headers: { "Retry-After": String(seconds), "Cache-Control": "private, no-store" } }
  );
}

function protocolResponse(response: {
  status: number;
  headers: Record<string, string>;
  body?: unknown;
  isHtml?: boolean;
}) {
  return new NextResponse(
    response.body === undefined || response.body === null
      ? null
      : response.isHtml
        ? String(response.body)
        : JSON.stringify(response.body),
    { status: response.status, headers: response.headers }
  );
}

function settlementHeaders(settlement: any) {
  return {
    "PAYMENT-RESPONSE": encodePaymentResponseHeader(settlement),
    "Cache-Control": "private, no-store"
  };
}

function completedResponse(response: unknown, settlement: any) {
  return NextResponse.json(response, { headers: settlementHeaders(settlement) });
}

function newLease() {
  return {
    token: crypto.randomBytes(16).toString("hex"),
    expiresAt: new Date(Date.now() + LEASE_MS)
  };
}

function getStoredPayment(operation: PaygGeneration): StoredPayment | null {
  const payment = operation.settlement as StoredPayment | null;
  return payment?.paymentPayload && payment?.paymentRequirements ? payment : null;
}

function getAuthorization(paymentPayload: any) {
  const authorization = paymentPayload?.payload?.authorization;
  const from = String(authorization?.from || "").toLowerCase();
  const nonce = String(authorization?.nonce || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(from) || !/^0x[a-f0-9]{64}$/.test(nonce)) return null;
  return {
    id: crypto.createHash("sha256").update(`${from}:${nonce}`).digest("hex"),
    payer: from
  };
}

function paymentMatchesOperation(payment: StoredPayment, operation: PaygGeneration) {
  const requirements = payment.paymentRequirements;
  const amount = String(requirements?.amount || "");
  return (
    String(requirements?.network || "") === operation.quotedNetwork &&
    String(requirements?.asset || "").toLowerCase() === operation.quotedAsset.toLowerCase() &&
    String(requirements?.payTo || "").toLowerCase() === operation.quotedPayTo.toLowerCase() &&
    /^\d+$/.test(amount) &&
    amount === operation.quotedAmountAtomic
  );
}

function getBaseClient() {
  return createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL!) });
}

async function recoverSettlement(
  payment: StoredPayment,
  settlementStartBlock: bigint | null,
  operation: PaygGeneration
) {
  const authorization = payment.paymentPayload?.payload?.authorization;
  const requirements = payment.paymentRequirements;
  const expectedAsset = String(requirements?.asset || "");
  const expectedPayTo = String(requirements?.payTo || "");
  const expectedAmount = String(requirements?.amount || "");
  if (
    !/^0x[a-fA-F0-9]{40}$/.test(authorization?.from || "") ||
    !/^0x[a-fA-F0-9]{64}$/.test(authorization?.nonce || "") ||
    !paymentMatchesOperation(payment, operation) ||
    expectedAsset.toLowerCase() !== PAYG_USDC_ADDRESS.toLowerCase() ||
    !/^0x[a-fA-F0-9]{40}$/.test(expectedPayTo) ||
    expectedPayTo.toLowerCase() !== operation.quotedPayTo.toLowerCase() ||
    !/^\d+$/.test(expectedAmount) ||
    BigInt(expectedAmount) <= 0n ||
    expectedAmount !== operation.quotedAmountAtomic
  ) return null;

  const client = getBaseClient();
  const latest = await client.getBlockNumber();
  const logs = await client.getLogs({
    address: PAYG_USDC_ADDRESS,
    event: AUTHORIZATION_USED,
    args: { authorizer: authorization.from, nonce: authorization.nonce },
    fromBlock: settlementStartBlock ?? (latest > 5000n ? latest - 5000n : 0n),
    toBlock: latest
  });
  const transaction = logs.at(-1)?.transactionHash;
  if (!transaction) return null;

  const receipt = await client.getTransactionReceipt({ hash: transaction });
  const expectedFrom = String(authorization.from).toLowerCase().replace(/^0x/, "");
  const expectedTo = expectedPayTo.toLowerCase().replace(/^0x/, "");
  const paid = receipt.status === "success" && receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== PAYG_USDC_ADDRESS.toLowerCase()) return false;
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) return false;
    const from = log.topics[1]?.slice(-40).toLowerCase();
    const to = log.topics[2]?.slice(-40).toLowerCase();
    if (from !== expectedFrom || to !== expectedTo) return false;
    try {
      return BigInt(log.data) === BigInt(expectedAmount);
    } catch {
      return false;
    }
  });
  return paid ? {
    success: true,
    transaction,
    network: "eip155:8453",
    payer: authorization.from,
    amount: expectedAmount
  } : null;
}

async function finishSettlement(
  operation: PaygGeneration,
  leaseToken: string,
  settlement: any
) {
  const updated = await prisma.paygGeneration.updateMany({
    where: { id: operation.id, status: "settling", leaseToken },
    data: {
      status: "completed",
      payer: settlement.payer || null,
      transactionHash: settlement.transaction,
      settlement: settlement as Prisma.InputJsonValue,
      leaseToken: null,
      leaseExpiresAt: null,
      error: null
    }
  });
  if (updated.count !== 1) return pendingResponse("PAYMENT_SETTLEMENT_PENDING");
  return completedResponse(operation.response, settlement);
}

function authorizationExpired(payment: StoredPayment) {
  const validBefore = Number(payment.paymentPayload?.payload?.authorization?.validBefore);
  return Number.isFinite(validBefore) && validBefore > 0 && validBefore <= Math.floor(Date.now() / 1000);
}

async function reconcileStaleSettlement(where: { userId?: string; payer?: string }) {
  const operation = await prisma.paygGeneration.findFirst({
    where: {
      status: "settling",
      leaseExpiresAt: { lt: new Date() },
      ...(where.userId && where.payer
        ? { OR: [{ userId: where.userId }, { payer: where.payer }] }
        : where)
    },
    orderBy: { updatedAt: "asc" }
  });
  if (!operation) return;
  const payment = getStoredPayment(operation);
  if (!payment) return;

  const lease = newLease();
  const claimed = await prisma.paygGeneration.updateMany({
    where: {
      id: operation.id,
      status: "settling",
      leaseExpiresAt: { lt: new Date() }
    },
    data: { leaseToken: lease.token, leaseExpiresAt: lease.expiresAt }
  });
  if (claimed.count !== 1) return;

  try {
    const settlement = await recoverSettlement(payment, operation.settlementStartBlock, operation);
    if (settlement) {
      await finishSettlement(operation, lease.token, settlement);
      return;
    }
  } catch (error: any) {
    console.error("[payg] stale settlement recovery failed", operation.id, error?.message || error);
    return;
  }

  if (!authorizationExpired(payment)) return;
  await prisma.paygGeneration.updateMany({
    where: { id: operation.id, status: "settling", leaseToken: lease.token },
    data: {
      status: "generated",
      authorizationId: null,
      payer: null,
      settlement: Prisma.DbNull,
      settlementStartBlock: null,
      leaseToken: null,
      leaseExpiresAt: null,
      error: "SETTLEMENT_FAILED:AUTHORIZATION_EXPIRED"
    }
  });
}

async function settleGeneratedOperation(
  server: PaygServer,
  req: NextRequest,
  operation: PaygGeneration,
  payment: StoredPayment
) {
  if (!operation.response) {
    return NextResponse.json({ error: "GENERATION_RESULT_MISSING" }, { status: 500 });
  }
  if (!paymentMatchesOperation(payment, operation)) {
    return NextResponse.json({ error: "PAYMENT_TERMS_MISMATCH" }, { status: 409 });
  }

  const lease = newLease();
  const now = new Date();
  const claimed = await prisma.paygGeneration.updateMany({
    where: {
      id: operation.id,
      OR: [
        { status: "ready_to_settle" },
        { status: "settling", leaseExpiresAt: { lt: now } }
      ]
    },
    data: { status: "settling", leaseToken: lease.token, leaseExpiresAt: lease.expiresAt, error: null }
  });
  if (claimed.count !== 1) return pendingResponse("PAYMENT_SETTLEMENT_PENDING");

  let settlement: any = null;
  if (operation.status === "settling") {
    try {
      settlement = await recoverSettlement(payment, operation.settlementStartBlock, operation);
    } catch (error: any) {
      console.error("[payg] settlement recovery failed", operation.id, error?.message || error);
    }
  }

  if (!settlement) {
    const context = {
      adapter: new NextAdapter(req),
      path: req.nextUrl.pathname,
      method: req.method,
      paymentHeader: req.headers.get("payment-signature") || undefined
    };
    try {
      settlement = await server.processSettlement(
        payment.paymentPayload,
        payment.paymentRequirements,
        payment.declaredExtensions,
        { request: context },
        undefined,
        undefined,
        "after-handler"
      );
    } catch (error: any) {
      console.error("[payg] settlement outcome pending", operation.id, error?.message || error);
      try {
        settlement = await recoverSettlement(payment, operation.settlementStartBlock, operation);
      } catch (recoveryError: any) {
        console.error("[payg] settlement recovery failed", operation.id, recoveryError?.message || recoveryError);
      }
      if (!settlement) return pendingResponse("PAYMENT_SETTLEMENT_PENDING", 3);
    }
  }

  if (!settlement.success) {
    try {
      const recovered = await recoverSettlement(payment, operation.settlementStartBlock, operation);
      if (recovered) settlement = recovered;
    } catch (error: any) {
      console.error("[payg] failed settlement recovery failed", operation.id, error?.message || error);
    }
  }
  if (settlement.success) {
    try {
      return await finishSettlement(operation, lease.token, settlement);
    } catch (error: any) {
      console.error("[payg] settlement persistence failed", operation.id, error?.message || error);
      return pendingResponse("PAYMENT_SETTLEMENT_PENDING", 3);
    }
  }

  await prisma.paygGeneration.updateMany({
    where: { id: operation.id, status: "settling", leaseToken: lease.token },
    data: {
      status: "generated",
      authorizationId: null,
      settlement: Prisma.DbNull,
      settlementStartBlock: null,
      leaseToken: null,
      leaseExpiresAt: null,
      error: `SETTLEMENT_FAILED:${settlement.errorReason || "UNKNOWN"}`
    }
  });
  return settlement.response
    ? protocolResponse(settlement.response)
    : NextResponse.json({ error: "PAYMENT_FAILED" }, { status: 402 });
}

async function generateBeforeSettlement(
  server: PaygServer,
  req: NextRequest,
  body: any,
  operation: PaygGeneration,
  payment: StoredPayment
) {
  const lease = newLease();
  const claimed = await prisma.paygGeneration.updateMany({
    where: {
      id: operation.id,
      OR: [
        { status: "verified" },
        { status: "generating", leaseExpiresAt: { lt: new Date() } }
      ]
    },
    data: { status: "generating", leaseToken: lease.token, leaseExpiresAt: lease.expiresAt, error: null }
  });
  if (claimed.count !== 1) return pendingResponse("GENERATION_PENDING");

  const headers = new Headers(req.headers);
  headers.delete("payment-signature");
  headers.set("x-nurxai-payg-grant", createPaygGrant({
    operationId: operation.id,
    userId: operation.userId,
    requestHash: operation.requestHash,
    leaseToken: lease.token
  }));
  const paidRequest = new NextRequest(new URL("/api/generate", req.url), {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const response = await generate(paidRequest);
  const responseBody = await response.clone().json().catch(() => null);

  if (!response.ok || !responseBody?.suggestions?.length) {
    await prisma.paygGeneration.updateMany({
      where: { id: operation.id, status: "generating", leaseToken: lease.token },
      data: {
        status: "verified",
        leaseToken: null,
        leaseExpiresAt: null,
        error: responseBody?.error || `HTTP_${response.status}`
      }
    });
    return response;
  }

  const cached = await prisma.paygGeneration.findUnique({ where: { id: operation.id } });
  if (cached?.status !== "ready_to_settle" || !cached.response) {
    return pendingResponse("GENERATION_PENDING");
  }
  return settleGeneratedOperation(server, req, cached, payment);
}

async function getServerResponse(operation: PaygGeneration) {
  try {
    return {
      server: await getPaygX402Server({
        network: operation.quotedNetwork as "eip155:8453",
        asset: operation.quotedAsset as typeof PAYG_USDC_ADDRESS,
        amountAtomic: operation.quotedAmountAtomic,
        payTo: operation.quotedPayTo
      }),
      response: null
    };
  } catch (error: any) {
    console.error("[payg] x402 initialization failed", error?.message || error);
    return {
      server: null,
      response: NextResponse.json({ error: "X402_UNAVAILABLE" }, { status: 503 })
    };
  }
}

export async function POST(req: NextRequest) {
  const config = getPaygConfig();
  if (!config.ready) {
    return NextResponse.json(
      { error: "PAYG_NOT_READY", message: "Onchain Pay As You Go is being configured." },
      { status: 503 }
    );
  }

  const [auth, body] = await Promise.all([
    getAuthUserFromHeader(req),
    req.clone().json().catch(() => ({}))
  ]);
  if (!auth?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!String(body?.context || "").trim()) {
    return NextResponse.json({ error: "EMPTY_CONTEXT" }, { status: 400 });
  }
  const operationId = body?.operationId;
  if (!isPaygOperationId(operationId)) {
    return NextResponse.json({ error: "BAD_OPERATION_ID" }, { status: 400 });
  }

  try {
    await ensurePaygSchema();
  } catch (error: any) {
    console.error("[payg] schema unavailable", error?.message || error);
    return NextResponse.json({ error: "PAYG_SCHEMA_NOT_READY" }, { status: 503 });
  }

  await reconcileStaleSettlement({ userId: auth.user.id });

  const requestHash = paygRequestHash(body);
  let operation = await prisma.paygGeneration.findUnique({ where: { id: operationId } });
  if (operation && (operation.userId !== auth.user.id || operation.requestHash !== requestHash)) {
    return NextResponse.json({ error: "OPERATION_CONFLICT" }, { status: 409 });
  }
  if (!operation) {
    const pricing = await getPaygPricing();
    const requestedRevision = Number(body?.pricingRevision);
    if (body?.pricingRevision !== undefined && requestedRevision !== pricing.revision) {
      return NextResponse.json({
        error: "PAYG_PRICE_CHANGED",
        retryable: true,
        pricing
      }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    }
    operation = await prisma.paygGeneration.create({
      data: {
        id: operationId,
        userId: auth.user.id,
        requestHash,
        status: "pending",
        pricingRevision: pricing.revision,
        quotedRegularPriceUSD: pricing.regularPriceUSD,
        quotedCurrentPriceUSD: pricing.currentPriceUSD,
        quotedAmountAtomic: pricing.amountAtomic,
        quotedNetwork: "eip155:8453",
        quotedAsset: PAYG_USDC_ADDRESS,
        quotedPayTo: getPaygConfig().payTo
      }
    }).catch(() => prisma.paygGeneration.findUnique({ where: { id: operationId } })) as PaygGeneration | null;
  }
  if (!operation) return NextResponse.json({ error: "OPERATION_CREATE_FAILED" }, { status: 500 });
  if (operation.userId !== auth.user.id || operation.requestHash !== requestHash) {
    return NextResponse.json({ error: "OPERATION_CONFLICT" }, { status: 409 });
  }

  if (operation.status === "completed" && operation.response && operation.settlement) {
    return completedResponse(operation.response, operation.settlement);
  }
  if (
    (operation.status === "generating" || operation.status === "settling") &&
    operation.leaseExpiresAt && operation.leaseExpiresAt.getTime() > Date.now()
  ) {
    return pendingResponse(operation.status === "generating" ? "GENERATION_PENDING" : "PAYMENT_SETTLEMENT_PENDING");
  }

  const storedPayment = getStoredPayment(operation);
  if (operation.status === "settling" && storedPayment) {
    const initialized = await getServerResponse(operation);
    if (!initialized.server) return initialized.response!;
    return settleGeneratedOperation(initialized.server, req, operation, storedPayment);
  }
  if ((operation.status === "verified" || operation.status === "generating") && storedPayment) {
    const initialized = await getServerResponse(operation);
    if (!initialized.server) return initialized.response!;
    return generateBeforeSettlement(initialized.server, req, body, operation, storedPayment);
  }
  if (operation.status === "ready_to_settle" && storedPayment) {
    const initialized = await getServerResponse(operation);
    if (!initialized.server) return initialized.response!;
    return settleGeneratedOperation(initialized.server, req, operation, storedPayment);
  }
  if (operation.status !== "pending" && operation.status !== "generated") {
    return NextResponse.json({ error: "OPERATION_STATE_INVALID" }, { status: 409 });
  }

  // Queue before issuing a payment challenge so the next authorization stays fresh.
  if (!req.headers.has("payment-signature")) {
    const activeOperation = await prisma.paygGeneration.findFirst({
      where: {
        id: { not: operation.id },
        userId: auth.user.id,
        status: { in: ["verified", "generating", "ready_to_settle", "settling"] }
      },
      select: { id: true }
    });
    if (activeOperation) {
      return NextResponse.json(
        { error: "PAYG_OPERATION_ACTIVE", retryable: true },
        { status: 409, headers: { "Retry-After": "2" } }
      );
    }
  }

  const initialized = await getServerResponse(operation);
  if (!initialized.server) return initialized.response!;
  const server = initialized.server;
  const context = {
    adapter: new NextAdapter(req),
    path: req.nextUrl.pathname,
    method: req.method,
    paymentHeader: req.headers.get("payment-signature") || undefined
  };
  let gate: Awaited<ReturnType<PaygServer["processHTTPRequest"]>>;
  try {
    gate = await server.processHTTPRequest(context);
  } catch (error: any) {
    console.error("[payg] payment verification failed", operation.id, error?.message || error);
    return NextResponse.json({ error: "X402_UNAVAILABLE" }, { status: 503 });
  }
  if (gate.type === "payment-error") return protocolResponse(gate.response);
  if (gate.type !== "payment-verified") {
    return NextResponse.json({ error: "X402_ROUTE_NOT_PROTECTED" }, { status: 500 });
  }
  if (extractPaymentIdentifier(gate.paymentPayload) !== operationId) {
    return NextResponse.json({ error: "PAYMENT_IDENTIFIER_MISMATCH" }, { status: 400 });
  }

  const authorization = getAuthorization(gate.paymentPayload);
  if (!authorization) {
    return NextResponse.json({ error: "INVALID_PAYMENT_AUTHORIZATION" }, { status: 400 });
  }
  await prisma.paygGeneration.updateMany({
    where: {
      id: { not: operation.id },
      status: { in: ["verified", "generating", "ready_to_settle"] },
      updatedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
      OR: [{ userId: auth.user.id }, { payer: authorization.payer }]
    },
    data: {
      status: "expired",
      authorizationId: null,
      payer: null,
      settlement: Prisma.DbNull,
      settlementStartBlock: null,
      leaseToken: null,
      leaseExpiresAt: null,
      error: "PAYMENT_AUTHORIZATION_EXPIRED"
    }
  });
  await reconcileStaleSettlement({ userId: auth.user.id, payer: authorization.payer });
  let settlementStartBlock: bigint;
  try {
    settlementStartBlock = await getBaseClient().getBlockNumber();
  } catch (error: any) {
    console.error("[payg] failed to record settlement block", operation.id, error?.message || error);
    return NextResponse.json({ error: "BASE_RPC_UNAVAILABLE" }, { status: 503 });
  }
  const payment: StoredPayment = {
    paymentPayload: gate.paymentPayload,
    paymentRequirements: gate.paymentRequirements,
    declaredExtensions: gate.declaredExtensions || null
  };
  const nextStatus = operation.response ? "ready_to_settle" : "verified";
  let accepted;
  try {
    accepted = await prisma.paygGeneration.updateMany({
      where: { id: operation.id, status: operation.status },
      data: {
        status: nextStatus,
        authorizationId: authorization.id,
        payer: authorization.payer,
        settlementStartBlock,
        settlement: payment as Prisma.InputJsonValue,
        error: null
      }
    });
  } catch (error: any) {
    if (error?.code === "P2002") {
      const target = JSON.stringify(error?.meta?.target || "");
      const code = target.includes("authorizationId")
        ? "PAYMENT_AUTHORIZATION_REUSED"
        : "PAYG_OPERATION_ACTIVE";
      return NextResponse.json(
        { error: code, retryable: true },
        { status: 409, headers: code === "PAYG_OPERATION_ACTIVE" ? { "Retry-After": "2" } : undefined }
      );
    }
    throw error;
  }
  if (accepted.count !== 1) return pendingResponse("PAYMENT_VERIFICATION_PENDING");

  const acceptedOperation: PaygGeneration = {
    ...operation,
    status: nextStatus,
    authorizationId: authorization.id,
    payer: authorization.payer,
    settlementStartBlock,
    settlement: payment
  };
  return operation.response
    ? settleGeneratedOperation(server, req, acceptedOperation, payment)
    : generateBeforeSettlement(server, req, body, acceptedOperation, payment);
}
