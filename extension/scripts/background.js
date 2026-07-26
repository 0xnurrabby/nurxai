// background.js — NurAi service worker
import { CONFIG } from "./config.js";
import { log, audit } from "./logger.js";
import { tryAcquire } from "./rate-limiter.js";
import { secureUUID, encryptString, decryptString } from "./crypto-utils.js";

const get = (k) => chrome.storage.local.get(k);
const set = (o) => chrome.storage.local.set(o);
const del = (k) => chrome.storage.local.remove(k);

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
    await del([CONFIG.STORAGE_KEYS.TOKEN, CONFIG.STORAGE_KEYS.USER]);
    await audit("auth_invalidated");
    return { ok: false, error: "SESSION_EXPIRED" };
  }
  if (resp.status === 402) {
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
    (async () => {
      await setToken(t);
      await set({ [CONFIG.STORAGE_KEYS.USER]: u });
      await audit("login", { uid: u?.id });
      sendResponse({ ok: true });
    })();
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
