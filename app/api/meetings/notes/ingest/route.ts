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

  return 'stored';
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
  const result = await fetchRecentFirefliesTranscripts({
    limit: Number.isFinite(limitParam) ? limitParam : 25,
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
