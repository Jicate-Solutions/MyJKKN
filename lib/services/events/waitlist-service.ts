// lib/services/events/waitlist-service.ts
//
// SEAT HOLDING for a full event — the first of the three pieces PR #3714
// tried to land at once. Signed-in registrants only; no money; no guest
// identity (those are PR 2 and PR 3, see the migration header).
//
// ---------------------------------------------------------------------------
// THE LOOP, IN ORDER
// ---------------------------------------------------------------------------
//   1. JOIN.    The event is full, cap_behavior = 'waitlist', the form is free
//               and the caller is signed in → joinWaitlist() writes a 'waiting'
//               row bound to their account and they are told their position.
//   2. SETTLE.  A place frees → the database (fn_event_waitlist_settle, run by
//               the trigger on events_registrations and by settleQueue() on the
//               next request that touches the event) lapses any stale offer and
//               moves the head of the queue to 'offered'. The place is HELD:
//               fn_event_waitlist_taken counts a live offer as taken.
//   3. ANNOUNCE. deliverPendingOffers() tells that person in-app, through the
//               canonical fanoutNotification().
//   4. CLAIM.   They come back to the public registration door and submit.
//               findOutstandingOffer() recognises their account, the route
//               writes the ordinary registration FIRST, and claimOffer() then
//               flips the row 'offered' → 'registered' in one statement that
//               presents the row's claim code and names the registration. The
//               database trigger is what makes that single-use: it refuses any
//               exit from 'offered' that does not present the matching code,
//               and it consumes the code in the statement that does.
//   5. LAPSE.   24 hours with no claim → the next settle marks the row
//               'expired' and offers the place to whoever is next.
//
// REGISTRATION FIRST, CLAIM SECOND — the order matters. While the registration
// is being written the offer still counts as taken, so a passer-by reading
// capacity in that moment sees one place MORE taken than it will settle at and
// is queued rather than let in. The other order (claim, then insert) reads one
// place FEWER and lets a stranger register into the held place. And because
// events_registrations already carries a partial UNIQUE index on
// (event_id, form_id, profile_id) for self-registrations, a double submit from
// the offer holder collides at the database on the second insert rather than
// producing two registrations.
//
// ---------------------------------------------------------------------------
// A MISSING TABLE IS NOT A FAILURE
// ---------------------------------------------------------------------------
// Migrations here are applied at merge time, after the code deploys. Every
// read and write below treats "relation does not exist" (42P01 / 42883 /
// PGRST202 / PGRST205) as "no waiting list yet" so that window behaves exactly
// like today rather than breaking public registration.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

export const MODULE = 'events/waitlist';

/** events.cap_behavior values, as defined by migration 20260416000001. */
export type EventCapBehavior = 'strict_cap' | 'waitlist' | 'allow_overflow';

export type WaitlistStatus = 'waiting' | 'offered' | 'registered' | 'expired';

/** One row of an event's queue, as the organiser's card renders it. */
export interface WaitlistEntry {
  id: string;
  /** Rank among the people still waiting, 1-based. null once not waiting. */
  position: number | null;
  queue_seq: number;
  status: WaitlistStatus;
  participant_name: string;
  participant_email: string | null;
  participant_phone: string | null;
  joined_at: string;
  offered_at: string | null;
  offer_expires_at: string | null;
  notified_at: string | null;
}

export interface WaitlistPanel {
  /**
   * The event's own switch. `null` means NOT READ — the route's pre-migration
   * branch has not been able to check the viewer's authority and must not
   * report a value it never queried.
   */
  cap_behavior: EventCapBehavior | null;
  max_registrations: number | null;
  /** Live registrations plus offers still within their deadline. */
  taken: number;
  entries: WaitlistEntry[];
  waiting_count: number;
  offered_count: number;
  /** True when the migration has not been applied yet. */
  not_yet_available: boolean;
}

const MISSING_OBJECT_CODES = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);

export function isMissingObject(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code && MISSING_OBJECT_CODES.has(code)) return true;
  // 42703 / PGRST204 are a missing COLUMN — schema drift, a fault to surface,
  // never "no waiting list yet".
  if (code === '42703' || code === 'PGRST204') return false;
  const message = (error as { message?: string } | null)?.message ?? '';
  return /relation .* does not exist|could not find the (table|function) .* in the schema cache/i.test(
    message
  );
}

