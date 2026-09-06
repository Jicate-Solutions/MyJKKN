#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * scripts/retitle-calendar-events-guest-first.ts
 *
 * Retitles Google Calendar events that were created BEFORE the guest-first
 * title fix (#3168) so they read the same way new bookings now do.
 *
 * ── WHY THERE IS ANYTHING TO BACKFILL ──────────────────────────────────────
 * #3168 changed what a NEW booking is called on the host's calendar, from
 *
 *     `${meetingType} — ${guest}`        →  `${guest} — ${meetingType}`
 *
 * because every one of the Director's one-to-one types is 47-48 characters
 * ("One to One Meeting with Ommsharravana 5 Minutes") and a phone truncates a
 * calendar row long before that. The guest's name began at character 49: four
 * back-to-back bookings rendered as four identical rows and the host walked in
 * blind. It fixed the code, and only the code — every event already on the
 * calendar still carries the old order. That is what this script is for.
 *
 * ── IT DOES NOT INVENT A TITLE FORMAT ──────────────────────────────────────
 * The new title comes from bookingEventTitle() — the SAME function the booking
 * path calls. If the format is ever changed again, this script follows it for
 * free. Reimplementing the string here would have created a second definition
 * that drifts. It is imported from lib/services/meetings/booking-event-title.ts
 * rather than from native-scheduling-service.ts (which re-exports it) purely to
 * stay out of that module's import-time Resend / Supabase / ActivityService
 * chain — a CLI should not have to boot half the application to know a format.
 *
 * ── DRY RUN IS THE DEFAULT, AND THAT IS NOT A COURTESY ──────────────────────
 * The target is the Director's live calendar with real external guests on it.
 * With no flags this script writes NOTHING: it prints, per event, the uid, the
 * title today and the title it would set, and stops. Only --apply writes.
 * Every line a dry run prints is tagged "(dry)" — this repo has a receipt where
 * unmarked dry-run zeros were read as live failures and cost a 20-minute hunt.
 *
 * ── NOBODY GETS EMAILED ────────────────────────────────────────────────────
 * Writes go through GoogleCalendarService.patchEventSummarySilently, which is
 * the one method in that file sending `sendUpdates=none`. Every other write
 * there sends `all`, correctly — they change the time, the place, or whether
 * the meeting exists. A rename changes none of those. Mailing an external guest
 * "your meeting was updated" because a word order improved on someone else's
 * screen is noise, so this run is silent by construction.
 *
 * ── WHAT IT REFUSES TO TOUCH ───────────────────────────────────────────────
 * A title is only rewritten when it still matches a shape the OLD code could
 * actually have produced. Anything else — a title the host edited by hand, or
 * one already in the new format — is left exactly as it is and counted. That
 * is what makes a re-run safe: the second run finds every title already
 * matching its proposal and does nothing. Idempotency here is a property of
 * what the script recognises, not a marker it writes into the summary.
 *
 * ── SCOPE ──────────────────────────────────────────────────────────────────
 *   --scope future  (default)  events that have not happened yet
 *   --scope all                every booking carrying a google_event_id
 * future is the default because the title exists so the host knows who is
 * walking in. For a meeting that already happened there is nobody to recognise.
 *
 * USAGE
 *   tsx --env-file=.env.local scripts/retitle-calendar-events-guest-first.ts
 *   tsx --env-file=.env.local scripts/retitle-calendar-events-guest-first.ts --scope all
 *   tsx --env-file=.env.local scripts/retitle-calendar-events-guest-first.ts --apply
 *
 * ENV
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — always
 *   GOOGLE_CAL_CLIENT_ID / _SECRET, GOOGLE_TOKEN_MASTER_SECRET
 *     — needed to read a live title and to write one. Without them a dry run
 *       still reports the full plan, marked as reconstructed rather than
 *       pretending it read the calendar.
 *   RESEND_API_KEY
 *     — not used by this script, and no email is sent on any path. It is
 *       required only because lib/resend.ts constructs its client at IMPORT
 *       time and throws without a key, and both imports below reach it. Any
 *       value loads the module; --env-file=.env.local already carries one.
 */

import { argv, exit } from 'node:process';
import { pathToFileURL } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  GoogleCalendarService,
  isGoogleCalConfigured,
} from '@/lib/services/integrations/google-calendar-service';
import { bookingEventTitle } from '@/lib/services/meetings/booking-event-title';

