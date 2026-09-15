// app/api/meetings/notes/ingest/route.ts
//
// GET /api/meetings/notes/ingest — pull recent Fireflies transcripts into
// `meeting_notes`. Intended for a scheduled call; safe to run by hand.
//
// ── AUTH ────────────────────────────────────────────────────────────────────
// Vercel cron's `Authorization: Bearer $CRON_SECRET`, or a manual trigger with
// the Fireflies key itself in `x-api-token` — the same shape as
// app/api/admission/calls/sync/route.ts, compared with timingSafeEqual so the
// comparison does not leak the token a character at a time.
//
// ── MATCHING — THE PART THAT MATTERS ────────────────────────────────────────
// A transcript is attached to a meeting ONLY when Fireflies' `calendar_id`
// equals a `meeting_bookings.google_event_id` EXACTLY. That is one identifier
// matching one identifier.
//
// Nothing else attaches. Not "started within ten minutes of", not "same host",
// not "the attendee lists overlap". Those heuristics are why this rule is
// written down: a wrong match staples one private conversation onto somebody
// else's meeting, and every person who can see that meeting can then read it.
// An unmatched note costs somebody two clicks. A mis-matched note cannot be
// un-read. If a future change makes the unmatched list feel too long, the
// answer is to put the calendar id on more bookings, NOT to guess.
//
// An id that matches more than one booking is also left UNMATCHED and reported,
// because "which of these two" is exactly the question a human must answer.
//
// ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
// Upsert onto `uq_meeting_notes_provider_ref (provider, provider_ref)`. Running
// this twice updates the same rows; it never writes a second copy. A note a
// human has already LINKED keeps its link — the upsert never writes
// `booking_id`, so re-running cannot undo somebody's work.
//
// ── CONFIGURATION ───────────────────────────────────────────────────────────
//   FIREFLIES_API_KEY  — required; absent means 503 with a plain sentence
//   CRON_SECRET        — optional; enables the Vercel cron trigger
//
// ── SCHEDULE ────────────────────────────────────────────────────────────────
// vercel.json runs this at :23 and :53. Note the path carries NO `?secret=`,
// unlike its 68 siblings: this route reads the cron secret from the
// Authorization header Vercel sends on its own, and the AUTH note above is
// explicit that a token must never travel in a URL.

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import {
  fetchRecentFirefliesTranscripts,
  isFirefliesConfigured,
  type FirefliesTranscript,
} from '@/lib/services/meetings/fireflies-client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export const dynamic = 'force-dynamic';

const MODULE = 'meetings/notes-ingest';

function safeEqual(candidate: string, expected: string): boolean {
  if (!candidate || candidate.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
  } catch {
    return false;
  }
}

function verifyAuth(request: NextRequest): boolean {
  const cronSecret = (process.env.CRON_SECRET ?? '').trim();
  if (cronSecret) {
    const header = request.headers.get('authorization') ?? '';
    if (safeEqual(header, `Bearer ${cronSecret}`)) return true;
  }

  const apiKey = (process.env.FIREFLIES_API_KEY ?? '').trim();
  if (!apiKey) return false;

  // Header only — never a query parameter. A token in the URL lands in every
  // access log and proxy along the way.
  const supplied = request.headers.get('x-api-token') ?? '';
  return safeEqual(supplied, apiKey);
}

/**
 * The ONE match rule: exact calendar id, exactly one booking.
 *
 * Returns the booking id, or null for "leave it unmatched" — which covers a
 * transcript with no calendar id, an id nothing holds, and an id more than one
 * booking holds.
 */
async function resolveBookingId(
  supabase: ReturnType<typeof createServiceRoleClient>,
  calendarId: string | null,
): Promise<{ bookingId: string | null; ambiguous: boolean }> {
  if (!calendarId) return { bookingId: null, ambiguous: false };

  const { data, error } = await supabase
    .from('meeting_bookings')
    .select('id')
    .eq('google_event_id', calendarId)
    .limit(2);

  if (error) {
    logger.warn(MODULE, 'Could not look up a booking by calendar id', {
      calendarId,
      error: error.message,
    });
    return { bookingId: null, ambiguous: false };
  }

  if (!data || data.length === 0) return { bookingId: null, ambiguous: false };
  if (data.length > 1) return { bookingId: null, ambiguous: true };
  return { bookingId: data[0].id, ambiguous: false };
}

