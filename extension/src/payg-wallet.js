import { createBaseAccountSDK, getCryptoKeyAccount } from "@base-org/account";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { BuilderCodeClientExtension } from "@x402/extensions/builder-code";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import {
  PAYMENT_IDENTIFIER,
  appendPaymentIdentifierToExtensions
} from "@x402/extensions/payment-identifier";
import { createPublicClient, decodeAbiParameters, http, parseAbi } from "viem";
import { base } from "viem/chains";

const CHAIN_ID = 8453;
const NETWORK = "eip155:8453";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const OWNER_ABI = parseAbi([
  "function isOwnerPublicKey(bytes32 x, bytes32 y) view returns (bool)"
]);

let sdk;
let provider;

function getSdk() {
  if (!sdk) {
    sdk = createBaseAccountSDK({
      appName: "NurAi Pay As You Go",
      appLogoUrl: "https://nurxai.xyz/icon.png",
      appChainIds: [CHAIN_ID],
      preference: { telemetry: false },
      subAccounts: {
        creation: "manual",
        defaultAccount: "sub",
        funding: "manual",
        toOwnerAccount: getCryptoKeyAccount
      }
    });
    provider = sdk.getProvider();
  }
  return sdk;
}

async function hasPublicKeyOwner(address, publicKey) {
  const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
  const code = await client.getCode({ address });
  if (!code) return null;
  const [x, y] = decodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }],
    publicKey
  );
  return client.readContract({
    address,
    abi: OWNER_ABI,
    functionName: "isOwnerPublicKey",
    args: [x, y]
  });
}

async function waitForPublicKeyOwner(address, publicKey) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await hasPublicKeyOwner(address, publicKey).catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("The Base Sub Account owner update was not confirmed.");
}

export async function setupPaygWallet(previousOwner, forceReconnect = false) {
  const accountSdk = getSdk();
  if (forceReconnect) await provider.disconnect().catch(() => null);
  const accounts = await provider.request({ method: "eth_requestAccounts", params: [] });
  const universalAddress = Array.isArray(accounts) ? accounts[0] : null;
  if (!universalAddress) throw new Error("Base Account connection was not completed.");
  const { account } = await getCryptoKeyAccount();
  if (!account?.publicKey) throw new Error("Could not create the local non-extractable signer.");

  let subAccount = await accountSdk.subAccount.get();
  if (!subAccount) {
    subAccount = await accountSdk.subAccount.create({
      type: "create",
      keys: [{ type: "webcrypto-p256", publicKey: account.publicKey }]
    });
  } else {
    const isOwner = await hasPublicKeyOwner(subAccount.address, account.publicKey);
    const cachedUndeployedOwner = isOwner === null &&
      String(previousOwner?.address || "").toLowerCase() === subAccount.address.toLowerCase() &&
      String(previousOwner?.publicKey || "").toLowerCase() === String(account.publicKey).toLowerCase();
    if (isOwner !== true && !cachedUndeployedOwner) {
      await accountSdk.subAccount.addOwner({ publicKey: account.publicKey, chainId: CHAIN_ID });
      await waitForPublicKeyOwner(subAccount.address, account.publicKey);
    }
  }
  if (!subAccount?.address) throw new Error("Base Sub Account creation was not completed.");

  return {
    universalAddress,
    address: subAccount.address,
    ownerPublicKey: account.publicKey,
    expiresAt: Date.now() + SESSION_MS
  };
}

export async function createPaygPayment(paymentRequired, operationId, expectedPayTo, expectedAmount, expectedPayer) {
  if (!/^\d+$/.test(String(expectedAmount || "")) || BigInt(expectedAmount) <= 0n) {
    throw new Error("PAYG price quote is invalid.");
  }
  if (!paymentRequired || paymentRequired.x402Version !== 2) throw new Error("Unsupported x402 response.");
  const requirement = paymentRequired.accepts?.find((item) =>
    item?.scheme === "exact" &&
    item?.network === NETWORK &&
    String(item?.asset || "").toLowerCase() === USDC.toLowerCase() &&
    String(item?.amount || "") === String(expectedAmount) &&
    item?.extra?.name === "USD Coin" &&
    item?.extra?.version === "2" &&
    String(item?.payTo || "").toLowerCase() === String(expectedPayTo || "").toLowerCase()
  );
  if (!requirement) throw new Error("Payment request did not match NurAi's pinned Base USDC terms.");

  const accountSdk = getSdk();
  const subAccount = await accountSdk.subAccount.get();
  const { account } = await getCryptoKeyAccount();
  if (!subAccount?.address || !account) throw new Error("PAYG wallet setup is required.");
  if (subAccount.address.toLowerCase() !== String(expectedPayer || "").toLowerCase()) {
    throw new Error("PAYG signer does not match the active wallet session.");
  }

  const signer = {
    address: subAccount.address,
    signTypedData: (typedData) => provider.request({
      method: "eth_signTypedData_v4",
      params: [subAccount.address, typedData]
    })
  };
  const client = new x402Client()
    .register(NETWORK, new ExactEvmScheme(signer, { rpcUrl: "https://mainnet.base.org" }))
    .registerExtension(new BuilderCodeClientExtension("nurai_extension"))
    .registerExtension({
      key: PAYMENT_IDENTIFIER,
      enrichPaymentPayload: async (payload, required) => {
        const extensions = structuredClone(required.extensions || {});
        appendPaymentIdentifierToExtensions(extensions, operationId);
        return { ...payload, extensions };
      }
    });
  const payload = await client.createPaymentPayload({
    ...paymentRequired,
    accepts: [requirement]
  });
  return encodePaymentSignatureHeader(payload);
}