/**
 * A read this feature could not complete. `message` is a fixed public
 * sentence; the database's own words stay in `detail` for the server log —
 * the public door returns `err.message` to an unauthenticated caller.
 */
export class WaitlistReadError extends Error {
  readonly detail: string;
  constructor(what: string, eventId: string, cause: unknown) {
    super('The waiting list could not be read. Please try again in a moment.');
    this.name = 'WaitlistReadError';
    this.detail = `Could not ${what} for event ${eventId}: ${
      (cause as { message?: string } | null)?.message ?? 'unknown error'
    }`;
  }
}

/**
 * How many places are taken: non-cancelled registrations plus offers still
 * within their deadline. Mirrors fn_event_waitlist_taken(uuid). Computed here
 * rather than through that RPC so the door works before the migration is
 * applied: without the table the second term is zero, the number the route
 * counted before this feature existed.
 */
export async function countTaken(
  service: SupabaseClient,
  eventId: string,
  /**
   * true (default) for the registration door, which decides whether to accept
   * somebody — dropping the held-place term there lets a passer-by register
   * into the gap the queue exists to fill. false for callers that only choose
   * what copy to show (the public page).
   */
  strictOffers = true
): Promise<number> {
  const { count, error: regError } = await (service as any)
    .from('events_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .neq('status', 'cancelled');

  // Throws rather than guessing: `count ?? 0` on a failed query reads a full
  // event as empty and over-sells the room.
  if (regError) {
    throw new WaitlistReadError('count registrations', eventId, regError);
  }

  let offered = 0;
  const { count: offeredCount, error } = await (service as any)
    .from('event_registration_waitlist')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'offered')
    .gt('offer_expires_at', new Date().toISOString());
  if (error) {
    if (strictOffers && !isMissingObject(error)) {
      throw new WaitlistReadError('count outstanding offers', eventId, error);
    }
  } else {
    offered = offeredCount ?? 0;
  }

  return (count ?? 0) + offered;
}

/**
 * Is there a waiting list to join AT ALL yet? Asked by the public page before
 * it offers a full event's visitor a queue, so the deploy-before-apply window
 * shows the same "Registration full" it always has rather than a form that is
 * taken and then refused. Never throws.
 */
export async function isWaitlistAvailable(service: SupabaseClient): Promise<boolean> {
  const { error } = await (service as any).from('event_registration_waitlist').select('id').limit(1);
  if (!error) return true;
  return !isMissingObject(error);
}

/**
 * Lapse stale offers and offer every free place to the queue, in order.
 * Runs fn_event_waitlist_settle under the service role. Never throws: a
 * missing function is "no waiting list yet", anything else is logged by the
 * caller through the returned error.
 */
export async function settleQueue(
  service: SupabaseClient,
  eventId: string
): Promise<{ expired: number; offered: number; error: unknown | null }> {
  const { data, error } = await (service as any).rpc('fn_event_waitlist_settle', {
    p_event_id: eventId,
  });
  if (error) {
    return { expired: 0, offered: 0, error: isMissingObject(error) ? null : error };
  }
  const first = (Array.isArray(data) ? data[0] : data) as
    | { expired_count?: number; offered_count?: number }
    | null;
  return {
    expired: first?.expired_count ?? 0,
    offered: first?.offered_count ?? 0,
    error: null,
  };
}

export interface JoinWaitlistInput {
  eventId: string;
  formId: string | null;
  participantName: string;
  participantEmail: string | null;
  participantPhone: string | null;
  /** REQUIRED. This queue is for people with an account. */
  profileId: string;
  learnerId: string | null;
  institutionId: string | null;
  customFields: Record<string, unknown> | null;
}

/**
 * Four outcomes, never one nullable id — a foreign-key violation, an RLS
 * refusal and the deliberate pre-migration fallback must not all wear the
 * same "This event is full." clothes.
 */
export type JoinWaitlistResult =
  | { outcome: 'queued'; id: string; position: number | null; already: boolean }
  /** This person already holds a live registration for this form. */
  | { outcome: 'already_registered'; registrationId: string }
  /** The table is not there yet. The caller falls back to today's refusal. */
  | { outcome: 'not_available' }
  /** A genuine write failure. The caller must NOT report this as "full". */
  | { outcome: 'error'; message: string };

