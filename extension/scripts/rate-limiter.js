// rate-limiter.js — token bucket
import { CONFIG } from "./config.js";

const STATE = { tokens: CONFIG.RATE_LIMIT_BURST, last: Date.now() };

export function tryAcquire() {
  const now = Date.now();
  const refill = CONFIG.RATE_LIMIT_PER_MINUTE / 60000;
  STATE.tokens = Math.min(CONFIG.RATE_LIMIT_BURST, STATE.tokens + (now - STATE.last) * refill);
  STATE.last = now;
  if (STATE.tokens >= 1) { STATE.tokens -= 1; return true; }
  return false;
}
