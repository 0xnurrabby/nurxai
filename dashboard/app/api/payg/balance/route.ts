import { NextRequest, NextResponse } from "next/server";
import { getPaygConfig, PAYG_USDC_ADDRESS } from "@/lib/payg-config";

export const runtime = "nodejs";

function balanceOfData(address: string) {
  return `0x70a08231${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

export async function GET(req: NextRequest) {
  if (!getPaygConfig().ready) {
    return NextResponse.json({ error: "PAYG_NOT_READY" }, { status: 503 });
  }
  const address = req.nextUrl.searchParams.get("address") || "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "BAD_ADDRESS" }, { status: 400 });
  }
  const rpcUrl = process.env.BASE_RPC_URL!;
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: PAYG_USDC_ADDRESS, data: balanceOfData(address) }, "latest"]
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store"
    });
    const result = await response.json();
    if (!response.ok || result?.error || !/^0x[0-9a-fA-F]+$/.test(result?.result || "")) {
      throw new Error(result?.error?.message || `RPC HTTP ${response.status}`);
    }
    const atomic = BigInt(result.result);
    return NextResponse.json({
      address,
      atomic: atomic.toString(),
      balance: Number(atomic) / 1_000_000,
      symbol: "USDC",
      network: "Base"
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: any) {
    console.error("[payg] balance RPC failed", error?.message || error);
    return NextResponse.json({ error: "BASE_RPC_UNAVAILABLE" }, { status: 502 });
  }
}
