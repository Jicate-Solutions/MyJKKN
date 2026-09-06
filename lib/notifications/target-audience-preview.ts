/**
 * Resolving recipient NAMES for a whole PAGE of notifications.
 *
 * `lib/notifications/target-audience.ts` owns the rule for which targeting keys
 * name people, and it stays the only place that rule lives. This module owns
 * nothing but the batching around it: the admin list renders up to 1,000
 * notifications in one response, so asking the database for names once per row
 * — let alone once per recipient — would turn a single page load into hundreds
 * of queries.
 *
 * What it produces:
 *   - `perRow[i]` — the first TARGET_NAME_PREVIEW_LIMIT recipient ids of row i,
 *     in their original order, so the resolved names line up with the ids they
 *     came from (`.in()` does not guarantee row order).
 *   - `lookupIds` — the de-duplicated union of all of those, capped, to be
 *     fetched in ONE query.
 *
 * The cap exists because `.in()` is serialised into the request URL: an
 * uncapped page of 1,000 rows would put ~2,000 uuids (~74KB) there and the
 * request would be rejected before it reached Postgres. Rows past the cap
 * simply resolve no names, and `formatRecipientSummary` degrades them to a
 * plain count ("273 people") — still honest about blast radius, and still
 * never the false "All Users".
 */

import {
  getTargetedUserIds,
  TARGET_NAME_PREVIEW_LIMIT,
  type NotificationTargeting
} from './target-audience';

/**
 * Most distinct profile ids one list request will look up. 200 uuids is ~7.4KB
 * of query string — comfortably inside the request-line limits, and far more
 * than a page of human-composed notifications needs once cron blasts to the
 * same handful of admins have been de-duplicated.
 */
export const LIST_NAME_LOOKUP_CAP = 200;

/** The columns a name preview is resolved from. */
export interface RecipientProfile {
  id?: string | null;
  full_name?: string | null;
  email?: string | null;
}

export interface RecipientNamePreviews {
  /** Preview ids per row, index-aligned with the notifications passed in. */
  perRow: string[][];
  /** De-duplicated, capped union of those ids — one `.in()` query's worth. */
  lookupIds: string[];
}

/**
 * Split a page of `targeting` values into per-row preview ids plus the single
 * de-duplicated id list to fetch. Never returns more than `cap` lookup ids.
 */
export function collectRecipientNamePreviews(
  targetings: readonly (NotificationTargeting | null | undefined)[] | null | undefined,
  cap: number = LIST_NAME_LOOKUP_CAP
): RecipientNamePreviews {
  const rows = Array.isArray(targetings) ? targetings : [];
  const perRow = rows.map((targeting) =>
    getTargetedUserIds(targeting).slice(0, TARGET_NAME_PREVIEW_LIMIT)
  );

  const safeCap = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 0;
  const lookupIds: string[] = [];
  const seen = new Set<string>();

  for (const ids of perRow) {
    if (lookupIds.length >= safeCap) break;
    for (const id of ids) {
      if (seen.has(id) || lookupIds.length >= safeCap) continue;
      seen.add(id);
      lookupIds.push(id);
    }
  }

  return { perRow, lookupIds };
}

/**
 * The display names for one row's preview ids, in the ids' own order.
 *
 * A profile that resolved to nothing usable — missing row, blank `full_name` —
 * falls back to its email and then drops out entirely rather than rendering an
 * empty name. Dropping out is safe: the caller's total comes from the id array
 * length, not from how many names came back.
 */
export function pickPreviewNames(
  previewIds: readonly string[] | null | undefined,
  profilesById: ReadonlyMap<string, RecipientProfile> | null | undefined
): string[] {
  if (!Array.isArray(previewIds) || previewIds.length === 0) return [];
  if (!profilesById) return [];

  const names: string[] = [];
  for (const id of previewIds) {
    const profile = profilesById.get(id);
    const name = profile?.full_name?.trim() || profile?.email?.trim() || '';
    if (name) names.push(name);
  }
  return names;
}