const OPEN_WAITLIST_STATUSES = ['waiting', 'offered'] as const;

function normEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function normPhone(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Rank among rows still waiting, counted by queue_seq. 1-based. */
async function positionOf(
  service: SupabaseClient,
  eventId: string,
  queueSeq: number
): Promise<number | null> {
  const { count, error } = await (service as any)
    .from('event_registration_waitlist')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'waiting')
    .lt('queue_seq', queueSeq);
  if (error) return null;
  return (count ?? 0) + 1;
}

interface OpenRow {
  id: string;
  queue_seq: number;
  status: string;
  registration_id: string | null;
  form_id: string | null;
  claim_code: string | null;
  offer_expires_at: string | null;
}

/**
 * The open row this account holds on this event and form, if any.
 *
 * IDENTITY ONLY. There is no name/phone/email matching anywhere in this
 * service: that is the trust model PR #3714 could not make safe, and it is
 * PR 3's problem. A row that stored no form_id matches any form.
 */
async function findOpenRow(
  service: SupabaseClient,
  eventId: string,
  profileId: string,
  statuses: readonly string[],
  formId: string | null
): Promise<{ row: OpenRow | null; missingTable: boolean }> {
  const { data, error } = await (service as any)
    .from('event_registration_waitlist')
    .select('id, queue_seq, status, registration_id, form_id, claim_code, offer_expires_at')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .in('status', statuses)
    .order('queue_seq', { ascending: true })
    .limit(20);

  // A real read failure is not "no offer": returning null here would refuse
  // the offer holder at the capacity check and re-queue them at the back.
  if (error) {
    if (isMissingObject(error)) return { row: null, missingTable: true };
    throw new WaitlistReadError('read the waiting list', eventId, error);
  }
  const rows = ((data ?? []) as OpenRow[]).filter(
    (r) => !formId || !r.form_id || r.form_id === formId
  );
  return { row: rows[0] ?? null, missingTable: false };
}

/**
 * This account's live registration for this form, if there is one. A failed
 * query throws — answering "nobody is registered" on a read failure is how
 * somebody ends up holding two seats.
 */
