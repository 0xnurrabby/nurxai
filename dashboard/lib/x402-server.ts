import crypto from "node:crypto";
import { SignJWT, importJWK, importPKCS8 } from "jose";
import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer
} from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  BUILDER_CODE,
  builderCodeResourceServerExtension,
  declareBuilderCodeExtension
} from "@x402/extensions/builder-code";
import {
  PAYMENT_IDENTIFIER,
  declarePaymentIdentifierExtension,
  paymentIdentifierResourceServerExtension
} from "@x402/extensions/payment-identifier";
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension
} from "@x402/extensions/bazaar";
import { getPaygConfig, PAYG_NETWORK, PAYG_ROUTE, PAYG_USDC_ADDRESS } from "@/lib/payg-config";

const CDP_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";
const CDP_HOST = "api.cdp.coinbase.com";
const CDP_BASE_PATH = "/platform/v2/x402";
const GAS_SPONSORING_EIP2612 = "eip2612GasSponsoring";
const GAS_SPONSORING_APPROVAL = "erc20ApprovalGasSponsoring";

type PaygServer = x402HTTPResourceServer;
const serverPromises = new Map<string, Promise<PaygServer>>();

async function cdpJwt(method: "GET" | "POST", path: string) {
  const keyId = process.env.CDP_API_KEY_ID?.trim();
  const secret = process.env.CDP_API_KEY_SECRET?.trim();
  if (!keyId || !secret) throw new Error("CDP facilitator credentials are not configured.");

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: keyId,
    iss: "cdp",
    uris: [`${method} ${CDP_HOST}${path}`]
  };
  const nonce = crypto.randomBytes(16).toString("hex");

  if (secret.includes("BEGIN")) {
    const key = await importPKCS8(secret.replace(/\\n/g, "\n"), "ES256");
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT", nonce })
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + 120)
      .sign(key);
  }

  const decoded = Buffer.from(secret, "base64");
  if (decoded.length !== 64) throw new Error("CDP Ed25519 API secret must decode to 64 bytes.");
  const key = await importJWK({
    kty: "OKP",
    crv: "Ed25519",
    d: decoded.subarray(0, 32).toString("base64url"),
    x: decoded.subarray(32).toString("base64url")
  }, "EdDSA");
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: keyId, typ: "JWT", nonce })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 120)
    .sign(key);
}

type PaygTerms = {
  network: typeof PAYG_NETWORK;
  asset: typeof PAYG_USDC_ADDRESS;
  amountAtomic: string;
  payTo: string;
};

async function createServer(config: ReturnType<typeof getPaygConfig>, terms: PaygTerms) {
  if (!config.ready) throw new Error("PAYG x402 is not fully configured.");

  const facilitator = new HTTPFacilitatorClient({
    url: CDP_FACILITATOR_URL,
    timeoutMs: 30_000,
    createAuthHeaders: async () => {
      const [verify, settle, supported] = await Promise.all([
        cdpJwt("POST", `${CDP_BASE_PATH}/verify`),
        cdpJwt("POST", `${CDP_BASE_PATH}/settle`),
        cdpJwt("GET", `${CDP_BASE_PATH}/supported`)
      ]);
      return {
        verify: { Authorization: `Bearer ${verify}` },
        settle: { Authorization: `Bearer ${settle}` },
        supported: { Authorization: `Bearer ${supported}` }
      };
    }
  });
  const resourceServer = new x402ResourceServer(facilitator)
    .register(PAYG_NETWORK, new ExactEvmScheme())
    .registerExtension(builderCodeResourceServerExtension)
    .registerExtension(paymentIdentifierResourceServerExtension)
    .registerExtension(bazaarResourceServerExtension);
  const discovery = declareDiscoveryExtension({
    bodyType: "json",
    input: {
      context: "Post text to reply to",
      imageUrls: [],
      regenerate: false,
      previousSuggestions: [],
      sourceLanguage: "en",
      operationId: "payg_unique_operation_id"
    },
    inputSchema: {
      properties: {
        context: { type: "string", minLength: 1, maxLength: 1500 },
        imageUrls: { type: "array", maxItems: 4, items: { type: "string", format: "uri" } },
        regenerate: { type: "boolean" },
        previousSuggestions: { type: "array", maxItems: 12, items: { type: "string" } },
        sourceLanguage: { type: "string", minLength: 2, maxLength: 35 },
        operationId: { type: "string", minLength: 16, maxLength: 128 }
      },
      required: ["context", "operationId"]
    },
    output: {
      example: {
        suggestions: ["reply 1", "reply 2", "reply 3", "reply 4"],
        aiStack: "GPT + Grok + Gemini",
        visionUsed: true,
        searchUsed: true
      }
    }
  });
  const server = new x402HTTPResourceServer(resourceServer, {
    [PAYG_ROUTE]: {
      accepts: {
        scheme: "exact",
        network: terms.network,
        price: {
          asset: terms.asset,
          amount: terms.amountAtomic,
          extra: { name: "USD Coin", version: "2" }
        },
        payTo: terms.payTo,
        maxTimeoutSeconds: 300
      },
      description: "Four Premium NurAi reply suggestions with GPT, Grok, Gemini, image understanding, styles, and project context.",
      mimeType: "application/json",
      serviceName: "NurAi Pay As You Go",
      tags: ["ai", "social", "x", "base", "premium"],
      iconUrl: "https://nurxai.xyz/icon.png",
      extensions: {
        [BUILDER_CODE]: declareBuilderCodeExtension(config.builderCode, "nurai_server"),
        [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true),
        [GAS_SPONSORING_EIP2612]: {},
        [GAS_SPONSORING_APPROVAL]: {},
        ...discovery
      }
    }
  });
  await server.initialize();
  return server;
}

export function getPaygX402Server(terms: PaygTerms) {
  if (
    terms.network !== PAYG_NETWORK ||
    terms.asset.toLowerCase() !== PAYG_USDC_ADDRESS.toLowerCase() ||
    !/^\d+$/.test(terms.amountAtomic) ||
    BigInt(terms.amountAtomic) <= 0n ||
    !/^0x[a-fA-F0-9]{40}$/.test(terms.payTo)
  ) {
    throw new Error("PAYG amount is invalid.");
  }
  const config = getPaygConfig();
  const key = `${terms.network}:${terms.asset.toLowerCase()}:${terms.payTo.toLowerCase()}:${terms.amountAtomic}:${config.builderCode}`;
  let serverPromise = serverPromises.get(key);
  if (!serverPromise) {
    serverPromise = createServer(config, terms).catch((error) => {
      serverPromises.delete(key);
      throw error;
    });
    serverPromises.set(key, serverPromise);
  }
  return serverPromise;
}
