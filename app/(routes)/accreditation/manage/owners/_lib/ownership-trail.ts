/**
 * The ownership trail — who assigned whom, when, and whether the person doing
 * the assigning was the body owner delegating within their own body.
 *
 * Two facts this module exists to keep separate, because the screen above it
 * kept collapsing them:
 *
 *   1. WHO IS DOING THE METRIC. `accreditation_metric_owners` answers this, and
 *      an explicit metric row overrides the inherited body owner.
 *   2. WHO IS STILL ANSWERABLE FOR IT. Delegation does not move that. A body
 *      owner who hands metric 3.1.1 to a colleague is still the person the IQAC
 *      asks about NAAC 3.1.1 — so the screen must name BOTH, and never render a
 *      delegation as a handover.
 *
 * Assignment IS ownership (Director, 2026-09-08). There is no Accept step and
 * nothing here reintroduces one: a trail row is a record of what happened, not
 * a gate on what may happen next.
 *
 * `public.accreditation_ownership_events` is written by a sibling lane and may
 * not exist on this database yet. Every read is therefore allowed to come back
 * UNAVAILABLE, which is a different fact from "no history" and is rendered
 * differently — see `TrailRead`.
 *
 * Pure, and in its own module, because importing the page pulls the Supabase
 * client in at module scope and that cannot load under vitest.
 */

/**
 * Mirrors the sibling lane's CHECK on `action`.
 *
 * `seen` is not an ownership CHANGE — it records that the named person opened
 * their page — but it belongs on the same timeline, because "did they know?" is
 * the question the retired Accept click was pretending to answer.
 */
export type OwnershipAction =
  | 'assigned'
  | 'reassigned'
  | 'cleared'
  | 'declined'
  | 'seen';

export interface OwnershipEvent {
  id: string;
  owner_row_id: string | null;
  institution_id: string;
  body_code: string;
  /** NULL = the event is about the body-level owner, not one metric. */
  metric_code: string | null;
  action: OwnershipAction | string;
  from_user_id: string | null;
  to_user_id: string | null;
  actor_user_id: string | null;
  actor_is_body_owner: boolean | null;
  note: string | null;
  created_at: string;
}

/**
 * The outcome of trying to read the trail.
 *
 * `unavailable` means the table is not on this database yet — say "no history
 * recorded yet". It is deliberately NOT the same value as an empty `ok`, and
 * neither is the same as a thrown error, which means the read FAILED and must
 * never be rendered as a claim that nothing happened.
 */
export type TrailRead =
  | { kind: 'ok'; events: OwnershipEvent[] }
  | { kind: 'unavailable' };

/**
 * Whether a PostgREST failure means "that table is not here" rather than
 * "something went wrong".
 *
 * PostgREST reports a missing relation two ways depending on version and on
 * whether the schema cache has been reloaded: the raw PostgreSQL code 42P01, or
 * its own PGRST205 with a "Could not find the table" message. Both are the same
 * fact. Anything else — an RLS refusal that errors, a network failure, a
 * malformed filter — is a genuine error and is left to throw.
 */
export function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : '';
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202') return true;
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  return (
    message.includes('could not find the table') ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
}

/** Newest first. Ties broken on id so the order is stable across renders. */
export function sortEventsNewestFirst(
  events: readonly OwnershipEvent[],
): OwnershipEvent[] {
  return [...events].sort((a, b) => {
    const diff =
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (diff !== 0 && Number.isFinite(diff)) return diff;
    return b.id.localeCompare(a.id);
  });
}

export interface TrailScope {
  bodyCode: string;
  /** NULL/undefined = every event in the body, metric-level rows included. */
  metricCode?: string | null;
}

/**
 * Narrow a trail to one body, or to one metric within it.
 *
 * A body scope INCLUDES the body-level rows (metric_code NULL) as well as every
 * metric beneath it: the person who was made body owner is part of that body's
 * ownership story, and hiding it would leave the delegations looking as though
 * they came from nowhere.
 *
 * A metric scope also includes the body-level rows, for the same reason one
 * level down — the accountable person above a delegated metric is exactly what
 * the screen is trying to make visible.
 */
export function filterEventsForScope(
  events: readonly OwnershipEvent[],
  scope: TrailScope,
): OwnershipEvent[] {
  return events.filter((e) => {
    if (e.body_code !== scope.bodyCode) return false;
    if (scope.metricCode == null) return true;
    return e.metric_code === scope.metricCode || e.metric_code === null;
  });
}

/** A day a reader recognises. Never a raw timestamp on screen. */
export function formatTrailDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'an unrecorded date';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** What the event is about — one metric, or the body as a whole. */
export function eventScopeLabel(event: OwnershipEvent): string {
  return event.metric_code
    ? `${event.body_code} ${event.metric_code}`
    : `${event.body_code} (whole body)`;
}

