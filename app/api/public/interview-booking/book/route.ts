// app/api/public/interview-booking/book/route.ts
// POST — book an interview through the shared link (/book-interview, #3).
// PUBLIC (no auth): a candidate books themselves, or a member of staff books
// on a candidate's behalf (#1).
//
// Gate order is the /meet book route's (app/api/public/meet/[handle]/[typeSlug]/
// book/route.ts): rate limit → body → honeypot → validation → host → post →
// identity → who-is-this → createBooking. Everything that can refuse runs
// BEFORE createBooking, so a refused request never leaves a meeting behind.
//
// The host and meeting type come from the policy setting (#12), never from the
// request. The post id from the form is re-read and refused if it has closed.
// A candidate id from the form is accepted only if it shares the typed email
// (resolveCandidateChoice) — the service owns that rule.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { NativeSchedulingService } from '@/lib/services/meetings/native-scheduling-service';
import { BookingIdentityService } from '@/lib/services/meetings/booking-identity-service';
import {
  INTERVIEW_LINK_SOURCE,
  INTERVIEW_LINK_STAFF_SOURCE,
  getBookablePost,
  recordInterviewBooking,
  resolveCandidateChoice,
  resolveInterviewHost,
  type CandidateChoice,
} from '@/lib/services/hr/interview-booking-service';
import { loadActiveStaffBooker } from './active-staff';

export const dynamic = 'force-dynamic';

// The /meet route's limit, kept — not a new barrier (#8). Without it the
// account probe inside BookingIdentityService and the "which of these is you?"
// answer (#7) become an unlimited lookup of who has a MyJKKN account and who
// has applied here. Active staff are exempt (#1): an office booking several
// candidates from one IP must not be locked out after the fifth.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// "*" and "%" are refused: the address is matched with a PostgREST ilike, where
// "*" is a wildcard that cannot be escaped (review finding, 2026-09-24).
const EMAIL_RE = /^[^\s@*%]+@[^\s@*%]+\.[^\s@*%]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WHY_MIN = 20;
const WHY_MAX = 2000;
const LOGIN_URL = `/auth/login?redirectedFrom=${encodeURIComponent('/book-interview')}`;

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * The booker's answer to "which of these is you?" (#7). Absent or unreadable
 * means "not answered yet", which asks again rather than guessing.
 */
