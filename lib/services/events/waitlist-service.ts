// lib/services/events/waitlist-service.ts
//
// The sign-up waiting list for a full event: joining it, reading it in order,
// announcing an offer once a place frees, and — the part without which the
// whole feature is theatre — TAKING THE OFFER UP.
//
// ---------------------------------------------------------------------------
// THE WHOLE LOOP, IN ORDER
// ---------------------------------------------------------------------------
//   1. JOIN.    The event is full, cap_behavior = 'waitlist' → joinWaitlist()
//                writes a 'waiting' row and the person is told their position.
//   2. PROMOTE. A place frees → the database trigger
//                fn_event_registration_freed_offer_waitlist (migration
//                20261209164500) moves the head of the queue to 'offered' and
//                stops there. It is a trigger, not application code, so it
//                catches EVERY way a place can free — a status change to
//                'cancelled', an organiser removing someone, a raw delete —
//                without this feature touching the cancel flow.
//   3. ANNOUNCE. deliverPendingOffers() tells that person, through
//                fanoutNotification().
//   4. CLAIM.   They come back to the public registration door and submit.
//                findOutstandingOffer() recognises them, claimOffer() flips the
//                row 'offered' → 'registered' as a compare-and-swap, the
//                ordinary registration is written, and attachRegistration()
//                points registration_id at it.
//
// Step 4 is what closes the loop. WITHOUT IT the offer is terminal: the row
// keeps holding the place (fn_event_waitlist_taken counts 'offered' as taken),
// the door the notification points at refuses the very person it was opened
// for and re-queues them at the BACK, and the event loses a seat permanently
// with every cancellation. That was the state this file shipped in first; the
// claim path below is the fix, and nothing here may be changed in a way that
// leaves 'offered' with no exit again.
//
// Delivery goes through fanoutNotification() — the canonical helper in
// lib/services/_shared/notifications/notify.ts that app/api/events/notify
// and lib/services/events/organiser-message-service.ts both end in — with the
// same legacy `type: 'events'` envelope, so the offer lands in the same inbox
// as every other events notification and EventsNotificationService.getUnread()
// picks it up with no change. No second messaging mechanism is introduced.
//
// ---------------------------------------------------------------------------
// THE LATENCY, STATED
// ---------------------------------------------------------------------------
// The trigger fires inside the cancelling transaction; the notification is sent
// by deliverPendingOffers(), which runs on the next request that touches the
// event — the organiser opening the queue card, or anybody hitting the public
// registration door (where it now runs BEFORE the capacity check and is
// AWAITED, because behind that check it could never be reached in the one state
// where an offer exists, and a fire-and-forget fanout on a frozen lambda can
// half-write the inbox). The OFFER is therefore instant and the place is held
// from that instant; the announcement waits for that next request. Nothing is
// lost if it never comes: offered_at is stored, and the organiser's card shows
// the offer as outstanding.
//
// ---------------------------------------------------------------------------
// A MISSING TABLE IS NOT A FAILURE
// ---------------------------------------------------------------------------
// Migrations here are applied at merge time, after the code deploys. Every read
// and write below treats "relation does not exist" (PostgREST 42P01 / PGRST205)
// as "no waiting list yet" so that the window between deploy and apply behaves
// exactly like today rather than breaking public registration for all 55
// events.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

export const MODULE = 'events/waitlist';

/** events.cap_behavior values, as defined by migration 20260416000001. */
export type EventCapBehavior = 'strict_cap' | 'waitlist' | 'allow_overflow';

export type WaitlistStatus = 'waiting' | 'offered' | 'registered' | 'withdrawn';

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
  /** true when this person matches no MyJKKN account and heard nothing in-app. */
  unreachable: boolean;
  joined_at: string;
  offered_at: string | null;
  notified_at: string | null;
}

export interface WaitlistPanel {
  /**
   * The event's own switch. The queue only exists when this is 'waitlist'.
   *
   * `null` means NOT READ — the only caller that returns null is the route's
   * pre-migration branch, which has not been able to check the viewer's
   * authority and therefore must not report anything it did not query. A panel
   * that invented 'waitlist' here would be stating a value nobody looked up.
   */
  cap_behavior: EventCapBehavior | null;
  max_registrations: number | null;
  /** Live registrations plus outstanding offers — the places actually taken. */
  taken: number;
  entries: WaitlistEntry[];
  waiting_count: number;
  offered_count: number;
  /**
   * True when the migration has not been applied yet. The card says so rather
   * than rendering an empty queue that looks like "nobody is waiting".
   */
  not_yet_available: boolean;
}

