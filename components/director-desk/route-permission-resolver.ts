// ============================================================================
// Route -> permission key(s), for the Director's hand-over control.
//
// THE WHOLE FEATURE TURNS ON THIS FILE.
// A handover row IS a permission grant (specs/director-desk/SPEC.md). So the
// key written onto the row has to be the SAME key the page's own gate demands,
// or the receiver gets a link that opens onto an access-denied panel and the
// Director believes he delegated something he did not.
//
// WHY routeMatcher AND NOT A FRESH LOOKUP IN MENU_PERMISSIONS
// -----------------------------------------------------------
// MENU_PERMISSIONS (lib/sidebarMenuLink) is the map, but it is NOT the matcher.
// The page gate — components/auth/route-permission-guard.tsx — resolves a route
// through `routeMatcher.match(pathname)?.permission`, a trie built FROM
// MENU_PERMISSIONS that adds two behaviours a plain `MENU_PERMISSIONS[path]`
// lookup does not have:
//
//   1. `[id]` segments match any concrete value, so /users/<uuid>/edit resolves
//      through the '/users/[id]/edit' entry.
//   2. the most-specific ANCESTOR wins when there is no entry for the exact
//      route, which is how deep pages inherit their section's key.
//
// Reimplementing (1) here and skipping (2) would produce a resolver that agrees
// with the map and disagrees with the gate — the four-layers defect this repo
// has hit three times (feedback_widening_a_permission_is_four_layers). Reading
// the gate's own resolver is the only way the two cannot drift.
//
// The trade this makes, stated plainly: a page whose BUTTONS need a second key
// beyond its gate key (e.g. a page gated on `x.view` whose save button calls an
// RPC wanting `x.manage`) hands over the gate key only. The receiver opens the
// page and the save button 403s. We do NOT guess the second key — inventing one
// is how a handover silently grants more than the Director chose. That gap is a
// page-authoring problem and belongs in MENU_PERMISSIONS, not here.
// ============================================================================

import { routeMatcher } from '@/lib/auth/route-matcher';

/** The three things a receiver can be given. Mirrors the DB CHECK constraint. */
export type HandoverAccessLevel = 'watch' | 'update' | 'full';

/**
 * The permission key that gates the hand-over control itself. Defined on the
 * spine branch in lib/constants/permissions.ts and deliberately NOT re-declared
 * here. Server-side, `fn_can_hand_over()` is the authority — it consults this
 * key, the `director` role, and the super-admin flag.
 */
export const HANDOVER_PERMISSION_KEY = 'director.handover.create';

export interface RouteResolution {
  /**
   * Keys to write onto the handover. Empty means the page declares no
   * permission of its own — submit must be blocked, NOT filled with a guess.
   */
  keys: string[];
  /**
   * The concrete path prefix the matcher stopped on, e.g. '/hr/employees' for
   * '/hr/employees/123/documents'. Shown to the Director so it is visible when
   * a key was inherited from a section rather than declared on the page.
   */
  matchedAt: string | null;
  /** True when the key came from an ancestor rather than the route itself. */
  inherited: boolean;
}

/**
 * Strip query string, hash and any trailing slash. Next's usePathname() does
 * not include search params, but this control is mounted globally and can be
 * handed any string, so normalise defensively.
 */
export function normalizePathname(raw: string | null | undefined): string {
  if (!raw) return '/';
  let path = raw.split('#')[0].split('?')[0].trim();
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '');
  return path === '' ? '/' : path;
}

/**
 * Resolve a live pathname to the permission key(s) that unlock it.
 *
 * Three outcomes, all of them explicit:
 *   exact entry            -> one key, inherited: false
 *   dynamic segment / deep -> one key, inherited: true when it came from above
 *   nothing in the map     -> keys: [] — the caller must refuse to submit
 */
export function resolveRoutePermissionKeys(pathname: string): RouteResolution {
  const path = normalizePathname(pathname);

  let match: { permission?: string; matchedPath: string } | null = null;
  try {
    match = routeMatcher.match(path);
  } catch {
    // The matcher builds a trie at import time over ~1,000 entries. If that ever
    // throws we refuse rather than guess: an empty resolution disables submit.
    match = null;
  }

  const permission = match?.permission;
  if (!permission) {
    return { keys: [], matchedAt: null, inherited: false };
  }

  const matchedAt = normalizePathname(match?.matchedPath ?? null);
  return {
    keys: [permission],
    matchedAt,
    inherited: matchedAt !== path,
  };
}

