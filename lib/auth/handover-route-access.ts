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
 * On the deny path it asks the database through the very function the page
 * gates use: `fn_my_handover_permissions()`. That function — not a copy of its
 * WHERE clause — is what makes this layer agree with the other four. It already
 * filters on status, revoked_at, due date (IST, inclusive), grantee still
 * active, grantee still inside the granting institution,
 * `fn_handover_key_allowed_at_level` and `fn_handover_key_is_blocked`.
 * Restating any of that here would create the exact drift the spine's
 * shared-predicate design exists to prevent.
 *
 * ── TWO LANES DID THE RIGHT THING AND STILL DISAGREED ─────────────────────────
 *
 * An earlier revision of this file compared ONE thing: the requested path's
 * MENU_PERMISSIONS key against the key set above. That is correct only while
 * the keys WRITTEN onto a handover are menu keys. They are not, and deliberately
 * so. `components/director-desk/route-permission-resolver.ts` resolves the keys
 * from `ROUTE_GATE_MAP` — the page's REAL `PermissionGuard` / `PolicyPageShell`
 * keys — and drops the menu key wherever no `RoutePermissionGuard` enforces it.
 * That was itself a fix: the resolver used to write a key the page's own gate
 * never reads, producing handovers that looked healthy and granted nothing.
 *
 * Both changes are right. Their COMPOSITION was not. Measured on this tree
 * against that resolver's own map: of 477 routes with a recorded gate, 122 are
 * un-handable, 99 also sit under a RoutePermissionGuard (so the menu key is
 * granted too) and 186 happen to agree — leaving **70 routes** where the page's
 * real gate key is NOT the menu key, e.g.
 *
 *     /accreditation/manage/metrics      menu accreditation.view
 *                                        page accreditation.metrics.manage
 *     /admission/gd-pi/[id]/evaluate     menu admission.applications.edit
 *                                        page admission.gd_pi.evaluate
 *     /bos/committees                    menu bos.view
 *                                        page academic.bos-compositions.view
 *
 * On every one of those the row carries keys this layer was never looking for,
 * no key matched, and the receiver was bounced — the very showstopper the fifth
 * layer exists to kill.
 *
 * ── THE UNION, AND WHY IT IS A UNION ──────────────────────────────────────────
 *
 * Access is granted on (key match) OR (route match), never on both:
 *
 *   key match    the requested path's MENU_PERMISSIONS key is in the live key
 *                set. Unchanged, byte for byte, from what round 2 proved.
 *   route match  the caller holds a live handover whose stored `route` IS this
 *                page.
 *
 * The route lane closes the 70-route gap no matter how either resolver evolves,
 * because it stops asking the two lanes to agree on a key at all.
 *
 * It cannot be a swap. The other four layers grant by KEY, and
 * `user_has_permission()` already grants that key platform-wide, so dropping
 * the key lane would make this middleware NARROWER than the other four — this
 * bug's exact shape: permitted everywhere, bounced at the edge, with no way for
 * the receiver to tell why.
 *
 * ── WHERE THE ROUTE LANE GETS ITS LIVENESS ────────────────────────────────────
 *
 * Not from TypeScript. The routes are read from `director_handovers` under RLS
 * (policy `dh_select` — a grantee may read the row that names them), and the
 * only filter that decides whether a row counts is
 * `permission_keys && <the key set fn_my_handover_permissions() just
 * returned>`. Status, revoked_at, the inclusive IST due date, grantee active,
 * grantee still in the granting institution, the walls and the access level are
 * therefore enforced by the spine's own function and are not restated here in
 * any form. A revoked, expired or declined handover contributes no keys, so it
 * contributes no routes: when the key set comes back EMPTY the route query is
 * not issued at all.
 *
 * `.eq('grantee_user_id', …)` is not a liveness filter — `dh_select` also lets
 * ADMINS read other people's handovers, and an admin must not inherit a
 * colleague's routes.
 *
 * Two consequences, stated plainly rather than discovered later.
 *
 * ONE. A route whose keys are live only because a DIFFERENT live handover
 * carries the same key is matched. That is not a widening — the page gate, RLS,
 * the RPCs and the API routes all opened it already, on that same live key.
 *
 * TWO, and it is a real widening of THIS layer: `route` and `permission_keys`
 * are independent arguments to `fn_director_handover_create`. The capture
 * control derives both from one pathname, but a Director calling the RPC
 * directly could store a route that its own keys do not unlock. The route lane
 * would then carry that person past the EDGE — and no further. The page's own
 * gate, RLS, the RPCs and the API routes all still refuse, because none of them
 * looks at `route` at all. The trade is deliberate: an edge layer that is never
 * narrower than the other four cannot also be the layer that decides, and only
 * a `director` or a super admin can create a row in the first place.
 *
 * ── SAME MATCHER, NOT A SECOND ONE ────────────────────────────────────────────
 *
 * Both lanes go through `routeMatcher`. The key lane uses the same
 * `routeMatcher.match()` call `hasAccess()` just made; the route lane uses
 * `routeMatcher.sameRoute()`, which walks that same permission trie, so a
 * segment is dynamic exactly where the trie says it is. `/x/[id]/budget` and a
 * literal id are one route by construction, and two different literal segments
 * stay two routes even when they resolve to the same menu key.
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
 * Hard ceiling on the extra database work. This is edge middleware on every
 * request; a hung PostgREST call must not be able to hold a document request
 * open. At the deadline we abort and keep the redirect. The budget covers the
 * WHOLE lookup, both lanes, not one call each.
 */
