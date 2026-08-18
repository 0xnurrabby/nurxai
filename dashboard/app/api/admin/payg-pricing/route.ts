import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { ensurePaygSchema } from "@/lib/schema-guard";
import {
  DEFAULT_PAYG_PRICE_USD,
  getPaygPricing,
  isPaygDiscounted,
  normalizePaygPrice,
  paygDiscountPercent,
  serializePricing
} from "@/lib/payg-pricing";

export const runtime = "nodejs";

function response(pricing: Awaited<ReturnType<typeof getPaygPricing>>) {
  return {
    ...pricing,
    discounted: isPaygDiscounted(pricing.regularPriceUSD, pricing.currentPriceUSD),
    discountPercent: paygDiscountPercent(pricing.regularPriceUSD, pricing.currentPriceUSD)
  };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensurePaygSchema();
  return NextResponse.json(response(await getPaygPricing()), {
    headers: { "Cache-Control": "private, no-store" }
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await ensurePaygSchema();

  const body = await req.json().catch(() => ({}));
  if (
    (typeof body?.regularPriceUSD !== "string" && typeof body?.regularPriceUSD !== "number") ||
    (typeof body?.currentPriceUSD !== "string" && typeof body?.currentPriceUSD !== "number") ||
    !Number.isInteger(Number(body?.revision))
  ) {
    return NextResponse.json({ error: "MISSING_PRICE_FIELDS", message: "Both prices and the current revision are required." }, { status: 400 });
  }
  let regular;
  let current;
  try {
    regular = normalizePaygPrice(body?.regularPriceUSD ?? DEFAULT_PAYG_PRICE_USD);
    current = normalizePaygPrice(body?.currentPriceUSD ?? DEFAULT_PAYG_PRICE_USD);
  } catch (error: any) {
    return NextResponse.json({ error: "INVALID_PRICE", message: error?.message }, { status: 400 });
  }
  if (BigInt(current.amountAtomic) > BigInt(regular.amountAtomic)) {
    return NextResponse.json(
      { error: "INVALID_DISCOUNT", message: "Current price cannot be higher than regular price." },
      { status: 400 }
    );
  }

  let pricing;
  try {
    pricing = await prisma.$transaction(async (tx) => {
      const before = await tx.paygPricing.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          regularPriceUSD: DEFAULT_PAYG_PRICE_USD,
          currentPriceUSD: DEFAULT_PAYG_PRICE_USD,
          revision: 1
        },
        update: {}
      });
      const previous = serializePricing(before);
      if (before.revision !== Number(body.revision)) throw new Error("PAYG_PRICING_STALE");
      if (previous.regularPriceUSD === regular.usd && previous.currentPriceUSD === current.usd) return before;

      const changed = await tx.paygPricing.updateMany({
        where: { id: "default", revision: before.revision },
        data: {
          regularPriceUSD: regular.usd,
          currentPriceUSD: current.usd,
          revision: { increment: 1 },
          updatedById: admin.id
        }
      });
      if (changed.count !== 1) throw new Error("PAYG_PRICING_STALE");
      const updated = await tx.paygPricing.findUniqueOrThrow({ where: { id: "default" } });
      await tx.auditLog.create({
        data: {
          userId: admin.id,
          event: "admin_update_payg_pricing",
          meta: {
            from: previous,
            to: serializePricing(updated)
          } as any
        }
      });
      return updated;
    });
  } catch (error: any) {
    if (error?.message === "PAYG_PRICING_STALE") {
      return NextResponse.json(
        { error: "PAYG_PRICING_STALE", message: "Pricing changed in another session. Refresh and try again." },
        { status: 409 }
      );
    }
    throw error;
  }

  return NextResponse.json(response(serializePricing(pricing)), {
    headers: { "Cache-Control": "private, no-store" }
  });
}
