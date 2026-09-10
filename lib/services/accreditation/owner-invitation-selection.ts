// =====================================================================
// Which pending ownership rows still need an invitation
// =====================================================================
// THE DECISION THIS SERVES (Director, 2026-09-08)
// "Assignment is ownership. No accepting. Record who has seen it."
//
// Before that decision a row left `pending` the moment its owner clicked
// Accept, so "every pending row" was a shrinking set and the invitation cron
// could simply mail it. With Accept gone, `pending` is permanent. Mailing every
// pending row per owner, keyed on the whole set, would re-send an ever-growing
// list each time one new assignment arrived.
//
// It would also say twice what another message already says. The
// accreditation-ownership-notify cron reads accreditation_ownership_events and
// tells the new owner about every assignment and reassignment (every 6 hours,
// 14-day lookback, idempotent per event and recipient). All 31 rows the
// 2026-09-10 invitation run would have announced had already been announced
// that way, and 3 people had received both messages.
//
// So a pending row is invited only when NEITHER of these is true:
//   (a) a live ownership event hands this row to its current owner — the
//       ownership-change cron owns announcing it;
//   (b) an earlier invitation to THIS SAME owner already listed this row.
// (b) is per owner on purpose: a row moved to somebody new by a write that
// recorded no event must still reach the new owner, even if the old owner was
// invited about it once.
//
// PURE: no Supabase client, no fetch, no clock. The cron route reads, calls
// this, and sends. The rules are asserted in
// __tests__/lib/services/accreditation/owner-invitation-selection.test.ts.
// =====================================================================

/** A pending row of accreditation_metric_owners, as the invitation cron reads it. */
export interface PendingAssignment {
  id: string;
  owner_user_id: string | null;
  institution_id: string | null;
  body_code: string | null;
  metric_code: string | null;
}

/**
 * An accreditation_ownership_events row whose `note` IS NULL. The one-off
 * backfill wrote a note on every row it created and announced nothing, so
 * only note-less events are treated as having reached the owner.
 */
export interface LiveOwnershipEvent {
  owner_row_id: string | null;
  to_user_id: string | null;
}

/** A past invitation: who it went to and which assignment rows it listed. */
export interface PriorInvite {
  user_ids: string[];
  assignment_ids: string[];
}

export interface InvitationSelection<T extends PendingAssignment> {
  toInvite: T[];
  excluded: {
    /** Rows a live ownership event already hands to their current owner. */
    announcedByChange: T[];
    /** Rows an earlier invitation to the same owner already listed. */
    alreadyInvited: T[];
  };
}

/** Idempotency-key prefix the invitation cron writes. */
export const OWNER_INVITE_KEY_PREFIX = 'accred_owner_invite:';

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v !== '') : [];

/**
 * Read a past invitation off a notifications row.
 *
 * `targeting.user_ids` and `metadata.assignment_ids` are what the cron writes.
 * Both are JSONB and nothing enforces their shape, so each falls back to the
 * idempotency key itself — `accred_owner_invite:<user>:<id,id,…>` — which was
 * built from the same two facts. Returns null for a row that is not an
 * invitation or carries neither.
 */
export function priorInviteFromNotification(row: {
  idempotency_key?: string | null;
  targeting?: unknown;
  metadata?: unknown;
}): PriorInvite | null {
  const key = typeof row.idempotency_key === 'string' ? row.idempotency_key : '';
  if (!key.startsWith(OWNER_INVITE_KEY_PREFIX)) return null;

  const rest = key.slice(OWNER_INVITE_KEY_PREFIX.length);
  const split = rest.indexOf(':');
  const keyUser = split === -1 ? rest : rest.slice(0, split);
  const keyIds = split === -1 ? [] : rest.slice(split + 1).split(',').filter(Boolean);

  const targetingUsers = strings((row.targeting as { user_ids?: unknown } | null)?.user_ids);
  const metadataIds = strings((row.metadata as { assignment_ids?: unknown } | null)?.assignment_ids);

  const user_ids = targetingUsers.length ? targetingUsers : keyUser ? [keyUser] : [];
  const assignment_ids = metadataIds.length ? metadataIds : keyIds;
  if (user_ids.length === 0 || assignment_ids.length === 0) return null;
  return { user_ids, assignment_ids };
}

/**
 * THE WHOLE RULE. See the header for why each exclusion exists.
 *
 * A row matching both exclusions is counted once, under announcedByChange —
 * the ownership-change message is the one the owner is meant to have. Rows
 * with no owner cannot be invited and are left out of every list; the cron
 * filters them before calling this. Every list comes back ordered by id.
 */
export function selectAssignmentsToInvite<T extends PendingAssignment>(input: {
  pending: T[];
  liveEvents: LiveOwnershipEvent[];
  priorInvites: PriorInvite[];
}): InvitationSelection<T> {
  const announced = new Set<string>();
  for (const e of input.liveEvents) {
    if (e.owner_row_id && e.to_user_id) announced.add(`${e.owner_row_id}|${e.to_user_id}`);
  }

  const invited = new Set<string>();
  for (const invite of input.priorInvites) {
    for (const userId of invite.user_ids) {
      for (const assignmentId of invite.assignment_ids) invited.add(`${assignmentId}|${userId}`);
    }
  }

  const result: InvitationSelection<T> = {
    toInvite: [],
    excluded: { announcedByChange: [], alreadyInvited: [] },
  };

  for (const row of [...input.pending].sort(byId)) {
    if (!row.owner_user_id) continue;
    const pair = `${row.id}|${row.owner_user_id}`;
    if (announced.has(pair)) result.excluded.announcedByChange.push(row);
    else if (invited.has(pair)) result.excluded.alreadyInvited.push(row);
    else result.toInvite.push(row);
  }

  return result;
}