export async function findLiveRegistration(
  service: SupabaseClient,
  eventId: string,
  formId: string | null,
  profileId: string
): Promise<{ id: string } | null> {
  let query = (service as any)
    .from('events_registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .neq('status', 'cancelled')
    .limit(1);
  if (formId) query = query.eq('form_id', formId);
  const { data, error } = await query;
  if (error) throw new WaitlistReadError('check for an existing registration', eventId, error);
  const hit = (data ?? [])[0] as { id: string } | undefined;
  return hit ? { id: hit.id } : null;
}

/**
 * Put a signed-in person on the queue and work out the position to tell them.
 * An existing open row is returned as-is (`already: true`); the partial UNIQUE
 * index on (event_id, profile_id, form) is the backstop for two submissions
 * racing past that check, and its 23505 is re-read rather than surfaced.
 */
export async function joinWaitlist(
  service: SupabaseClient,
  input: JoinWaitlistInput
): Promise<JoinWaitlistResult> {
  if (!input.profileId) {
    return { outcome: 'error', message: 'Only a signed-in person can join the waiting list.' };
  }

  const live = await findLiveRegistration(service, input.eventId, input.formId, input.profileId);
  if (live) return { outcome: 'already_registered', registrationId: live.id };

  const existing = await findOpenRow(
    service,
    input.eventId,
    input.profileId,
    OPEN_WAITLIST_STATUSES,
    input.formId
  );
  if (existing.row) {
    return {
      outcome: 'queued',
      id: existing.row.id,
      position:
        existing.row.status === 'waiting'
          ? await positionOf(service, input.eventId, existing.row.queue_seq)
          : null,
      already: true,
    };
  }
  if (existing.missingTable) return { outcome: 'not_available' };

  const { data, error } = await (service as any)
    .from('event_registration_waitlist')
    .insert({
      event_id: input.eventId,
      form_id: input.formId,
      participant_name: input.participantName,
      participant_email: normEmail(input.participantEmail),
      participant_phone: normPhone(input.participantPhone),
      profile_id: input.profileId,
      learner_id: input.learnerId,
      institution_id: input.institutionId,
      custom_fields: input.customFields,
      status: 'waiting',
    })
    .select('id, queue_seq')
    .single();

  if (error) {
    if (isMissingObject(error)) return { outcome: 'not_available' };
    if ((error as { code?: string }).code === '23505') {
      const again = await findOpenRow(
        service,
        input.eventId,
        input.profileId,
        OPEN_WAITLIST_STATUSES,
        input.formId
      );
      if (again.row) {
        return {
          outcome: 'queued',
          id: again.row.id,
          position:
            again.row.status === 'waiting'
              ? await positionOf(service, input.eventId, again.row.queue_seq)
              : null,
          already: true,
        };
      }
    }
    return {
      outcome: 'error',
      message: (error as { message?: string }).message || 'Could not join the waiting list.',
    };
  }

  if (!data) return { outcome: 'error', message: 'Could not join the waiting list.' };

  return {
    outcome: 'queued',
    id: data.id as string,
    position: await positionOf(service, input.eventId, data.queue_seq as number),
    already: false,
  };
}

// ---------------------------------------------------------------------------
// TAKING THE OFFER UP
// ---------------------------------------------------------------------------

export interface OutstandingOffer {
  id: string;
  queue_seq: number;
  /**
   * The row's single-use claim token, read off the row this account is
   * entitled to and presented back to the database by claimOffer(). Never
   * shown to anybody in this PR.
   */
  claimCode: string;
  offer_expires_at: string;
}

/**
 * The LIVE offer this account holds on this event and form, if there is one.
 * Called by the public door BEFORE it checks capacity, because a live offer
 * already counts as a taken place — without this the door refuses the one
 * person the place is being held for.
 */
export async function findOutstandingOffer(
  service: SupabaseClient,
  eventId: string,
  profileId: string,
  formId: string | null
): Promise<OutstandingOffer | null> {
  const hit = await findOpenRow(service, eventId, profileId, ['offered'], formId);
  const row = hit.row;
  if (!row || !row.claim_code || !row.offer_expires_at) return null;
  // A lapsed hold holds nothing, even before the settle pass has marked it.
  if (Date.parse(row.offer_expires_at) <= Date.now()) return null;
  return {
    id: row.id,
    queue_seq: row.queue_seq,
    claimCode: row.claim_code,
    offer_expires_at: row.offer_expires_at,
  };
}

/**
 * 'claimed' — the place is now this registration's.
 * 'lost'    — the row is no longer a live offer (a double submit won, or the
 *             hold lapsed in the same instant). A genuine zero-row CAS loss.
 * 'error'   — the write itself failed and nothing is known.
 */
export type ClaimOutcome = 'claimed' | 'lost' | 'error';

/**
 * Take an offered place up: 'offered' → 'registered' as a compare-and-swap
 * that PRESENTS the row's claim code and NAMES the registration in one
 * statement. The WHERE clause is the fast path; the trigger
 * fn_event_registration_waitlist_guard is the guarantee — it refuses this
 * transition unless claim_code_presented equals the stored code and the
 * deadline has not passed, and it consumes the code, so the same code cannot
 * take the place up twice whatever any caller's WHERE clause says.
 */
export async function claimOffer(
  service: SupabaseClient,
  waitlistId: string,
  claimCode: string,
  registrationId: string
): Promise<ClaimOutcome> {
  const { data, error } = await (service as any)
    .from('event_registration_waitlist')
    .update({
      status: 'registered',
      registration_id: registrationId,
      claim_code_presented: claimCode,
    })
    .eq('id', waitlistId)
    .eq('status', 'offered')
    .gt('offer_expires_at', new Date().toISOString())
    .select('id');
  if (error) return 'error';
  return Array.isArray(data) && data.length > 0 ? 'claimed' : 'lost';
}

/**
 * Close the WAITING row this account holds on this form after a registration
 * written through the ordinary door — so a later freed place is not offered to
 * somebody who is already going.
 *
 * WAITING ROWS ONLY, BY ACCOUNT ONLY. This never touches an 'offered' row: an
 * offer leaves through claimOffer() with its code or through the settle pass
 * when it lapses, and the database refuses every other exit. That is the
 * defect #3714 stopped on — its clean-up matched rows by name and phone and
 * nulled the code — and it is not a path here at all.
 *
 * Best effort. The registration is real either way.
 */
export async function closeWaitingRowsFor(
  service: SupabaseClient,
  eventId: string,
  profileId: string,
  formId: string | null,
  registrationId: string
): Promise<void> {
  try {
    const hit = await findOpenRow(service, eventId, profileId, ['waiting'], formId);
    if (!hit.row) return;
    const { error } = await (service as any)
      .from('event_registration_waitlist')
      .update({ status: 'registered', registration_id: registrationId })
      .eq('id', hit.row.id)
      .eq('status', 'waiting');
    if (error && !isMissingObject(error)) {
      console.error(
        `[${MODULE}] could not close waiting-list row ${hit.row.id} after registration ${registrationId}:`,
        (error as { message?: string }).message ?? error
      );
    }
  } catch {
    /* the registration stands; a stale queue row is the organiser's to see */
  }
}

/** The sentence a queued person is shown. Plain, and never "you are refused". */
export function queuedMessage(position: number | null, already = false): string {
  if (already) {
    if (position === 1) {
      return 'You are already on the waiting list for this event, and you are first in line — if a place frees up it is offered to you. Submitting again does not move you up.';
    }
    if (position && position > 1) {
      return `You are already on the waiting list for this event, at number ${position}. Submitting again does not move you up.`;
    }
    return 'You are already on the waiting list for this event. Submitting again does not move you up.';
  }
  if (!position || position < 1) {
    return 'This event is full, so you have been added to the waiting list. If a place frees up you will be offered it.';
  }
  if (position === 1) {
    return 'This event is full. You are first on the waiting list — if a place frees up it is offered to you.';
  }
  return `This event is full, so you are number ${position} on the waiting list. If a place frees up, it is offered to whoever is at the front of the queue.`;
}

/**
 * Announce every live offer on this event that has not been announced yet.
 * Idempotent: a row leaves the `notified_at IS NULL` slice as soon as it is
 * stamped, and the fanout carries an idempotency key from the row id. Every
 * row here has an account (profile_id is NOT NULL), so there is no
 * "unreachable" case. Never throws.
 */
export async function deliverPendingOffers(
  service: SupabaseClient,
  eventId: string,
  /** Cap per pass — awaited on the public door's critical path. */
  maxRows = 50
): Promise<{ notified: number }> {
  const outcome = { notified: 0 };
  try {
    const { data: pending, error } = await (service as any)
      .from('event_registration_waitlist')
      .select('id, profile_id, offer_expires_at')
      .eq('event_id', eventId)
      .eq('status', 'offered')
      .is('notified_at', null)
      .gt('offer_expires_at', new Date().toISOString())
      .order('queue_seq', { ascending: true })
      .limit(maxRows);

    if (error || !pending?.length) return outcome;

    const { data: event } = await (service as any)
      .from('events')
      .select('name, created_by')
      .eq('id', eventId)
      .maybeSingle();
    const eventName = (event as { name?: string } | null)?.name ?? 'the event';
    // The offer comes from the event, so its organiser is the honest author —
    // not the waiting person, whom notify.ts would otherwise default to.
    const authorId = (event as { created_by?: string | null } | null)?.created_by ?? undefined;

    for (const row of pending as Array<{ id: string; profile_id: string; offer_expires_at: string }>) {
      const until = new Date(row.offer_expires_at).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      });
      const result = await fanoutNotification(service, {
        title: 'A place has opened up',
        body: `A place has opened up for ${eventName} and it is being held for you until ${until} — you were next on the waiting list. Open the registration page and send the form to take it up. If you do not, the place goes to the next person.`,
        userIds: [row.profile_id],
        createdBy: authorId,
        url: `/p/event/${eventId}/register`,
        source: 'events_waitlist_offer',
        metadata: { event_id: eventId, waitlist_id: row.id },
        idempotencyKey: `events_waitlist_offer:${row.id}`,
        // Legacy column the events read path still filters on, exactly as
        // app/api/events/notify/route.ts writes it.
        extraColumns: { type: 'events' },
      });

      if (result.notified > 0 || result.skipped === 'idempotent') {
        await (service as any)
          .from('event_registration_waitlist')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', row.id)
          .is('notified_at', null);
        outcome.notified += 1;
      }
    }
  } catch {
    /* an announcement failure must never take down the page that triggered it */
  }
  return outcome;
}