// ── FROM A TRANSCRIPT TO SOMEBODY'S TASK LIST ────────────────────────────────
//
// Fireflies returns `action_items` as ONE string, shaped like this:
//
//     **Maheswaran T**
//     Prepare to join JKKN within one to two months if appointed (18:18)
//
//     **Ommsharravana, Director, JKKN Institutions**
//     Follow-up with Principal regarding the appointment in two days (19:00)
//
// A bold line names the person; the plain lines under it are that person's
// follow-ups until the next bold line.
const OWNER_LINE = /^\*\*(.+?)\*\*:?\s*$/;
// A trailing "(19:00)" locates the moment in the recording. Useful while
// reading the transcript, noise in a task list — the note already links to the
// full recording, so it comes off here.
const TRAILING_TIMESTAMP = /\s*\(\d{1,2}:\d{2}(?::\d{2})?\)\s*$/;
const MAX_ACTION_TEXT = 500;

interface ParsedAction {
  ownerName: string | null;
  text: string;
}

function parseActionItems(raw: string | null): ParsedAction[] {
  if (!raw) return [];
  const out: ParsedAction[] = [];
  let owner: string | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const ownerMatch = OWNER_LINE.exec(trimmed);
    if (ownerMatch) {
      owner = ownerMatch[1].trim() || null;
      continue;
    }

    // Some meetings come back as a flat list with no speaker headings at all.
    // Those are real follow-ups with an unknown owner, not junk — keep them,
    // with a null owner, rather than dropping work on the floor.
    const text = trimmed
      .replace(/^[-*•]\s*/, '')
      .replace(TRAILING_TIMESTAMP, '')
      .trim();
    if (!text) continue;
    out.push({ ownerName: owner, text: text.slice(0, MAX_ACTION_TEXT) });
  }
  return out;
}

// Titles carry no identity and differ between systems: Fireflies heard
// "Maheswaran T" while the calendar invite said "Prof. Dr. T. Maheswaran".
const NAME_NOISE = new Set(['dr', 'prof', 'mr', 'mrs', 'ms', 'miss', 'shri', 'smt', 'the']);

function nameTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !NAME_NOISE.has(t));
}

/**
 * Which real person does a name in the transcript belong to?
 *
 * NEVER a guess, and never a near-miss. A candidate is accepted only when a
 * DISTINCTIVE token (4+ characters — enough to exclude initials and "the") is
 * shared, and only when EXACTLY ONE person in the meeting qualifies. Two
 * plausible people means nobody is chosen.
 *
 * The cost of being wrong is not a cosmetic one: it puts one person's
 * commitment on another person's list, and the other person never learns they
 * owed something. An unmatched owner costs a label that reads exactly as
 * Fireflies heard it, which a human can correct in one click.
 */
function resolveOwnerProfileId(
  ownerName: string | null,
  people: Array<{ profileId: string | null; names: string[] }>,
): string | null {
  const wanted = nameTokens(ownerName).filter((t) => t.length >= 4);
  if (wanted.length === 0) return null;

  const hits = people.filter((person) => {
    if (!person.profileId) return false;
    const theirs = new Set(person.names.flatMap(nameTokens).filter((t) => t.length >= 4));
    return wanted.some((t) => theirs.has(t));
  });

  return hits.length === 1 ? hits[0].profileId : null;
}

