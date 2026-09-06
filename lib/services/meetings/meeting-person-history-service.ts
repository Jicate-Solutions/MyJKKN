// lib/services/meetings/meeting-person-history-service.ts
//
// "Past meetings with this person" — the relationship behind a single booking.
//
// WHY THIS EXISTS
//   The Director meets the same people over and over. Verified on production
//   2026-08-25: the Dental Principal 11 times since 18 June, eao@ 9 times,
//   vijaysabari@ 8, sankar_g@ 7 — and 20 host+person pairs have met more than
//   once. None of that was visible when he opened a meeting. He walked in with
//   no memory of the last four conversations.
//
// WHY IT MATCHES ON attendee_email
//   Because MeetingActionItemService.listOpenCarryOver already does. Its
//   PastActions adapter resolves "the host's other bookings with the SAME
//   person" as host_profile_id + attendee_email, and the carried-over panel it
//   feeds sits directly above this one. A different matching key here would
//   silently disagree with the panel next to it: the same page would claim two
//   different answers to "who is this person". attendee_profile_id is set on
//   host-scheduled internal bookings only, so it would ALSO be a narrower key.
//
// WHY IT READS meeting_bookings AND NOTHING ELSE
//   meeting_action_items, meeting_agenda_items and meeting_agendas all hold 0
//   rows in production, and follows_booking_id is set on 0 of 128 bookings.
//   Nothing has ever been recorded against a meeting. A panel that depended on
//   any of them would render empty forever, so the only description of what a
//   meeting was about is the guest's own booking note in answers->>'note'
//   (present on 105 of 128 rows).
//
// SECURITY MODEL
//   READ ONLY, and on the SESSION client — never service-role. The only SELECT
//   policy on meeting_bookings is
//
//     mb_host_select : is_super_admin() OR is_admin()
//                      OR host_profile_id = auth.uid()
//
//   so RLS already scopes this to the host (or an admin). Reading service-role
//   here would WIDEN who can see a person's meeting history with the Director,
//   which is not this panel's call to make.
//
// Native meeting tables are not in the generated Supabase types (TS2589 class),
// so the caller passes an untyped SupabaseClient and casts stay local — the
// same shape MeetingActionItemService and MeetingContactsService already use.

import type { SupabaseClient } from '@supabase/supabase-js';

const LOG_PREFIX = '[meeting-person-history]';

/** How many prior meetings the panel lists before collapsing to "+N earlier". */
export const HISTORY_LIMIT = 10;

// ============================================================================
// TYPES
// ============================================================================

/**
 * What became of a meeting, stated no more confidently than the record allows.
 *
 * 'not_recorded' is the honest majority case, not an edge case: verified on
 * production 2026-08-25, outcome_marked_by is NULL on ALL 128 bookings, and
 * the 62 'completed' rows were all closed by one bulk backfill at the same
 * instant (2026-08-18 02:54:56.7029+00). Nobody ever said those meetings took
 * place. Rendering them as "happened" would manufacture a fact the database
 * does not hold.
 */
export type MeetingOutcome = 'happened' | 'no_show' | 'cancelled' | 'not_recorded';

/** One earlier meeting between this host and this person. */
export interface PriorMeeting {
  uid: string;
  startTime: string;
  /** The meeting type's title, or null when the type was deleted / never set. */
  typeTitle: string | null;
  /** The guest's own booking note — the only account of what it was about. */
  note: string | null;
  outcome: MeetingOutcome;
}

export interface PersonHistory {
  /** Who this history is about — for the summary line. */
  personName: string;
  /** Prior meetings, most recent first, already capped to HISTORY_LIMIT. */
  meetings: PriorMeeting[];
  /** How many prior meetings exist BEYOND the ones in `meetings`. */
  hiddenCount: number;
  /** Prior meetings that were not cancelled — what "you have met" counts. */
  metCount: number;
  /** Prior meetings that were cancelled and never happened. */
  cancelledCount: number;
  /** ISO start of the earliest prior meeting counted by metCount. */
  metSince: string | null;
}

// ============================================================================
// PURE DERIVATION (unit-tested directly; no client, no env)
// ============================================================================

interface OutcomeInput {
  status: string | null | undefined;
  outcomeMarkedBy: string | null | undefined;
}

