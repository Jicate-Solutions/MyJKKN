/**
 * SF100 meeting requests — NIF (coordinator) side.
 *
 * A team asks to meet a registry mentor/investor OR a free-text person (spec §6,
 * Phase 3). NIF staff approve / decline / schedule from a service-role route gated
 * by `startup_studio.sf100.member.create` — NIF coordinators are NOT team members,
 * so the authenticated RLS path (sf100_can_write_enrollment) never applies to them.
 * On SCHEDULE we materialise a meeting_bookings row hosted by the approver.
 *
 * These run with a SERVICE-ROLE client because sf100_meeting_requests exposes only
 * `sf100_meeting_requests_service_all` to non-members; authorization is enforced
 * UP-FRONT in the API route (queue read + PATCH both require member.create).
 *
 * Node runtime only (service-role client + node:crypto).
 */
import { createServiceRoleClient } from '@/lib/supabase/server';
import { randomUUID } from 'node:crypto';

export type MeetingRequestStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'scheduled'
  | 'cancelled';

export type MeetingRequestAction = 'approve' | 'decline' | 'schedule';

export interface NifMeetingRequest {
  id: string;
  enrollmentId: string;
  teamName: string | null;
  requestedMentorId: string | null;
  requestedName: string | null;
  requestedContact: string | null;
  /** mentor name (registry request) or the free-text requested_name. */
  requestedDisplay: string;
  reason: string;
  status: MeetingRequestStatus;
  declineReason: string | null;
  createdAt: string;
  bookingId: string | null;
}

// Statuses shown on the NIF queue: pending (needs a decision) + approved
// (decided, awaiting a scheduled slot). Order oldest-first so the queue is FIFO.
const QUEUE_STATUSES = ['pending', 'approved'];

// Placeholder for the NOT-NULL meeting_bookings.attendee_email when the requested
// person's contact is a phone number (or missing) rather than an email.
const PLACEHOLDER_EMAIL = 'noemail@sf100.invalid';

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * The NIF pending/approved queue across ALL teams. Enriches each row with the
 * team name (via enrollment → event_registrations) and a display name for the
 * requested person (registry mentor name, else the free-text requested_name).
 */
export async function listPendingForNif(): Promise<NifMeetingRequest[]> {
  const db = createServiceRoleClient();
  const { data } = await db
    .from('sf100_meeting_requests')
    .select(
      `id, enrollment_id, requested_mentor_id, requested_name, requested_contact,
       reason, status, decline_reason, booking_id, created_at,
       enrollment:sf100_enrollments(registration:event_registrations(team_name)),
       mentor:ss_mentors(name)`
    )
    .in('status', QUEUE_STATUSES)
    .order('created_at', { ascending: true });

  return (data ?? []).map((r: any) => ({
    id: r.id,
    enrollmentId: r.enrollment_id,
    teamName: r.enrollment?.registration?.team_name ?? null,
    requestedMentorId: r.requested_mentor_id ?? null,
    requestedName: r.requested_name ?? null,
    requestedContact: r.requested_contact ?? null,
    requestedDisplay: r.mentor?.name || r.requested_name || 'Unknown',
    reason: r.reason,
    status: r.status,
    declineReason: r.decline_reason ?? null,
    createdAt: r.created_at,
    bookingId: r.booking_id ?? null,
  }));
}

export type DecideResult =
  | { ok: true; status: MeetingRequestStatus; bookingId?: string }
  | { ok: false; message: string };

/**
 * NIF decision on a meeting request. Service-role.
 *   approve  — pending → approved (stamps nif_decided_by + decided_at).
 *   decline  — pending|approved → declined (+ decline_reason).
 *   schedule — pending|approved → scheduled: resolve the attendee, INSERT a
 *              meeting_bookings row hosted by the approver, then link booking_id.
 * Guards on the current status so a request is never double-actioned.
 */
