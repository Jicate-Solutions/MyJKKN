/**
 * Per-key fixed-window counter, in memory. Resets on redeploy and is per-instance —
 * a speed bump against casual abuse (same trade-off as the public course apply
 * route), not a security control.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = 0;
  return (key: string, now: number = Date.now()): boolean => {
    // Drop expired keys now and then so the map can't grow one entry per IP forever.
    if (now - lastSweep > opts.windowMs) {
      lastSweep = now;
      for (const [k, e] of hits) if (now >= e.resetAt) hits.delete(k);
    }
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

/**
 * The client's IP as the platform saw it. Vercel overwrites both x-real-ip and
 * x-forwarded-for with the connecting address, so on the deployed host both are
 * trusted. Elsewhere the RIGHTMOST x-forwarded-for hop is the one appended by
 * the nearest proxy — the leftmost is whatever the client chose to send, which
 * is why it must never be the limiter key.
 */
export function clientIp(request: Request): string {
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const hops = (request.headers.get('x-forwarded-for') ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  return hops.length > 0 ? hops[hops.length - 1] : 'unknown';
}