/**
 * Postgres / PostgREST codes meaning "this relation or function is not in the
 * schema". Treated as "the migration has not been applied yet", never as an
 * error to surface to a registrant.
 */
const MISSING_OBJECT_CODES = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);

export function isMissingObject(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code && MISSING_OBJECT_CODES.has(code)) return true;
  // 42703 is "column ... does not exist" — SCHEMA DRIFT, not a missing table,
  // and the message regex below would otherwise swallow it as "no waiting list
  // yet". A column that went missing is a fault to surface, not to degrade past.
  if (code === '42703') return false;
  const message = (error as { message?: string } | null)?.message ?? '';
  return /does not exist|schema cache/i.test(message);
}

/** The 3 statuses that occupy a place. Kept beside the SQL that mirrors it. */
export const LIVE_REGISTRATION_FILTER = 'cancelled';

/**
 * A read this feature could not complete.
 *
 * It carries the database's own words in `detail` FOR THE SERVER LOG ONLY, and
 * a fixed, boring sentence as its `message`. The public registration door
 * returns `err.message` to an unauthenticated caller, so a raw PostgREST string
 * there publishes table names and grant detail — "permission denied for table
 * event_registration_waitlist" tells a stranger the table exists, what it is
 * called, and that they were refused by a grant rather than by a filter.
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
 * How many places are taken: non-cancelled registrations plus offers that are
 * still outstanding. An offer HOLDS its place — otherwise a passer-by could
 * register into the gap the queue exists to fill.
 *
 * Mirrors fn_event_waitlist_taken(uuid) in the migration. It is computed here
 * rather than through that RPC so the registration door still works before the
 * migration is applied: without the waitlist table the second term is zero and
 * this returns exactly the count the route used before this feature existed.
 */
export async function countTaken(
  service: SupabaseClient,
  eventId: string,
  /**
   * Whether a FAILED offers count is fatal.
   *
   * true (the default) for the registration door, which decides whether to
   * accept somebody: silently dropping the held-place term there lets a
   * passer-by register into the very gap the queue exists to fill.
   *
   * false for callers that only choose what COPY to show — the public page.
   * Throwing there closes registration for every capped event on any transient
   * read failure, which is the unreachable-queue bug this feature exists to
   * remove; and the door re-checks strictly on submit, so the page under-
   * counting costs at worst a form that is answered and then queued.
   */
  strictOffers = true
): Promise<number> {
  const { count, error: regError } = await (service as any)
    .from('events_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .neq('status', LIVE_REGISTRATION_FILTER);

  // THROWS RATHER THAN GUESSING. `count ?? 0` on a failed query reads a full
  // event as empty, and the caller then registers past max_registrations —
  // over-selling the room is a worse outcome than an error, and it is silent.
  if (regError) {
    throw new WaitlistReadError('count registrations', eventId, regError);
  }

  let offered = 0;
  const { count: offeredCount, error } = await (service as any)
    .from('event_registration_waitlist')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'offered');
  if (error) {
    // No table yet = no offers, which is exactly the number this route counted
    // before the feature existed. Any OTHER failure drops the held-place term,
    // and a passer-by then registers into the gap the queue exists to fill —
    // so the door treats it as fatal and a copy-picking caller does not.
    if (strictOffers && !isMissingObject(error)) {
      throw new WaitlistReadError('count outstanding offers', eventId, error);
    }
  } else {
    offered = offeredCount ?? 0;
  }

  return (count ?? 0) + offered;
}

/**
 * Is there a waiting list to join AT ALL yet?
 *
 * Asked by the public registration page before it offers a full event's visitor
 * a queue. Without it that page would, in the deploy-before-apply window, show a
 * form headed "This event is full — send this to join the waiting list", take
 * every answer, and THEN refuse with "This event is full." — worse than the
 * refusal it replaced, and not the "degrades to today's behaviour" this feature
 * promises. countTaken() cannot answer this: it swallows the missing table into
 * a zero, which is indistinguishable from a real zero.
 *
 * Never throws. Unknown failures answer "no": the honest fallback is the
 * refusal that has always been there.
 */
export async function isWaitlistAvailable(service: SupabaseClient): Promise<boolean> {
  // One row, no COUNT: `{ count: 'exact', head: true }` makes PostgREST run an
  // unfiltered count over the whole table, which is a table scan to answer a
  // yes/no question about the schema.
  const { error } = await (service as any)
    .from('event_registration_waitlist')
    .select('id')
    .limit(1);
  // ONLY a missing object means "no queue yet". Returning false for ANY error
  // turns a transient outage into a permanent "Registration full" with nothing
  // logged — which is the unreachable-queue bug this whole feature exists to
  // remove. If the table is there but unreadable here, the queue is still real:
  // the write path runs under the service role and the route reports a genuine
  // failure as a 500 rather than as a capacity decision.
  if (!error) return true;
  return !isMissingObject(error);
}

