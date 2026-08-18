const PENDING_PREFIX = "nurai_payg_pending_v2_";
const CONFIG_KEY = "nurai_payg_config_v1";
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const PAYMENT_HEADER_TTL_MS = 5 * 60 * 1000;
const inFlight = new Map();

function decodeHeader(value) {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function fingerprint(body) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchPaygConfig(apiBase, force = false) {
  const cached = await chrome.storage.local.get(CONFIG_KEY);
  if (!force && cached[CONFIG_KEY]?.expiresAt > Date.now()) return cached[CONFIG_KEY].value;
  const response = await fetch(`${apiBase}/payg/config`, { cache: "no-store" });
  const config = await response.json().catch(() => ({}));
  if (!response.ok || !config.enabled) throw new Error("PAYG_NOT_READY");
  await chrome.storage.local.set({
    [CONFIG_KEY]: { value: config, expiresAt: Date.now() + 15_000 }
  });
  return config;
}

function quoteFromConfig(config) {
  const amount = String(config?.amount || "");
  const revision = Number(config?.pricingRevision);
  const payTo = String(config?.payTo || "");
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n || !Number.isInteger(revision) || revision < 1) {
    throw new Error("PAYG_NOT_READY");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) throw new Error("PAYG_NOT_READY");
  return {
    amount,
    revision,
    payTo,
    regularPriceUSD: String(config.regularPriceUSD || ""),
    currentPriceUSD: String(config.currentPriceUSD || "")
  };
}

