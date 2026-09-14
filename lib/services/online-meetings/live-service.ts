/**
 * Online Meetings — the live session core.
 *
 * WHY THESE ARE PLAIN FUNCTIONS TAKING A CLIENT
 *   Every other service in this module extends BaseService and lets the
 *   AsyncLocalStorage override hand it the right client. These cannot: they
 *   are called from two front doors with two different identities.
 *
 *     /api/online-meetings/live/*         — withAuth, the caller's own
 *                                           RLS-carrying client
 *     /api/public/online-meetings/live/*  — service role, identity proven by
 *                                           a join token
 *
 *   A guest is `anon`, and anon is REVOKED on every table in this module, so
 *   the guest path has no other way in. The alternative — internals writing
 *   through RLS from the browser and guests through an API — means the live
 *   path is implemented twice and the two drift. So identity resolution
 *   happens in the route, and everything below takes an already-resolved
 *   `participantId` and never asks who the caller is.
 *
 *   The consequence to respect: on the service-role path RLS is OFF. The route
 *   MUST have validated the token against this meeting before calling in here.
 *   `resolveParticipantByToken` is the only function that accepts a raw token,
 *   and it is deliberately the narrowest thing in the file.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  evaluateMeetingGates,
  resolveMeetingConfig,
  type EngagementSignals,
} from '@/lib/services/live-engine/engagement-gates';
import {
  diffMinutes,
  isoToIstHHMM,
  withinJoinWindow,
} from '@/lib/services/live-engine/time-window';
import { getErrorMessage } from '@/lib/utils';
import { logger } from '@/lib/utils/enhanced-logger';

import { effectiveMeetingStatus } from './meeting-service';
import {
  EMPTY_QUIZ,
  type LiveMeetingData,
  type MeetingPoll,
  type MeetingQuiz,
  type MeetingStatus,
  type ParticipantKind,
} from './types';
import type { ServiceResult } from './meeting-service';

const LOG_SCOPE = 'online-meetings/live';

/** Anything, typed loosely — these run against both client flavours. */
type Db = SupabaseClient<any, any, any> | any;

export interface ResolvedParticipant {
  participantId: string;
  meetingId: string;
  institutionId: string;
  kind: ParticipantKind;
  displayName: string;
}

function coerceQuiz(raw: unknown): MeetingQuiz {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_QUIZ };
  const q = raw as Partial<MeetingQuiz>;
  return {
    questions: Array.isArray(q.questions) ? q.questions : [],
    pass_threshold:
      typeof q.pass_threshold === 'number' ? q.pass_threshold : EMPTY_QUIZ.pass_threshold,
  };
}

// ---------------------------------------------------------------------------
// Identity resolution — the two front doors
// ---------------------------------------------------------------------------

/**
 * Resolve a join token to exactly one participant of exactly one meeting.
 *
 * THE SECURITY BOUNDARY OF THE GUEST PATH. Everything a guest can do is scoped
 * by what this returns. It deliberately refuses more than it needs to:
 *
 *   - an unknown token is refused (not "treated as a new guest")
 *   - a token that belongs to another meeting is refused even if valid
 *   - a cancelled meeting is refused
 *   - a meeting outside its join window plus the async quiz window is refused,
 *     so a leaked link stops working rather than remaining a standing
 *     unauthenticated write endpoint on a service-role route
 *
 * `expectedMeetingId` is optional because the guest page resolves the meeting
 * FROM the token; pass it on every subsequent write, where the client has
 * already told you which meeting it thinks it is in.
 */