/**
 * Turn a booking row into an outcome, erring toward "we do not know".
 *
 * status is a fact for cancelled/no_show: somebody performed that act. It is
 * NOT a fact for 'completed' — nothing about the row proves a human observed
 * the meeting unless outcome_marked_by names one ('host' or 'admin'). The
 * third legal value, 'system', is the auto-closer, and the detail page already
 * words that case as "nobody confirmed it took place"; this agrees with it.
 *
 * A 'confirmed' row is a meeting nobody ever closed. Whether it is in the past
 * or the future, the record says nothing about what happened — and every row
 * this panel shows is already in the past, so it reads as not recorded.
 */
export function deriveOutcome(row: OutcomeInput): MeetingOutcome {
  if (row.status === 'cancelled') return 'cancelled';
  if (row.status === 'no_show') return 'no_show';
  if (row.status === 'completed') {
    const by = row.outcomeMarkedBy;
    return by === 'host' || by === 'admin' ? 'happened' : 'not_recorded';
  }
  return 'not_recorded';
}

/** Plain-English label for an outcome. Shown to the Director, not to a dev. */
export function outcomeLabel(outcome: MeetingOutcome): string {
  switch (outcome) {
    case 'happened':
      return 'Happened';
    case 'no_show':
      return 'No-show';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Not recorded';
  }
}

/**
 * The guest's booking note, from a JSONB column that may hold either shape.
 *
 * Production currently stores an object on all 128 rows, but JSONB in this
 * repo is not guaranteed one shape (see CLAUDE.md), and the array form shows
 * up wherever answers were captured as a question list. Both are handled here
 * so a future writer cannot make this panel silently note-less.
 */
export function extractNote(answers: unknown): string | null {
  if (!answers) return null;

  const clean = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  };

  if (Array.isArray(answers)) {
    for (const entry of answers) {
      if (typeof entry !== 'object' || entry === null) continue;
      const e = entry as Record<string, unknown>;
      // { note: '...' }
      const direct = clean(e.note);
      if (direct) return direct;
      // { question: 'note', answer: '...' } — the question-list form
      const key = typeof e.question === 'string' ? e.question.trim().toLowerCase() : null;
      if (key === 'note') {
        const answer = clean(e.answer) ?? clean(e.value);
        if (answer) return answer;
      }
    }
    return null;
  }

  if (typeof answers === 'object') {
    return clean((answers as Record<string, unknown>).note);
  }
  return null;
}

/**
 * The one line the Director reads first.
 *
 * It deliberately does NOT say "you have met them 11 times" when 5 of those 11
 * were cancelled — verified on production, exactly that is true of the Dental
 * Principal. A cancelled booking is not a meeting that happened, so it is
 * counted separately and named, never folded into the headline number.
 */
export function summarize(history: PersonHistory): string {
  const { personName, metCount, cancelledCount, metSince } = history;
  const name = personName.trim() || 'this person';
  const since = metSince ? ` since ${formatDay(metSince)}` : '';

  if (metCount === 0) {
    // Everything prior was called off. Saying "you have met" would be false,
    // and metSince is null by construction, so no date is claimed either.
    const plural = cancelledCount === 1 ? 'meeting' : 'meetings';
    return `You have ${cancelledCount} earlier ${plural} with ${name} — all cancelled.`;
  }

  const times = metCount === 1 ? 'once' : `${metCount} times`;
  const head = `You have met ${name} ${times} before${since}.`;
  if (cancelledCount === 0) return head;
  const plural = cancelledCount === 1 ? 'was' : 'were';
  return `${head} ${cancelledCount} more ${plural} cancelled.`;
}

/** "18 June 2026" — IST, matching how the rest of the meetings module reads. */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(d);
}

/** "25 Aug 2026, 12:05 pm" — IST. Every time in this module is IST. */
export function formatDayTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(d);
}

interface RawPrior {
  uid: string;
  start_time: string;
  status: string | null;
  outcome_marked_by: string | null;
  answers: unknown;
  meeting_type_id: string | null;
}

/**
 * Shape raw prior-booking rows into the panel's view model.
 *
 * Exported so the whole derivation — ordering, the cap, the counts and the
 * summary — is testable without a database. `titles` maps meeting_type_id to
 * its title; a missing entry is a deleted or never-set type, not an error.
 */
