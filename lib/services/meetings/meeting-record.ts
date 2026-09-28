// lib/services/meetings/meeting-record.ts
//
// Everything a finished meeting's record (the downloadable PDF) prints, read
// in one place.
//
// WHO CAN READ IT. Every read goes through the VIEWER'S SESSION CLIENT, never
// the service role, so the same row rules as /meetings/{uid} decide what comes
// back: RLS on meeting_bookings decides whether the booking exists for them at
// all (null → the route answers 404), fn_can_view_meeting_note decides whether
// the note comes with it, and meeting_note_participants follows its note
// exactly. A service-role read here would hand the notes to anyone who knows —
// or guesses — a booking uid.
//
// WHAT THE PDF SHOWS THAT THE PAGE DOES NOT. The page does not list who was on
// the call; the PDF does, by NAME ONLY (see peopleOf in lib/pdf/meeting-record-pdf.ts).
// Participants come from meeting_note_participants — the display table the
// Fireflies ingest fills — never from meeting_notes.raw, which the schema marks
// "diagnostic only, not rendered to users".
//
// WHAT IS DELIBERATELY NOT READ, because a PDF gets forwarded:
//   • meeting_notes.recording_url / audio_url / video_url — signed links that
//     play the recording for whoever holds them;
//   • meeting_notes.transcript_url — the Fireflies transcript page stays on the
//     meeting page only;
//   • meeting_notes.raw — the stored provider payload.
//
// A FAILED READ IS AN ERROR, NEVER AN EMPTY SECTION. Every query's error is
// checked and thrown, so the route answers 500 instead of printing "No summary
// was recorded" for a meeting that has one.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface MeetingRecordParticipant {
  name: string | null;
  /** Kept only to collapse duplicates; the PDF never prints it. */
  email: string | null;
}

export interface MeetingRecordNote {
  title: string | null;
  summary: string | null;
  durationMinutes: number | null;
  occurredAt: string | null;
  participants: MeetingRecordParticipant[];
}

export interface MeetingRecordFollowUp {
  actionText: string;
  decisionText: string | null;
  ownerLabel: string | null;
  dueDate: string | null;
  status: 'open' | 'done';
}

export interface MeetingRecord {
  uid: string;
  meetingTypeTitle: string | null;
  startTime: string;
  endTime: string;
  status: string;
  attendeeName: string | null;
  attendeeEmail: string | null;
  hostName: string | null;
  hostEmail: string | null;
  note: MeetingRecordNote | null;
  followUps: MeetingRecordFollowUp[];
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** Throw a plain error for a failed read; the route turns it into a 500. */
function check(what: string, error: { message?: string } | null | undefined): void {
  if (error) {
    console.error(`[meeting-record] ${what} read failed:`, error.message);
    throw new Error(`Could not read the ${what}.`);
  }
}

/**
 * The button's rule, repeated server-side: the meeting is over (marked held or
 * no-show, or its end time has passed) AND something was recorded — a linked
 * note or at least one follow-up. Mirrors canDownloadRecord in
 * app/(routes)/meetings/[uid]/page.tsx.
 */
export function isMeetingRecordReady(record: MeetingRecord, now: Date = new Date()): boolean {
  const isPast =
    record.status === 'completed' ||
    record.status === 'no_show' ||
    new Date(record.endTime).getTime() < now.getTime();
  return isPast && (record.note !== null || record.followUps.length > 0);
}

/**
 * The record of one meeting, as the viewer is allowed to see it.
 * Returns null when RLS hides the booking (or the uid does not exist) — the
 * caller must not be able to tell those two apart. Throws when any read fails.
 */
export async function loadMeetingRecord(
  client: SupabaseClient,
  uid: string,
): Promise<MeetingRecord | null> {
  const { data: booking, error } = await client
    .from('meeting_bookings')
    .select('id, uid, status, start_time, end_time, attendee_name, attendee_email, host_profile_id, meeting_type_id')
    .eq('uid', uid)
    .maybeSingle();
  check('meeting', error);
  if (!booking) return null;

  const b = booking as Record<string, unknown>;
  const bookingId = b.id as string;

  const [typeRes, noteRes, hostRes, itemsRes] = await Promise.all([
    b.meeting_type_id
      ? client.from('meeting_types').select('title').eq('id', b.meeting_type_id as string).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client
      .from('meeting_notes')
      .select('id, title, summary, duration_minutes, occurred_at')
      .eq('booking_id', bookingId)
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    client.from('profiles').select('full_name, email').eq('id', b.host_profile_id as string).maybeSingle(),
    // Read here rather than through MeetingActionItemService.listForBooking,
    // which answers [] on a failed read — that would print "None recorded".
    // Same order as that service: open before done, then by due date.
    client
      .from('meeting_action_items')
      .select('action_text, decision_text, owner_label, due_date, status')
      .eq('booking_id', bookingId)
      .order('status', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
  ]);
  check('meeting type', typeRes.error);
  check('meeting note', noteRes.error);
  check('host', hostRes.error);
  check('follow-ups', itemsRes.error);

  const typeRow = (typeRes.data ?? null) as Record<string, unknown> | null;
  const noteRow = (noteRes.data ?? null) as Record<string, unknown> | null;
  const hostRow = (hostRes.data ?? null) as Record<string, unknown> | null;
  const itemRows = (itemsRes.data ?? []) as Array<Record<string, unknown>>;

  let participants: MeetingRecordParticipant[] = [];
  if (noteRow) {
    const { data: rows, error: pErr } = await client
      .from('meeting_note_participants')
      .select('display_name, email')
      .eq('note_id', noteRow.id as string)
      .order('display_name', { ascending: true, nullsFirst: false })
      .order('email', { ascending: true });
    check('participants', pErr);
    participants = ((rows ?? []) as Array<Record<string, unknown>>)
      .map((r) => ({ name: text(r.display_name), email: text(r.email) }))
      .filter((p) => p.name || p.email);
  }

  return {
    uid: b.uid as string,
    meetingTypeTitle: text(typeRow?.title),
    startTime: b.start_time as string,
    endTime: b.end_time as string,
    status: (b.status as string) ?? 'confirmed',
    attendeeName: text(b.attendee_name),
    attendeeEmail: text(b.attendee_email),
    hostName: text(hostRow?.full_name),
    hostEmail: text(hostRow?.email),
    note: noteRow
      ? {
          title: text(noteRow.title),
          summary: text(noteRow.summary),
          durationMinutes: typeof noteRow.duration_minutes === 'number' ? noteRow.duration_minutes : null,
          occurredAt: text(noteRow.occurred_at),
          participants,
        }
      : null,
    // Every row, none dropped: the route's gate counts these, and so does the page.
    followUps: itemRows.map((i) => ({
      actionText: typeof i.action_text === 'string' ? i.action_text : '',
      decisionText: text(i.decision_text),
      ownerLabel: text(i.owner_label),
      dueDate: text(i.due_date),
      status: i.status === 'done' ? 'done' : 'open',
    })),
  };
}