export async function resolveParticipantByToken(
  db: Db,
  token: string,
  expectedMeetingId?: string,
): Promise<ServiceResult<ResolvedParticipant>> {
  if (!token || typeof token !== 'string') {
    return { ok: false, error: 'This invitation link is not valid.' };
  }

  const { data, error } = await db
    .from('online_meeting_participants')
    .select(
      'id, meeting_id, institution_id, participant_kind, external_name, profile_id, ' +
        'online_meetings!inner(id, status, starts_at, ends_at, engagement_config)',
    )
    .eq('join_token', token)
    .maybeSingle();

  if (error) {
    logger.error(LOG_SCOPE, 'token resolve failed', error);
    return { ok: false, error: 'This invitation link could not be checked.' };
  }
  if (!data) {
    // One message for every failure mode. Distinguishing "no such token" from
    // "expired" would confirm which tokens are real.
    return { ok: false, error: 'This invitation link is not valid or has expired.' };
  }
  if (expectedMeetingId && data.meeting_id !== expectedMeetingId) {
    return { ok: false, error: 'This invitation link is not valid or has expired.' };
  }

  const meeting = (data as any).online_meetings;
  if (!meeting || meeting.status === 'cancelled') {
    return { ok: false, error: 'This meeting has been cancelled.' };
  }

  const cfg = resolveMeetingConfig(meeting.engagement_config);
  const opensMs =
    new Date(meeting.starts_at).getTime() - cfg.join_doors_open_minutes * 60_000;
  const closesMs =
    new Date(meeting.ends_at).getTime() + cfg.async_makeup_window_hours * 3_600_000;
  const now = Date.now();
  if (now < opensMs || now > closesMs) {
    return {
      ok: false,
      error: 'This invitation link is not active right now.',
    };
  }

  let displayName = data.external_name ?? 'Guest';
  if (data.participant_kind === 'internal' && data.profile_id) {
    const { data: p } = await db
      .from('profiles')
      .select('full_name')
      .eq('id', data.profile_id)
      .maybeSingle();
    displayName = p?.full_name ?? 'Colleague';
  }

  return {
    ok: true,
    data: {
      participantId: data.id,
      meetingId: data.meeting_id,
      institutionId: data.institution_id,
      kind: data.participant_kind as ParticipantKind,
      displayName,
    },
  };
}

/** Resolve the signed-in user's own participant row on a meeting. */
export async function resolveParticipantByProfile(
  db: Db,
  meetingId: string,
  profileId: string,
): Promise<ServiceResult<ResolvedParticipant>> {
  const { data, error } = await db
    .from('online_meeting_participants')
    .select('id, meeting_id, institution_id, participant_kind')
    .eq('meeting_id', meetingId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) {
    logger.error(LOG_SCOPE, 'profile resolve failed', error);
    return { ok: false, error: getErrorMessage(error) };
  }
  if (!data) {
    return { ok: false, error: 'You are not on the invitation list for this meeting.' };
  }

  const { data: p } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', profileId)
    .maybeSingle();

  return {
    ok: true,
    data: {
      participantId: data.id,
      meetingId: data.meeting_id,
      institutionId: data.institution_id,
      kind: data.participant_kind as ParticipantKind,
      displayName: p?.full_name ?? 'Colleague',
    },
  };
}

// ---------------------------------------------------------------------------
// The live payload
// ---------------------------------------------------------------------------