export interface JoinWaitlistInput {
  eventId: string;
  formId: string | null;
  participantName: string;
  participantEmail: string | null;
  participantPhone: string | null;
  profileId: string | null;
  learnerId: string | null;
  institutionId: string | null;
  customFields: Record<string, unknown> | null;
}

/**
 * Three OUTCOMES, never one nullable id.
 *
 * The first version of this returned `{ id: null }` for every failure alike, and
 * the route turned all of them into "This event is full." — so a foreign-key
 * violation, an RLS refusal and a real database outage were each reported to a
 * registrant as a capacity message, indistinguishable from the deliberate
 * pre-migration fallback. A write failure must not wear the fallback's clothes.
 */
export type JoinWaitlistResult =
  | { outcome: 'queued'; id: string; position: number | null; already: boolean }
  /**
   * This person already took a place up on this event — their queue row is
   * 'registered'. A state that only became reachable when the claim path was
   * added, and one worth answering properly: somebody who registers, then hits
   * back and resubmits, must not be told they are "number 4 on the waiting
   * list" for an event they are already going to.
   */
  | {
      outcome: 'already_registered';
      registrationId: string | null;
      /** Their existing registration is unpaid — do not tell them they are in. */
      paymentPending: boolean;
    }
  /** The table is not there yet. The caller falls back to today's refusal. */
  | { outcome: 'not_available' }
  /** A genuine write failure. The caller must NOT report this as "full". */
  | { outcome: 'error'; message: string };

/** The statuses that mean "this person is still in the queue for a place". */
const OPEN_WAITLIST_STATUSES = ['waiting', 'offered'] as const;

/**
 * ONE normaliser, used for BOTH the lookup and the write.
 *
 * The email is stored lower-cased and trimmed, so the partial UNIQUE index in
 * the migration can be a plain column and the pre-insert lookup compares
 * exactly the string the index compares. If these two ever diverge — an
 * expression index on one side, a raw value on the other — an insert is
 * rejected with 23505 that the service's own re-read cannot find, and the
 * registrant is told the queue is broken when it is working perfectly.
 */
function normEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function normPhone(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * A name reduced to what two submissions by the same person have in common:
 * case folded, outer and inner whitespace collapsed.
 *
 * Used ONLY to tell two people apart when they share a contact detail, never to
 * merge them — a name that does not match simply means "a different person",
 * which costs at worst a duplicate queue row.
 */
function normName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
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

/**
 * A lookup result, NOT a discriminated union.
 *
 * This repo compiles with `strict: false` and `strictNullChecks: false`, under
 * which narrowing a `{ found: true } | { found: false }` pair does not happen —
 * `existing.missingTable` after `if (existing.found) return` is still a TS2339.
 * A flat shape with an explicit null needs no narrowing at all.
 */
/** Everything a submission knows about who is submitting it. */
export interface WaitlistIdentity {
  profileId?: string | null;
  learnerId?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Required to match on a shared phone or email — see findOpenRow. */
  name?: string | null;
}

interface OpenRowLookup {
  row: {
    id: string;
    queue_seq: number;
    status: string;
    registration_id: string | null;
    profile_id: string | null;
    participant_name?: string | null;
    participant_email?: string | null;
    participant_phone?: string | null;
    form_id?: string | null;
  } | null;
  /** true only when the waiting-list table is not in the schema yet. */
  missingTable: boolean;
}

/**
 * The open row this person already holds on this event, if any.
 *
 * Identity first (a signed-in person is the same person however they typed
 * their phone number this time), then contact details — because MOST public
 * registrants are guests with no account, and a guest is exactly who this
 * feature exists for. Matching a guest on the phone or email THE OFFER WAS MADE
 * TO is the same trust model the public registration door already runs on: name
 * plus one contact detail is all it has ever taken to register for an event
 * here. It grants no more than that door already grants.
 */
async function findOpenRow(
  service: SupabaseClient,
  eventId: string,
  who: WaitlistIdentity,
  statuses: readonly string[] = OPEN_WAITLIST_STATUSES
): Promise<OpenRowLookup> {
  // IDENTITY matches on its own; a CONTACT DETAIL must also agree on the name.
  //
  // A phone number is not a person here. Siblings share a parent's number and a
  // family shares one email address — routine in this domain, not an edge case.
  // Matching on the contact alone would hand the second child the first child's
  // queue row, tell them they were "already number 4", and never queue them at
  // all. The name is what separates two people behind one number; it is only
  // ever used to SPLIT them, so a name that fails to match costs a duplicate
  // row, never somebody else's place.
  const attempts: Array<{ column: string; value: string; byName: boolean }> = [];
  if (who.profileId) attempts.push({ column: 'profile_id', value: who.profileId, byName: false });
  if (who.learnerId) attempts.push({ column: 'learner_id', value: who.learnerId, byName: false });
  const phone = normPhone(who.phone);
  if (phone) attempts.push({ column: 'participant_phone', value: phone, byName: true });
  const email = normEmail(who.email);
  if (email) attempts.push({ column: 'participant_email', value: email, byName: true });

  const wantedName = normName(who.name);

  for (const attempt of attempts) {
    const { data, error } = await (service as any)
      .from('event_registration_waitlist')
      .select(
        'id, queue_seq, status, registration_id, profile_id, participant_name, participant_email, participant_phone, form_id'
      )
      .eq('event_id', eventId)
      .in('status', statuses)
      .eq(attempt.column, attempt.value)
      .order('queue_seq', { ascending: true })
      .limit(20);

    if (error) return { row: null, missingTable: isMissingObject(error) };
    if (!data?.length) continue;

    const rows = data as Array<{ participant_name?: string | null }>;
    const hit = attempt.byName
      ? rows.find((r) => normName(r.participant_name) === wantedName && wantedName !== '')
      : rows[0];
    if (hit) return { row: hit as OpenRowLookup['row'], missingTable: false };
  }

  return { row: null, missingTable: false };
}

interface LiveRegistration {
  id: string;
  /** So an unpaid registration is not reported back as "you're all set". */
  payment_status: string | null;
}

/**
 * This person's live registration for this form, if they already have one.
 *
 * Same identity rules as findOpenRow — an account matches on its own, a contact
 * detail must also agree on the name, because a shared family phone is not a
 * person. A cancelled registration is not a registration.
 */
async function findLiveRegistration(
  service: SupabaseClient,
  eventId: string,
  formId: string | null,
  who: WaitlistIdentity
): Promise<LiveRegistration | null> {
  // events_registrations stores the email AS TYPED — only the waiting list
  // lower-cases it — so a single `.eq` on the normalised form would miss
  // "Abc@x.com". Both spellings are offered instead of reaching for `ilike`,
  // whose `_` and `%` are wildcards and an email may legally contain `_`.
  const attempts: Array<{ column: string; values: string[]; byName: boolean }> = [];
  if (who.profileId) attempts.push({ column: 'profile_id', values: [who.profileId], byName: false });
  if (who.learnerId) attempts.push({ column: 'learner_id', values: [who.learnerId], byName: false });
  const phone = normPhone(who.phone);
  if (phone) attempts.push({ column: 'participant_phone', values: [phone], byName: true });
  const typedEmail = who.email?.trim() || null;
  const email = normEmail(who.email);
  if (email) {
    attempts.push({
      column: 'participant_email',
      values: Array.from(new Set([email, typedEmail].filter(Boolean) as string[])),
      byName: true,
    });
  }

  const wantedName = normName(who.name);

  for (const attempt of attempts) {
    let query = (service as any)
      .from('events_registrations')
      .select('id, participant_name, payment_status')
      .eq('event_id', eventId)
      .neq('status', LIVE_REGISTRATION_FILTER)
      .in(attempt.column, attempt.values)
      .limit(20);
    if (formId) query = query.eq('form_id', formId);

    const { data, error } = await query;
    // A FAILED QUERY IS NOT "NOBODY IS REGISTERED". Swallowing it into `continue`
    // means a transient outage queues somebody who is already registered, who is
    // then promoted and ends up holding two seats — exactly what this function
    // exists to prevent.
    if (error) throw new WaitlistReadError('check for an existing registration', eventId, error);
    if (!data?.length) continue;

    const rows = data as Array<LiveRegistration & { participant_name?: string | null }>;
    const hit = attempt.byName
      ? rows.find((r) => normName(r.participant_name) === wantedName && wantedName !== '')
      : rows[0];
    if (hit) return { id: hit.id, payment_status: hit.payment_status ?? null };
  }

  return null;
}

/**
 * Put somebody on the queue and work out the position to tell them.
 *
 * ONE PERSON, ONE PLACE. Somebody who refreshes and resubmits used to get a
 * second row with a fresh queue_seq — enough repeats and one person occupies
 * the whole head of the queue. An existing open row is now returned as-is
 * (`already: true`).
 *
 * THE BACKSTOP COVERS ACCOUNTS ONLY, and that is worth saying plainly. The
 * migration carries ONE partial unique index, on (event_id, profile_id): a
 * signed-in person cannot hold two open rows even if two submissions race, and
 * the 23505 that proves it is re-read rather than surfaced. A GUEST has no such
 * index — deliberately, because a contact-detail index would collide siblings
 * sharing a parent's phone number — so for guests the check above is a read
 * followed by an unserialised insert, and two genuinely simultaneous guest
 * submissions can both land. The cost is one duplicate queue row, which is the
 * behaviour this door already had; the alternative cost was handing one child
 * their sibling's place.
 *
 * Throws WaitlistReadError if it cannot tell whether this person is already
 * registered — answering "no" to that question on a failed read is how somebody
 * ends up holding two seats.
 */
export async function joinWaitlist(
  service: SupabaseClient,
  input: JoinWaitlistInput
): Promise<JoinWaitlistResult> {
  const who: WaitlistIdentity = {
    profileId: input.profileId,
    learnerId: input.learnerId,
    email: input.participantEmail,
    phone: input.participantPhone,
    name: input.participantName,
  };

  // Already registered for THIS FORM? Say so, rather than queueing them for
  // something they are already going to.
  //
  // Read from events_registrations, not from a 'registered' waitlist row, and
  // scoped to the form. Both matter. The waitlist knows only about people who
  // came through the queue, so somebody who registered normally BEFORE the
  // event filled up and then resubmitted would have been queued, later
  // promoted, and left holding a second seat they already occupied — with no
  // way to give it back. And an event holds many forms, one per monthly run:
  // scoping to the event would let one taken place block that person from ever
  // queueing for a later run, which is the opposite of what this table's own
  // comment promises.
  const live = await findLiveRegistration(service, input.eventId, input.formId, who);
  if (live) {
    return {
      outcome: 'already_registered',
      registrationId: live.id,
      paymentPending: live.payment_status === 'pending',
    };
  }

  const existing = await findOpenRow(service, input.eventId, who);
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

    // Two submissions raced. One of them won and that row IS this person's
    // place — re-read it rather than telling them something went wrong.
    if ((error as { code?: string }).code === '23505') {
      const again = await findOpenRow(service, input.eventId, who);
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

  // Position = rank among the rows still waiting. Counting rows ahead of this
  // one by queue_seq is stable under concurrent joins, and it stays correct
  // when somebody in front withdraws without any renumbering.
  return {
    outcome: 'queued',
    id: data.id as string,
    position: await positionOf(service, input.eventId, data.queue_seq as number),
    already: false,
  };
}

// ---------------------------------------------------------------------------
// TAKING THE OFFER UP — the step without which this feature is an announcement
// it cannot honour.
// ---------------------------------------------------------------------------

export interface OutstandingOffer {
  id: string;
  queue_seq: number;
}

/**
 * The offer this caller is holding on this event, if there is one.
 *
 * Called by the public registration door BEFORE it checks capacity, because an
 * outstanding offer already counts as a taken place (fn_event_waitlist_taken)
 * — so without this lookup the door refuses the one person whose place it is
 * holding and puts them at the back of the queue they were just promoted off.
 */
export async function findOutstandingOffer(
  service: SupabaseClient,
  eventId: string,
  who: WaitlistIdentity,
  /**
   * The form being submitted. An event holds many forms, one per monthly run,
   * and a queue place is for the run the person joined: without this, September's
   * queue entry is claimed against October's form — and October's form is what
   * sets the fee. A row that stored no form_id matches anything, since there is
   * nothing to contradict.
   */
  formId?: string | null
): Promise<OutstandingOffer | null> {
  const hit = await findOpenRow(service, eventId, who, ['offered']);
  if (!hit.row) return null;
  if (formId && hit.row.form_id && hit.row.form_id !== formId) return null;

  // AN OFFER MADE TO AN ACCOUNT MAY ONLY BE CLAIMED BY THAT ACCOUNT.
  //
  // A guest has no identity but a phone number, so a contact match has to be
  // enough for them — it is the same detail an organiser would ask for on the
  // phone, and the public door has always run on name-plus-one-contact. But
  // when the queue row DOES name an account, that is a stronger fact than a
  // typed-in email, and letting a contact match beat it would let anybody who
  // knows somebody's email walk off with the place being held for them.
  if (hit.row.profile_id && hit.row.profile_id !== who.profileId) return null;

  // A GUEST OFFER REQUIRES EVERY CONTACT DETAIL THE ROW HOLDS, not just the one
  // that found it. A guest has no account, so name-plus-a-contact is the only
  // handle there is — but the organiser's card displays the name AND the phone
  // number, so a classmate can know both. Demanding the full set the person
  // queued with (phone AND email, when they gave both) raises the bar for
  // somebody who knows only one of them.
  //
  // THIS IS A MITIGATION, NOT A PROOF OF IDENTITY, and it is written down as
  // such: whoever can produce the exact details a guest queued with can take
  // the place held for them, and with no deadline and no revocation that is
  // unrecoverable. The real answer is a one-time claim token carried in the
  // offer — which a guest cannot be sent in-app, so it has to reach them
  // through the organiser's phone call, and that is a change to what the
  // organiser is asked to say rather than a change to this function. Flagged
  // in the PR as an open decision instead of being half-built here.
  if (!hit.row.profile_id) {
    const rowPhone = normPhone(hit.row.participant_phone);
    const rowEmail = normEmail(hit.row.participant_email);
    if (rowPhone && rowPhone !== normPhone(who.phone)) return null;
    if (rowEmail && rowEmail !== normEmail(who.email)) return null;
  }

  return { id: hit.row.id, queue_seq: hit.row.queue_seq };
}

/**
 * Claim an offer: 'offered' → 'registered', as a compare-and-swap.
 *
 * The `.eq('status', 'offered')` is the whole point. Two submissions from the
 * same person, or an organiser acting at the same moment, both read the same
 * outstanding offer; only the update that still finds it in 'offered' returns a
 * row, and the loser is told the truth instead of producing a second
 * registration against one held place.
 *
 * Claimed BEFORE the registration is written, and released again by
 * releaseOffer() if that write fails — the other order would let a double
 * submit create two registrations for one place.
 */
export async function claimOffer(
  service: SupabaseClient,
  waitlistId: string
): Promise<boolean> {
  const { data, error } = await (service as any)
    .from('event_registration_waitlist')
    .update({ status: 'registered' })
    .eq('id', waitlistId)
    .eq('status', 'offered')
    .select('id');
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

/** Put a claim back when the registration it was claimed for could not be written. */
export async function releaseOffer(
  service: SupabaseClient,
  waitlistId: string
): Promise<void> {
  await (service as any)
    .from('event_registration_waitlist')
    .update({ status: 'offered' })
    .eq('id', waitlistId)
    .eq('status', 'registered')
    .is('registration_id', null);
}

/** Point a claimed row at the registration it became. Best effort by design. */
export async function attachRegistration(
  service: SupabaseClient,
  waitlistId: string,
  registrationId: string
): Promise<void> {
  await (service as any)
    .from('event_registration_waitlist')
    .update({ registration_id: registrationId })
    .eq('id', waitlistId);
}

/**
 * The sentence a queued person is shown. Plain, and never "you are refused".
 *
 * `already` is set when they were on the queue before this submission — a
 * refresh, a second click, a return visit. Saying "you have been added" again
 * would invite them to keep resubmitting to improve a position that cannot
 * move.
 */
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
 * Announce every offer on this event that has not been announced yet.
 *
 * Idempotent by construction: a row leaves the `offered_at IS NOT NULL AND
 * notified_at IS NULL` slice as soon as it is stamped, and the fanout is called
 * with an idempotency key derived from the row id so even two passes racing
 * cannot deliver twice.
 *
 * A person with no MyJKKN account cannot be told in-app. That is not silently
 * ignored: the row is marked `unreachable` so the organiser's card says so and
 * they can pick up the phone.
 *
 * Never throws. An announcement failure must not take down the page that
 * happened to trigger it.
 */
export async function deliverPendingOffers(
  service: SupabaseClient,
  eventId: string,
  /**
   * How many offers one pass may announce. The public registration door passes
   * a small number: this is awaited on the critical path of somebody's
   * registration, each row costs a notification fanout plus an update, and an
   * unbounded loop there puts unbounded latency in front of a registrant. The
   * organiser's card, which is not on anybody's critical path, takes the
   * default. Nothing is lost by announcing fewer per pass — the rest are picked
   * up by the next request that touches the event.
   */
  maxRows = 50
): Promise<{ notified: number; unreachable: number }> {
  const outcome = { notified: 0, unreachable: 0 };

  const { data: pending, error } = await (service as any)
    .from('event_registration_waitlist')
    .select('id, participant_name, profile_id, learner_id')
    .eq('event_id', eventId)
    .eq('status', 'offered')
    .is('notified_at', null)
    .order('queue_seq', { ascending: true })
    .limit(maxRows);

  if (error || !pending?.length) return outcome;

  // `created_by` is read for the notification's AUTHOR, not for any write: this
  // function never updates public.events, so it cannot trip
  // fn_guard_event_privileged_fields (the BEFORE UPDATE guard that raises 42501
  // on institution_id / event_type / created_by / config->incharges).
  const { data: event } = await (service as any)
    .from('events')
    .select('name, created_by')
    .eq('id', eventId)
    .maybeSingle();
  const eventName = (event as { name?: string } | null)?.name ?? 'the event';
  // Without this, notify.ts defaults created_by to userIds[0] and records the
  // waiting person as the author of their own offer. The offer comes from the
  // event, so its organiser is the honest author.
  const authorId = (event as { created_by?: string | null } | null)?.created_by ?? undefined;

  // A registration can identify a person by profile_id OR by learner_id
  // resolved through profiles.learner_id — reading profile_id alone drops every
  // internal learner filed by learner id, who DOES have an account.
  const learnerIds = Array.from(
    new Set(
      (pending as any[])
        .filter((r) => !r.profile_id && r.learner_id)
        .map((r) => r.learner_id as string)
    )
  );
  const learnerToProfile: Record<string, string> = {};
  if (learnerIds.length) {
    const { data: profiles } = await (service as any)
      .from('profiles')
      .select('id, learner_id')
      .in('learner_id', learnerIds);
    // AN AMBIGUOUS learner_id IS NOT A MATCH. Taking the last row of an
    // unscoped `.in()` means that if two profiles carry the same learner_id —
    // a duplicate, a bad import, another tenant — the offer is announced to
    // whichever happened to sort last. A row with no single answer is left
    // unresolved, so it is marked `unreachable` and the organiser is told to
    // contact them, which is the honest outcome rather than a wrong inbox.
    const seen = new Set<string>();
    for (const p of (profiles ?? []) as { id: string; learner_id: string | null }[]) {
      if (!p.learner_id) continue;
      if (seen.has(p.learner_id)) {
        delete learnerToProfile[p.learner_id];
        continue;
      }
      seen.add(p.learner_id);
      learnerToProfile[p.learner_id] = p.id;
    }
  }

  for (const row of pending as any[]) {
    const userId: string | null =
      row.profile_id ?? (row.learner_id ? learnerToProfile[row.learner_id] ?? null : null);

    if (!userId) {
      await (service as any)
        .from('event_registration_waitlist')
        .update({ notified_at: new Date().toISOString(), unreachable: true })
        .eq('id', row.id)
        .is('notified_at', null);
      outcome.unreachable += 1;
      continue;
    }

    const result = await fanoutNotification(service, {
      title: 'A place has opened up',
      body: `A place has opened up for ${eventName} and it is being held for you — you were next on the waiting list. Open the registration page and send the form to take it up; nobody else can take this place while it is held for you.`,
      userIds: [userId],
      createdBy: authorId,
      // The door the sentence above points at. The registration route
      // recognises the offer this row holds and lets the form through instead
      // of refusing it as full.
      url: `/p/event/${eventId}/register`,
      source: 'events_waitlist_offer',
      metadata: { event_id: eventId, waitlist_id: row.id },
      idempotencyKey: `events_waitlist_offer:${row.id}`,
      // Legacy column the events read path still filters on, exactly as
      // app/api/events/notify/route.ts writes it.
      extraColumns: { type: 'events' },
    });

    // 'idempotent' means an identical notification already exists — the offer
    // HAS been announced, so the row must be stamped rather than retried
    // forever.
    if (result.notified > 0 || result.skipped === 'idempotent') {
      await (service as any)
        .from('event_registration_waitlist')
        .update({ notified_at: new Date().toISOString(), unreachable: false })
        .eq('id', row.id)
        .is('notified_at', null);
      outcome.notified += 1;
    }
  }

  return outcome;
}

/**
 * Sort key by status. A RANK, not a pairwise "is this one offered?" test.
 *
 * The first version compared `a.status === 'offered' ? -1 : 1` whenever the two
 * differed, which is not a total order the moment a third status appears:
 * waiting-vs-registered returned 1 AND registered-vs-waiting returned 1, so the
 * result depended on the engine's traversal. It was masked only because the
 * read filtered to waiting/offered — and it stopped being masked the moment
 * 'registered' began to be written, which is exactly what the claim path above
 * does. Any status not named here sorts last, deterministically.
 */
function statusRank(status: string): number {
  switch (status) {
    case 'offered':
      return 0;
    case 'waiting':
      return 1;
    case 'registered':
      return 2;
    case 'withdrawn':
      return 3;
    default:
      return 4;
  }
}

/**
 * Turn stored rows into the queue as it is shown. Pure, and the only place the
 * two rules that matter live:
 *
 *   1. POSITION is the rank among rows still 'waiting', counted in queue_seq
 *      order — NOT queue_seq itself. queue_seq is join order and is never
 *      renumbered, so after two people leave the queue the third joiner is 1st,
 *      and showing them "3" would be a lie about how long they have to wait.
 *      An offered row has no position; it is past the queue.
 *   2. OFFERED ROWS COME FIRST. An offer holds a place and has no deadline, so
 *      a stalled one is the only thing on this screen that can quietly cost the
 *      event a seat. It must not sit below the people still waiting.
 *
 * Input is assumed to be in queue_seq order, as the read orders it; the sort
 * below is stable on queue_seq anyway, so an unordered input still ranks
 * correctly.
 */
export function orderQueue(
  rows: Array<{
    id: string;
    queue_seq: number;
    status: string;
    participant_name: string;
    participant_email?: string | null;
    participant_phone?: string | null;
    unreachable?: boolean | null;
    joined_at: string;
    offered_at?: string | null;
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
    unreachable: r.unreachable === true,
    joined_at: r.joined_at,
    offered_at: r.offered_at ?? null,
    notified_at: r.notified_at ?? null,
  }));

  entries.sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.queue_seq - b.queue_seq);

  return entries;
}