function parseChoice(raw: unknown): CandidateChoice | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as { kind?: unknown; candidateId?: unknown };
  if (c.kind === 'new') return { kind: 'new' };
  if (c.kind === 'existing' && typeof c.candidateId === 'string' && c.candidateId) {
    return { kind: 'existing', candidateId: c.candidateId };
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const staff = await loadActiveStaffBooker(supabase);
    if (!staff) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      if (!checkRateLimit(ip)) {
        return NextResponse.json(
          { error: 'Too many booking attempts. Please try again later.' },
          { status: 429 },
        );
      }
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    if (body.honeypot) {
      // Spam bot — pretend success without creating anything.
      return NextResponse.json({ success: true, uid: null });
    }

    const start = typeof body.start === 'string' ? body.start : '';
    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
    const name = str(body.name, 200);
    const email = str(body.email, 254);
    const phone = str(body.phone, 20);
    const currentJob = str(body.currentJob, 200);
    const payExpectation = str(body.payExpectation, 100);
    // Trimmed first, then measured: twenty spaces are not an answer.
    const whyThisRole = typeof body.whyThisRole === 'string' ? body.whyThisRole.trim() : '';

    const startDate = new Date(start);
    if (!start || Number.isNaN(startDate.getTime()) || startDate.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Please pick an interview time.' }, { status: 400 });
    }
    if (!UUID_RE.test(jobId)) {
      return NextResponse.json({ error: 'Please choose the post.' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }
    // Required, unlike /meet: the office rings this number if the time has to
    // change, and a call-back request (#14) is only as good as it.
    if (!phone) {
      return NextResponse.json({ error: 'A phone number is required.' }, { status: 400 });
    }
    if (whyThisRole.length < WHY_MIN || whyThisRole.length > WHY_MAX) {
      return NextResponse.json(
        { error: `Please say why you want this role in ${WHY_MIN} to ${WHY_MAX} characters.` },
        { status: 400 },
      );
    }

    const interviewHost = await resolveInterviewHost(supabase);
    if (!interviewHost) {
      return NextResponse.json({ error: 'not_open' }, { status: 404 });
    }
    const { host, meetingType } = interviewHost;

    const post = await getBookablePost(supabase, jobId);
    if (!post) {
      return NextResponse.json({ error: 'post_closed' }, { status: 409 });
    }

    // Who is this booking for?
    //
    // Staff mode (#1): BookingIdentityService is NOT called — it would see the
    // staff member's session and book the staff member instead of the
    // candidate they typed in. The candidate is a guest; the staff member is
    // who created the interview.
    let attendeeName = name;
    let attendeeEmail = email;
    let attendeeProfileId: string | null = null;
    let source = INTERVIEW_LINK_SOURCE;
    let createdBy = host.hostProfileId;

    if (staff) {
      source = INTERVIEW_LINK_STAFF_SOURCE;
      createdBy = staff.profileId;
    } else {
      const identity = await BookingIdentityService.resolve(supabase, email);
      if (identity.kind === 'login_required') {
        return NextResponse.json(
          { error: 'login_required', reason: identity.reason, loginUrl: LOGIN_URL },
          { status: 403 },
        );
      }
      if (identity.kind === 'authenticated') {
        attendeeName = identity.name;
        attendeeEmail = identity.email;
        attendeeProfileId = identity.profileId;
      }
    }

    // Settled BEFORE booking, so nobody is booked and then asked who they are
    // (#4, #5, #7). Nothing below this line runs on either refusal.
    const resolution = await resolveCandidateChoice(supabase, attendeeEmail, parseChoice(body.candidateChoice));
    if (resolution.ok === false) {
      if (resolution.reason === 'needs_choice') {
        return NextResponse.json({ error: 'needs_choice', matches: resolution.matches }, { status: 409 });
      }
      return NextResponse.json({ error: 'invalid_choice' }, { status: 400 });
    }

    const booking = await NativeSchedulingService.createBooking(supabase, {
      meetingTypeId: meetingType.id,
      start,
      attendeeName,
      attendeeEmail,
      attendeePhone: phone,
      attendeeProfileId,
      answers: {
        // `note` is load-bearing: the Google Calendar event title and body read
        // answers.note. No recording notice anywhere (#9).
        note: `Interview — ${post.title}`,
        post: post.title,
        current_job: currentJob,
        pay_expectation: payExpectation,
        why_this_role: whyThisRole,
      },
      source,
    });
    // `=== false`, not `!booking.success`: strictNullChecks is off repo-wide.
    if (booking.success === false) {
      if (booking.error === 'SLOT_TAKEN' || booking.error === 'INVALID_SLOT') {
        return NextResponse.json({ error: 'slot_taken' }, { status: 409 });
      }
      if (booking.error === 'VENUE_TAKEN') {
        return NextResponse.json({ error: 'venue_taken' }, { status: 409 });
      }
      if (booking.error === 'NOT_FOUND') {
        return NextResponse.json({ error: 'not_open' }, { status: 404 });
      }
      return NextResponse.json(
        { error: 'Could not complete the booking. Please try again.' },
        { status: 500 },
      );
    }

    const { data: bookingRow } = await (supabase as any)
      .from('meeting_bookings')
      .select('id, end_time, video_url')
      .eq('uid', booking.uid)
      .maybeSingle();
    const vu = String((bookingRow?.video_url as string | null) ?? '').trim();
    const videoUrl = /^https?:\/\//i.test(vu) ? vu : null;

    // The booking stands whatever happens next (#16): the candidate has a time,
    // and the host can join it to the candidate by hand with "Link an
    // interview". So a failure here is logged with the uid, never shown.
    const logUnrecorded = (why: unknown) =>
      console.error(
        `[public/interview-booking/book] booking ${booking.uid} made but the interview was not recorded — link it by hand:`,
        why,
      );
    if (bookingRow?.id) {
      try {
        const recorded = await recordInterviewBooking(supabase, {
          booking: {
            id: bookingRow.id as string,
            start: booking.start,
            end: (bookingRow.end_time as string | null) ?? booking.end ?? null,
            videoUrl,
          },
          locationMode: meetingType.locationMode,
          hostProfileId: host.hostProfileId,
          createdBy,
          post,
          person: { name: attendeeName, email: attendeeEmail, phone },
          answers: { currentJob, payExpectation, whyThisRole },
          choice: resolution.choice,
        });
        if (recorded.success === false) logUnrecorded(recorded.error);
      } catch (err) {
        logUnrecorded(err);
      }
    } else {
      logUnrecorded('the booking row could not be read back');
    }

    return NextResponse.json({
      success: true,
      uid: booking.uid,
      start: booking.start,
      hostName: host.name,
      videoUrl,
    });
  } catch (err) {
    console.error('[public/interview-booking/book] failed:', err);
    return NextResponse.json(
      { error: 'Could not complete the booking. Please try again.' },
      { status: 500 },
    );
  }
}
