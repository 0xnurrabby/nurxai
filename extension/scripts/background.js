// background.js — NurAi service worker
import { CONFIG } from "./config.js";
import { log, audit } from "./logger.js";
import { tryAcquire } from "./rate-limiter.js";
import { secureUUID, encryptString, decryptString } from "./crypto-utils.js";
import { paygGenerate } from "./payg-client.js";

const get = (k) => chrome.storage.local.get(k);
const set = (o) => chrome.storage.local.set(o);
const del = (k) => chrome.storage.local.remove(k);
const PAYG_OFFSCREEN_URL = "payg-offscreen.html";
const PAYG_PENDING_PREFIX = "nurai_payg_pending_v2_";
const paygSignerNonce = crypto.randomUUID();
let creatingPaygOffscreen = null;
let paygAccountEpoch = 0;
let paygPublicConfigCache = null;

async function getPaygPublicConfig(force = false) {
  if (!force && paygPublicConfigCache?.expiresAt > Date.now()) return paygPublicConfigCache.value;
  try {
    const response = await fetch(`${CONFIG.API_BASE}/payg/config`, { cache: "no-store" });
    if (!response.ok) throw new Error("PAYG_CONFIG_UNAVAILABLE");
    const value = await response.json();
    paygPublicConfigCache = { value, expiresAt: Date.now() + 15_000 };
    return value;
  } catch (error) {
    if (!force && paygPublicConfigCache?.value) return paygPublicConfigCache.value;
    throw error;
  }
}

async function clearPendingPaymentHeaders() {
  const values = await chrome.storage.session.get(null);
  const keys = Object.keys(values).filter((key) => key.startsWith(PAYG_PENDING_PREFIX) && key.endsWith("_payment"));
  if (keys.length) await chrome.storage.session.remove(keys);
}

async function ensurePaygOffscreen() {
  const documentUrl = chrome.runtime.getURL(`${PAYG_OFFSCREEN_URL}?nonce=${encodeURIComponent(paygSignerNonce)}`);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (contexts.some((context) => context.documentUrl === documentUrl)) return;
  if (!creatingPaygOffscreen) {
    creatingPaygOffscreen = (async () => {
      if (contexts.length) await chrome.offscreen.closeDocument();
      await chrome.offscreen.createDocument({
        url: documentUrl,
        reasons: ["LOCAL_STORAGE"],
        justification: "Use the user-approved non-extractable Base Sub Account key for x402 payment signing."
      });
    })().finally(() => {
      creatingPaygOffscreen = null;
    });
  }
  await creatingPaygOffscreen;
}

async function resetPaygOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (contexts.length) await chrome.offscreen.closeDocument();
}

async function clearPaygState() {
  paygAccountEpoch += 1;
  await chrome.storage.local.remove([
    CONFIG.STORAGE_KEYS.PAYG_SESSION,
    CONFIG.STORAGE_KEYS.PAYG_ENABLED
  ]);
  await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.PAYG_RECONNECT_REQUIRED]: true });
  const session = await chrome.storage.session.get(null);
  const sessionKeys = Object.keys(session).filter((key) => key.startsWith(PAYG_PENDING_PREFIX));
  if (sessionKeys.length) await chrome.storage.session.remove(sessionKeys);
  await resetPaygOffscreen();
}

function tokenSubject(token) {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return null;
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    return typeof payload?.sub === "string" && payload.sub.length <= 128 ? payload.sub : null;
  } catch {
    return null;
  }
}

async function signPaygPayment(input) {
  await ensurePaygOffscreen();
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("PAYMENT_SIGNING_TIMEOUT")), 30_000);
  });
  const response = await Promise.race([
    chrome.runtime.sendMessage({
      target: "payg-offscreen",
      type: "NURAI_PAYG_SIGN",
      signerNonce: paygSignerNonce,
      ...input
    }),
    timeout
  ]);
  if (!response?.ok || !response.paymentHeader) {
    throw new Error(response?.error || "PAYMENT_SIGNING_FAILED");
  }
  return response.paymentHeader;
}

