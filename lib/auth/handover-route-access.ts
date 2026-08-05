/**
 * Director's Desk — the FIFTH permission layer.
 *
 * THE MISS THIS CLOSES
 * --------------------
 * specs/director-desk/SPEC.md enumerates four layers a handover must unlock:
 * page gate · RLS · RPC · API route. There is a fifth, and it runs BEFORE all
 * four: the edge middleware in `proxy.ts`.
 *
 * `proxy.ts` enforces the route's MENU_PERMISSIONS key server-side by reading
 * `custom_roles.permissions` for `profiles.role` ALONE. It never calls
 * `user_has_permission()` and it never calls `fn_my_handover_permissions()`. So
 * a handover never reached it: the receiver was redirected to /unauthorized
 * before the page rendered and before a single RLS query was issued. Every
 * server-side piece of the spine worked and the feature still did not.
 *
 * The failure was not uniform, which is why it survived review. `proxy.ts`
 * exempts eleven role strings — super_admin, administrator, faculty, staff,
 * student, guest, driver, hod, admission, registrar, principal — and for those
 * it leaves `userPermissions` undefined, which `routeMatcher.hasAccess()` reads
 * as "allow, the client will enforce". So the feature WORKED for HODs and
 * FAILED for the C-suite it was built for: 185 production profiles sit outside
 * that list (ceo, coe, chief_warden, cao, cbo, executive_admin_officer, …).
 *
 * WHAT THIS DOES
 * --------------
 * Nothing, on the path that already passes. It is consulted only after the
 * role-derived check has ALREADY decided to redirect. A user who holds a page
 * by role never pays for it — asserted by call-count in
 * __tests__/lib/auth/director-handover-middleware.test.ts, not by assertion here.
 *
 * On the deny path it asks the database exactly one question, through the very
 * function the page gates use: `fn_my_handover_permissions()`. That function —
 * not a copy of its WHERE clause — is what makes this layer agree with the
 * other four. It already filters on status, revoked_at, due date (IST,
 * inclusive), grantee still active, grantee still inside the granting
 * institution, `fn_handover_key_allowed_at_level` and
 * `fn_handover_key_is_blocked`. Restating any of that here would create the
 * exact drift the spine's shared-predicate design exists to prevent.
 *
 * WHY IT KEYS ON THE PERMISSION, NOT ON `director_handovers.route`
 * ---------------------------------------------------------------
 * The requested path is resolved to its MENU_PERMISSIONS key with the SAME
 * `routeMatcher.match()` call that `hasAccess()` just made — one matcher, so
 * dynamic segments (`/projects/[id]/budget` vs a literal id) resolve
 * identically by construction. The handover's stored `route` is deliberately
 * NOT re-matched: re-deriving it would be a second matcher that could disagree
 * with the first.
 *
 * The consequence is stated plainly: if two routes map to the same
 * MENU_PERMISSIONS key, a handover for one opens both. That is not a widening
 * this layer invents — `user_has_permission()` already grants the key platform
 * wide, so RLS, the RPCs, the API routes and the client page gate all opened
 * both already. A middleware that were NARROWER than the other four would
 * reintroduce this bug's own shape: bounced at the edge, permitted everywhere
 * else, with no way for the receiver to tell why.
 *
 * FAIL CLOSED, ALWAYS
 * -------------------
 * Any error, any timeout, any unparseable answer returns false and the caller
 * keeps its redirect. That includes the case that is true TODAY in production:
 * the spine migration is not applied, so the RPC does not exist, PostgREST
 * answers PGRST202, and this layer contributes nothing. Deploying this file
 * before the spine lands changes no behaviour at all.
 */

import { routeMatcher } from './route-matcher';

/**
 * Hard ceiling on the one extra database round trip. This is edge middleware on
 * every request; a hung PostgREST call must not be able to hold a document
 * request open. At the deadline we abort and keep the redirect.
 */
export const HANDOVER_LOOKUP_TIMEOUT_MS = 300;

/**
 * How long a user's live handover key set is reused. Next prefetches links, so
 * one page view can drive several middleware invocations; without this a
 * receiver would pay a round trip for each.
 *
 * Revocation lag is bounded by this TTL and is far shorter than the 5-minute
 * client permission cache SPEC.md already documents. The DATA closes
 * immediately either way — RLS re-asks the database on the very next query.
 */
export const HANDOVER_KEYS_TTL_MS = 30_000;

/**
 * An EMPTY key set is cached far more briefly, and the asymmetry is the point.
 * Caching "you have nothing" for 30 s would mean a receiver who clicks a
 * freshly-sent handover link is still bounced — this bug's own symptom, just
 * shorter. Five seconds is imperceptible next to the notification that carried
 * the link, while still collapsing a burst of prefetches into one lookup.
 */
