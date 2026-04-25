// background.js — NurAi service worker
import { CONFIG } from "./config.js";
import { log, audit } from "./logger.js";
import { tryAcquire } from "./rate-limiter.js";
import { secureUUID } from "./crypto-utils.js";

const get = (k) => chrome.storage.local.get(k);
const set = (o) => chrome.storage.local.set(o);
const del = (k) => chrome.storage.local.remove(k);

async function getInstallId() {
  const k = CONFIG.STORAGE_KEYS.INSTALL_ID;
  const r = await get(k);
  if (r[k]) return r[k];
  const id = secureUUID();
  await set({ [k]: id });
  return id;
}

/* ---------- Suggestion cache ---------- */
async function readCache() {
  const r = await get(CONFIG.STORAGE_KEYS.SUGGESTION_CACHE);
  return r[CONFIG.STORAGE_KEYS.SUGGESTION_CACHE] || {};
}
async function writeCache(cache) {
  let entries = Object.entries(cache);
  if (entries.length > CONFIG.CACHE_MAX_ENTRIES) {
    entries.sort((a, b) => b[1].ts - a[1].ts);
    cache = Object.fromEntries(entries.slice(0, CONFIG.CACHE_MAX_ENTRIES));
  }
  await set({ [CONFIG.STORAGE_KEYS.SUGGESTION_CACHE]: cache });
}
async function hashCtx(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/* ---------- Validation ---------- */
function sanitizeContext(t) {
  if (typeof t !== "string") return "";
  return t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim().slice(0, CONFIG.MAX_TWEET_CONTEXT_LENGTH);
}
function validateSuggestions(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(s => typeof s === "string" && s.trim())
    .map(s => s.trim().slice(0, CONFIG.MAX_SUGGESTION_LENGTH))
    .slice(0, CONFIG.MAX_SUGGESTIONS);
}

/* ---------- Backend call ---------- */
async function callGenerate(context, imageUrls, regenerate, previousSuggestions) {
  const r = await get(CONFIG.STORAGE_KEYS.TOKEN);
  const token = r[CONFIG.STORAGE_KEYS.TOKEN];
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
    await del([CONFIG.STORAGE_KEYS.TOKEN, CONFIG.STORAGE_KEYS.USER]);
    await audit("auth_invalidated");
    return { ok: false, error: "SESSION_EXPIRED" };
  }
  if (resp.status === 402) return { ok: false, error: "NO_SUBSCRIPTION" };
  if (resp.status === 429) return { ok: false, error: "QUOTA_EXCEEDED" };

  let data;
  try { data = await resp.json(); } catch { return { ok: false, error: "BAD_RESPONSE" }; }
  if (!resp.ok) return { ok: false, error: data?.error || "SERVER_ERROR" };

  return { ok: true, suggestions: validateSuggestions(data.suggestions), usage: data.usage };
}

async function handleGenerate(rawCtx, imageUrls, regenerate, previousSuggestions) {
  const ctx = sanitizeContext(rawCtx);
  if (!ctx) return { ok: false, error: "EMPTY_CONTEXT" };
  if (!tryAcquire()) return { ok: false, error: "RATE_LIMIT_LOCAL" };

  // For regenerate, skip cache (always fresh)
  if (!regenerate) {
    const key = await hashCtx(ctx);
    const cache = await readCache();
    const hit = cache[key];
    if (hit && Date.now() - hit.ts < CONFIG.SUGGESTION_CACHE_TTL_MS) {
      return { ok: true, suggestions: hit.suggestions, cached: true };
    }
  }

  const result = await callGenerate(ctx, imageUrls || [], !!regenerate, previousSuggestions || []);
  if (result.ok && !regenerate) {
    const key = await hashCtx(ctx);
    const cache = await readCache();
    cache[key] = { ts: Date.now(), suggestions: result.suggestions };
    await writeCache(cache);
  }
  if (result.ok) await audit("generate_ok", { count: result.suggestions.length, regen: regenerate });
  else await audit("generate_fail", { error: result.error });
  return result;
}


/* ---------- Internal messages (sender validation) ---------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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


    case "NURAI_AUTH_STATUS":
      get([CONFIG.STORAGE_KEYS.TOKEN, CONFIG.STORAGE_KEYS.USER]).then(r => {
        sendResponse({
          loggedIn: !!r[CONFIG.STORAGE_KEYS.TOKEN],
          user: r[CONFIG.STORAGE_KEYS.USER] || null
        });
      });
      return true;

    case "NURAI_LOGOUT":
      del([CONFIG.STORAGE_KEYS.TOKEN, CONFIG.STORAGE_KEYS.USER])
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

    default:
      sendResponse({ ok: false, error: "UNKNOWN_TYPE" });
      return false;
  }
});

/* ---------- External messages (from website only) ---------- */
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!sender?.url || !sender.url.startsWith(CONFIG.WEB_BASE)) {
    sendResponse({ ok: false, error: "FORBIDDEN_ORIGIN" });
    return false;
  }
  if (!msg || typeof msg.type !== "string") {
    sendResponse({ ok: false, error: "BAD_MSG" });
    return false;
  }

  if (msg.type === "NURAI_SET_TOKEN") {
    const t = typeof msg.token === "string" ? msg.token : "";
    const u = msg.user || null;
    if (!t || t.length < 20 || t.length > 4096) {
      sendResponse({ ok: false, error: "BAD_TOKEN" });
      return false;
    }
    set({
      [CONFIG.STORAGE_KEYS.TOKEN]: t,
      [CONFIG.STORAGE_KEYS.USER]: u
    }).then(() => audit("login", { uid: u?.id }))
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "NURAI_PING") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
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
