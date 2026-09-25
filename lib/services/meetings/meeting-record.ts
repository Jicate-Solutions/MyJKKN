// lib/services/meetings/meeting-record.ts
//
// Everything a finished meeting's record (the downloadable PDF) prints, read
// in one place.
//
// WHY THIS READS THROUGH THE VIEWER'S SESSION CLIENT, never the service role:
// these are the SAME reads app/(routes)/meetings/[uid]/page.tsx makes, so the
// PDF can never show more than the page already shows that person. RLS on
// meeting_bookings decides whether the booking exists for them at all (null →
// the route answers 404), and fn_can_view_meeting_note decides whether the note
// comes with it. A service-role read here would hand the notes to anyone who
// knows — or guesses — a booking uid.
//
// WHAT IS DELIBERATELY NOT READ: meeting_notes.recording_url / audio_url /
// video_url. Those are signed links that play the recording for whoever holds
// them; a PDF gets forwarded, so it must never carry one. Only the transcript
// PAGE link is read, and raw is narrowed to raw->meeting_attendees so nothing
// else in the stored payload can leak into the document.

import type { SupabaseClient } from '@supabase/supabase-js';
import { MeetingActionItemService } from '@/lib/services/meetings/meeting-action-item-service';

export interface MeetingRecordParticipant {
  name: string | null;
  email: string | null;
}

export interface MeetingRecordNote {
  title: string | null;
  summary: string | null;
  transcriptUrl: string | null;
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

/** Fireflies' meeting_attendees, defensive on shape: rows written by other
 *  versions of the ingest may be missing fields, or not be an array at all. */
function parseParticipants(value: unknown): MeetingRecordParticipant[] {
  if (!Array.isArray(value)) return [];
  const out: MeetingRecordParticipant[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const email = text(r.email);
    const name = text(r.displayName) ?? text(r.name);
    if (!email && !name) continue;
    out.push({ name, email });
  }
  return out;
}

/**
 * The record of one meeting, as the viewer is allowed to see it.
 * Returns null when RLS hides the booking (or the uid does not exist) — the
 * caller must not be able to tell those two apart.
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
  if (error) {
    console.error('[meeting-record] booking read failed:', error.message);
    throw new Error('Could not read the meeting.');
  }
  if (!booking) return null;

  const b = booking as Record<string, unknown>;
  const bookingId = b.id as string;

  const [typeRes, noteRes, hostRes, items] = await Promise.all([
    b.meeting_type_id
      ? client.from('meeting_types').select('title').eq('id', b.meeting_type_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    client
      .from('meeting_notes')
      .select('title, summary, transcript_url, duration_minutes, occurred_at, meeting_attendees:raw->meeting_attendees')
      .eq('booking_id', bookingId)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client.from('profiles').select('full_name, email').eq('id', b.host_profile_id as string).maybeSingle(),
    MeetingActionItemService.listForBooking(client, bookingId),
  ]);

  const typeRow = (typeRes.data ?? null) as Record<string, unknown> | null;
  const noteRow = (noteRes.data ?? null) as Record<string, unknown> | null;
  const hostRow = (hostRes.data ?? null) as Record<string, unknown> | null;

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
          transcriptUrl: text(noteRow.transcript_url),
          durationMinutes: typeof noteRow.duration_minutes === 'number' ? noteRow.duration_minutes : null,
          occurredAt: text(noteRow.occurred_at),
          participants: parseParticipants(noteRow.meeting_attendees),
        }
      : null,
    followUps: items.map((i) => ({
      actionText: i.action_text,
      decisionText: text(i.decision_text),
      ownerLabel: text(i.owner_label),
      dueDate: text(i.due_date),
      status: i.status,
    })),
  };
}
