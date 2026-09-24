// lib/services/hr/interview-booking-service.ts
//
// The interview booking link — the one place its rules live.
//
// A hiring conversation used to arrive as an ordinary meeting and be joined to
// a candidate and a post afterwards, by hand, with "Link an interview" on the
// meeting page. This link asks the post up front, so the booking, the candidate
// and the interview row are written together. The manual path stays for
// meetings booked the ordinary way (#16).
//
// The Director's 16 decisions (16 and 22 Sep 2026) are the spec; #n below cites
// them. Schema: supabase/migrations/20270312090000_interview_booking_link.sql.
//
// CLIENTS. Every write here runs on a SERVICE-ROLE client, because the booker is
// anonymous (the public careers route is the precedent). RLS neither helps nor
// protects on that path, so each function does its own checking — most
// importantly, a candidate id sent by the browser is never trusted on its own.
// getInterviewFlagsForBooking is the exception: it is read on the meeting page
// through the viewer's SESSION client, so RLS decides who sees candidate facts.
//
// WHAT IS NOT STORED. Round, no-show history, "already rejected or hired" and
// "never applied for this post" are derived at read time from rows that already
// exist, so they cannot disagree with the rows they describe.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PublicHostService,
  type PublicHost,
  type PublicMeetingType,
} from '@/lib/services/meetings/public-host-service';
import { POLICY_KEYS } from '@/lib/policies/keys';

// ---------------------------------------------------------------------------
// Sources and the 2-hour change rule (#11)
// ---------------------------------------------------------------------------

/** meeting_bookings.source for a candidate booking themselves through the link. */
export const INTERVIEW_LINK_SOURCE = 'interview-link';
/** meeting_bookings.source for staff booking on a candidate's behalf (#1). */
export const INTERVIEW_LINK_STAFF_SOURCE = 'interview-link-staff';
/** hr_recruitment_candidates.source for a candidate the link created (#4). */
export const INTERVIEW_BOOKING_CANDIDATE_SOURCE = 'interview_booking';

/** Used only when the policy row is missing or unreadable. The row is the authority. */
export const DEFAULT_CHANGE_CUTOFF_MIN = 120;

/**
 * True for a booking made through the interview link, by the candidate or by
 * staff for them. The 2-hour rule keys on this, so it never reaches an ordinary
 * meeting — including one later joined to an interview by hand.
 */
export function isInterviewLinkSource(source: string | null | undefined): boolean {
  return source === INTERVIEW_LINK_SOURCE || source === INTERVIEW_LINK_STAFF_SOURCE;
}

/**
 * True when the interview starts within `cutoffMin` minutes of `now` (or has
 * already started). Inside the window the candidate may no longer move or cancel
 * it themselves; they contact the office (#11). The window is measured from the
 * interview they HOLD, not from the new time they pick — the slot engine's
 * min_notice already governs how soon a new time may be.
 */
export function isInsideChangeCutoff(
  startIso: string,
  cutoffMin: number,
  now: Date = new Date(),
): boolean {
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return true; // unreadable time: refuse rather than allow
  const cutoff = Math.max(0, Number.isFinite(cutoffMin) ? cutoffMin : DEFAULT_CHANGE_CUTOFF_MIN);
  return start - now.getTime() < cutoff * 60_000;
}

/** The message a candidate sees inside the window. One wording, used everywhere. */
export const CHANGE_CUTOFF_MESSAGE =
  'This interview is too close to change online. Please contact the office.';

/**
 * Read with a SERVICE-ROLE client. fn_get_policy is not callable by anon, so a
 * visitor's session would silently get the default and ignore the Director's edit.
 */
