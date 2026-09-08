// =====================================================================
// Accreditation ownership changes — who gets told, and what they are told
// =====================================================================
// THE DECISION THIS SERVES (Director, 2026-09-08)
// Assignment IS ownership. There is no Accept step and nothing here should
// reintroduce one: an ownership row changing hands is a completed fact, not a
// proposal. What was missing is that the fact reached nobody.
//
// When ownership of a metric or a whole body changes, FOUR people have a
// reason to know:
//
//   1. the person who just became the owner        — they have work now
//   2. the person who lost it                      — they can stop
//   3. the body owner above that metric            — it is their body
//   4. the IQAC officer for that college           — they run the register
//
// with two rules on top:
//   · skip anyone who is the actor (nobody needs to be told what they did)
//   · de-duplicate — one person, one message per change, however many of the
//     four roles they happen to occupy
//
// and one condition the Director attached to giving body owners the power to
// override somebody else's assignment: a body-owner override ALWAYS reaches
// the IQAC officer. That is the check that makes the power safe to grant, so
// it must not be optimised away.
//
// WHY THIS FILE IS PURE
// It takes rows in and returns messages out. No Supabase client, no fetch, no
// clock. Every rule above is therefore testable without a database, and the
// cron route that calls it holds no rules of its own — it reads, calls, sends.
// The wording a person will actually receive is asserted in
// __tests__/lib/services/accreditation/ownership-notify.test.ts, not reviewed
// by reading a template.
//
// RELATIONSHIP TO THE EXISTING MAILERS
// `accreditation-owner-invitations` tells a NAMED owner about their standing
// assignment set; `accreditation-owner-digest` tells a settled owner what is
// still outstanding. Neither is about a CHANGE, and neither tells the three
// other parties. This is the third message, and its idempotency namespace is
// its own so it cannot collide with either.
// =====================================================================

/**
 * One row of public.accreditation_ownership_events — the trail written when
 * ownership moves.
 *
 * DEFENSIVE NOTE: this table is built by a sibling lane and may not exist in
 * production at the time this file merges. Nothing here assumes it does; the
 * cron route treats a missing relation as "no events" and says so out loud
 * rather than failing shut.
 */
export interface OwnershipEvent {
  id: string;
  owner_row_id: string | null;
  institution_id: string | null;
  body_code: string | null;
  metric_code: string | null;
  action: 'assigned' | 'reassigned' | 'cleared' | 'declined' | 'seen';
  from_user_id: string | null;
  to_user_id: string | null;
  actor_user_id: string | null;
  actor_is_body_owner: boolean | null;
  note: string | null;
  created_at: string;
}

/** One row of public.accreditation_metric_owners, as far as this file cares. */
export interface OwnerRow {
  id: string;
  owner_user_id: string | null;
  institution_id: string | null;
  body_code: string | null;
  /** NULL means this person owns the WHOLE body for that college. */
  metric_code: string | null;
}

/** Why a particular person is on the recipient list for a particular change. */
export type NotifyReason = 'new_owner' | 'previous_owner' | 'body_owner' | 'iqac_officer';

export interface PlannedNotification {
  userId: string;
  title: string;
  body: string;
  url: string;
  idempotencyKey: string;
  reason: NotifyReason;
  /** Carried into notification metadata so a message is traceable to its event. */
  eventId: string;
}

export interface NotifyContext {
  /** Every current ownership row, used to find the body owner above a metric. */
  ownerRows: OwnerRow[];
  /** institution_id → college name. A miss reads as "your college". */
  institutionNames: Record<string, string>;
  /** user_id → the name to print. A miss reads as "Somebody". */
  personNames: Record<string, string>;
  /** institution_id → the IQAC officer's user id for that college. */
  iqacOfficerByInstitution: Record<string, string>;
}

/** Where every one of these messages sends the reader. */
export const OWNERSHIP_URL = '/accreditation/manage/owners';

/**
 * Idempotency namespace. Keyed on the EVENT plus the RECIPIENT, which is the
 * whole double-send protection: re-running the cron over the same window
 * re-derives the same keys and `fanoutNotification` skips every one of them.
 * There is no last_sent_at to drift out of step with reality.
 */
export function idempotencyKeyFor(eventId: string, userId: string): string {
  return `accred_ownership_change:${eventId}:${userId}`;
}

/**
 * A 'seen' row records that somebody opened the change. It is a read receipt,
 * not a change of ownership, and telling four people about it would turn the
 * trail into noise. Everything else moves ownership and is announced.
 */
