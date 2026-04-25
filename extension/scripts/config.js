// config.js — central configuration constants for NurAi extension
export const CONFIG = Object.freeze({
  API_BASE: "https://nurxai.vercel.app/api",
  WEB_BASE: "https://nurxai.vercel.app",

  MAX_TWEET_CONTEXT_LENGTH: 800,
  MAX_SUGGESTION_LENGTH: 280,
  MAX_SUGGESTIONS: 4,

  RATE_LIMIT_PER_MINUTE: 8,
  RATE_LIMIT_BURST: 4,
  REQUEST_DEBOUNCE_MS: 600,

  STORAGE_KEYS: {
    TOKEN: "nurai_jwt",
    USER: "nurai_user",
    INSTALL_ID: "nurai_install_id",
    PANEL_POS: "nurai_panel_pos",
    SUGGESTION_CACHE: "nurai_suggestion_cache",
    AUDIT_LOG: "nurai_audit_log"
  },

  SUGGESTION_CACHE_TTL_MS: 5 * 60 * 1000,
  CACHE_MAX_ENTRIES: 30,
  AUDIT_LOG_MAX_ENTRIES: 200
});