export const HANDOVER_LOOKUP_TIMEOUT_MS = 300;

/**
 * How long a user's live handover grants are reused. Next prefetches links, so
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

/** What one deny-path lookup yields. Both lanes, one cache entry. */
export interface LiveHandoverGrants {
  /** fn_my_handover_permissions() — the spine's own predicate, verbatim. */
  keys: string[];
  /** `director_handovers.route` for the rows those keys came from. */
  routes: string[];
}

interface CachedGrants extends LiveHandoverGrants {
  expiresAt: number;
}

const keyCache = new Map<string, CachedGrants>();

/**
 * Minimal shape this module needs. Keeps the module testable without the SDK.
 *
 * `from` is optional on purpose: a caller that cannot read the table (or a test
 * double that models only the RPC) simply has no route lane, and the key lane
 * behaves exactly as it did before. Degrading is never opening.
 */
export interface HandoverRpcClient {
  rpc: (fn: string, args?: Record<string, unknown>) => unknown;
  from?: (table: string) => unknown;
}

function readCache(userId: string): LiveHandoverGrants | null {
  const hit = keyCache.get(userId);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    keyCache.delete(userId);
    return null;
  }
  return { keys: hit.keys, routes: hit.routes };
}

function writeCache(userId: string, grants: LiveHandoverGrants) {
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
    grants.keys.length > 0 ? HANDOVER_KEYS_TTL_MS : HANDOVER_EMPTY_TTL_MS;
  keyCache.set(userId, { ...grants, expiresAt: Date.now() + ttl });
}

/** Test seam. Never called by the middleware. */
export function __clearHandoverKeyCache() {
  keyCache.clear();
}

/**
 * Await a PostgREST builder, passing the abort signal when the builder supports
 * it. Shared by both lanes so a stalled socket on either is bounded the same
 * way.
 */
async function settle(builder: unknown, signal: AbortSignal): Promise<unknown> {
  const withAbort = builder as {
    abortSignal?: (s: AbortSignal) => unknown;
  };
  return typeof withAbort?.abortSignal === 'function'
    ? await withAbort.abortSignal(signal)
    : await (builder as Promise<unknown>);
}

/**
 * LANE 1 — the keys, from the spine's own function.
 * @returns the caller's live handover keys, or null when the answer is unknown
 *          (error, malformed). null is never treated as "no keys".
 */
async function fetchLiveKeys(
  supabase: HandoverRpcClient,
  signal: AbortSignal
): Promise<string[] | null> {
  const awaited = await settle(supabase.rpc('fn_my_handover_permissions'), signal);
  const { data, error } = (awaited ?? {}) as { data?: unknown; error?: unknown };

  // Includes the pre-migration case: the function does not exist yet, so
  // PostgREST answers PGRST202 and this layer stays inert.
  if (error) return null;
  if (!Array.isArray(data)) return [];
  return data.filter((k): k is string => typeof k === 'string');
}