const ANNOUNCED_ACTIONS: ReadonlySet<OwnershipEvent['action']> = new Set([
  'assigned',
  'reassigned',
  'cleared',
  'declined',
]);

/**
 * When one person occupies two of the four roles they get ONE message, and it
 * is the one closest to them: what happened to me beats what happened to
 * someone I supervise. Lower number wins.
 */
const REASON_RANK: Record<NotifyReason, number> = {
  new_owner: 0,
  previous_owner: 1,
  body_owner: 2,
  iqac_officer: 3,
};

function personName(ctx: NotifyContext, userId: string | null | undefined): string {
  if (!userId) return 'Somebody';
  return ctx.personNames[userId] ?? 'Somebody';
}

function collegeName(ctx: NotifyContext, institutionId: string | null | undefined): string {
  if (!institutionId) return 'your college';
  return ctx.institutionNames[institutionId] ?? 'your college';
}

/**
 * How the thing that changed hands is named in a sentence.
 *
 * A body-level row (metric_code IS NULL) covers everything that body asks of
 * that college. Saying "NAAC" where we mean all of NAAC, and "NAAC 1.1.1"
 * where we mean one metric, is the difference between a reader who knows what
 * they hold and one who guesses.
 */
export function describeSubject(bodyCode: string | null, metricCode: string | null): string {
  const body = bodyCode ?? 'an awarding body';
  return metricCode ? `${body} ${metricCode}` : `${body} (the whole body)`;
}

/**
 * The people who own the WHOLE body that this metric sits under, at this
 * college. Empty for a body-level change: there is no body owner above a body,
 * and the escalation for those is the IQAC officer.
 */
export function bodyOwnersAbove(event: OwnershipEvent, ownerRows: OwnerRow[]): string[] {
  if (!event.metric_code) return [];
  if (!event.institution_id || !event.body_code) return [];
  const ids = ownerRows
    .filter(
      (r) =>
        r.metric_code === null &&
        r.institution_id === event.institution_id &&
        r.body_code === event.body_code &&
        Boolean(r.owner_user_id),
    )
    .map((r) => r.owner_user_id as string);
  return [...new Set(ids)];
}

/**
 * True when a body owner changed an assignment that was somebody else's.
 *
 * "Somebody else's" is read off the row being changed, not off the actor's
 * powers: if the actor was the previous owner, or is the person now receiving
 * it, they are rearranging their own work and no override happened.
 */
export function isBodyOwnerOverride(event: OwnershipEvent): boolean {
  if (!event.actor_is_body_owner) return false;
  if (!event.actor_user_id) return false;
  if (event.from_user_id && event.from_user_id === event.actor_user_id) return false;
  if (event.to_user_id && event.to_user_id === event.actor_user_id) return false;
  // An override needs somebody to have been overridden.
  return Boolean(event.from_user_id);
}

// ---------------------------------------------------------------------------
// Wording.
//
// Plain sentences. Say what changed, who did it, and what the reader should do
// about it. No exclamation marks, no praise, no reprimand — losing a metric is
// a normal administrative event, and a message that reads as a telling-off
// makes the next one unwelcome.
// ---------------------------------------------------------------------------

function newOwnerMessage(event: OwnershipEvent, ctx: NotifyContext): { title: string; body: string } {
  const subject = describeSubject(event.body_code, event.metric_code);
  const college = collegeName(ctx, event.institution_id);
  const actor = personName(ctx, event.actor_user_id);
  return {
    title: `You are now the owner of ${subject}`,
    body: [
      `${actor} has made you the owner of ${subject} at ${college}.`,
      '',
      'Being the owner means you are the person we come to for it, and you decide what still needs collecting. It does not mean you have to fill everything in yourself.',
      '',
      'Open the owners page to see what it covers.',
    ].join('\n'),
  };
}

function previousOwnerMessage(
  event: OwnershipEvent,
  ctx: NotifyContext,
): { title: string; body: string } {
  const subject = describeSubject(event.body_code, event.metric_code);
  const college = collegeName(ctx, event.institution_id);
  const actor = personName(ctx, event.actor_user_id);
  const movedTo = event.to_user_id ? personName(ctx, event.to_user_id) : null;
  const whatHappened = movedTo
    ? `${actor} has moved ${subject} at ${college} to ${movedTo}.`
    : `${actor} has removed you as the owner of ${subject} at ${college}. Nobody is recorded as the owner right now.`;
  return {
    title: `${subject} is no longer yours`,
    body: [
      whatHappened,
      '',
      'You no longer need to work on it. Anything you have already recorded stays where it is.',
      '',
      'If you think this was a mistake, tell the IQAC office. The change is recorded, not hidden.',
    ].join('\n'),
  };
}