/** markEventCancelled keeps a cancelled booking on the calendar under this. */
export const CANCELLED_PREFIX = 'Cancelled: ';

export type Scope = 'future' | 'all';

/** The fields of a booking that decide what its event is called. */
export interface RetitleBooking {
  uid: string;
  attendeeName: string | null;
  typeTitle: string;
  note: string | null;
  /** The host's meeting_host_integration_prefs.show_note_in_title. */
  showNote: boolean;
  status: string;
  /**
   * False when the booking's meeting type has since been deleted
   * (meeting_type_id is ON DELETE SET NULL), so typeTitle is the 'Meeting'
   * fallback and NOT the words actually sitting in the old event title.
   */
  typeKnown: boolean;
}

export type Verdict = 'retitle' | 'already' | 'unrecognised';

/**
 * What this booking's event SHOULD be called — the booking path's own title,
 * plus the "Cancelled: " prefix when the booking was cancelled (that prefix is
 * how markEventCancelled keeps a cancelled meeting visible but marked, and
 * dropping it while renaming would quietly un-cancel the row on the calendar).
 */
export function proposedTitle(b: RetitleBooking): string {
  const core = bookingEventTitle({
    attendeeName: b.attendeeName,
    typeTitle: b.typeTitle,
    note: b.note,
    showNote: b.showNote,
  });
  return b.status === 'cancelled' ? `${CANCELLED_PREFIX}${core}` : core;
}

/**
 * Every title the code BEFORE #3168 could have written for this booking.
 *
 * Three shapes shipped, and all three are still out there:
 *   `${type} — ${guest}`                  the ordinary event
 *   `${type} — ${guest} — ${note}`        when the host opted into notes
 *   `Cancelled: ${type} — ${guest}`       markEventCancelled, which builds its
 *                                         own string and STILL uses the old
 *                                         order on main today
 * Recognising a title is the safety gate: a summary matching none of these was
 * not written by us, so it is somebody's edit and is left alone.
 */
export function legacyTitles(b: RetitleBooking): string[] {
  const who = (b.attendeeName ?? '').trim();
  const note = (b.note ?? '').trim();
  const base = `${b.typeTitle} — ${who}`.trim();
  const shapes = [base];
  if (note) shapes.push(`${base} — ${note}`);
  return [...shapes, ...shapes.map((t) => `${CANCELLED_PREFIX}${t}`)];
}

/**
 * Decide what to do with one event, given what it is called on Google right now.
 *
 * 'already' wins over 'retitle' when the current title IS the proposal — that
 * single comparison is the whole of the idempotency guarantee, and it is why a
 * second run is a no-op rather than a second write.
 */
export function classify(current: string | null, b: RetitleBooking): Verdict {
  const now = (current ?? '').trim();
  if (now === proposedTitle(b)) return 'already';
  if (legacyTitles(b).includes(now)) return 'retitle';
  if (!b.typeKnown && matchesLegacyTail(now, b)) return 'retitle';
  return 'unrecognised';
}

/**
 * The deleted-meeting-type case, and ONLY that case.
 *
 * meeting_type_id is ON DELETE SET NULL, so for a booking whose type has since
 * been deleted the type name is simply gone from the database — while the event
 * on Google still carries it. Those titles can never be reconstructed exactly,
 * and a strict comparison would skip every one of them. They are not a rare
 * corner either: 3 of the 12 future events are in it, and "<deleted type> — DR
 * K L SENTHIL KUMAR" is exactly the unreadable row this whole change is about.
 *
 * So when — and only when — the type is unknown, a title is accepted on its
 * TAIL: the old format always ended with the guest's name, or with the guest's
 * name and their note. The guest's name is a per-booking discriminator, so this
 * cannot match another booking's event, and it stays off entirely for the
 * ordinary case where the exact old title IS reconstructable.
 */