/* ---------- Token storage (encrypted at rest) ---------- */
// The JWT is stored AES-GCM encrypted under a per-install master key. Older
// installs may still hold a plaintext string token, so reads fall back to it.
async function setToken(token) {
  const enc = await encryptString(token);
  await set({ [CONFIG.STORAGE_KEYS.TOKEN]: enc });
}
async function getToken() {
  const r = await get(CONFIG.STORAGE_KEYS.TOKEN);
  const stored = r[CONFIG.STORAGE_KEYS.TOKEN];
  if (!stored) return null;
  if (typeof stored === "string") return stored; // legacy plaintext token
  return decryptString(stored);
}

async function getInstallId() {
  const k = CONFIG.STORAGE_KEYS.INSTALL_ID;
  const r = await get(k);
  if (r[k]) return r[k];
  const id = secureUUID();
  await set({ [k]: id });
  return id;
}

async function extensionIsEnabled() {
  const stored = await get(CONFIG.STORAGE_KEYS.EXTENSION_ENABLED);
  return stored[CONFIG.STORAGE_KEYS.EXTENSION_ENABLED] !== false;
}

/* ---------- Validation ---------- */
function sanitizeContext(t) {
  if (typeof t !== "string") return "";
  return t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim().slice(0, CONFIG.MAX_TWEET_CONTEXT_LENGTH);
}
function validateSuggestions(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(s => typeof s === "string" && s.trim())
    .map(s => cleanSuggestion(s).slice(0, CONFIG.MAX_SUGGESTION_LENGTH))
    .filter(Boolean)
    .slice(0, CONFIG.MAX_SUGGESTIONS);
}

function cleanSuggestion(s) {
  const strip = (line) => line.trim().replace(/^["“”]+|["“”]+$/g, "");
  return String(s).trim().replace(/\r\n?/g, "\n").split("\n").map(strip).join("\n").trim();
}

/* ---------- Backend call ---------- */
async function callGenerate(context, imageUrls, regenerate, previousSuggestions) {
  const token = await getToken();
  if (!token) return { ok: false, error: "NOT_LOGGED_IN" };

  const installId = await getInstallId();
  let resp;
  try {
    resp = await fetch(`${CONFIG.API_BASE}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "X-Install-Id": installId,
        "X-Client-Version": chrome.runtime.getManifest().version
      },
      body: JSON.stringify({ context, imageUrls, regenerate, previousSuggestions })
    });
  } catch (e) {
    log.error("network", e);
    return { ok: false, error: "NETWORK" };
  }

  if (resp.status === 401) {
    await clearPaygState();
    await del([CONFIG.STORAGE_KEYS.TOKEN, CONFIG.STORAGE_KEYS.USER]);
    await audit("auth_invalidated");
    return { ok: false, error: "SESSION_EXPIRED" };
  }
  if (resp.status === 402) {
    await clearPaygState();
    await del([CONFIG.STORAGE_KEYS.TOKEN, CONFIG.STORAGE_KEYS.USER]);
    await audit("subscription_check_failed");
    return { ok: false, error: "NEEDS_RECONNECT" };
  }
  let data;
  try { data = await resp.json(); } catch {
    if (resp.status === 429) return { ok: false, error: "RATE_LIMITED" };
    return { ok: false, error: "BAD_RESPONSE" };
  }
  if (resp.status === 429) {
    return {
      ok: false,
      error: data?.error === "QUOTA_EXCEEDED" ? "QUOTA_EXCEEDED" : "RATE_LIMITED",
      message: data?.message || "",
      limit: data?.limit
    };
  }
  if (resp.status === 426 || data?.error === "EXTENSION_UPDATE_REQUIRED") {
    return {
      ok: false,
      error: "EXTENSION_UPDATE_REQUIRED",
      message: data?.message || "",
      currentVersion: data?.currentVersion || chrome.runtime.getManifest().version,
      requiredVersion: data?.requiredVersion || "",
      updateUrl: data?.updateUrl || CONFIG.EXTENSION_UPDATE_URL
    };
  }
  if (!resp.ok) return { ok: false, error: data?.error || "SERVER_ERROR" };

  return {
    ok: true,
    suggestions: validateSuggestions(data.suggestions),
    usage: data.usage,
    visionUsed: !!data.visionUsed,
    searchUsed: !!data.searchUsed,
    aiStack: data.aiStack || ""
  };
}

async function fetchJsonWithAuth(path) {
  const token = await getToken();
  if (!token) return { ok: false, error: "NOT_LOGGED_IN" };
  let resp;
  try {
    resp = await fetch(`${CONFIG.API_BASE}${path}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Client-Version": chrome.runtime.getManifest().version
      }
    });
  } catch (e) {
    log.error("live_summary_network", e);
    return { ok: false, error: "NETWORK" };
  }
  if (resp.status === 401) {
    await clearPaygState();
    await del([CONFIG.STORAGE_KEYS.TOKEN, CONFIG.STORAGE_KEYS.USER]);
    return { ok: false, error: "SESSION_EXPIRED" };
  }
  let data;
  try { data = await resp.json(); } catch { data = {}; }
  if (!resp.ok) return { ok: false, error: data?.error || "SERVER_ERROR" };
  return { ok: true, data };
}

