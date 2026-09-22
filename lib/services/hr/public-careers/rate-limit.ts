/**
 * Per-key fixed-window counter, in memory. Resets on redeploy and is per-instance —
 * a speed bump against casual abuse (same trade-off as the public course apply
 * route), not a security control.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string, now: number = Date.now()): boolean => {
    const entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return true;
    }
    if (entry.count >= opts.limit) return false;
    entry.count += 1;
    return true;
  };
}

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