function matchesLegacyTail(current: string, b: RetitleBooking): boolean {
  const who = (b.attendeeName ?? '').trim();
  if (!who) return false;
  const note = (b.note ?? '').trim();
  const tails = [` — ${who}`, ...(note ? [` — ${who} — ${note}`] : [])];
  return tails.some((t) => current.endsWith(t));
}

/**
 * A title as ONE printable line.
 *
 * Guests type their discussion note into a textarea, so some notes contain real
 * newlines — and when the host has opted notes into the title, the title
 * contains them too. Printed raw, one event's title becomes four lines, and
 * three of them would carry no "(dry)" marker: exactly the ambiguity the marker
 * exists to prevent. Display only. The value WRITTEN to Google is whatever
 * bookingEventTitle returns, unflattened, because that is what a new booking
 * writes and a backfill that "tidied" it would disagree with the booking path
 * and re-write the same event on every run.
 */
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// ── args ─────────────────────────────────────────────────────────────────────

export function parseArgs(args: string[]): { apply: boolean; scope: Scope } {
  const apply = args.includes('--apply');
  const i = args.indexOf('--scope');
  const raw = i >= 0 ? args[i + 1] : undefined;
  if (raw !== undefined && raw !== 'future' && raw !== 'all') {
    throw new Error(`--scope must be 'future' or 'all' (got '${raw}')`);
  }
  return { apply, scope: (raw as Scope | undefined) ?? 'future' };
}

// ── run ──────────────────────────────────────────────────────────────────────

interface BookingRow {
  uid: string;
  status: string;
  start_time: string;
  host_profile_id: string;
  attendee_name: string | null;
  answers: Record<string, unknown> | null;
  google_event_id: string | null;
  meeting_types: { title: string | null } | null;
}

async function loadBookings(supabase: SupabaseClient, scope: Scope): Promise<BookingRow[]> {
  let q = supabase
    .from('meeting_bookings')
    .select(
      'uid, status, start_time, host_profile_id, attendee_name, answers, google_event_id, meeting_types(title)',
    )
    .not('google_event_id', 'is', null)
    .order('start_time', { ascending: true });
  if (scope === 'future') q = q.gt('start_time', new Date().toISOString());
  const { data, error } = await q;
  if (error) throw new Error(`booking load failed: ${error.message}`);
  return (data ?? []) as unknown as BookingRow[];
}

/** host_profile_id → show_note_in_title. An absent row means false. */
async function loadNotePrefs(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('meeting_host_integration_prefs')
    .select('host_profile_id, show_note_in_title');
  if (error) throw new Error(`prefs load failed: ${error.message}`);
  const on = new Set<string>();
  for (const r of (data ?? []) as Array<{
    host_profile_id: string;
    show_note_in_title: boolean | null;
  }>) {
    if (r.show_note_in_title === true) on.add(r.host_profile_id);
  }
  return on;
}