async function getLiveSummary() {
  const cached = await get(CONFIG.STORAGE_KEYS.LIVE_SUMMARY_CACHE);
  const cache = cached[CONFIG.STORAGE_KEYS.LIVE_SUMMARY_CACHE];
  if (cache?.ts && Date.now() - cache.ts < 3500) {
    return { ok: true, ...cache.data };
  }

  const [announcements, chat] = await Promise.all([
    fetchJsonWithAuth("/announcements"),
    fetchJsonWithAuth("/chat?summary=1")
  ]);

  if (!announcements.ok && !chat.ok) {
    return {
      ok: false,
      error: announcements.error || chat.error || "LIVE_SUMMARY_FAILED",
      notificationUnread: cache?.data?.notificationUnread || 0,
      chatUnread: cache?.data?.chatUnread || 0
    };
  }

  const summary = {
    notificationUnread: announcements.ok ? Number(announcements.data?.unreadCount || 0) : Number(cache?.data?.notificationUnread || 0),
    chatUnread: chat.ok ? Number(chat.data?.unreadCount || 0) : Number(cache?.data?.chatUnread || 0)
  };
  await set({ [CONFIG.STORAGE_KEYS.LIVE_SUMMARY_CACHE]: { ts: Date.now(), data: summary } });
  return { ok: true, ...summary };
}

async function handleGenerate(rawCtx, imageUrls, regenerate, previousSuggestions) {
  if (!await extensionIsEnabled()) return { ok: false, error: "EXTENSION_DISABLED" };
  const ctx = sanitizeContext(rawCtx);
  if (!ctx) return { ok: false, error: "EMPTY_CONTEXT" };
  if (!tryAcquire()) return { ok: false, error: "RATE_LIMIT_LOCAL" };

  // Grounding must run on every generation. Do not serve cached suggestions,
  // because stale cache skips Grok search/image checks and can mix old context.
  const result = await callGenerate(ctx, imageUrls || [], !!regenerate, previousSuggestions || []);
  if (result.ok) await audit("generate_ok", { count: result.suggestions.length, regen: regenerate });
  else await audit("generate_fail", { error: result.error });
  return result;
}

