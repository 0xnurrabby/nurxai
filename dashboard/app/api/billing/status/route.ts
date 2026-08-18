import { NextRequest, NextResponse } from "next/server";
import { getSessionFromAuthHeader } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { ensureRuntimeSchema } from "@/lib/schema-guard";
import { paymentProviderStatus, reconcileNowPaymentsOrder } from "@/lib/nowpayments-billing";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSessionFromAuthHeader(req);
  if (!session?.sub) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await ensureRuntimeSchema();

  const orderId = new URL(req.url).searchParams.get("order")?.trim() || "";
  if (!orderId || orderId.length > 200) {
    return NextResponse.json({ error: "BAD_ORDER" }, { status: 400 });
  }

  let payment = await prisma.payment.findFirst({
    where: { providerId: orderId, userId: session.sub, provider: "nowpayments" }
  });
  if (!payment) return NextResponse.json({ error: "PAYMENT_NOT_FOUND" }, { status: 404 });

  if (payment.status !== "confirmed" && payment.status !== "activating") {
    await reconcileNowPaymentsOrder(payment, "user_reconcile");
    payment = await prisma.payment.findUnique({ where: { id: payment.id } }) || payment;
  }

  return NextResponse.json({
    orderId: payment.providerId,
    status: payment.status,
    providerStatus: paymentProviderStatus(payment.raw),
    terminal: payment.status === "confirmed" || payment.status === "failed",
    message:
      payment.status === "confirmed"
        ? "Payment confirmed. Your subscription is active or scheduled."
        : payment.status === "failed"
          ? "The payment did not complete. Contact support if funds were deducted."
          : "Payment received or still processing. Activation will happen automatically."
  });
}