// ============================================================================
// ACCESS LEVELS
//
// The strings below are what the Director actually reads. Plain English at a
// 10th-grade reading level, because the person receiving this is a colleague
// deciding whether to accept a job, not an engineer reading a permission key.
// ============================================================================

export interface AccessLevelOption {
  value: HandoverAccessLevel;
  label: string;
  /** One line. What the receiver will be able to do, in words. */
  description: string;
}

export const ACCESS_LEVELS: AccessLevelOption[] = [
  {
    value: 'watch',
    label: 'Watch',
    description: 'They can open the page and read it. They cannot change anything.',
  },
  {
    value: 'update',
    label: 'Update',
    description: 'They can read it and move the work along — but not create or delete.',
  },
  {
    value: 'full',
    label: 'Full',
    description: 'They can do everything on this page, as if it were theirs.',
  },
];

// ---------------------------------------------------------------------------
// A CLIENT-SIDE MIRROR OF fn_handover_key_allowed_at_level(key, level).
//
// READ THIS BEFORE TOUCHING IT. The database is the authority: the create RPC
// rejects a key the level cannot carry, and fn_handover_grants_key re-checks it
// on every permission read. This mirror exists ONLY to warn the Director BEFORE
// he submits, so he does not send a handover that would grant nothing.
//
// It therefore NEVER blocks submit. If this mirror and the database ever
// disagree, the database wins and its message is shown verbatim — a mirror that
// blocked would turn its own drift into an unfixable dead end.
//
// SQL LIKE subtlety, faithfully reproduced: the spine writes `'%.mark_%'`, and
// `_` is a single-character wildcard in LIKE — so that clause matches ".mark"
// followed by at least one more character (".marks", ".mark_bulk"), not a
// literal underscore. Getting this wrong in either direction produces warnings
// the server does not agree with.
// ---------------------------------------------------------------------------

const WATCH_SUFFIXES = ['.view', '.read', '.export'];
const UPDATE_EXTRA_SUFFIXES = [
  '.edit',
  '.update',
  '.submit',
  '.mark',
  '.respond',
  '.acknowledge',
];
/** `'%.mark_%'` — ".mark" plus at least one further character. */
const MARK_WILDCARD = /\.mark[\s\S]/;

export function keyAllowedAtLevel(key: string, level: HandoverAccessLevel): boolean {
  if (level === 'full') return true;

  const endsWithAny = (suffixes: string[]) => suffixes.some((s) => key.endsWith(s));

  if (level === 'watch') return endsWithAny(WATCH_SUFFIXES);

  // 'update'
  return (
    endsWithAny(WATCH_SUFFIXES) ||
    endsWithAny(UPDATE_EXTRA_SUFFIXES) ||
    MARK_WILDCARD.test(key)
  );
}

/** Keys the chosen level cannot carry. Empty means the level is a fit. */
export function keysNotAllowedAtLevel(
  keys: string[],
  level: HandoverAccessLevel
): string[] {
  return keys.filter((k) => !keyAllowedAtLevel(k, level));
}

/**
 * The lowest level that carries every key. Null when only Full will do.
 * Used to suggest a fix rather than just reporting a problem.
 */
export function lowestLevelThatCarries(keys: string[]): HandoverAccessLevel {
  if (keysNotAllowedAtLevel(keys, 'watch').length === 0) return 'watch';
  if (keysNotAllowedAtLevel(keys, 'update').length === 0) return 'update';
  return 'full';
}

// ============================================================================
// TITLE
// ============================================================================

const TITLE_TAIL = /\s*[|–—-]\s*MyJKKN\s*$/i;
/**
 * Observed live on /learners/profiles, 2026-08-05: document.title is the bare
 * app name on plenty of pages, not a page name. Prefilling "MyJKKN" as the job
 * is worse than prefilling nothing, so the app name is treated as absent.
 */
const APP_NAME_ONLY = /^\s*my\s*jkkn\s*$/i;

/**
 * Pre-fill the title so the Director types nothing he does not have to.
 * Prefers the real document title (pages set descriptive ones), and falls back
 * to the last meaningful path segment turned into words.
 */
export function deriveHandoverTitle(
  pathname: string,
  documentTitle?: string | null
): string {
  const fromDoc = (documentTitle ?? '').replace(TITLE_TAIL, '').trim();
  if (fromDoc.length > 2 && !APP_NAME_ONLY.test(fromDoc)) return fromDoc;

  const segments = normalizePathname(pathname).split('/').filter(Boolean);
  // Walk back past concrete ids (uuids, numbers) to the last word-ish segment.
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (/^[0-9a-f-]{8,}$/i.test(seg) || /^\d+$/.test(seg)) continue;
    return seg
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return 'Dashboard';
}