async function handlePaygGenerate(rawCtx, imageUrls, regenerate, previousSuggestions, pricing) {
  if (!await extensionIsEnabled()) return { ok: false, error: "EXTENSION_DISABLED" };
  const ctx = sanitizeContext(rawCtx);
  if (!ctx) return { ok: false, error: "EMPTY_CONTEXT" };
  const token = await getToken();
  if (!token) return { ok: false, error: "NOT_LOGGED_IN" };
  const stored = await get([CONFIG.STORAGE_KEYS.PAYG_SESSION, CONFIG.STORAGE_KEYS.USER]);
  const session = stored[CONFIG.STORAGE_KEYS.PAYG_SESSION];
  const user = stored[CONFIG.STORAGE_KEYS.USER];
  if (!user?.id || session?.userId !== user.id || !session?.address || Number(session.expiresAt || 0) <= Date.now()) {
    return { ok: false, error: "PAYG_SETUP_REQUIRED" };
  }
  const accountEpoch = paygAccountEpoch;
  const sessionGuard = async () => {
    if (accountEpoch !== paygAccountEpoch) return false;
    const current = await get([CONFIG.STORAGE_KEYS.PAYG_SESSION, CONFIG.STORAGE_KEYS.USER]);
    return current[CONFIG.STORAGE_KEYS.USER]?.id === user.id &&
      current[CONFIG.STORAGE_KEYS.PAYG_SESSION]?.userId === user.id &&
      current[CONFIG.STORAGE_KEYS.PAYG_SESSION]?.address === session.address;
  };
  const result = await paygGenerate({
    apiBase: CONFIG.API_BASE,
    token,
    installId: await getInstallId(),
    version: chrome.runtime.getManifest().version,
    requestBody: {
      context: ctx,
      imageUrls: imageUrls || [],
      regenerate: !!regenerate,
      previousSuggestions: previousSuggestions || [],
      pricing
    },
    accountId: user.id,
    sessionGuard,
    signPayment: async (input) => {
      if (!await sessionGuard()) throw new Error("PAYG_SESSION_CHANGED");
      return signPaygPayment({ ...input, expectedPayer: session.address });
    }
  });
  if (result.error === "SESSION_EXPIRED") {
    await clearPaygState();
    await del([CONFIG.STORAGE_KEYS.TOKEN, CONFIG.STORAGE_KEYS.USER]);
  }
  if (!result.ok) return result;
  return {
    ...result,
    suggestions: validateSuggestions(result.suggestions)
  };
}