/** Sort rank by status: offers first, then the queue, then the finished. */
function statusRank(status: string): number {
  switch (status) {
    case 'offered':
      return 0;
    case 'waiting':
      return 1;
    case 'registered':
      return 2;
    case 'expired':
      return 3;
    default:
      return 4;
  }
}

/**
 * Turn stored rows into the queue as it is shown. Pure.
 *   1. POSITION is the rank among rows still 'waiting', in queue_seq order —
 *      not queue_seq itself, which is never renumbered.
 *   2. OFFERED ROWS COME FIRST: a held place with a running clock is the thing
 *      the organiser most needs to see.
 */
export function orderQueue(
  rows: Array<{
    id: string;
    queue_seq: number;
    status: string;
    participant_name: string;
    participant_email?: string | null;
    participant_phone?: string | null;
    joined_at: string;
    offered_at?: string | null;
    offer_expires_at?: string | null;
    notified_at?: string | null;
  }>
): WaitlistEntry[] {
  const bySeq = [...rows].sort((a, b) => a.queue_seq - b.queue_seq);

  let rank = 0;
  const entries: WaitlistEntry[] = bySeq.map((r) => ({
    id: r.id,
    position: r.status === 'waiting' ? ++rank : null,
    queue_seq: r.queue_seq,
    status: r.status as WaitlistStatus,
    participant_name: r.participant_name,
    participant_email: r.participant_email ?? null,
    participant_phone: r.participant_phone ?? null,
    joined_at: r.joined_at,
    offered_at: r.offered_at ?? null,
    offer_expires_at: r.offer_expires_at ?? null,
    notified_at: r.notified_at ?? null,
  }));

  entries.sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.queue_seq - b.queue_seq);
  return entries;
}