async function storeTranscript(
  supabase: ReturnType<typeof createServiceRoleClient>,
  transcript: FirefliesTranscript,
  bookingId: string | null,
): Promise<'stored' | 'failed'> {
  // `booking_id` is written ONLY on the first insert. On a re-run the row
  // already exists, and overwriting it would silently undo a human's link (or
  // re-attach a note they deliberately detached).
  const { data: existing, error: readError } = await supabase
    .from('meeting_notes')
    .select('id')
    .eq('provider', 'fireflies')
    .eq('provider_ref', transcript.id)
    .maybeSingle();

  if (readError) {
    logger.error(MODULE, 'Could not read an existing note', {
      providerRef: transcript.id,
      error: readError.message,
    });
    return 'failed';
  }

  const common = {
    title: transcript.title,
    summary: transcript.summary,
    transcript_url: transcript.transcriptUrl,
    recording_url: transcript.recordingUrl,
    occurred_at: transcript.occurredAt,
    duration_minutes: transcript.durationMinutes,
    raw: transcript.raw as never,
    updated_at: new Date().toISOString(),
  };

  let noteId: string | null = existing?.id ?? null;

  if (noteId) {
    const { error } = await supabase.from('meeting_notes').update(common).eq('id', noteId);
    if (error) {
      logger.error(MODULE, 'Could not update a note', {
        providerRef: transcript.id,
        error: error.message,
      });
      return 'failed';
    }
  } else {
    const { data, error } = await supabase
      .from('meeting_notes')
      .insert({
        provider: 'fireflies',
        provider_ref: transcript.id,
        booking_id: bookingId,
        ...common,
      })
      .select('id')
      .single();

    if (error) {
      logger.error(MODULE, 'Could not insert a note', {
        providerRef: transcript.id,
        error: error.message,
      });
      return 'failed';
    }
    noteId = data.id;
  }

  if (noteId && transcript.participants.length > 0) {
    const { error } = await supabase.from('meeting_note_participants').upsert(
      transcript.participants.map((p) => ({
        note_id: noteId as string,
        email: p.email,
        display_name: p.displayName,
      })),
      { onConflict: 'note_id,email' },
    );
    // A participant list is display detail. Losing it must not cost us the
    // note, so this is reported and not treated as a failed transcript.
    if (error) {
      logger.warn(MODULE, 'Stored the note but not its participants', {
        providerRef: transcript.id,
        error: error.message,
      });
    }
  }

  if (noteId && bookingId) {
    await applyNoteToBooking(supabase, noteId, bookingId, transcript);
  }

  return 'stored';
}

/**
 * Turn a matched note into the things a person can act on.
 *
 * Runs ONCE per note, guarded by meeting_notes.action_items_applied_at. The
 * ingest is scheduled every half hour and re-reads the same transcripts on
 * purpose; without the guard each tick would add another copy of the same
 * follow-ups, and a task somebody deleted would reappear within thirty minutes.
 * After the stamp is set the machine never touches these rows again — they
 * belong to whoever edits them next.
 *
 * Nothing here can fail the ingest. A note that is stored but whose follow-ups
 * could not be applied is a smaller problem than a transcript we did not keep,
 * and the stamp is only written when the work actually succeeded, so the next
 * run retries it.
 */
