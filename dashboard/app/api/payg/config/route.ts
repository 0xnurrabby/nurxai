import { NextResponse } from "next/server";
import {
  getPaygConfig,
  PAYG_CHAIN_ID,
  PAYG_NETWORK,
  PAYG_USDC_ADDRESS
} from "@/lib/payg-config";
import { ensurePaygSchema } from "@/lib/schema-guard";
import { formatPaygPrice, getPaygPricing, isPaygDiscounted, paygDiscountPercent } from "@/lib/payg-pricing";

export const runtime = "nodejs";

export async function GET() {
  const config = getPaygConfig();
  await ensurePaygSchema();
  const pricing = await getPaygPricing();
  const regularPrice = formatPaygPrice(pricing.regularPriceUSD);
  const currentPrice = formatPaygPrice(pricing.currentPriceUSD);
  return NextResponse.json({
    enabled: config.ready,
    chainId: PAYG_CHAIN_ID,
    network: PAYG_NETWORK,
    asset: PAYG_USDC_ADDRESS,
    amount: pricing.amountAtomic,
    price: currentPrice,
    regularPrice,
    currentPrice,
    regularPriceUSD: pricing.regularPriceUSD,
    currentPriceUSD: pricing.currentPriceUSD,
    pricingRevision: pricing.revision,
    discounted: isPaygDiscounted(pricing.regularPriceUSD, pricing.currentPriceUSD),
    discountPercent: paygDiscountPercent(pricing.regularPriceUSD, pricing.currentPriceUSD),
    payTo: config.ready ? config.payTo : null,
    features: ["GPT", "Grok", "Gemini", "image understanding", "styles", "project context"],
    unlimited: true
  }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
