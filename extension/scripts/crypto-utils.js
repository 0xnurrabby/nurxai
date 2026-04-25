// crypto-utils.js — Web Crypto helpers
const ALGO = { name: "AES-GCM", length: 256 };
const KEY_STORAGE = "nurai_master_key_v1";

async function getMasterKey() {
  const r = await chrome.storage.local.get(KEY_STORAGE);
  if (r[KEY_STORAGE]) {
    return crypto.subtle.importKey("jwk", r[KEY_STORAGE], ALGO, false, ["encrypt", "decrypt"]);
  }
  const key = await crypto.subtle.generateKey(ALGO, true, ["encrypt", "decrypt"]);
  const jwk = await crypto.subtle.exportKey("jwk", key);
  await chrome.storage.local.set({ [KEY_STORAGE]: jwk });
  return crypto.subtle.importKey("jwk", jwk, ALGO, false, ["encrypt", "decrypt"]);
}

export async function encryptString(plaintext) {
  const key = await getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)
  );
  return { iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) };
}

export async function decryptString(payload) {
  if (!payload?.iv || !payload?.ct) return null;
  try {
    const key = await getMasterKey();
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(payload.iv) },
      key, new Uint8Array(payload.ct)
    );
    return new TextDecoder().decode(pt);
  } catch { return null; }
}

export function secureUUID() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
