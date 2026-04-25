// logger.js — production-safe logger + audit trail
import { CONFIG } from "./config.js";

const IS_DEV = !("update_url" in chrome.runtime.getManifest());

export const log = {
  debug: (...a) => { if (IS_DEV) console.debug("[NurAi]", ...a); },
  info:  (...a) => { if (IS_DEV) console.info("[NurAi]", ...a); },
  warn:  (...a) => console.warn("[NurAi]", ...a),
  error: (...a) => console.error("[NurAi]", ...a)
};

function sanitizeMeta(meta) {
  const blocked = /token|secret|key|password|authorization|bearer/i;
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) {
    if (blocked.test(k)) continue;
    if (typeof v === "string" && v.length > 200) out[k] = v.slice(0, 200) + "…";
    else out[k] = v;
  }
  return out;
}

export async function audit(event, meta = {}) {
  try {
    const key = CONFIG.STORAGE_KEYS.AUDIT_LOG;
    const r = await chrome.storage.local.get(key);
    const list = Array.isArray(r[key]) ? r[key] : [];
    list.push({ ts: Date.now(), event: String(event).slice(0, 64), meta: sanitizeMeta(meta) });
    const trimmed = list.slice(-CONFIG.AUDIT_LOG_MAX_ENTRIES);
    await chrome.storage.local.set({ [key]: trimmed });
  } catch (e) {
    log.warn("audit failed", e);
  }
}