async function applyNoteToBooking(
  supabase: ReturnType<typeof createServiceRoleClient>,
  noteId: string,
  bookingId: string,
  transcript: FirefliesTranscript,
): Promise<void> {
  const { data: note } = await supabase
    .from('meeting_notes')
    .select('action_items_applied_at')
    .eq('id', noteId)
    .maybeSingle();

  if (!note || note.action_items_applied_at) return;

  // ── who was in the room, as real people ────────────────────────────────────
  // Matching is on EMAIL, which is exact, never on a name, which is not.
  // Fireflies attributes a follow-up to a display name; the participant list
  // maps that name to an address; the address identifies the person. The name
  // is only ever used to choose BETWEEN the people who were actually present.
  const emails = transcript.participants.map((x) => x.email).filter(Boolean);
  const people: Array<{ profileId: string | null; names: string[]; email: string }> = [];

  if (emails.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('email', emails);

    const byEmail = new Map(
      ((profiles ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>)
        .filter((r) => r.email)
        .map((r) => [r.email!.toLowerCase(), r]),
    );

    for (const p of transcript.participants) {
      const profile = byEmail.get(p.email);
      people.push({
        profileId: profile?.id ?? null,
        names: [p.displayName, profile?.full_name ?? null].filter(Boolean) as string[],
        email: p.email,
      });
    }

    // Fill in the participant rows' profile_id, which the ingest has always
    // left null. Best-effort: a name on a card is worth less than the note.
    for (const person of people) {
      if (!person.profileId) continue;
      await supabase
        .from('meeting_note_participants')
        .update({ profile_id: person.profileId })
        .eq('note_id', noteId)
        .eq('email', person.email);
    }
  }

  // ── the follow-ups, as tasks on the meeting ───────────────────────────────
  const actions = parseActionItems(transcript.actionItemsRaw);
  let applied = true;

  if (actions.length > 0) {
    const { data: booking } = await supabase
      .from('meeting_bookings')
      .select('host_profile_id')
      .eq('id', bookingId)
      .maybeSingle();

    const hostProfileId = (booking as { host_profile_id: string | null } | null)?.host_profile_id;

    // host_profile_id is NOT NULL on meeting_action_items and is who the task
    // hangs off. Without a host there is nothing to attach to, so the follow-ups
    // wait rather than being written somewhere arbitrary.
    if (hostProfileId) {
      const rows = actions.map((a) => ({
        booking_id: bookingId,
        host_profile_id: hostProfileId,
        action_text: a.text,
        decision_text: null,
        owner_label: a.ownerName,
        owner_profile_id: resolveOwnerProfileId(a.ownerName, people),
        status: 'open' as const,
      }));

      const { error } = await supabase.from('meeting_action_items').insert(rows);
      if (error) {
        applied = false;
        logger.warn(MODULE, 'Stored the note but could not create its follow-ups', {
          noteId,
          error: error.message,
        });
      }
    } else {
      applied = false;
      logger.warn(MODULE, 'A matched booking has no host, so follow-ups were not created', {
        noteId,
        bookingId,
      });
    }
  }

  // ── the interview record, when this meeting is one ────────────────────────
  // Only ever FILLS IN a blank. A person who has written their own outcome has
  // said something the machine has not, and overwriting it would delete the
  // more valuable of the two.
  const { data: interview } = await supabase
    .from('hr_recruitment_interviews')
    .select('id, outcome_summary, duration_minutes')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (interview) {
    const patch: Record<string, unknown> = {};
    const row = interview as { outcome_summary: string | null; duration_minutes: number | null };
    if (!row.outcome_summary && transcript.summary) patch.outcome_summary = transcript.summary;
    if (row.duration_minutes == null && transcript.durationMinutes != null) {
      patch.duration_minutes = transcript.durationMinutes;
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase
        .from('hr_recruitment_interviews')
        .update(patch)
        .eq('id', (interview as { id: string }).id);
      if (error) {
        logger.warn(MODULE, 'Could not write the transcript into its interview record', {
          noteId,
          error: error.message,
        });
      }
    }
  }

  if (applied) {
    await supabase
      .from('meeting_notes')
      .update({ action_items_applied_at: new Date().toISOString() })
      .eq('id', noteId);
  }
}

export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isFirefliesConfigured()) {
    return NextResponse.json(
      {
        error: 'not_connected',
        message:
          'Fireflies is not connected yet. Add a FIREFLIES_API_KEY and meeting notes will start arriving.',
      },
      { status: 503 },
    );
  }

  const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '25');
  // `skip` pages BACKWARDS through the provider's history. Without it this
  // endpoint can only ever see the newest page, so everything older than that
  // is unreachable — 1,533 of 1,583 transcripts on the day this was added.
  // The scheduled call never passes it (it only needs what is new); a one-off
  // backfill walks it up by hand. The upsert is keyed on (provider,
  // provider_ref), so overlapping pages re-write the same rows rather than
  // duplicating them, and a page that is walked twice costs nothing.
  const skipParam = Number(request.nextUrl.searchParams.get('skip') ?? '0');
  const result = await fetchRecentFirefliesTranscripts({
    limit: Number.isFinite(limitParam) ? limitParam : 25,
    skip: Number.isFinite(skipParam) ? skipParam : 0,
  });

  if (!result.ok) {
    // 503 for "not connected" (nothing is wrong, nothing is switched on);
    // 502 for a provider that answered badly or not at all.
    const status = result.reason === 'not_connected' ? 503 : 502;
    logger.warn(MODULE, 'Fireflies fetch did not succeed', {
      reason: result.reason,
      message: result.message,
    });
    return NextResponse.json({ error: result.reason, message: result.message }, { status });
  }

  const supabase = createServiceRoleClient();

  let stored = 0;
  let failed = 0;
  let matched = 0;
  let unmatched = 0;
  let ambiguousCalendarIds = 0;

  for (const transcript of result.data) {
    const { bookingId, ambiguous } = await resolveBookingId(supabase, transcript.calendarId);
    if (ambiguous) ambiguousCalendarIds += 1;

    const outcome = await storeTranscript(supabase, transcript, bookingId);
    if (outcome === 'failed') {
      failed += 1;
      continue;
    }
    stored += 1;
    if (bookingId) matched += 1;
    else unmatched += 1;
  }

  logger.warn(MODULE, 'Fireflies ingest finished', {
    fetched: result.data.length,
    stored,
    failed,
    matched,
    unmatched,
    ambiguousCalendarIds,
  });

  return NextResponse.json({
    ok: true,
    fetched: result.data.length,
    stored,
    failed,
    matched,
    unmatched,
    // Named separately because it is the one number that means "a human must
    // look": two bookings claim the same calendar event.
    ambiguousCalendarIds,
  });
}