export function buildHistory(
  personName: string,
  rows: RawPrior[],
  titles: Map<string, string> = new Map(),
  limit: number = HISTORY_LIMIT,
): PersonHistory {
  // Most recent first. The caller's ordering is not trusted: a cap applied to
  // a differently-ordered list would hide the wrong meetings.
  const sorted = [...rows].sort(
    (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
  );

  const withOutcome = sorted.map((r) => ({
    row: r,
    outcome: deriveOutcome({ status: r.status, outcomeMarkedBy: r.outcome_marked_by }),
  }));

  const met = withOutcome.filter((r) => r.outcome !== 'cancelled');
  const cancelledCount = withOutcome.length - met.length;
  // Earliest of the ones actually counted, so "since" cannot name a date whose
  // only meeting was cancelled.
  const metSince = met.length > 0 ? met[met.length - 1].row.start_time : null;

  const shown = withOutcome.slice(0, Math.max(0, limit));

  return {
    personName,
    meetings: shown.map(({ row, outcome }) => ({
      uid: row.uid,
      startTime: row.start_time,
      typeTitle: row.meeting_type_id ? (titles.get(row.meeting_type_id) ?? null) : null,
      note: extractNote(row.answers),
      outcome,
    })),
    hiddenCount: Math.max(0, withOutcome.length - shown.length),
    metCount: met.length,
    cancelledCount,
    metSince,
  };
}

// ============================================================================
// SERVICE
// ============================================================================

export class MeetingPersonHistoryService {
  /**
   * Every earlier meeting this host had with this booking's attendee.
   *
   * "Earlier" is relative to THIS booking, not to now: opening a meeting that
   * is still upcoming must not list a meeting that comes after it as history.
   * Returns null when there is nothing to show, so the caller renders no panel
   * at all rather than an empty box.
   *
   * Session client only — RLS (mb_host_select) decides what is visible.
   */
  static async getForBooking(
    client: SupabaseClient,
    bookingId: string,
    limit: number = HISTORY_LIMIT,
  ): Promise<PersonHistory | null> {
    // 1. Resolve this booking's host + person + its own place in time. Matched
    //    on attendee_email exactly as listOpenCarryOver does.
    const { data: current, error: cErr } = await client
      .from('meeting_bookings')
      .select('id, host_profile_id, attendee_email, attendee_name, start_time')
      .eq('id', bookingId)
      .maybeSingle();
    if (cErr || !current) {
      if (cErr) console.error(`${LOG_PREFIX} current booking error:`, cErr.message);
      return null;
    }
    const cur = current as {
      host_profile_id: string;
      attendee_email: string | null;
      attendee_name: string | null;
      start_time: string;
    };
    if (!cur.attendee_email) return null; // nothing to match a person on

    // 2. This host's OTHER bookings with the same person, before this one.
    const { data: priors, error: pErr } = await client
      .from('meeting_bookings')
      .select('uid, start_time, status, outcome_marked_by, answers, meeting_type_id')
      .eq('host_profile_id', cur.host_profile_id)
      .eq('attendee_email', cur.attendee_email)
      .neq('id', bookingId)
      .lt('start_time', cur.start_time)
      .order('start_time', { ascending: false });
    if (pErr) {
      console.error(`${LOG_PREFIX} priors error:`, pErr.message);
      return null;
    }
    const rows = (priors ?? []) as RawPrior[];
    if (rows.length === 0) return null; // no history → no panel

    // 3. Titles for the types actually referenced (one query, not one per row).
    const typeIds = Array.from(
      new Set(rows.map((r) => r.meeting_type_id).filter((id): id is string => !!id)),
    );
    const titles = new Map<string, string>();
    if (typeIds.length > 0) {
      const { data: types, error: tErr } = await client
        .from('meeting_types')
        .select('id, title')
        .in('id', typeIds);
      if (tErr) {
        // A missing title is cosmetic — the history is still worth showing.
        console.error(`${LOG_PREFIX} type titles error:`, tErr.message);
      } else {
        for (const t of (types ?? []) as Array<{ id: string; title: string | null }>) {
          if (t.title) titles.set(t.id, t.title);
        }
      }
    }

    return buildHistory(cur.attendee_name || cur.attendee_email, rows, titles, limit);
  }
}