export async function decideRequest(input: {
  requestId: string;
  action: MeetingRequestAction;
  actorProfileId: string;
  declineReason?: string;
  startTime?: string;
  endTime?: string;
}): Promise<DecideResult> {
  const db = createServiceRoleClient();

  // Load the request (service-role — NIF is not a team member, so RLS wouldn't
  // surface it on the caller's client).
  const { data: req, error: loadErr } = await db
    .from('sf100_meeting_requests')
    .select('id, status, requested_mentor_id, requested_name, requested_contact')
    .eq('id', input.requestId)
    .maybeSingle();
  if (loadErr) return { ok: false, message: loadErr.message };
  if (!req) return { ok: false, message: 'Meeting request not found' };

  const nowIso = new Date().toISOString();

  // ── approve ────────────────────────────────────────────────────────────────
  if (input.action === 'approve') {
    if (req.status !== 'pending') {
      return {
        ok: false,
        message: `Only a pending request can be approved (current: ${req.status}).`,
      };
    }
    const { error } = await db
      .from('sf100_meeting_requests')
      .update({
        status: 'approved',
        nif_decided_by: input.actorProfileId,
        decided_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', input.requestId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, status: 'approved' };
  }

  // ── decline ──────────────────────────────────────────────────────────────
  if (input.action === 'decline') {
    if (req.status !== 'pending' && req.status !== 'approved') {
      return {
        ok: false,
        message: `This request cannot be declined (current: ${req.status}).`,
      };
    }
    const { error } = await db
      .from('sf100_meeting_requests')
      .update({
        status: 'declined',
        decline_reason: input.declineReason?.trim() || null,
        nif_decided_by: input.actorProfileId,
        decided_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', input.requestId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, status: 'declined' };
  }

  // ── schedule ───────────────────────────────────────────────────────────────
  if (req.status !== 'pending' && req.status !== 'approved') {
    return {
      ok: false,
      message: `This request cannot be scheduled (current: ${req.status}).`,
    };
  }
  if (!input.startTime || !input.endTime) {
    return { ok: false, message: 'startTime and endTime are required to schedule.' };
  }

  // Resolve the attendee (the person NIF is booking the meeting with).
  let attendeeName: string;
  let attendeeEmail: string;
  let attendeePhone: string | null = null;

  if (req.requested_mentor_id) {
    const { data: mentor } = await db
      .from('ss_mentors')
      .select('name, email, phone')
      .eq('id', req.requested_mentor_id)
      .maybeSingle();
    attendeeName = mentor?.name || req.requested_name || 'SF100 contact';
    attendeeEmail = mentor?.email || PLACEHOLDER_EMAIL;
    attendeePhone = mentor?.phone ?? null;
  } else {
    attendeeName = req.requested_name || 'SF100 contact';
    const contact = (req.requested_contact ?? '').trim();
    if (contact && looksLikeEmail(contact)) {
      attendeeEmail = contact;
    } else {
      attendeeEmail = PLACEHOLDER_EMAIL;
      attendeePhone = contact || null;
    }
  }

  const bookingUid = 'sf100mr-' + randomUUID();
  const { data: booking, error: bookErr } = await db
    .from('meeting_bookings')
    .insert({
      uid: bookingUid,
      host_profile_id: input.actorProfileId,
      attendee_name: attendeeName,
      attendee_email: attendeeEmail,
      attendee_phone: attendeePhone,
      start_time: input.startTime,
      end_time: input.endTime,
      status: 'confirmed',
      source: 'sf100_meeting_request',
    })
    .select('id')
    .single();
  if (bookErr) return { ok: false, message: bookErr.message };

  const { error: updErr } = await db
    .from('sf100_meeting_requests')
    .update({
      status: 'scheduled',
      booking_id: booking.id,
      nif_decided_by: input.actorProfileId,
      decided_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', input.requestId);
  if (updErr) return { ok: false, message: updErr.message };

  return { ok: true, status: 'scheduled', bookingId: booking.id };
}
