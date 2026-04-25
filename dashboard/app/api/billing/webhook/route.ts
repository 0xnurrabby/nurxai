import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { PLANS, PlanKey } from "@/lib/plans";

export const runtime = "nodejs";

function sortedJSON(obj: any): string {
  if (Array.isArray(obj)) return "[" + obj.map(sortedJSON).join(",") + "]";
  if (obj && typeof obj === "object") {
    return "{" + Object.keys(obj).sort().map(k => JSON.stringify(k) + ":" + sortedJSON(obj[k])).join(",") + "}";
  }
  return JSON.stringify(obj);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-nowpayments-sig") || "";
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) return NextResponse.json({ ok: false }, { status: 500 });

  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const expected = crypto.createHmac("sha512", secret).update(sortedJSON(body)).digest("hex");
  if (sig !== expected) return NextResponse.json({ ok: false }, { status: 401 });

  const { order_id, payment_status } = body;
  if (!order_id) return NextResponse.json({ ok: true });

  const payment = await prisma.payment.findUnique({ where: { providerId: order_id } });
  if (!payment) return NextResponse.json({ ok: true });

  if (["finished", "confirmed"].includes(payment_status)) {
    const p = PLANS[payment.plan as PlanKey];
    if (!p) return NextResponse.json({ ok: true });
    const endsAt = new Date(Date.now() + p.days * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: { userId: payment.userId, plan: payment.plan, status: "active", endsAt }
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "confirmed" } });
    await prisma.auditLog.create({
      data: { userId: payment.userId, event: "subscription_activated", meta: { plan: payment.plan } as any }
    });
  } else if (["failed", "expired"].includes(payment_status)) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed"
