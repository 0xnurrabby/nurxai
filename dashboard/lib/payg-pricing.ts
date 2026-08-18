import { prisma } from "@/lib/db";

export const DEFAULT_PAYG_PRICE_USD = "0.009000";
const PRICING_ID = "default";
const MAX_PRICE_ATOMIC = 100_000_000n;

export type PaygPricing = {
  regularPriceUSD: string;
  currentPriceUSD: string;
  amountAtomic: string;
  revision: number;
  updatedAt: string;
};

export function normalizePaygPrice(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/.test(raw)) {
    throw new Error("Price must be a positive USD amount with up to 6 decimal places.");
  }
  const [whole, fraction = ""] = raw.split(".");
  const normalized = `${whole}.${fraction.padEnd(6, "0")}`;
  const amountAtomic = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (amountAtomic <= 0n || amountAtomic > MAX_PRICE_ATOMIC) {
    throw new Error("Price must be between $0.000001 and $100.");
  }
  return { usd: normalized, amountAtomic: amountAtomic.toString() };
}

export function formatPaygPrice(value: string) {
  const compact = value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return `$${compact}`;
}

export function paygDiscountPercent(regularPriceUSD: string, currentPriceUSD: string) {
  const regular = Number(regularPriceUSD);
  const current = Number(currentPriceUSD);
  if (!Number.isFinite(regular) || !Number.isFinite(current) || current >= regular) return 0;
  return Math.min(99.99, Number(((1 - current / regular) * 100).toFixed(2)));
}

export function isPaygDiscounted(regularPriceUSD: string, currentPriceUSD: string) {
  return BigInt(normalizePaygPrice(currentPriceUSD).amountAtomic) <
    BigInt(normalizePaygPrice(regularPriceUSD).amountAtomic);
}

function serializePricing(row: {
  regularPriceUSD: { toFixed(digits: number): string };
  currentPriceUSD: { toFixed(digits: number): string };
  revision: number;
  updatedAt: Date;
}): PaygPricing {
  const regularPriceUSD = row.regularPriceUSD.toFixed(6);
  const currentPriceUSD = row.currentPriceUSD.toFixed(6);
  return {
    regularPriceUSD,
    currentPriceUSD,
    amountAtomic: normalizePaygPrice(currentPriceUSD).amountAtomic,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function getPaygPricing() {
  const existing = await prisma.paygPricing.findUnique({ where: { id: PRICING_ID } });
  const row = existing || await prisma.paygPricing.create({
    data: {
      id: PRICING_ID,
      regularPriceUSD: DEFAULT_PAYG_PRICE_USD,
      currentPriceUSD: DEFAULT_PAYG_PRICE_USD,
      revision: 1
    }
  }).catch(() => prisma.paygPricing.findUniqueOrThrow({ where: { id: PRICING_ID } }));
  return serializePricing(row);
}

export { serializePricing };
