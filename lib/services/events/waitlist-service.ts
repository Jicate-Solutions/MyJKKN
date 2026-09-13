// lib/services/events/waitlist-service.ts
//
// The sign-up waiting list for a full event: joining it, reading it in order,
// and announcing an offer once a place frees.
//
// ---------------------------------------------------------------------------
// WHERE THE PIECES LIVE
// ---------------------------------------------------------------------------
// Promotion itself is NOT here. It is a database trigger
// (fn_event_registration_freed_offer_waitlist, migration 20261207090000) on
// events_registrations, so it catches every way a place can free — a status
// change to 'cancelled', an organiser removing someone, a deletion — without
// this feature touching the cancel flow. The trigger moves the head of the
// queue to 'offered' and stops there.
//
// This file does the part a trigger must not do: TELLING the person. Delivery
// goes through fanoutNotification() — the canonical helper in
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
// registration door. The OFFER is therefore instant and the place is held from
// that instant; the announcement waits for that next request. Nothing is lost
// if it never comes: offered_at is stored, and the organiser's card shows the
// offer as outstanding.
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
  /** The event's own switch. The queue only exists when this is 'waitlist'. */
  cap_behavior: EventCapBehavior;
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
  const message = (error as { message?: string } | null)?.message ?? '';
  return /does not exist|schema cache/i.test(message);
}

/** The 3 statuses that occupy a place. Kept beside the SQL that mirrors it. */
export const LIVE_REGISTRATION_FILTER = 'cancelled';

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
  eventId: string
): Promise<number> {
  const { count } = await (service as any)
    .from('events_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .neq('status', LIVE_REGISTRATION_FILTER);

  let offered = 0;
  const { count: offeredCount, error } = await (service as any)
    .from('event_registration_waitlist')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'offered');
  if (!error) offered = offeredCount ?? 0;

  return (count ?? 0) + offered;
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

export interface JoinWaitlistResult {
  /** null when the waiting list is not available yet — caller falls back. */
  id: string | null;
  /** 1-based place in the queue, for the sentence the person is shown. */
  position: number | null;
}

/**
 * Put somebody on the queue and work out the position to tell them.
 *
 * Returns `{ id: null }` — never throws — when the table is not there yet, so
 * the registration route can fall back to today's "This event is full."
 */
export async function joinWaitlist(
  service: SupabaseClient,
  input: JoinWaitlistInput
): Promise<JoinWaitlistResult> {
  const { data, error } = await (service as any)
    .from('event_registration_waitlist')
    .insert({
      event_id: input.eventId,
      form_id: input.formId,
      participant_name: input.participantName,
      participant_email: input.participantEmail,
      participant_phone: input.participantPhone,
      profile_id: input.profileId,
      learner_id: input.learnerId,
      institution_id: input.institutionId,
      custom_fields: input.customFields,
      status: 'waiting',
    })
    .select('id, queue_seq')
    .single();

  if (error || !data) {
    return { id: null, position: null };
  }

  // Position = rank among the rows still waiting. Counting rows ahead of this
  // one by queue_seq is stable under concurrent joins, and it stays correct
  // when somebody in front withdraws without any renumbering.
  const { count } = await (service as any)
    .from('event_registration_waitlist')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', input.eventId)
    .eq('status', 'waiting')
    .lt('queue_seq', data.queue_seq);

  return { id: data.id as string, position: (count ?? 0) + 1 };
}

/** The sentence a queued person is shown. Plain, and never "you are refused". */
export function queuedMessage(position: number | null): string {
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
  eventId: string
): Promise<{ notified: number; unreachable: number }> {
  const outcome = { notified: 0, unreachable: 0 };

  const { data: pending, error } = await (service as any)
    .from('event_registration_waitlist')
    .select('id, participant_name, profile_id, learner_id')
    .eq('event_id', eventId)
    .eq('status', 'offered')
    .is('notified_at', null)
    .order('queue_seq', { ascending: true })
    .limit(50);

  if (error || !pending?.length) return outcome;

  const { data: event } = await (service as any)
    .from('events')
    .select('name')
    .eq('id', eventId)
    .maybeSingle();
  const eventName = (event as { name?: string } | null)?.name ?? 'the event';

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
    for (const p of (profiles ?? []) as { id: string; learner_id: string | null }[]) {
      if (p.learner_id) learnerToProfile[p.learner_id] = p.id;
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
      body: `A place has opened up for ${eventName} and it is being held for you — you were next on the waiting list. Open the event page to complete your registration.`,
      userIds: [userId],
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

  entries.sort((a, b) => {
    if (a.status === b.status) return a.queue_seq - b.queue_seq;
    return a.status === 'offered' ? -1 : 1;
  });

  return entries;
}

/**
 * The organiser's view: the queue in order, plus the numbers that explain it.
 */
export async function getWaitlistPanel(
  service: SupabaseClient,
  eventId: string
): Promise<WaitlistPanel> {
  const { data: event } = await (service as any)
    .from('events')
    .select('cap_behavior, max_registrations')
    .eq('id', eventId)
    .maybeSingle();

  const capBehavior = ((event as any)?.cap_behavior ?? 'waitlist') as EventCapBehavior;
  const maxRegistrations = ((event as any)?.max_registrations ?? null) as number | null;

  const { data: rows, error } = await (service as any)
    .from('event_registration_waitlist')
    .select(
      'id, queue_seq, status, participant_name, participant_email, participant_phone, unreachable, joined_at, offered_at, notified_at'
    )
    .eq('event_id', eventId)
    .in('status', ['waiting', 'offered'])
    .order('queue_seq', { ascending: true });

  if (error) {
    return {
      cap_behavior: capBehavior,
      max_registrations: maxRegistrations,
      taken: 0,
      entries: [],
      waiting_count: 0,
      offered_count: 0,
      not_yet_available: isMissingObject(error),
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
