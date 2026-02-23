/**
 * In-memory sliding window rate limiter for B2A API Gateway.
 *
 * Limit: 60 requests per 60 seconds per API key.
 * Storage: Map<apiKeyId, timestamp[]> — timestamps in milliseconds.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
};

const requests = new Map<string, number[]>();

// GC interval: cleans up fully-expired key entries every 5 minutes to prevent
// unbounded Map growth in long-running processes.
//
// The handle is intentionally not stored. This interval cannot be cancelled
// from outside the module, which is acceptable for the MVP:
//   - Unit tests exit before it fires (5 min >> test suite duration)
//   - `_resetForTesting()` clears the Map, which is all unit tests need
// Future: expose _stopGcForTesting() if --watch mode or integration tests require it.
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of requests.entries()) {
    const valid = timestamps.filter((t) => now - t < 60_000);
    if (valid.length === 0) {
      requests.delete(key);
    } else {
      requests.set(key, valid);
    }
  }
}, 5 * 60 * 1000);

/**
 * Checks whether the given API key is within its rate limit.
 *
 * - Sliding window of 60 seconds.
 * - Blocked requests are NOT recorded (timestamp not added).
 *
 * @returns `{ allowed: true, remaining, resetAt }` when the request is permitted,
 *          or `{ allowed: false, remaining: 0, resetAt }` when the limit is exhausted.
 *
 * `resetAt` is an **absolute** `Date` indicating when the oldest in-window
 * request will expire and the key will have at least one slot free again.
 * To compute a relative "retry after" duration: `resetAt.getTime() - Date.now()`.
 *
 * Implementation note: `valid[0]` is always the oldest timestamp because
 * entries are appended in monotonically increasing order (single-threaded JS/Bun
 * runtime guarantees `Date.now()` never decreases between synchronous calls).
 */
export function checkRateLimit(apiKeyId: string): RateLimitResult {
  if (!apiKeyId) {
    throw new Error('checkRateLimit: apiKeyId must be a non-empty string');
  }

  const now = Date.now();
  const window = 60_000; // 60 seconds in ms
  const maxRequests = 60;

  // Retrieve existing timestamps and filter to the current sliding window.
  const existing = requests.get(apiKeyId) ?? [];
  const valid = existing.filter((t) => now - t < window);

  if (valid.length >= maxRequests) {
    // Oldest timestamp in the window determines when the slot frees up.
    const resetAt = new Date(valid[0] + window);
    return { allowed: false, remaining: 0, resetAt };
  }

  // Record this request.
  valid.push(now);
  requests.set(apiKeyId, valid);

  const remaining = maxRequests - valid.length;
  // resetAt = when the oldest recorded timestamp expires from the window.
  const resetAt =
    valid.length === 1
      ? new Date(now + window)
      : new Date(valid[0] + window);

  return { allowed: true, remaining, resetAt };
}

/** @internal — only for tests: clears all in-memory state. */
export function _resetForTesting(): void {
  requests.clear();
}