/* ---------- Internal messages (sender validation) ---------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === "payg-offscreen") return false;
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: "FORBIDDEN" });
    return false;
  }
  if (!msg || typeof msg.type !== "string") {
    sendResponse({ ok: false, error: "BAD_MSG" });
    return false;
  }

  switch (msg.type) {
    case "NURAI_GENERATE":
      handleGenerate(
        msg.context || "",
        msg.imageUrls || [],
        !!msg.regenerate,
        msg.previousSuggestions || []
      ).then(sendResponse);
      return true;

    case "NURAI_PAYG_GENERATE":
      handlePaygGenerate(
        msg.context || "",
        msg.imageUrls || [],
        !!msg.regenerate,
        msg.previousSuggestions || [],
        msg.pricing || null
      ).then(sendResponse);
      return true;

    case "NURAI_PAYG_STATUS":
      get([CONFIG.STORAGE_KEYS.PAYG_SESSION, CONFIG.STORAGE_KEYS.PAYG_ENABLED, CONFIG.STORAGE_KEYS.USER]).then((r) => {
        const pricing = paygPublicConfigCache?.value || null;
        const session = r[CONFIG.STORAGE_KEYS.PAYG_SESSION];
        const user = r[CONFIG.STORAGE_KEYS.USER];
        const ready = Boolean(user?.id && session?.userId === user.id && session?.address && Number(session.expiresAt || 0) > Date.now());
        sendResponse({
          ok: true,
          enabled: r[CONFIG.STORAGE_KEYS.PAYG_ENABLED] === true,
          ready,
          address: ready ? session.address : null,
          expiresAt: ready ? session.expiresAt : null,
          currentPrice: pricing?.currentPrice || pricing?.price || null,
          regularPrice: pricing?.regularPrice || null,
          discountPercent: Number(pricing?.discountPercent || 0),
          amount: pricing?.amount || null,
          pricingRevision: Number(pricing?.pricingRevision || 0) || null,
          payTo: pricing?.payTo || null
        });
      });
      void getPaygPublicConfig().catch(() => null);
      return true;

    case "NURAI_PAYG_QUOTE":
      Promise.all([
        get([CONFIG.STORAGE_KEYS.PAYG_SESSION, CONFIG.STORAGE_KEYS.PAYG_ENABLED, CONFIG.STORAGE_KEYS.USER]),
        getPaygPublicConfig(true)
      ]).then(([r, pricing]) => {
        const session = r[CONFIG.STORAGE_KEYS.PAYG_SESSION];
        const user = r[CONFIG.STORAGE_KEYS.USER];
        const ready = Boolean(user?.id && session?.userId === user.id && session?.address && Number(session.expiresAt || 0) > Date.now());
        sendResponse({
          ok: true,
          enabled: r[CONFIG.STORAGE_KEYS.PAYG_ENABLED] === true,
          ready,
          address: ready ? session.address : null,
          currentPrice: pricing.currentPrice || pricing.price,
          regularPrice: pricing.regularPrice || null,
          discountPercent: Number(pricing.discountPercent || 0),
          amount: pricing.amount,
          pricingRevision: pricing.pricingRevision,
          payTo: pricing.payTo
        });
      }).catch(() => sendResponse({ ok: false, error: "PAYG_CONFIG_UNAVAILABLE" }));
      return true;

    case "NURAI_SET_PAYG_MODE":
      set({ [CONFIG.STORAGE_KEYS.PAYG_ENABLED]: msg.enabled === true })
        .then(() => sendResponse({ ok: true, enabled: msg.enabled === true }));
      return true;

    case "NURAI_OPEN_PAYG_SETUP":
      chrome.tabs.create({ url: chrome.runtime.getURL("payg.html") });
      sendResponse({ ok: true });
      return false;

    case "NURAI_PAYG_RESET_SIGNER":
      if (sender.url !== chrome.runtime.getURL("payg.html")) {
        sendResponse({ ok: false, error: "FORBIDDEN" });
        return false;
      }
      Promise.all([resetPaygOffscreen(), clearPendingPaymentHeaders()]).then(() => sendResponse({ ok: true }));
      return true;


    case "NURAI_AUTH_STATUS":
      get([CONFIG.STORAGE_KEYS.TOKEN, CONFIG.STORAGE_KEYS.USER]).then(r => {
        sendResponse({
          loggedIn: !!r[CONFIG.STORAGE_KEYS.TOKEN],
          user: r[CONFIG.STORAGE_KEYS.USER] || null
        });
      });
      return true;

    case "NURAI_LOGOUT":
      clearPaygState()
        .then(() => del([CONFIG.STORAGE_KEYS.TOKEN, CONFIG.STORAGE_KEYS.USER]))
        .then(() => audit("logout"))
        .then(() => sendResponse({ ok: true }));
      return true;

    case "NURAI_OPEN_LOGIN":
      (async () => {
        const installId = await getInstallId();
        const url = `${CONFIG.WEB_BASE}/auth/extension?install_id=${encodeURIComponent(installId)}&ext_id=${chrome.runtime.id}`;
        chrome.tabs.create({ url });
        sendResponse({ ok: true });
      })();
      return true;

    case "NURAI_OPEN_PRICING":
      chrome.tabs.create({ url: `${CONFIG.WEB_BASE}/pricing` });
      sendResponse({ ok: true });
      return false;

    case "NURAI_OPEN_EXTENSION_UPDATE":
      chrome.tabs.create({ url: CONFIG.EXTENSION_UPDATE_URL });
      sendResponse({ ok: true });
      return false;

    case "NURAI_OPEN_DASHBOARD": {
      const panel = msg.section === "chat" ? "chat" : msg.section === "notifications" ? "notifications" : "";
      const suffix = panel ? `/dashboard?panel=${encodeURIComponent(panel)}` : "/dashboard";
      chrome.tabs.create({ url: `${CONFIG.WEB_BASE}${suffix}` });
      sendResponse({ ok: true });
      return false;
    }

    case "NURAI_LIVE_SUMMARY":
      getLiveSummary().then(sendResponse);
      return true;

    default:
      sendResponse({ ok: false, error: "UNKNOWN_TYPE" });
      return false;
  }
});

/* ---------- External messages (from website only) ---------- */
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  let senderOrigin = "";
  try { senderOrigin = new URL(sender?.url || "").origin; } catch {}
  if (!new Set(["https://nurxai.xyz", "https://www.nurxai.xyz"]).has(senderOrigin)) {
    sendResponse({ ok: false, error: "FORBIDDEN_ORIGIN" });
    return false;
  }
  if (!msg || typeof msg.type !== "string") {
    sendResponse({ ok: false, error: "BAD_MSG" });
    return false;
  }

  if (msg.type === "NURAI_SET_TOKEN") {
    const t = typeof msg.token === "string" ? msg.token : "";
    const suppliedUser = msg.user && typeof msg.user === "object" ? msg.user : {};
    const subject = tokenSubject(t);
    if (!t || t.length < 20 || t.length > 4096 || !subject) {
      sendResponse({ ok: false, error: "BAD_TOKEN" });
      return false;
    }
    (async () => {
      const tokenUser = { ...suppliedUser, id: subject };
      const previous = await get([CONFIG.STORAGE_KEYS.USER, CONFIG.STORAGE_KEYS.PAYG_SESSION]);
      if (
        (previous[CONFIG.STORAGE_KEYS.USER]?.id && previous[CONFIG.STORAGE_KEYS.USER].id !== tokenUser.id) ||
        (previous[CONFIG.STORAGE_KEYS.PAYG_SESSION]?.userId &&
          previous[CONFIG.STORAGE_KEYS.PAYG_SESSION].userId !== tokenUser.id)
      ) {
        await clearPaygState();
      }
      await setToken(t);
      await set({ [CONFIG.STORAGE_KEYS.USER]: tokenUser });
      await audit("login", { uid: tokenUser.id });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === "NURAI_PING") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  if (msg.type === "NURAI_PAYG_STATUS") {
    get([CONFIG.STORAGE_KEYS.PAYG_SESSION, CONFIG.STORAGE_KEYS.PAYG_ENABLED, CONFIG.STORAGE_KEYS.USER]).then((r) => {
      const pricing = paygPublicConfigCache?.value || null;
      const session = r[CONFIG.STORAGE_KEYS.PAYG_SESSION];
      const user = r[CONFIG.STORAGE_KEYS.USER];
      const ready = Boolean(user?.id && session?.userId === user.id && session?.address && Number(session.expiresAt || 0) > Date.now());
      sendResponse({
        ok: true,
        installed: true,
        enabled: r[CONFIG.STORAGE_KEYS.PAYG_ENABLED] === true,
        ready,
        address: ready ? session.address : null,
        expiresAt: ready ? session.expiresAt : null,
        currentPrice: pricing?.currentPrice || pricing?.price || null,
        regularPrice: pricing?.regularPrice || null,
        discountPercent: Number(pricing?.discountPercent || 0),
        amount: pricing?.amount || null,
        pricingRevision: Number(pricing?.pricingRevision || 0) || null,
        payTo: pricing?.payTo || null
      });
    });
    void getPaygPublicConfig().catch(() => null);
    return true;
  }

  if (msg.type === "NURAI_OPEN_PAYG_SETUP") {
    chrome.tabs.create({ url: chrome.runtime.getURL("payg.html") });
    sendResponse({ ok: true });
    return false;
  }

  sendResponse({ ok: false, error: "UNKNOWN_TYPE" });
  return false;
});

/* ---------- Action button ---------- */
chrome.action.onClicked.addListener(async () => {
  const r = await get(CONFIG.STORAGE_KEYS.TOKEN);
  const installId = await getInstallId();
  if (!r[CONFIG.STORAGE_KEYS.TOKEN]) {
    chrome.tabs.create({
      url: `${CONFIG.WEB_BASE}/auth/extension?install_id=${encodeURIComponent(installId)}&ext_id=${chrome.runtime.id}`
    });
  } else {
    chrome.tabs.create({ url: `${CONFIG.WEB_BASE}/dashboard` });
  }
});