/**
 * The organiser's view: the queue in order, plus the numbers that explain it.
 */
export async function getWaitlistPanel(
  service: SupabaseClient,
  eventId: string
): Promise<WaitlistPanel> {
  const { data: event, error: eventError } = await (service as any)
    .from('events')
    .select('cap_behavior, max_registrations')
    .eq('id', eventId)
    .maybeSingle();

  // NOT READ IS NOT 'waitlist'. The old `?? 'waitlist'` reported a value nobody
  // successfully looked up — and the card decides whether to render at all on
  // that value, so an unreadable event quietly became "this event queues".
  if (eventError) {
    throw new WaitlistReadError('read the event', eventId, eventError);
  }
  const capBehavior = ((event as any)?.cap_behavior ?? null) as EventCapBehavior | null;
  const maxRegistrations = ((event as any)?.max_registrations ?? null) as number | null;

  // TWO READS, because a flat row cap ordered by queue_seq silently drops the
  // one row that matters most. On a long queue an 'offered' row with a high
  // queue_seq falls outside the window, so the card understates the places
  // taken and hides the stalled offer it exists to surface. Offers are few by
  // construction — at most one per freed place — so they are read in full and
  // the cap applies only to the people still waiting.
  const OFFER_COLUMNS =
    'id, queue_seq, status, participant_name, participant_email, participant_phone, unreachable, joined_at, offered_at, notified_at';

  const [offeredRead, waitingRead] = await Promise.all([
    (service as any)
      .from('event_registration_waitlist')
      .select(OFFER_COLUMNS)
      .eq('event_id', eventId)
      .eq('status', 'offered')
      .order('queue_seq', { ascending: true }),
    (service as any)
      .from('event_registration_waitlist')
      .select(OFFER_COLUMNS)
      .eq('event_id', eventId)
      .eq('status', 'waiting')
      .order('queue_seq', { ascending: true })
      .limit(500),
  ]);

  const error = offeredRead.error ?? waitingRead.error;
  const rows = error ? null : [...(offeredRead.data ?? []), ...(waitingRead.data ?? [])];

  if (error) {
    // Only a missing table is "not yet available". Anything else is a real
    // failure and must reach the card's explicit could-not-load state — an
    // empty panel with not_yet_available=false rendered identically to "nobody
    // is waiting", which made that state unreachable and hid a stalled offer.
    if (!isMissingObject(error)) {
      throw new WaitlistReadError('read the waiting list', eventId, error);
    }
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

  const entries = orderQueue((rows ?? []) as any[]);

  return {
    cap_behavior: capBehavior,
    max_registrations: maxRegistrations,
    taken: await countTaken(service, eventId),
    entries,
    waiting_count: entries.filter((e) => e.status === 'waiting').length,
    offered_count: entries.filter((e) => e.status === 'offered').length,
    not_yet_available: false,
  };
}