/**
 * One trail row as a plain sentence.
 *
 * `nameOf` resolves a user id to a display name; it is passed in rather than
 * looked up here so this stays pure and so the page can reuse the same person
 * map it already builds for the owner tables. It must always return something
 * printable — the caller's existing `personLabel` returns 'Nobody' for null and
 * 'Owner assigned' for an id it cannot name, so no branch here prints a UUID.
 *
 * The body-owner suffix is the point of the sentence, not decoration: a
 * delegation made BY the accountable person reads differently from one imposed
 * from outside the body, and the screen must not flatten the two.
 */
export function ownershipEventSentence(
  event: OwnershipEvent,
  nameOf: (userId: string | null) => string,
): string {
  const actor = nameOf(event.actor_user_id);
  const from = nameOf(event.from_user_id);
  const to = nameOf(event.to_user_id);
  const when = formatTrailDate(event.created_at);

  let core: string;
  switch (event.action) {
    case 'assigned':
      core = `${actor} made ${to} the owner`;
      break;
    case 'reassigned':
      core = `${actor} moved this from ${from} to ${to}`;
      break;
    case 'cleared':
      core = `${actor} removed ${from} as owner`;
      break;
    case 'declined':
      // The person declining IS the actor. Naming them twice ("X declined,
      // taking it from X") would read as two people.
      core = `${actor} declined this`;
      break;
    case 'seen':
      core = `${actor} opened this for the first time`;
      break;
    default:
      // A new action added by the sibling lane must still render as something
      // true rather than vanish from the timeline or crash it.
      core = `${actor} changed the ownership of this (${String(event.action)})`;
      break;
  }

  // 'seen' is not an act of authority, so the body-owner note would be noise
  // there — it answers "who was allowed to do this", and opening your own page
  // needs no authority.
  const asBodyOwner =
    event.actor_is_body_owner === true && event.action !== 'seen'
      ? `, as the ${event.body_code} body owner`
      : '';

  const note = event.note ? ` — “${event.note}”` : '';

  return `${core}${asBodyOwner} on ${when}${note}.`;
}

/**
 * The line that keeps a delegation from reading as a handover.
 *
 * Returned for an EXPLICIT metric owner only. An inherited metric already says
 * "via NAAC owner" in the cell beside it, and an unowned one has nobody to be
 * accountable above.
 *
 * `null` when the body owner IS the metric owner — the person has not delegated
 * anything to themselves, and printing "you remain accountable" beside your own
 * name says nothing.
 */
export function accountabilityNote(args: {
  source: 'explicit' | 'inherited' | 'none';
  bodyCode: string;
  metricOwnerUserId: string | null;
  bodyOwnerUserId: string | null;
  bodyOwnerName: string | null;
}): string | null {
  if (args.source !== 'explicit') return null;
  if (!args.bodyOwnerUserId) {
    return `${args.bodyCode} has no owner — nobody above this metric is accountable.`;
  }
  if (args.bodyOwnerUserId === args.metricOwnerUserId) return null;
  const name = args.bodyOwnerName || 'the body owner';
  return `${args.bodyCode} owner ${name} remains accountable.`;
}

/**
 * Why an assignment was refused, named out loud.
 *
 * Permission failures on this platform must be explicit, never a silent
 * redirect or a control that quietly does nothing (repo rule). The assign
 * controls are already withheld from anyone with neither power; this is what
 * gets said if a write is reached anyway — a stale render, a second tab, a
 * permission removed mid-session.
 */
export function assignRefusalReason(args: {
  canManage: boolean;
  isBodyOwner: boolean;
  bodyCode: string;
}): string | null {
  if (args.canManage || args.isBodyOwner) return null;
  return (
    `You cannot set owners for ${args.bodyCode}. That is open to the ` +
    `${args.bodyCode} body owner, who may delegate within their own body, and ` +
    `to IQAC coordinators holding “Manage narrative” ` +
    `(accreditation.naac.narrative.manage). Ask your IQAC coordinator for one ` +
    `of the two.`
  );
}

/**
 * Why clearing was refused.
 *
 * A delegating body owner may hand a metric to someone else; leaving it with
 * NOBODY is a different act — it removes the metric from the worklist of the
 * only person doing it, and the body owner's own accountability makes that
 * exactly the change they have the most reason to want and the least standing
 * to make unobserved. It stays with IQAC.
 */
export function clearRefusalReason(args: {
  canManage: boolean;
  bodyCode: string;
}): string | null {
  if (args.canManage) return null;
  return (
    `Only an IQAC coordinator can leave a ${args.bodyCode} metric with no ` +
    `owner. As body owner you can hand it to somebody else, and you stay ` +
    `accountable for it either way.`
  );
}