export async function getLiveMeeting(
  db: Db,
  who: ResolvedParticipant,
): Promise<ServiceResult<LiveMeetingData>> {
  const { data: meetingRow, error: meetingErr } = await db
    .from('online_meetings')
    .select(
      'id, title, description, status, starts_at, ends_at, timezone, meet_url, ' +
        'host_profile_id, engagement_config, quiz',
    )
    .eq('id', who.meetingId)
    .maybeSingle();

  if (meetingErr) {
    logger.error(LOG_SCOPE, 'meeting fetch failed', meetingErr);
    return { ok: false, error: getErrorMessage(meetingErr) };
  }
  if (!meetingRow) return { ok: false, error: 'Meeting not found.' };

  const cfg = resolveMeetingConfig(meetingRow.engagement_config);
  const status = effectiveMeetingStatus(meetingRow as any) as MeetingStatus;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const [{ data: attRow }, { data: pollRows }, { data: hostRow }] = await Promise.all([
    db
      .from('online_meeting_attendance')
      .select('id, joined_at, engagement_signals')
      .eq('meeting_id', who.meetingId)
      .eq('participant_id', who.participantId)
      .maybeSingle(),
    db
      .from('online_meeting_polls')
      .select('id, meeting_id, question, options, is_open, issued_at, closed_at')
      .eq('meeting_id', who.meetingId)
      .order('issued_at', { ascending: true }),
    db
      .from('profiles')
      .select('full_name')
      .eq('id', meetingRow.host_profile_id)
      .maybeSingle(),
  ]);

  const polls = (pollRows ?? []) as MeetingPoll[];

  // Which polls this participant has already answered. The unique constraint
  // on (poll_id, participant_id) means this count IS the distinct count — AI
  // Pulse has to recompute a DISTINCT here because its table lacks that
  // constraint and a re-answer would otherwise inflate the gate.
  let answered_poll_ids: string[] = [];
  if (polls.length > 0) {
    const { data: responses } = await db
      .from('online_meeting_poll_responses')
      .select('poll_id')
      .eq('participant_id', who.participantId)
      .in(
        'poll_id',
        polls.map((p) => p.id),
      );
    answered_poll_ids = ((responses ?? []) as any[]).map((r) => r.poll_id);
  }

  const storedSignals = (attRow?.engagement_signals ?? {}) as EngagementSignals;
  const signals: EngagementSignals = {
    ...storedSignals,
    polls_responded: answered_poll_ids.length,
  };

  const quiz = coerceQuiz(meetingRow.quiz);
  const endsMs = new Date(meetingRow.ends_at).getTime();

  // The quiz opens when the meeting ends and stays open for an hour live, then
  // for the async make-up window. A quiz with no questions is never "open" —
  // an empty panel that says "take the quiz" is worse than no panel.
  const hasQuiz = cfg.require_quiz && quiz.questions.length > 0;
  const quiz_open =
    hasQuiz && status === 'completed' && diffMinutes(nowIso, meetingRow.ends_at) <= 60;
  const quiz_async_window_open =
    hasQuiz &&
    status === 'completed' &&
    diffMinutes(nowIso, meetingRow.ends_at) <= cfg.async_makeup_window_hours * 60;

  const opensMs =
    new Date(meetingRow.starts_at).getTime() - cfg.join_doors_open_minutes * 60_000;

  return {
    ok: true,
    data: {
      meeting: {
        id: meetingRow.id,
        title: meetingRow.title,
        description: meetingRow.description ?? null,
        status,
        starts_at: meetingRow.starts_at,
        ends_at: meetingRow.ends_at,
        timezone: meetingRow.timezone ?? 'Asia/Kolkata',
        meet_url: meetingRow.meet_url ?? null,
        host_name: hostRow?.full_name ?? null,
      },
      participant: {
        id: who.participantId,
        display_name: who.displayName,
        kind: who.kind,
      },
      attendance: {
        id: attRow?.id ?? null,
        participant_id: who.participantId,
        joined_at: attRow?.joined_at ?? null,
        engagement_signals: signals,
      },
      polls,
      answered_poll_ids,
      quiz,
      quiz_open,
      quiz_async_window_open,
      config: cfg,
      join_open: now >= opensMs && now <= endsMs,
      join_opens_at: new Date(opensMs).toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Read-modify-write of one attendance row's signals.
 *
 * Spread-merges so unknown keys survive — another writer (the report, a future
 * webhook) may own keys this call knows nothing about, and a whole-object
 * overwrite would silently drop them.
 */
async function mergeSignals(
  db: Db,
  who: ResolvedParticipant,
  patch: Partial<EngagementSignals>,
  extra: Record<string, unknown> = {},
): Promise<ServiceResult<EngagementSignals>> {
  const { data: existing, error: readErr } = await db
    .from('online_meeting_attendance')
    .select('id, engagement_signals')
    .eq('meeting_id', who.meetingId)
    .eq('participant_id', who.participantId)
    .maybeSingle();

  if (readErr) {
    logger.error(LOG_SCOPE, 'signals read failed', readErr);
    return { ok: false, error: getErrorMessage(readErr) };
  }

  const next: EngagementSignals = {
    ...((existing?.engagement_signals ?? {}) as EngagementSignals),
    ...patch,
  };

  if (existing) {
    const { error } = await db
      .from('online_meeting_attendance')
      .update({ engagement_signals: next, ...extra })
      .eq('id', existing.id);
    if (error) {
      logger.error(LOG_SCOPE, 'signals update failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
  } else {
    const { error } = await db.from('online_meeting_attendance').insert({
      meeting_id: who.meetingId,
      participant_id: who.participantId,
      institution_id: who.institutionId,
      engagement_signals: next,
      ...extra,
    });
    if (error) {
      logger.error(LOG_SCOPE, 'signals insert failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
  }
  return { ok: true, data: next };
}

/**
 * Record the participant pressing Join.
 *
 * Idempotent by design: a second click must not restamp `joined_at`, because
 * the on-time verdict is computed from the FIRST join and somebody who loses
 * the tab and comes back has not become late. This is the same failure the AI
 * Pulse join button had to design around — mobile popup blockers and dropped
 * Teams deep-links mean rejoining is normal, not exceptional.
 */
export async function recordJoin(
  db: Db,
  who: ResolvedParticipant,
): Promise<ServiceResult<EngagementSignals>> {
  const { data: meetingRow, error: mErr } = await db
    .from('online_meetings')
    .select('starts_at, ends_at, status, engagement_config')
    .eq('id', who.meetingId)
    .maybeSingle();

  if (mErr) return { ok: false, error: getErrorMessage(mErr) };
  if (!meetingRow) return { ok: false, error: 'Meeting not found.' };
  if (meetingRow.status === 'cancelled') {
    return { ok: false, error: 'This meeting has been cancelled.' };
  }

  const { data: existing } = await db
    .from('online_meeting_attendance')
    .select('id, joined_at, engagement_signals')
    .eq('meeting_id', who.meetingId)
    .eq('participant_id', who.participantId)
    .maybeSingle();

  if (existing?.joined_at) {
    return { ok: true, data: (existing.engagement_signals ?? {}) as EngagementSignals };
  }

  const cfg = resolveMeetingConfig(meetingRow.engagement_config);
  const joinedAt = new Date().toISOString();
  const onTime = withinJoinWindow(
    joinedAt,
    meetingRow.starts_at,
    cfg.late_threshold_minutes,
  );

  const result = await mergeSignals(
    db,
    who,
    {
      joined_on_time: onTime,
      joined_at: joinedAt,
      last_heartbeat_at: joinedAt,
      stayed_until: isoToIstHHMM(joinedAt),
    },
    { joined_at: joinedAt },
  );

  if (result.ok) {
    // Best-effort. A roster badge that lags is a cosmetic problem; failing the
    // join over it would not be.
    await db
      .from('online_meeting_participants')
      .update({ invite_status: 'joined' })
      .eq('id', who.participantId);
  }
  return result;
}

/**
 * The stay signal. Called on an interval by the open page.
 *
 * Writes BOTH `last_heartbeat_at` (ISO, for anything doing arithmetic) and
 * `stayed_until` (IST "HH:MM", what the present-at-end gate compares). Writing
 * only one is how AI Pulse ended up with a leave time nothing could read.
 */
export async function recordHeartbeat(
  db: Db,
  who: ResolvedParticipant,
): Promise<ServiceResult<EngagementSignals>> {
  const nowIso = new Date().toISOString();
  return mergeSignals(db, who, {
    last_heartbeat_at: nowIso,
    stayed_until: isoToIstHHMM(nowIso),
  });
}

export async function recordPollResponse(
  db: Db,
  who: ResolvedParticipant,
  pollId: string,
  optionId: string,
): Promise<ServiceResult<{ polls_responded: number }>> {
  const { data: poll, error: pollErr } = await db
    .from('online_meeting_polls')
    .select('id, meeting_id, is_open, closed_at, options')
    .eq('id', pollId)
    .maybeSingle();

  if (pollErr) return { ok: false, error: getErrorMessage(pollErr) };
  if (!poll) return { ok: false, error: 'That poll no longer exists.' };
  if (poll.meeting_id !== who.meetingId) {
    return { ok: false, error: 'That poll belongs to a different meeting.' };
  }
  if (poll.is_open === false || poll.closed_at) {
    return { ok: false, error: 'That poll is closed.' };
  }

  const options = (poll.options ?? []) as Array<{ id: string }>;
  if (!options.some((o) => o.id === optionId)) {
    return { ok: false, error: 'That is not one of the options.' };
  }

  // The unique constraint on (poll_id, participant_id) makes re-answering an
  // update rather than a second row, so the gate cannot be inflated by
  // clicking twice.
  const { error } = await db
    .from('online_meeting_poll_responses')
    .upsert(
      { poll_id: pollId, participant_id: who.participantId, option_id: optionId },
      { onConflict: 'poll_id,participant_id' },
    );

  if (error) {
    logger.error(LOG_SCOPE, 'poll response failed', error);
    return { ok: false, error: getErrorMessage(error) };
  }

  const { count } = await db
    .from('online_meeting_poll_responses')
    .select('id', { count: 'exact', head: true })
    .eq('participant_id', who.participantId);

  const polls_responded = typeof count === 'number' ? count : 0;
  await mergeSignals(db, who, { polls_responded });
  return { ok: true, data: { polls_responded } };
}

export async function submitQuiz(
  db: Db,
  who: ResolvedParticipant,
  answers: Record<string, string>,
): Promise<ServiceResult<{ score: number; passed: number; total: number; isPass: boolean }>> {
  const { data: meetingRow, error: mErr } = await db
    .from('online_meetings')
    .select('quiz, ends_at, status, engagement_config')
    .eq('id', who.meetingId)
    .maybeSingle();

  if (mErr) return { ok: false, error: getErrorMessage(mErr) };
  if (!meetingRow) return { ok: false, error: 'Meeting not found.' };

  const quiz = coerceQuiz(meetingRow.quiz);
  if (quiz.questions.length === 0) {
    return { ok: false, error: 'This meeting has no quiz.' };
  }

  const cfg = resolveMeetingConfig(meetingRow.engagement_config);
  const endsMs = new Date(meetingRow.ends_at).getTime();
  const now = Date.now();
  if (now < endsMs) {
    return { ok: false, error: 'The quiz opens when the meeting ends.' };
  }
  if (now > endsMs + cfg.async_makeup_window_hours * 3_600_000) {
    return { ok: false, error: 'The quiz window for this meeting has closed.' };
  }

  // One attempt. Without this the "score" is just how many times somebody was
  // willing to guess.
  const { data: existing } = await db
    .from('online_meeting_attendance')
    .select('engagement_signals')
    .eq('meeting_id', who.meetingId)
    .eq('participant_id', who.participantId)
    .maybeSingle();
  const prior = (existing?.engagement_signals ?? {}) as EngagementSignals;
  if (typeof prior.quiz_score === 'number') {
    return { ok: false, error: 'You have already taken this quiz.' };
  }

  let passed = 0;
  for (const q of quiz.questions) {
    const chosen = answers[q.id];
    const correct = q.options.find((o) => o.is_correct);
    if (chosen && correct && chosen === correct.id) passed += 1;
  }
  const total = quiz.questions.length;
  const score = Math.round((passed / total) * 100);
  const threshold = quiz.pass_threshold ?? cfg.quiz_pass_threshold;
  const isPass = score >= threshold;

  // An attempt made after the live hour is a make-up, and a make-up must NOT
  // credit the present-at-end gate — it was taken after everyone went home.
  const isAsyncMakeup = now > endsMs + 60 * 60_000;

  const merged = await mergeSignals(db, who, {
    quiz_score: score,
    quiz_passed: isPass,
    quiz_async_makeup: isAsyncMakeup,
  });
  if (!merged.ok) return merged;

  return { ok: true, data: { score, passed, total, isPass } };
}

/** The participant's own live gate status, for the progress panel. */
export function gatesFor(
  signals: EngagementSignals,
  endsAt: string | null,
  pollsIssued: number,
  engagementConfig: unknown,
) {
  return evaluateMeetingGates(signals, endsAt, pollsIssued, engagementConfig);
}
