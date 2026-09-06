// lib/services/roles/permission-holder-counts.ts
// ============================================================================
// "This permission is used by N people." — Director decision 9 (2026-08-05).
//
// Backs the warning shown in Role Management when an admin unticks a permission
// that real people currently rely on. Everything here is deliberately small and
// side-effect free apart from fetchPermissionHolderCounts(), so the decision
// logic can be tested without a browser or a database.
//
// THE COUNT IS PEOPLE, NOT ROLES. The distinct-person figure comes from the
// database (fn_permission_live_holder_count), which counts
// COUNT(DISTINCT user_roles.user_id) across every granting role. Summing
// per-role holder counts double-counts anyone holding two granting roles —
// on production `bos.experts.view` sums to 621 and is really 581 people.
// parseHolderCounts() therefore never adds two rows together, even if the
// server contract were to change underneath it.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

/** SECURITY DEFINER RPC added by supabase/migrations/20260809103300_permission_holder_count.sql */
export const PERMISSION_HOLDER_COUNT_RPC = 'fn_permission_live_holder_count';

/** One row per requested key, exactly as the RPC returns it. */
export interface PermissionHolderCountRow {
  permission_key: string | null;
  /** bigint — arrives as a number over PostgREST, but a string is tolerated. */
  holder_count: number | string | null;
}

/** permission key -> how many real people hold it right now. */
export type PermissionHolderCounts = Record<string, number>;

/** What the toggle handler should do with a click. */
export type PermissionToggleAction = 'apply' | 'confirm-removal';

/**
 * The keys worth asking about. Only a permission that is currently ON can be
 * switched off, so those are the only ones whose holder count can matter — and
 * asking for just those keeps this to ONE request per dialog rather than one
 * per checkbox.
 */
export function keysNeedingHolderCounts(
  permissions: Record<string, boolean> | null | undefined
): string[] {
  if (!permissions) return [];
  return Object.keys(permissions).filter(
    (key) => key.trim() !== '' && permissions[key] === true
  );
}

/**
 * Rows -> map. FIRST WINS, never sums.
 *
 * The RPC returns one row per key. If it ever returned one row per granting
 * role instead, summing would silently reproduce the exact bug this feature
 * exists to prevent (621 instead of 581), so this refuses to add. A repeated
 * key keeps the first value it saw.
 */
export function parseHolderCounts(
  rows: PermissionHolderCountRow[] | null | undefined
): PermissionHolderCounts {
  const counts: PermissionHolderCounts = {};
  if (!Array.isArray(rows)) return counts;

  for (const row of rows) {
    const key = row?.permission_key;
    if (typeof key !== 'string' || key === '') continue;
    if (key in counts) continue; // first wins — see the note above

    const raw = row?.holder_count;
    const value = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;

    counts[key] = value;
  }

  return counts;
}

/**
 * Warn only when a permission real people are using is being taken away.
 *
 * Granting is not the hazard, so it is never interrupted. An unknown count
 * (key absent from the map — the state before the migration is applied, or
 * after a failed request) does NOT warn: a prompt that fires on every untick
 * regardless of impact is the cry-wolf failure the Director called out, and a
 * warning people click through is worse than none.
 */
export function shouldWarnOnRemoval(
  previous: boolean,
  next: boolean,
  holderCount: number | undefined
): boolean {
  if (!previous || next) return false; // not a removal
  return typeof holderCount === 'number' && holderCount > 0;
}

/**
 * The single decision the permission Switch asks before it changes anything.
 * Kept as one exported function so the dialog and its test exercise the same
 * code rather than two copies of the same rule.
 */
export function resolvePermissionToggle(args: {
  previous: boolean;
  next: boolean;
  holderCount: number | undefined;
}): PermissionToggleAction {
  return shouldWarnOnRemoval(args.previous, args.next, args.holderCount)
    ? 'confirm-removal'
    : 'apply';
}

/**
 * One batched request for every key the dialog might need, called once when the
 * dialog opens. Never call this per checkbox.
 *
 * Returns {} on any failure — including the migration not being applied yet, in
 * which case the RPC does not exist. The caller treats an absent key as
 * "unknown" and stays silent, so the warning switches itself on the day the
 * database half lands and never guesses before then.
 */
export async function fetchPermissionHolderCounts(
  keys: string[]
): Promise<PermissionHolderCounts> {
  if (!keys.length) return {};

  const supabase = createClientSupabaseClient();
  const { data, error } = await (supabase as any).rpc(
    PERMISSION_HOLDER_COUNT_RPC,
    { p_keys: keys }
  );

  if (error) return {};
  return parseHolderCounts(data as PermissionHolderCountRow[] | null);
}