async function main(): Promise<void> {
  const { apply, scope } = parseArgs(argv.slice(2));

  // EVERY line a dry run prints carries the marker, as a PREFIX. This repo has
  // a receipt where unmarked dry-run zeros were read as live failures and cost
  // a 20-minute hunt, so "most lines are tagged" is not good enough — a title
  // line quoted on its own has to say what it is. Prefix rather than suffix
  // because "(dry)" trailing a calendar title reads like part of the title.
  const say = (line = '') => console.log(apply ? line : line ? `(dry) ${line}` : line);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const google = isGoogleCalConfigured();
  if (apply && !google) {
    console.error('✗ --apply needs GOOGLE_CAL_CLIENT_ID / _SECRET / GOOGLE_TOKEN_MASTER_SECRET');
    exit(1);
  }

  console.log('');
  say('── guest-first calendar retitle ──');
  say(`mode   ${apply ? 'APPLY — Google will be written' : 'DRY RUN — nothing is written'}`);
  say(`scope  ${scope}${scope === 'future' ? ' (start_time > now)' : ' (every event)'}`);
  if (!google) {
    say('google NOT CONFIGURED — live titles cannot be read; showing the plan only');
  }
  console.log('');

  const [rows, notePrefOn] = await Promise.all([
    loadBookings(supabase, scope),
    loadNotePrefs(supabase),
  ]);

  const totals = { retitled: 0, already: 0, unrecognised: 0, gone: 0, failed: 0, planned: 0 };

  for (const r of rows) {
    const b: RetitleBooking = {
      uid: r.uid,
      attendeeName: r.attendee_name,
      typeTitle: (r.meeting_types?.title ?? 'Meeting').trim() || 'Meeting',
      note: typeof r.answers?.note === 'string' ? r.answers.note : null,
      showNote: notePrefOn.has(r.host_profile_id),
      status: r.status,
      typeKnown: !!(r.meeting_types?.title ?? '').trim(),
    };
    const proposed = proposedTitle(b);

    // No Google credentials: report the plan from the database rather than
    // guessing. "was" here is the title the OLD code would have written for
    // this row — a reconstruction, labelled as one, not a reading of the live
    // event. Never reached under --apply (refused above).
    if (!google) {
      totals.planned++;
      say(r.uid);
      say(`     was (reconstructed): ${oneLine(legacyTitles(b)[0])}`);
      say(`     new:                 ${oneLine(proposed)}`);
      continue;
    }

    const ev = await GoogleCalendarService.getEvent(
      supabase,
      r.host_profile_id,
      r.google_event_id as string,
    );
    if (ev === 'gone' || ev === null) {
      totals.gone++;
      say(`${r.uid}  ${ev === 'gone' ? 'event gone' : 'unreadable'} — skipped`);
      continue;
    }

    const verdict = classify(ev.summary, b);
    if (verdict === 'already') {
      totals.already++;
      say(`${r.uid}  already guest-first — skipped`);
      continue;
    }
    if (verdict === 'unrecognised') {
      totals.unrecognised++;
      say(`${r.uid}  not a title this system wrote — left alone`);
      say(`     now: ${oneLine(ev.summary ?? '(none)')}`);
      continue;
    }

    say(r.uid);
    say(`     now: ${oneLine(ev.summary ?? '(none)')}`);
    say(`     new: ${oneLine(proposed)}`);
    if (!apply) {
      totals.planned++;
      continue;
    }
    const ok = await GoogleCalendarService.patchEventSummarySilently(
      supabase,
      r.host_profile_id,
      r.google_event_id as string,
      proposed,
    );
    if (ok) {
      totals.retitled++;
    } else {
      totals.failed++;
      console.error(`         ✗ retitle failed for ${r.uid}`);
    }
  }

  console.log('');
  say('── done ──');
  say(`events in scope     ${rows.length}`);
  if (!google) {
    say(`titles proposed     ${totals.planned}   (live titles not read)`);
  } else if (apply) {
    say(`retitled            ${totals.retitled}`);
    say(`already guest-first ${totals.already}`);
    say(`left alone          ${totals.unrecognised}`);
    say(`gone / unreadable   ${totals.gone}`);
    say(`failed              ${totals.failed}`);
  } else {
    say(`would retitle       ${totals.planned}`);
    say(`already guest-first ${totals.already}`);
    say(`left alone          ${totals.unrecognised}`);
    say(`gone / unreadable   ${totals.gone}`);
  }
  console.log('');

  if (totals.failed > 0) exit(2);
}

// Only run when invoked directly — the pure helpers above are imported by
// __tests__/meetings/calendar-retitle-backfill.test.ts, and importing this
// module must not start a backfill.
const invokedDirectly = argv[1] !== undefined && import.meta.url === pathToFileURL(argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error('✗ fatal:', err);
    exit(1);
  });
}