/**
 * LANE 2 — the routes of the rows those keys came from.
 *
 * Issued ONLY when lane 1 returned at least one live key, which is what makes
 * the liveness of these routes the spine's answer rather than this file's. A
 * failure here yields no routes and never an error: lane 1 has already
 * succeeded and its grant must still stand.
 */
async function fetchLiveRoutes(
  supabase: HandoverRpcClient,
  userId: string,
  liveKeys: string[],
  signal: AbortSignal
): Promise<string[]> {
  if (typeof supabase.from !== 'function') return [];
  try {
    const query = (supabase.from('director_handovers') as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          overlaps: (col: string, vals: string[]) => unknown;
        };
      };
    })
      .select('route')
      .eq('grantee_user_id', userId)
      .overlaps('permission_keys', liveKeys);

    const awaited = await settle(query, signal);
    const { data, error } = (awaited ?? {}) as {
      data?: unknown;
      error?: unknown;
    };
    if (error || !Array.isArray(data)) return [];
    return data
      .map((row) => (row as { route?: unknown })?.route)
      .filter((r): r is string => typeof r === 'string' && r.startsWith('/'));
  } catch {
    return [];
  }
}

/**
 * Both lanes, hard-bounded by ONE deadline.
 * @returns the caller's live grants, or null when the answer is unknown.
 */
async function fetchLiveGrants(
  supabase: HandoverRpcClient,
  userId: string
): Promise<LiveHandoverGrants | null> {
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

  const lookup = (async (): Promise<LiveHandoverGrants | null> => {
    const keys = await fetchLiveKeys(supabase, controller.signal);
    if (keys === null) return null;
    // No live key means no live handover, so there is nothing for the route
    // lane to find. Skipping the second call is what keeps the cost of an
    // ordinary denial at exactly one round trip, as measured.
    if (keys.length === 0) return { keys, routes: [] };
    const routes = await fetchLiveRoutes(supabase, userId, keys, controller.signal);
    return { keys, routes };
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

/** Query string, hash and trailing slash are not part of a route's identity. */
function normalizePath(raw: string): string {
  let path = (raw ?? '').split('#')[0].split('?')[0].trim();
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path === '' ? '/' : path;
}

/**
 * Does a live Director's Desk handover open the requested path for this user?
 *
 * Granted on (key match) OR (route match) — see the union note in the header.
 * Call this ONLY after the role-derived check has already decided to redirect.
 * It fails closed on every uncertainty.
 */
export async function routeAllowedByHandover(
  supabase: HandoverRpcClient,
  userId: string,
  path: string
): Promise<boolean> {
  try {
    const requestedPath = normalizePath(path);

    // The same matcher, the same call, that hasAccess() just used. A path this
    // matcher does not know at all is not a protected route, so hasAccess()
    // cannot have denied it and nothing can have been handed over for it —
    // answer without asking the database anything.
    const config = routeMatcher.match(requestedPath);
    if (!config) return false;

    // May be absent: a denial from the static PROTECTED_ROUTES role list has no
    // MENU_PERMISSIONS key. That kills the key lane for this request, not the
    // route lane — such a page can still declare its own gate keys and so can
    // still have been handed over.
    const requiredKey = config.permission ?? null;

    let grants = readCache(userId);
    if (!grants) {
      grants = await fetchLiveGrants(supabase, userId);
      // A null answer means UNKNOWN, never "no grants" — it is not cached at
      // all, so a transient PostgREST blip cannot pin a user out for a TTL.
      if (!grants) return false; // keep the redirect
      writeCache(userId, grants);
    }

    // LANE 1 — the key the page is gated on, unchanged.
    if (requiredKey && grants.keys.includes(requiredKey)) return true;

    // LANE 2 — a live handover whose stored route IS this page. Closes the 70
    // routes whose real gate key is not their menu key.
    return grants.routes.some((stored) =>
      routeMatcher.sameRoute(normalizePath(stored), requestedPath)
    );
  } catch {
    return false;
  }
}
