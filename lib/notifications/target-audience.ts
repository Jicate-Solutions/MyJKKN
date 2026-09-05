/**
 * Notifications — describing who a notification was actually sent to.
 *
 * The admin detail page used to derive its Target Audience label from the
 * structural targeting keys only (institution / department / program /
 * semester / section / roles) and fall through to the literal string
 * 'All Users' when none were set. Person-targeted sends set none of those
 * keys, so a notification addressed to exactly one person rendered as
 * "All Users" — a blast-radius misreport, and the misreading that precedes an
 * accidental mass send.
 *
 * Measured on production 2026-08-18 (298,874 notifications). Senders have
 * emitted FOUR different keys for "these people", not one:
 *   - 295,362 carry `targeting.user_ids` (an array of profiles.id)
 *   - 3,192 carry `targeting.user_id` (a SINGLE id, not an array)
 *   - 4 carry `targeting.target_users`
 *   - 272 carry `targeting.roles` rather than `targeting.target_roles`
 *   - 2 carry `targeting.audience_ids` (saved audiences, resolved at send time)
 *   - 22 carry institution_id, 39 carry target_roles
 * Every one of those groups fell through to 'All Users'. Exactly ONE row in
 * the whole table has empty targeting `{}` — that row, and only that row, is
 * what 'All Users' should ever describe.
 *
 * These helpers are shared by the API route (which resolves the preview names)
 * and the view component (which renders the label), so the two cannot drift
 * apart on which ids count as recipients.
 */

export interface NotificationTargeting {
  institution_id?: string | null;
  department_id?: string | null;
  program_id?: string | null;
  semester_id?: string | null;
  section_id?: string | null;
  /** Canonical role-targeting key. */
  target_roles?: string[] | null;
  /** Legacy alias emitted by `{ type: 'role', roles: [...] }` senders. */
  roles?: string[] | null;
  /** Canonical person-targeting key: an array of profiles.id. */
  user_ids?: string[] | null;
  /** Legacy alias emitted by `{ type: 'user', user_id: '...' }` senders. */
  user_id?: string | null;
  /** Legacy alias emitted by a handful of older senders. */
  target_users?: string[] | null;
  /** Saved-audience references, resolved to people at send time. */
  audience_ids?: string[] | null;
  /**
   * Display names for the first few recipients, resolved server-side and in
   * the same order as the ids they came from. Never the whole list.
   */
  user_names?: string[] | null;
  [key: string]: unknown;
}

/**
 * How many recipient names the label shows before collapsing to "and N others".
 * This is also the number of profile rows the API fetches — the total count
 * comes from the id array's length, so name resolution never scales with the
 * size of the recipient list.
 */
export const TARGET_NAME_PREVIEW_LIMIT = 2;

function cleanStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * The profile ids a notification was addressed to, normalised across every
 * person-targeting key found in production. The keys do not co-occur, so the
 * first non-empty one wins. Order is preserved so the resolved names line up
 * with the ids they came from.
 */
export function getTargetedUserIds(
  targeting: NotificationTargeting | null | undefined
): string[] {
  if (!targeting) return [];
  const candidates = [
    targeting.user_ids,
    targeting.target_users,
    [targeting.user_id]
  ];
  for (const candidate of candidates) {
    const cleaned = cleanStrings(candidate);
    if (cleaned.length > 0) return cleaned;
  }
  return [];
}

/**
 * The role keys a notification was addressed to, normalised across both shapes
 * found in production (`target_roles` and the legacy `roles`).
 */
export function getTargetRoleKeys(
  targeting: NotificationTargeting | null | undefined
): string[] {
  if (!targeting) return [];
  const canonical = cleanStrings(targeting.target_roles);
  if (canonical.length > 0) return canonical;
  return cleanStrings(targeting.roles);
}

/**
 * "Priya R." · "Priya R. and Arun K." · "Priya R., Arun K. and 271 others".
 *
 * `total` is the full recipient count; `names` is only the handful that were
 * resolved for display. If no name could be resolved (a blank full_name, or a
 * lookup that returned nothing) the summary degrades to a plain count rather
 * than rendering an empty string — a count is still honest about blast radius.
 */
export function formatRecipientSummary(
  names: readonly (string | null | undefined)[] | null | undefined,
  total: number
): string {
  if (total <= 0) return '';

  const shown = cleanStrings(Array.isArray(names) ? names : []).slice(
    0,
    TARGET_NAME_PREVIEW_LIMIT
  );

  if (shown.length === 0) {
    return `${total.toLocaleString()} ${total === 1 ? 'person' : 'people'}`;
  }

  const remaining = total - shown.length;
  if (remaining <= 0) {
    return shown.length === 1 ? shown[0] : `${shown[0]} and ${shown[1]}`;
  }

  return `${shown.join(', ')} and ${remaining.toLocaleString()} ${
    remaining === 1 ? 'other' : 'others'
  }`;
}

/**
 * The Target Audience label.
 *
 * Precedence, when a notification carries BOTH named people and a structural
 * filter (0 such rows in production today, but the shape is expressible):
 * the people come FIRST because they are the narrower, more consequential
 * fact, and the structural parts are still appended after them — neither
 * silently disappears.
 *
 * 'All Users' is returned only when the targeting names nobody and no
 * structural filter is set, so the string is true wherever it appears.
 */
export function describeTargetAudience(
  targeting: NotificationTargeting | null | undefined
): string {
  const parts: string[] = [];

  const userIds = getTargetedUserIds(targeting);
  if (userIds.length > 0) {
    parts.push(formatRecipientSummary(targeting?.user_names, userIds.length));
  }

  // Saved audiences are resolved to people at send time, so the ids here are
  // audience rows, not profiles — named, not resolved, but never mistaken for
  // an unfiltered broadcast.
  if (cleanStrings(targeting?.audience_ids).length > 0) {
    parts.push('Saved audience');
  }

  if (targeting?.institution_id) parts.push('Institution');
  if (targeting?.department_id) parts.push('Department');
  if (targeting?.program_id) parts.push('Program');
  if (targeting?.semester_id) parts.push('Semester');
  if (targeting?.section_id) parts.push('Section');
  if (getTargetRoleKeys(targeting).length > 0) parts.push('Roles');

  return parts.length > 0 ? parts.join(' → ') : 'All Users';
}
