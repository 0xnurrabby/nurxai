import { NextRequest, NextResponse } from "next/server";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { nowPaymentsClient, processNowPaymentsUpdate } from "@/lib/nowpayments-billing";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await ensureRuntimeSchema();
    const raw = await req.text();
    const signature = req.headers.get("x-nowpayments-sig") || "";
    if (!process.env.NOWPAYMENTS_IPN_SECRET) {
      return NextResponse.json({ ok: false, error: "MISSING_IPN_SECRET" }, { status: 500 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    try {
      const event = nowPaymentsClient().parseWebhook(body, signature);
      if (event.type !== "payment.status_changed") {
        return NextResponse.json({ ok: true, ignored: "unknown_event" });
      }
    } catch (error) {
      console.error("Invalid NOWPayments webhook signature:", error);
      return NextResponse.json({ ok: false, error: "BAD_SIGNATURE" }, { status: 401 });
    }

    const result = await processNowPaymentsUpdate(body, "webhook", { allowRecovery: true });
    if (!result.ok) {
      const status = result.error === "UNKNOWN_ORDER" || result.error === "UNKNOWN_USER" ? 404 : 422;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json({ ok: true, status: result.status, activated: result.activated });
  } catch (error) {
    console.error("NOWPayments webhook processing failed:", error);
    return NextResponse.json({ ok: false, error: "WEBHOOK_PROCESSING_FAILED" }, { status: 500 });
  }
}