/** The organiser's view: the queue in order, plus the numbers that explain it. */
export async function getWaitlistPanel(
  service: SupabaseClient,
  eventId: string
): Promise<WaitlistPanel> {
  const { data: event, error: eventError } = await (service as any)
    .from('events')
    .select('cap_behavior, max_registrations')
    .eq('id', eventId)
    .maybeSingle();
  if (eventError) throw new WaitlistReadError('read the event', eventId, eventError);
  const capBehavior = ((event as any)?.cap_behavior ?? null) as EventCapBehavior | null;
  const maxRegistrations = ((event as any)?.max_registrations ?? null) as number | null;

  const COLUMNS =
    'id, queue_seq, status, participant_name, participant_email, participant_phone, joined_at, offered_at, offer_expires_at, notified_at';

  // Offers are read in full (they are few by construction) and the cap applies
  // only to the people still waiting, so a high-seq offer is never dropped.
  const [offeredRead, waitingRead] = await Promise.all([
    (service as any)
      .from('event_registration_waitlist')
      .select(COLUMNS)
      .eq('event_id', eventId)
      .eq('status', 'offered')
      .order('queue_seq', { ascending: true }),
    (service as any)
      .from('event_registration_waitlist')
      .select(COLUMNS)
      .eq('event_id', eventId)
      .eq('status', 'waiting')
      .order('queue_seq', { ascending: true })
      .limit(500),
  ]);

  const error = offeredRead.error ?? waitingRead.error;
  if (error) {
    if (!isMissingObject(error)) throw new WaitlistReadError('read the waiting list', eventId, error);
    return {
      cap_behavior: capBehavior,
      max_registrations: maxRegistrations,
      taken: 0,
      entries: [],
      waiting_count: 0,
      offered_count: 0,
      not_yet_available: true,
    };
  }

  const entries = orderQueue([...(offeredRead.data ?? []), ...(waitingRead.data ?? [])] as any[]);
  const rendered = entries.filter((e) => e.status === 'waiting').length;

  // Counted, not inferred from a capped page.
  const { count: waitingCount, error: waitingCountError } = await (service as any)
    .from('event_registration_waitlist')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'waiting');

  return {
    cap_behavior: capBehavior,
    max_registrations: maxRegistrations,
    taken: await countTaken(service, eventId),
    entries,
    waiting_count: waitingCountError ? rendered : waitingCount ?? rendered,
    offered_count: entries.filter((e) => e.status === 'offered').length,
    not_yet_available: false,
  };
}
