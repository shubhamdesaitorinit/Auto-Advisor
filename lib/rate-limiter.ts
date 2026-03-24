import * as kv from "./redis";
import type { RateLimitResult } from "@/types";

const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX ?? "30", 10);
const WINDOW_SECONDS = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS ?? "60", 10);

export async function checkRateLimit(sessionId: string): Promise<RateLimitResult> {
  const key = `ratelimit:${sessionId}`;
  const count = await kv.incr(key);

  // Set expiry on first request in the window
  if (count === 1) {
    await kv.expire(key, WINDOW_SECONDS);
  }

  const remaining = Math.max(0, MAX_REQUESTS - count);
  const currentTTL = await kv.ttl(key);
  const resetIn = currentTTL > 0 ? currentTTL : WINDOW_SECONDS;

  return {
    allowed: count <= MAX_REQUESTS,
    remaining,
    resetIn,
  };
}
