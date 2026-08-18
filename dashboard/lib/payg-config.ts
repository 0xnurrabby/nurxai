export const PAYG_NETWORK = "eip155:8453" as const;
export const PAYG_CHAIN_ID = 8453;
export const PAYG_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const PAYG_ROUTE = "POST /api/payg/generate";

export function getPaygConfig() {
  const payTo = (process.env.X402_PAY_TO || "").trim();
  const builderCode = (process.env.X402_BUILDER_CODE || "").trim();
  const enabled = process.env.PAYG_X402_ENABLED === "true";

  return {
    enabled,
    ready:
      enabled &&
      /^0x[a-fA-F0-9]{40}$/.test(payTo) &&
      /^[a-z0-9_]{1,32}$/.test(builderCode) &&
      Boolean(process.env.CDP_API_KEY_ID?.trim()) &&
      Boolean(process.env.CDP_API_KEY_SECRET?.trim()) &&
      Boolean(process.env.PAYG_INTERNAL_SECRET && process.env.PAYG_INTERNAL_SECRET.length >= 32) &&
      Boolean(process.env.BASE_RPC_URL?.trim()),
    payTo,
    builderCode
  };
}