export async function getChangeCutoffMin(serviceDb: SupabaseClient): Promise<number> {
  const { data, error } = await serviceDb.rpc('fn_get_policy_int', {
    p_key: POLICY_KEYS.HR_INTERVIEW_BOOKING_CHANGE_CUTOFF_MIN,
    p_default: DEFAULT_CHANGE_CUTOFF_MIN,
    p_scope_id: null,
  });
  if (error || typeof data !== 'number') {
    if (error) console.error('[interview-booking] cutoff policy read failed', error);
    return DEFAULT_CHANGE_CUTOFF_MIN;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Whose calendar (#12)
// ---------------------------------------------------------------------------

export interface InterviewHostSetting {
  handle: string;
  type_slug: string;
}

export interface InterviewHost {
  host: PublicHost;
  meetingType: PublicMeetingType;
}

/**
 * The host and meeting type interviews book onto, from the
 * hr.recruitment.interview_booking.host policy row. Returns null when the
 * setting is missing, the page is not bookable (private, auto-hidden, Google
 * disconnected) or the meeting type does not exist or is hidden — the link then
 * shows "not open yet" instead of a broken form.
 */
export async function resolveInterviewHost(serviceDb: SupabaseClient): Promise<InterviewHost | null> {
  const { data, error } = await serviceDb.rpc('fn_get_policy', {
    p_key: POLICY_KEYS.HR_INTERVIEW_BOOKING_HOST,
    p_scope_id: null,
  });
  if (error) {
    console.error('[interview-booking] host policy read failed', error);
    return null;
  }
  const setting = data as Partial<InterviewHostSetting> | null;
  const handle = typeof setting?.handle === 'string' ? setting.handle.trim() : '';
  const typeSlug = typeof setting?.type_slug === 'string' ? setting.type_slug.trim() : '';
  if (!handle || !typeSlug) return null;

  const host = await PublicHostService.resolveBookableHost(serviceDb, handle);
  if (!host) return null;
  const meetingType = host.meetingTypes.find((t) => t.slug === typeSlug);
  if (!meetingType) return null;
  return { host, meetingType };
}

// ---------------------------------------------------------------------------
// Which posts can be booked
// ---------------------------------------------------------------------------

export interface InterviewPost {
  id: string;
  title: string;
  institutionName: string | null;
}

/** A post row with everything a new candidate record copies from it. */
export interface InterviewPostDetail {
  id: string;
  title: string;
  role_category: string;
  institution_id: string | null;
  hr_organization_id: string;
  status: string;
}

/**
 * Posts a candidate may pick: open and not past their closing date — the same
 * predicate as the public careers board, so the two never disagree about which
 * posts exist.
 */
export async function listInterviewPosts(
  serviceDb: SupabaseClient,
  now: Date = new Date(),
): Promise<InterviewPost[]> {
  const { data, error } = await serviceDb
    .from('hr_recruitment_jobs')
    .select('id, title, institution:institutions(name)')
    .eq('status', 'open')
    .or(`closes_at.is.null,closes_at.gt.${now.toISOString()}`)
    .order('title', { ascending: true })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{ id: string; title: string; institution: { name: string } | null }>).map(
    (r) => ({ id: r.id, title: r.title, institutionName: r.institution?.name ?? null }),
  );
}

/**
 * Re-reads a post the browser named, and refuses one that is no longer open.
 * The id from the form is never trusted to still be bookable.
 */
export async function getBookablePost(
  serviceDb: SupabaseClient,
  jobId: string,
  now: Date = new Date(),
): Promise<InterviewPostDetail | null> {
  const { data, error } = await serviceDb
    .from('hr_recruitment_jobs')
    .select('id, title, role_category, institution_id, hr_organization_id, status, closes_at')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== 'open') return null;
  if (data.closes_at && new Date(data.closes_at as string).getTime() <= now.getTime()) return null;
  return data as InterviewPostDetail;
}

// ---------------------------------------------------------------------------
// Who is booking (#4, #5, #7)
// ---------------------------------------------------------------------------

/** What the server knows about a candidate who shares the booker's email. */
export interface CandidateMatchRow {
  id: string;
  name: string;
  role_title: string;
  status: string;
}

/**
 * What a STRANGER may be shown about those candidates (#7). A shared family
 * email is normal at JKKN, so the form must ask which person this is — but the
 * link is public, and anyone can type any email. Showing full names would turn
 * it into a directory of who applied where. So: a first initial and the post
 * title, and only after the whole form has been submitted.
 */
export interface PublicCandidateMatch {
  id: string;
  label: string;
}

export function toPublicMatches(rows: CandidateMatchRow[]): PublicCandidateMatch[] {
  return rows.map((r) => {
    const initial = (r.name ?? '').trim().charAt(0).toUpperCase();
    const post = (r.role_title ?? '').trim() || 'a post';
    return { id: r.id, label: initial ? `${initial}. — applied for ${post}` : `Applied for ${post}` };
  });
}

export async function findCandidatesByEmail(
  serviceDb: SupabaseClient,
  email: string,
): Promise<CandidateMatchRow[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  // ilike without wildcards is a case-insensitive equality, and the migration's
  // lower(email) index serves it. Escape the two ilike metacharacters so a typed
  // "%" or "_" cannot widen the match to other people's rows.
  const pattern = normalized.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await serviceDb
    .from('hr_recruitment_candidates')
    .select('id, name, role_title, status')
    .ilike('email', pattern)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as CandidateMatchRow[];
}

/** 'new' = a person the office has not seen; 'existing' = one of the matches. */
export type CandidateChoice = { kind: 'new' } | { kind: 'existing'; candidateId: string };

export type CandidateResolution =
  | { ok: true; choice: CandidateChoice }
  /** The email is already on file: ask which person this is before booking anything. */
  | { ok: false; reason: 'needs_choice'; matches: PublicCandidateMatch[] }
  /** The browser named a candidate who does not share this email. */
  | { ok: false; reason: 'invalid_choice' };

/**
 * Settles who is booking BEFORE any booking is made, so a person is never booked
 * and then asked "which of these are you?".
 *
 * Zero matches → a new candidate (#4). One or more → the booker must say which
 * (#7), or that they are someone else; a returning person then books their next
 * round (#5). Asked even for a single match, because with one family email and
 * a second person applying, "same email" is not "same person".
 *
 * A candidate id from the browser is accepted ONLY if that candidate shares the
 * email typed. Without this check a tampered request could attach a booking to
 * any candidate in the system.
 */
export async function resolveCandidateChoice(
  serviceDb: SupabaseClient,
  email: string,
  requested: CandidateChoice | null,
): Promise<CandidateResolution> {
  const matches = await findCandidatesByEmail(serviceDb, email);
  if (matches.length === 0) return { ok: true, choice: { kind: 'new' } };
  if (!requested) return { ok: false, reason: 'needs_choice', matches: toPublicMatches(matches) };
  if (requested.kind === 'new') return { ok: true, choice: requested };
  if (matches.some((m) => m.id === requested.candidateId)) return { ok: true, choice: requested };
  return { ok: false, reason: 'invalid_choice' };
}

// ---------------------------------------------------------------------------
// Writing the candidate and the interview after the booking exists
// ---------------------------------------------------------------------------

/** The form's answers beyond name/email/phone (#2). */
export interface InterviewAnswers {
  currentJob: string;
  payExpectation: string;
  whyThisRole: string;
}

export interface RecordInterviewInput {
  booking: {
    id: string;
    start: string;
    end: string | null;
    videoUrl: string | null;
  };
  /** The meeting host — the Director (#12). Sits on the panel and owns the record. */
  hostProfileId: string;
  /** Who made the booking: the host for a self-booking, the staff member for #1. */
  createdBy: string;
  post: InterviewPostDetail;
  person: { name: string; email: string; phone: string | null };
  answers: InterviewAnswers;
  choice: CandidateChoice;
}

export type RecordInterviewResult =
  | { success: true; candidateId: string; interviewId: string; round: number; createdCandidate: boolean }
  | { success: false; error: string };

/**
 * Called after NativeSchedulingService.createBooking succeeds. Creates the
 * candidate when needed (#4), counts the round (#5), writes the interview row in
 * the same shape "Link an interview" writes (#16), and closes the person's open
 * call-back request for this post (#14).
 *
 * If this fails the booking still stands — the candidate has a time, and the
 * host can join it by hand with "Link an interview". The error is returned so
 * the caller can log it; it is not shown to the candidate.
 */
export async function recordInterviewBooking(
  serviceDb: SupabaseClient,
  input: RecordInterviewInput,
): Promise<RecordInterviewResult> {
  const { booking, post, person, answers } = input;

  let candidateId: string;
  let createdCandidate = false;

  if (input.choice.kind === 'existing') {
    candidateId = input.choice.candidateId;
  } else {
    // Every NOT NULL the careers promotion fills from the job, this fills the
    // same way (RecruitmentService.promoteJobApplication). submitted_by is the
    // host: an anonymous booker has no profile, and the host owns the interview.
    // cvviz_url is left empty — allowed for this source only (migration §2).
    const { data, error } = await serviceDb
      .from('hr_recruitment_candidates')
      .insert({
        hr_organization_id: post.hr_organization_id,
        institution_id: post.institution_id,
        name: person.name,
        email: person.email.trim().toLowerCase(),
        phone: person.phone,
        cvviz_url: null,
        role_category: post.role_category,
        role_title: post.title,
        source: INTERVIEW_BOOKING_CANDIDATE_SOURCE,
        role_specific_details: {
          // job_id here is what the manual Link picker reads to pre-fill the post.
          job_id: post.id,
          booked_via: 'interview_link',
          current_job: answers.currentJob,
          pay_expectation: answers.payExpectation,
          why_this_role: answers.whyThisRole,
        },
        submitted_by: input.hostProfileId,
      })
      .select('id')
      .single();
    if (error || !data) {
      return { success: false, error: `candidate insert failed: ${error?.message ?? 'no row'}` };
    }
    candidateId = data.id as string;
    createdCandidate = true;
  }

  // Counted, not assumed — a returning person is their next round (#5).
  const { count, error: countError } = await serviceDb
    .from('hr_recruitment_interviews')
    .select('id', { count: 'exact', head: true })
    .eq('candidate_id', candidateId);
  if (countError) return { success: false, error: `round count failed: ${countError.message}` };
  const round = (count ?? 0) + 1;

  const durationMinutes = booking.end
    ? Math.round((new Date(booking.end).getTime() - new Date(booking.start).getTime()) / 60000)
    : null;

  const { data: interview, error: interviewError } = await serviceDb
    .from('hr_recruitment_interviews')
    .insert({
      candidate_id: candidateId,
      job_id: post.id,
      booking_id: booking.id,
      round_number: round,
      round_name: `Round ${round} — booked through the interview link`,
      scheduled_at: booking.start,
      ...(durationMinutes && durationMinutes > 0 ? { duration_minutes: durationMinutes } : {}),
      mode: booking.videoUrl ? 'video' : 'in_person',
      location_or_link: booking.videoUrl,
      // NOT NULL with array_length > 0. The host is the panel (#12), which is
      // also what lets them see the row under the panel-member SELECT policy.
      panel_member_ids: [input.hostProfileId],
      status: 'scheduled',
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (interviewError || !interview) {
    return { success: false, error: `interview insert failed: ${interviewError?.message ?? 'no row'}` };
  }

  await closeCallbackRequestsFor(serviceDb, {
    jobId: post.id,
    email: person.email,
    phone: person.phone,
    bookingId: booking.id,
  });

  return { success: true, candidateId, interviewId: interview.id as string, round, createdCandidate };
}

// ---------------------------------------------------------------------------
// Call-back requests (#14)
// ---------------------------------------------------------------------------

export interface CallbackRequestInput {
  post: { id: string; title: string; institution_id: string | null };
  name: string;
  phone: string;
  email: string | null;
}

export async function createCallbackRequest(
  serviceDb: SupabaseClient,
  input: CallbackRequestInput,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const { data, error } = await serviceDb
    .from('hr_interview_callback_requests')
    .insert({
      job_id: input.post.id,
      post_title: input.post.title,
      institution_id: input.post.institution_id,
      name: input.name,
      phone: input.phone,
      email: input.email ? input.email.trim().toLowerCase() : null,
    })
    .select('id')
    .single();
  if (error || !data) return { success: false, error: error?.message ?? 'no row' };
  return { success: true, id: data.id as string };
}

/**
 * The second way a call-back request closes: the person booked this post after
 * all, so the office has nothing left to ring about. Matched on the post AND
 * either the email or the phone. Best-effort — a failure leaves the request open
 * for the office, which is the safe direction.
 */
async function closeCallbackRequestsFor(
  serviceDb: SupabaseClient,
  args: { jobId: string; email: string; phone: string | null; bookingId: string },
): Promise<void> {
  // Two plain .eq() updates, never one .or() filter string. The email and phone
  // are typed by an anonymous visitor, and an .or() string is PostgREST syntax:
  // a crafted value containing a comma could add conditions of its own and close
  // other people's requests.
  const patch = { status: 'done', closed_by_booking_id: args.bookingId, handled_at: new Date().toISOString() };
  const keys: Array<['email' | 'phone', string]> = [['email', args.email.trim().toLowerCase()]];
  const phone = (args.phone ?? '').trim();
  if (phone) keys.push(['phone', phone]);
  for (const [column, value] of keys) {
    const { error } = await serviceDb
      .from('hr_interview_callback_requests')
      .update(patch)
      .eq('job_id', args.jobId)
      .eq('status', 'open')
      .eq(column, value);
    if (error) console.error(`[interview-booking] closing call-back requests by ${column} failed`, error);
  }
}

// ---------------------------------------------------------------------------
// What the meeting page shows (#5, #6, #10, #15)
// ---------------------------------------------------------------------------

export interface InterviewFlags {
  interviewId: string;
  candidateId: string;
  round: number;
  status: string;
  /** Candidate already rejected or hired when this interview was booked (#6). */
  priorOutcome: 'rejected' | 'joined' | null;
  /** Earlier interviews this candidate did not attend, newest first (#10). */
  priorNoShows: Array<{ interviewId: string; scheduledAt: string }>;
  /** The candidate has an application on file for this post (#15). null = no post on the interview. */
  hasApplication: boolean | null;
  /** Booked through the link rather than joined by hand afterwards. */
  bookedViaLink: boolean;
}

/**
 * TWO clients, on purpose.
 *
 * The GATE is the viewer's SESSION client: they must be able to read this
 * interview row under RLS (HR with access, or a panel member). A viewer who
 * cannot gets null and the page shows nothing — never a partial or guessed flag.
 *
 * The FACTS are then read with a SERVICE-ROLE client. Reading them through the
 * session would make RLS lie by omission: a host outside HR cannot read
 * hr_job_applications, so every interview would show "no application for this
 * post"; and earlier interviews on someone else's panel would be invisible, so a
 * no-show would never be reported. Having passed the gate, the viewer is entitled
 * to these facts about THIS candidate.
 */
export async function getInterviewFlagsForBooking(
  sessionDb: SupabaseClient,
  serviceDb: SupabaseClient,
  bookingId: string,
): Promise<InterviewFlags | null> {
  const { data: gate, error: gateError } = await sessionDb
    .from('hr_recruitment_interviews')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (gateError || !gate) return null;

  const { data: row, error } = await serviceDb
    .from('hr_recruitment_interviews')
    .select('id, candidate_id, job_id, round_number, status, created_at, candidate:hr_recruitment_candidates(id, email, status, final_decided_at, role_specific_details)')
    .eq('id', gate.id)
    .maybeSingle();
  if (error || !row) return null;

  const candidate = (row as unknown as {
    candidate: {
      id: string;
      email: string;
      status: string;
      final_decided_at: string | null;
      role_specific_details: Record<string, unknown> | null;
    } | null;
  }).candidate;
  if (!candidate) return null;

  const { data: noShows } = await serviceDb
    .from('hr_recruitment_interviews')
    .select('id, scheduled_at')
    .eq('candidate_id', candidate.id)
    .eq('status', 'no_show')
    .neq('id', row.id)
    .order('scheduled_at', { ascending: false });

  let hasApplication: boolean | null = null;
  if (row.job_id) {
    const { data: apps } = await serviceDb
      .from('hr_job_applications')
      .select('id')
      .eq('job_id', row.job_id)
      .eq('email', (candidate.email ?? '').trim().toLowerCase())
      .limit(1);
    hasApplication = (apps ?? []).length > 0;
  }

  return {
    interviewId: row.id as string,
    candidateId: candidate.id,
    round: row.round_number as number,
    status: row.status as string,
    priorOutcome: priorOutcomeAtBooking(candidate.status, candidate.final_decided_at, row.created_at as string),
    priorNoShows: ((noShows ?? []) as Array<{ id: string; scheduled_at: string }>).map((n) => ({
      interviewId: n.id,
      scheduledAt: n.scheduled_at,
    })),
    hasApplication,
    bookedViaLink: candidate.role_specific_details?.booked_via === 'interview_link',
  };
}

/**
 * #6 warns that the person was ALREADY rejected or hired when this interview
 * was booked. A decision taken after the booking — often because of this very
 * interview — is the interview's outcome, not a warning about it. When no
 * decision time was recorded, the status is shown: a warning that might be
 * stale beats one that is silently missing.
 */
export function priorOutcomeAtBooking(
  status: string,
  decidedAt: string | null,
  interviewCreatedAt: string,
): 'rejected' | 'joined' | null {
  if (status !== 'rejected' && status !== 'joined') return null;
  if (decidedAt && new Date(decidedAt).getTime() > new Date(interviewCreatedAt).getTime()) return null;
  return status;
}