async function requestWithRetries(url, headers, body, sessionGuard) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (!await sessionGuard()) throw new Error("PAYG_SESSION_CHANGED");
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    let operationActive = false;
    if (response.status === 409) {
      const data = await response.clone().json().catch(() => ({}));
      operationActive = data?.error === "PAYG_OPERATION_ACTIVE";
    }
    if (response.status !== 202 && !operationActive) return response;
    const retryAfter = Number(response.headers.get("Retry-After"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(5000, retryAfter * 1000)
      : Math.min(3000, 750 + attempt * 150);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("PAYMENT_SETTLEMENT_PENDING");
}

async function executePaygGenerate({
  apiBase,
  token,
  installId,
  version,
  baseBody,
  requestFingerprint,
  accountId,
  sessionGuard,
  signPayment,
  initialPricing
}) {
  const config = initialPricing?.amount && initialPricing?.pricingRevision && initialPricing?.payTo
    ? initialPricing
    : await fetchPaygConfig(apiBase, true);
  if (!await sessionGuard()) throw new Error("PAYG_SESSION_CHANGED");
  const pendingKey = `${PENDING_PREFIX}${accountId}_${requestFingerprint}`;
  const paymentKey = `${pendingKey}_payment`;
  const stored = await chrome.storage.local.get(pendingKey);
  const paymentStored = await chrome.storage.session.get(paymentKey);
  const previous = stored[pendingKey];
  const existing = previous?.fingerprint === requestFingerprint &&
    Date.now() - Number(previous.createdAt || 0) < PENDING_TTL_MS
    ? previous
    : null;
  const operationId = existing?.operationId || `payg_${crypto.randomUUID().replace(/-/g, "")}`;
  const quote = existing?.quote
    ? quoteFromConfig({
        amount: existing.quote.amount,
        pricingRevision: existing.quote.revision,
        payTo: existing.quote.payTo,
        regularPriceUSD: existing.quote.regularPriceUSD,
        currentPriceUSD: existing.quote.currentPriceUSD
      })
    : quoteFromConfig(config);
  const body = { ...baseBody, operationId, pricingRevision: quote.revision };
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-Install-Id": installId,
    "X-Client-Version": version
  };

  const storedPayment = paymentStored[paymentKey];
  if (existing && storedPayment?.expiresAt > Date.now() && storedPayment.paymentHeader) {
    headers["PAYMENT-SIGNATURE"] = storedPayment.paymentHeader;
  } else if (storedPayment) {
    await chrome.storage.session.remove(paymentKey);
  }
  await chrome.storage.local.set({
    [pendingKey]: {
      fingerprint: requestFingerprint,
      operationId,
      quote,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    }
  });

  let response;
  try {
    response = await requestWithRetries(`${apiBase}/payg/generate`, headers, body, sessionGuard);
  } catch (error) {
    const message = String(error?.message || error || "");
    if (message === "PAYG_SESSION_CHANGED") {
      return { ok: false, error: message };
    }
    return {
      ok: false,
      error: message === "PAYMENT_SETTLEMENT_PENDING" ? message : "NETWORK",
      retryable: true
    };
  }

  if (response.status === 402 && !headers["PAYMENT-SIGNATURE"]) {
    const challengeHeader = response.headers.get("PAYMENT-REQUIRED");
    if (!challengeHeader) return { ok: false, error: "BAD_PAYMENT_CHALLENGE" };
    let paymentHeader;
    try {
      paymentHeader = await signPayment({
        paymentRequired: decodeHeader(challengeHeader),
        operationId,
        expectedPayTo: quote.payTo,
        expectedAmount: quote.amount
      });
      await chrome.storage.session.set({
        [paymentKey]: { paymentHeader, expiresAt: Date.now() + PAYMENT_HEADER_TTL_MS }
      });
      headers["PAYMENT-SIGNATURE"] = paymentHeader;
    } catch (error) {
      const message = String(error?.message || error || "");
      return {
        ok: false,
        error: message.includes("setup") || message.includes("Sub Account") ? "PAYG_SETUP_REQUIRED" : "PAYMENT_FAILED",
        message
      };
    }
    try {
      response = await requestWithRetries(`${apiBase}/payg/generate`, headers, body, sessionGuard);
    } catch (error) {
      const message = String(error?.message || error || "");
      return {
        ok: false,
        error: message === "PAYMENT_SETTLEMENT_PENDING" ? message : "NETWORK",
        message,
        retryable: true
      };
    }
  }

  const data = await response.json().catch(() => ({}));
  if (response.ok) {
    await Promise.all([
      chrome.storage.local.remove(pendingKey),
      chrome.storage.session.remove(paymentKey)
    ]);
    return { ok: true, ...data, transaction: response.headers.get("PAYMENT-RESPONSE") || null };
  }
  if (response.status === 401) return { ok: false, error: "SESSION_EXPIRED" };
  if (data?.error === "PAYG_PRICE_CHANGED") {
    await Promise.all([
      chrome.storage.local.remove(pendingKey),
      chrome.storage.session.remove(paymentKey)
    ]);
    return { ok: false, error: data.error, retryable: true };
  }
  if (response.status === 402 || data?.error === "PAYMENT_AUTHORIZATION_REUSED") {
    await chrome.storage.session.remove(paymentKey);
    await chrome.storage.local.set({
      [pendingKey]: {
        fingerprint: requestFingerprint,
        operationId,
        quote,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now()
      }
    });
    return { ok: false, error: "PAYMENT_FAILED", message: data?.message || data?.error };
  }
  if (data?.error === "OPERATION_STATE_INVALID") {
    await Promise.all([
      chrome.storage.local.remove(pendingKey),
      chrome.storage.session.remove(paymentKey)
    ]);
    return { ok: false, error: "PAYMENT_RETRY_REQUIRED", retryable: true };
  }
  if (data?.error === "PAYG_OPERATION_ACTIVE") {
    return { ok: false, error: data.error, retryable: true };
  }
  return { ok: false, error: data?.error || "SERVER_ERROR", message: data?.message || "" };
}

export async function paygGenerate({
  apiBase,
  token,
  installId,
  version,
  requestBody,
  accountId,
  sessionGuard,
  signPayment
}) {
  const baseBody = {
    context: requestBody.context,
    imageUrls: requestBody.imageUrls || [],
    regenerate: Boolean(requestBody.regenerate),
    previousSuggestions: requestBody.previousSuggestions || []
  };
  const requestFingerprint = await fingerprint(baseBody);
  const inFlightKey = `${accountId}:${requestFingerprint}`;
  const current = inFlight.get(inFlightKey);
  if (current) return current;

  const request = executePaygGenerate({
    apiBase,
    token,
    installId,
    version,
    baseBody,
    requestFingerprint,
    accountId,
    sessionGuard,
    signPayment,
    initialPricing: requestBody.pricing || null
  }).catch((error) => ({
    ok: false,
    error: String(error?.message || error || "").includes("PAYG_NOT_READY")
      ? "PAYG_NOT_READY"
      : String(error?.message || error || "").includes("PAYG_SESSION_CHANGED")
        ? "PAYG_SESSION_CHANGED"
        : "NETWORK",
    retryable: true
  })).finally(() => {
    if (inFlight.get(inFlightKey) === request) inFlight.delete(inFlightKey);
  });
  inFlight.set(inFlightKey, request);
  return request;
}