function bodyOwnerMessage(event: OwnershipEvent, ctx: NotifyContext): { title: string; body: string } {
  const subject = describeSubject(event.body_code, event.metric_code);
  const college = collegeName(ctx, event.institution_id);
  const actor = personName(ctx, event.actor_user_id);
  const from = event.from_user_id ? personName(ctx, event.from_user_id) : 'nobody';
  const to = event.to_user_id ? personName(ctx, event.to_user_id) : 'nobody';
  return {
    title: `Ownership changed under ${event.body_code ?? 'a body'} you own`,
    body: [
      `${actor} changed the owner of ${subject} at ${college}: ${from} to ${to}.`,
      '',
      `You own ${event.body_code ?? 'this body'} at ${college}, so this sits under you.`,
      '',
      'Open the owners page if you want to change it back or hand it to someone else.',
    ].join('\n'),
  };
}

function iqacMessage(event: OwnershipEvent, ctx: NotifyContext): { title: string; body: string } {
  const subject = describeSubject(event.body_code, event.metric_code);
  const college = collegeName(ctx, event.institution_id);
  const actor = personName(ctx, event.actor_user_id);
  const from = event.from_user_id ? personName(ctx, event.from_user_id) : 'nobody';
  const to = event.to_user_id ? personName(ctx, event.to_user_id) : 'nobody';
  const lines = [`${actor} changed the owner of ${subject} at ${college}: ${from} to ${to}.`];
  if (isBodyOwnerOverride(event)) {
    lines.push(
      '',
      `${actor} owns ${event.body_code ?? 'this body'} and changed an assignment that belonged to someone else. You are told about these every time, so the change is never only between the two of them.`,
    );
  }
  lines.push('', 'Open the owners page to see the current register.');
  return {
    title: `Ownership changed: ${subject} at ${college}`,
    body: lines.join('\n'),
  };
}

const MESSAGE_BUILDERS: Record<
  NotifyReason,
  (event: OwnershipEvent, ctx: NotifyContext) => { title: string; body: string }
> = {
  new_owner: newOwnerMessage,
  previous_owner: previousOwnerMessage,
  body_owner: bodyOwnerMessage,
  iqac_officer: iqacMessage,
};

/**
 * THE WHOLE RULE, in one pure function.
 *
 * Takes the trail events and the current owner rows; returns the exact set of
 * notifications that should go out. De-duplication and the skip-the-actor rule
 * live here and nowhere else, so there is one place to read them and one place
 * to test them.
 */
export function planOwnershipNotifications(
  events: OwnershipEvent[],
  ctx: NotifyContext,
): PlannedNotification[] {
  const planned: PlannedNotification[] = [];

  for (const event of events) {
    if (!ANNOUNCED_ACTIONS.has(event.action)) continue;

    // Candidate recipients in rank order. A person may appear more than once;
    // the de-dup below keeps the highest-ranked entry only.
    const candidates: Array<{ userId: string; reason: NotifyReason }> = [];

    if (event.to_user_id) candidates.push({ userId: event.to_user_id, reason: 'new_owner' });
    if (event.from_user_id) candidates.push({ userId: event.from_user_id, reason: 'previous_owner' });
    for (const owner of bodyOwnersAbove(event, ctx.ownerRows)) {
      candidates.push({ userId: owner, reason: 'body_owner' });
    }
    const iqac = event.institution_id
      ? ctx.iqacOfficerByInstitution[event.institution_id]
      : undefined;
    if (iqac) candidates.push({ userId: iqac, reason: 'iqac_officer' });

    const best = new Map<string, NotifyReason>();
    for (const c of candidates) {
      // Nobody is told what they themselves just did. This is also the only
      // thing that can stop the IQAC officer hearing about a body-owner
      // override, and only in the one case where the IQAC officer IS the body
      // owner who made it.
      if (event.actor_user_id && c.userId === event.actor_user_id) continue;
      const existing = best.get(c.userId);
      if (existing === undefined || REASON_RANK[c.reason] < REASON_RANK[existing]) {
        best.set(c.userId, c.reason);
      }
    }

    for (const [userId, reason] of best) {
      const { title, body } = MESSAGE_BUILDERS[reason](event, ctx);
      planned.push({
        userId,
        title,
        body,
        url: OWNERSHIP_URL,
        idempotencyKey: idempotencyKeyFor(event.id, userId),
        reason,
        eventId: event.id,
      });
    }
  }

  return planned;
}
