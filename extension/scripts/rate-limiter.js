// rate-limiter.js — optional local throttle (disabled by default)
import { CONFIG } from "./config.js";

const STATE = { tokens: Math.max(0, CONFIG.RATE_LIMIT_BURST || 0), last: Date.now() };

export function tryAcquire() {
  // 0 / missing values mean "no local rate limit".
  if (!CONFIG.RATE_LIMIT_PER_MINUTE || CONFIG.RATE_LIMIT_PER_MINUTE <= 0) return true;
  if (!CONFIG.RATE_LIMIT_BURST || CONFIG.RATE_LIMIT_BURST <= 0) return true;

  const now = Date.now();
  const refill = CONFIG.RATE_LIMIT_PER_MINUTE / 60000;
  STATE.tokens = Math.min(CONFIG.RATE_LIMIT_BURST, STATE.tokens + (now - STATE.last) * refill);
  STATE.last = now;
  if (STATE.tokens >= 1) { STATE.tokens -= 1; return true; }
  return false;
}