export const HANDOVER_EMPTY_TTL_MS = 5_000;

/** Bound on the in-memory map, so a long-lived isolate cannot grow unbounded. */
const MAX_CACHE_ENTRIES = 500;

interface CachedKeys {
  keys: string[];
  expiresAt: number;
}

const keyCache = new Map<string, CachedKeys>();

/** Minimal shape this module needs. Keeps the module testable without the SDK. */
export interface HandoverRpcClient {
  rpc: (fn: string, args?: Record<string, unknown>) => unknown;
}

function readCache(userId: string): string[] | null {
  const hit = keyCache.get(userId);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    keyCache.delete(userId);
    return null;
  }
  return hit.keys;
}

function writeCache(userId: string, keys: string[]) {
  if (keyCache.size >= MAX_CACHE_ENTRIES) {
    const now = Date.now();
    for (const [id, entry] of Array.from(keyCache.entries())) {
      if (entry.expiresAt <= now) keyCache.delete(id);
    }
    // Still full after sweeping expired entries — drop everything rather than
    // leak. Worst case is one extra lookup per user, never a wrong answer.
    if (keyCache.size >= MAX_CACHE_ENTRIES) keyCache.clear();
  }
  const ttl =
    keys.length > 0 ? HANDOVER_KEYS_TTL_MS : HANDOVER_EMPTY_TTL_MS;
  keyCache.set(userId, { keys, expiresAt: Date.now() + ttl });
}

/** Test seam. Never called by the middleware. */
export function __clearHandoverKeyCache() {
  keyCache.clear();
}

/**
 * One RPC, hard-bounded.
 * @returns the caller's live handover keys, or null when the answer is unknown
 *          (error, timeout, malformed). null is never treated as "no keys" —
 *          the caller must fail closed on it.
 */
async function fetchLiveHandoverKeys(
  supabase: HandoverRpcClient
): Promise<string[] | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      // Abort the in-flight request as well as resolving, so a stalled socket
      // is not left holding the invocation open after we have answered.
      try {
        controller.abort();
      } catch {
        /* aborting is best-effort; the race below is what guarantees the bound */
      }
      resolve(null);
    }, HANDOVER_LOOKUP_TIMEOUT_MS);
  });

  const lookup = (async (): Promise<string[] | null> => {
    const builder = supabase.rpc('fn_my_handover_permissions') as {
      abortSignal?: (signal: AbortSignal) => unknown;
    };

    const awaited =
      typeof builder?.abortSignal === 'function'
        ? await builder.abortSignal(controller.signal)
        : await (builder as unknown as Promise<unknown>);

    const { data, error } = (awaited ?? {}) as {
      data?: unknown;
      error?: unknown;
    };

    // Includes the pre-migration case: the function does not exist yet, so
    // PostgREST answers PGRST202 and this layer stays inert.
    if (error) return null;
    if (!Array.isArray(data)) return [];
    return data.filter((k): k is string => typeof k === 'string');
  })();

  try {
    return await Promise.race([lookup, deadline]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    // A rejection arriving after the race resolved (typically the abort itself)
    // would otherwise surface as an unhandled rejection and, on some runtimes,
    // take the invocation down.
    void lookup.catch(() => undefined);
  }
}

/**
 * Does a live Director's Desk handover grant this user the permission key the
 * requested path is gated on?
 *
 * Call this ONLY after the role-derived check has already decided to redirect.
 * It fails closed on every uncertainty.
 */
export async function routeAllowedByHandover(
  supabase: HandoverRpcClient,
  userId: string,
  path: string
): Promise<boolean> {
  try {
    // The same matcher, the same call, that hasAccess() just used.
    const requiredKey = routeMatcher.match(path)?.permission;

    // No MENU_PERMISSIONS key on this path means the denial came from the
    // static PROTECTED_ROUTES role list, and there is no key for a handover to
    // have granted. It also means the route could never have been handed over:
    // the capture control resolves permission_keys from MENU_PERMISSIONS, and
    // director_handovers.dh_keys_not_empty rejects an empty array. Fail closed.
    if (!requiredKey) return false;

    const cached = readCache(userId);
    if (cached) return cached.includes(requiredKey);

    const keys = await fetchLiveHandoverKeys(supabase);
    // A null answer means UNKNOWN, never "no keys" — it is not cached at all,
    // so a transient PostgREST blip cannot pin a user out for a whole TTL.
    if (keys === null) return false; // keep the redirect
    writeCache(userId, keys);
    return keys.includes(requiredKey);
  } catch {
    return false;
  }
}
