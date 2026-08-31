/**
 * Token Validation Cache — short-TTL, in-memory, per-access-token auth verdicts.
 *
 * WHY: proxy.ts historically called supabase.auth.getUser() — a network round
 * trip to the Supabase Auth server (/auth/v1/user) — on EVERY authenticated
 * document request (measured 387ms–2.67s TTFB floor on fresh connections).
 * Full local JWT signature verification is unavailable for this project (legacy
 * HS256: the JWKS endpoint returns no keys and SUPABASE_JWT_SECRET is not in
 * the env), so the network validation itself cannot be replaced — but it CAN
 * be amortised: the FIRST sight of an access token performs the real getUser()
 * network validation; subsequent requests bearing the SAME token reuse that
 * verified verdict until the cache TTL or the token's own exp claim, whichever
 * comes first.
 *
 * SECURITY MODEL:
 * - Only SUCCESSFUL getUser() validations are ever cached. A forged or garbage
 *   token can never enter the cache as valid: its first (and every) sighting
 *   goes to the real network validation, which fails. Failed validations are
 *   NOT cached at all (not even briefly) — fail-closed, and a transient
 *   Supabase blip can never be remembered as a lasting negative verdict.
 * - Cache entries are keyed by the SHA-256 of the exact token string, and the
 *   stored identity snapshot comes from the getUser() response performed with
 *   that exact token. Cross-token or cross-user reuse is impossible by
 *   construction.
 * - The token's exp claim is read by decoding the JWT payload WITHOUT trusting
 *   it for identity: it is only ever used to REJECT (expired tokens are never
 *   served from cache, even on a hit) and to BOUND the cache entry lifetime
 *   (an entry never outlives its token). Undecodable tokens are never cached
 *   and never served from cache.
 * - Server-side revocation lag (admin ban, password change, account_disabled
 *   flip) is bounded by TTL_MS: a token validated in the last 60s keeps its
 *   verdict for at most 60s. A user's own sign-out clears their cookies
 *   client-side immediately, so their browser stops presenting the token.
 *
 * Modeled on the lib/auth/profile-cache.ts idiom (module-level singleton,
 * TTL entries, periodic sweep) with an added hard entry bound + LRU eviction.
 */

/** Minimal identity snapshot the proxy needs downstream of auth. */
export interface VerifiedTokenUser {
  id: string;
  email?: string;
  user_metadata?: { account_disabled?: boolean; [key: string]: unknown };
}

interface CacheEntry {
  user: VerifiedTokenUser;
  /** ms epoch — min(verifiedAt + TTL_MS, token exp claim) */
  expiresAt: number;
}

/** How long a verified verdict may be reused. Also the revocation-lag bound. */
const TTL_MS = 60 * 1000;
/** Hard bound on cache size — oldest (least recently used) entry is evicted. */
const MAX_ENTRIES = 5000;
/** Periodic sweep of expired entries (same cadence idiom as profile-cache). */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Decode the JWT payload (WITHOUT signature verification — see security model)
 * and return the exp claim as ms-epoch, or null if undecodable/absent.
 */
function decodeJwtExpMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** SHA-256 hex via Web Crypto (available in both Node and Edge runtimes). */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

class TokenValidationCache {
  private cache = new Map<string, CacheEntry>();
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startSweep();
  }

  /**
   * Return the verified identity snapshot for this exact token, or null.
   * Null means: no entry, entry expired, token exp passed, or token
   * undecodable — in every case the caller must fall back to the real
   * network validation (or reject).
   */
  async get(accessToken: string): Promise<VerifiedTokenUser | null> {
    const now = Date.now();
    const expMs = decodeJwtExpMs(accessToken);
    // Locally-expired (or undecodable) tokens are NEVER served from cache.
    if (expMs === null || expMs <= now) return null;

    const key = await sha256Hex(accessToken);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.cache.delete(key);
      return null;
    }
    // LRU touch — re-insert so Map iteration order tracks recency.
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.user;
  }

  /**
   * Record a SUCCESSFUL network validation for this exact token. Only ever
   * call with the user object returned by supabase.auth.getUser() for this
   * token. Entries never outlive the token's exp claim.
   */
  async set(accessToken: string, user: VerifiedTokenUser): Promise<void> {
    const now = Date.now();
    const expMs = decodeJwtExpMs(accessToken);
    // Fail-closed: never cache a token we cannot bound by its own exp.
    if (expMs === null || expMs <= now) return;
    const expiresAt = Math.min(now + TTL_MS, expMs);

    const key = await sha256Hex(accessToken);
    if (this.cache.size >= MAX_ENTRIES && !this.cache.has(key)) {
      // Evict least recently used (first key in insertion/recency order).
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, {
      user: {
        id: user.id,
        email: user.email,
        user_metadata: {
          account_disabled: user.user_metadata?.account_disabled === true
        }
      },
      expiresAt
    });
  }

  /** Clear all cached verdicts (tests / emergency). */
  clear() {
    this.cache.clear();
  }

  /** Cache statistics (size only — never expose keys or identities). */
  getStats() {
    return { size: this.cache.size, ttlMs: TTL_MS, maxEntries: MAX_ENTRIES };
  }

  private startSweep() {
    if (typeof global === 'undefined') return;
    this.sweepInterval = setInterval(() => {
      const now = Date.now();
      const entries = Array.from(this.cache.entries());
      for (const [key, value] of entries) {
        if (value.expiresAt <= now) {
          this.cache.delete(key);
        }
      }
    }, SWEEP_INTERVAL_MS);
  }

  /** Stop the periodic sweep (for testing). */
  stopSweep() {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }
}

// Export singleton instance
export const tokenValidationCache = new TokenValidationCache();
