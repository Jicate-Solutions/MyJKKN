/**
 * Live Engine — engagement gates (pure)
 *
 * Moved out of `lib/services/ai-pulse/live-session-service.ts` so the Online
 * Meetings module can reach the same verdict logic without importing AI
 * Pulse's storage. That service re-exports every name below, so no AI Pulse
 * consumer changed and no AI Pulse behaviour changed.
 *
 * TWO VERDICT FUNCTIONS, ON PURPOSE
 *   `evaluateGates` is AI Pulse's, unchanged, including its history. Read its
 *   comment before touching it — the "2 of 3" is not an oversight.
 *
 *   `evaluateMeetingGates` is the Online Meetings one, and it is configurable
 *   rather than fixed. That difference is the whole reason it exists: AI Pulse
 *   is one recurring session that always has a quiz and (in principle) polls,
 *   so a fixed gate is meaningful there. A dynamically-created team meeting
 *   may legitimately have no polls and no quiz at all, and a fixed gate would
 *   then mark every single attendee disengaged — a report that is not merely
 *   wrong but confidently wrong.
 */

import { hhmmMinusMinutes, isoToIstHHMM } from './time-window';

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/**
 * What a live session observes about one person.
 *
 * Two names for the on-time signal, deliberately. AI Pulse writes
 * `joined_within_5min` and six files read that key, so renaming it would be a
 * data migration for no gain; the name is also a lie (it has meant "within the
 * configured late threshold" since the threshold became a policy). Online
 * Meetings writes the honest `joined_on_time`. Every helper below reads
 * `joined_on_time ?? joined_within_5min`, so both modules work and neither had
 * to move first.
 */
export interface EngagementSignals {
  /** AI Pulse's historical key. Means "within the configured late threshold". */
  joined_within_5min?: boolean;
  /** Online Meetings' key for the same signal, honestly named. */
  joined_on_time?: boolean;
  joined_at?: string; // ISO timestamp
  polls_responded?: number;
  stayed_until?: string; // IST "HH:MM"
  last_heartbeat_at?: string; // ISO timestamp
  quiz_score?: number; // 0–100
  quiz_passed?: boolean;
  quiz_async_makeup?: boolean;
  /** Optional "what should change next time?" free text. */
  feedback_text?: string;
}

/** Read the on-time signal under either key. */
export function joinedOnTime(signals: EngagementSignals): boolean {
  return !!(signals.joined_on_time ?? signals.joined_within_5min);
}

/**
 * ONE deliberate difference from the AI Pulse original this file was moved
 * from: `withinJoinWindow` in `time-window.ts` now returns true rather than
 * false when a timestamp is unparseable. The original produced
 * `NaN <= NaN === false`, i.e. it marked somebody LATE because a date was
 * malformed. That input cannot arise in AI Pulse (the cycle window is either
 * null or valid ISO, and the join instant is `new Date().toISOString()`), so
 * no existing verdict moves — but failing a person on a measurement error is
 * not behaviour worth carrying forward into a module where organisers type
 * their own start times.
 */

/**
 * The last heartbeat can land up to one interval (60s) before the end, and
 * isoToIstHHMM truncates seconds — so requiring stayed_until >= the exact end
 * "HH:MM" fails people who genuinely stayed. Accept heartbeats within this
 * many minutes of the end.
 */
export const STAY_TOLERANCE_MINUTES = 5;

// ---------------------------------------------------------------------------
// Shared sub-gates
// ---------------------------------------------------------------------------

/**
 * Observable "present at session end" — the single source of truth for the
 * `stayed_until_end` sub-gate, shared across evaluateGates, the dept heatmap,
 * the weekly digest, the learner badge, and the PDE bridge.
 *
 * TRUE if EITHER:
 *   1. the client-side heartbeat recorded `stayed_until` at/after the end
 *      threshold (the original sensor), OR
 *   2. the person took the quiz IN THE LIVE WINDOW —
 *      `typeof quiz_score === 'number'` AND not an async make-up.
 *
 * Rationale: these sessions run on an EXTERNAL meeting link, so people leave
 * the MyJKKN page and the heartbeat never fires — `stayed_until` is never
 * recorded and the heartbeat sensor reads false for everyone despite real
 * attendance. The live quiz only opens at session end, so having taken it live
 * is an observable substitute for being present then. Async make-ups are taken
 * AFTER the session, so they are NOT credited as "stayed".
 *
 * Pass `endThresholdHHMM` as null when no end time is available — the
 * heartbeat branch is then skipped and only the quiz-live proxy can satisfy
 * presence.
 */
export function isPresentAtEnd(
  signals: Pick<
    EngagementSignals,
    'stayed_until' | 'quiz_score' | 'quiz_async_makeup'
  >,
  endThresholdHHMM: string | null,
): boolean {
  const tookQuizLive =
    typeof signals.quiz_score === 'number' && signals.quiz_async_makeup !== true;
  if (tookQuizLive) return true;

  if (signals.stayed_until && endThresholdHHMM) {
    return signals.stayed_until >= endThresholdHHMM;
  }
  return false;
}

/** The tolerance-adjusted session-end "HH:MM", or null when no end is known. */
export function endThresholdFrom(
  endsAt: string | null,
  toleranceMinutes: number = STAY_TOLERANCE_MINUTES,
): string | null {
  if (!endsAt) return null;
  return hhmmMinusMinutes(isoToIstHHMM(endsAt), toleranceMinutes);
}

// ---------------------------------------------------------------------------
// AI Pulse verdict — unchanged, do not "tidy"
// ---------------------------------------------------------------------------

export interface GateStatus {
  joined_within_5min: boolean;
  polls_responded_ok: boolean;
  stayed_until_end: boolean;
  quiz_passed: boolean;
  /** How many polls the Champion issued this cycle. Informational only. */
  polls_issued: number;
  /** How many poll responses are needed (min(3, polls_issued)). Display only. */
  polls_required: number;
  /** Real signals passed (0..3): joined / stayed / quiz. Polls excluded. */
  passed_count: number;
  /** Gates counted toward the verdict (currently 3 — polls excluded). */
  total: number;
  is_engaged: boolean;
}

/**
 * The AI Pulse engagement verdict — honest "2 of 3 real signals" (Model B,
 * 2026-06-18).
 *
 * The three REAL, measurable signals are joined, stayed and quiz. `polls` is
 * deliberately EXCLUDED. It used to be a 4th gate, but it was never a
 * trustworthy signal: no cycle had issued polls, so the old evaluateGates
 * auto-PASSED it as a free point (inflating the score) while the learner badge
 * required real responses (deflating it) — the same learner read "engaged" on
 * the heatmap and "partial" on their badge.
 *
 * History: 4-of-4 AND → 0% by construction (dead heartbeat) → 3-of-4 robust
 * (with the polls free-pass) → this honest 2-of-3.
 *
 * `polls` is accepted for call-site compatibility and ignored.
 *
 * NOTE for the Online Meetings module: polls ARE a working signal there — the
 * host issues them in-page and participants answer in-page — so that module
 * uses `evaluateMeetingGates` below, which counts every signal the meeting
 * actually enabled. Do not "fix" this function to match it.
 */
export function isEngagedFromGates(gates: {
  joined: boolean;
  stayed: boolean;
  quiz: boolean;
  polls?: boolean; // accepted but NOT counted — see doc above
}): boolean {
  const passed = Number(gates.joined) + Number(gates.stayed) + Number(gates.quiz);
  return passed >= 2;
}

/**
 * Evaluate the AI Pulse engagement gate from raw signals + cycle end time.
 *
 * `pollsIssued` is how many polls exist for the cycle: the polls requirement
 * is min(3, pollsIssued), so a cycle with no polls doesn't make engagement
 * unattainable.
 */
export function evaluateGates(
  signals: EngagementSignals,
  endsAt: string | null,
  pollsIssued: number = 0,
): GateStatus {
  const joined_within_5min = joinedOnTime(signals);
  const polls_required = Math.min(3, Math.max(0, pollsIssued));
  const polls_responded_ok =
    polls_required === 0 || (signals.polls_responded ?? 0) >= polls_required;

  const stayed_until_end = isPresentAtEnd(signals, endThresholdFrom(endsAt));
  const quiz_passed = !!signals.quiz_passed;

  const passed_count =
    Number(joined_within_5min) + Number(stayed_until_end) + Number(quiz_passed);

  return {
    joined_within_5min,
    polls_responded_ok,
    stayed_until_end,
    quiz_passed,
    polls_issued: Math.max(0, pollsIssued),
    polls_required,
    passed_count,
    total: 3,
    is_engaged: isEngagedFromGates({
      joined: joined_within_5min,
      polls: polls_responded_ok,
      stayed: stayed_until_end,
      quiz: quiz_passed,
    }),
  };
}

// ---------------------------------------------------------------------------
// Online Meetings verdict — configurable
// ---------------------------------------------------------------------------

/**
 * The engagement rules of ONE meeting, read from
 * `online_meetings.engagement_config`. Every field is optional; the defaults
 * below are what an organiser gets without touching anything.
 */
export interface MeetingEngagementConfig {
  /** Minutes after start within which a join still counts as on time. */
  late_threshold_minutes?: number;
  /** Minutes before start when the Join button unlocks. */
  join_doors_open_minutes?: number;
  /** Slack allowed on the last heartbeat before the end. */
  stay_tolerance_minutes?: number;
  /** Count poll participation toward the verdict. */
  require_polls?: boolean;
  /** How many distinct polls must be answered when require_polls is on. */
  required_poll_count?: number;
  /** Count the quiz toward the verdict. */
  require_quiz?: boolean;
  /** Percentage needed to pass the quiz. */
  quiz_pass_threshold?: number;
  /** Hours after the end during which a make-up quiz is still accepted. */
  async_makeup_window_hours?: number;
}

export const MEETING_ENGAGEMENT_DEFAULTS: Required<MeetingEngagementConfig> = {
  late_threshold_minutes: 10,
  join_doors_open_minutes: 15,
  stay_tolerance_minutes: STAY_TOLERANCE_MINUTES,
  require_polls: false,
  required_poll_count: 1,
  require_quiz: false,
  quiz_pass_threshold: 50,
  async_makeup_window_hours: 48,
};

/** Fill a stored (possibly empty, possibly partial) config with the defaults. */
export function resolveMeetingConfig(
  raw: unknown,
): Required<MeetingEngagementConfig> {
  const cfg = (raw && typeof raw === 'object' ? raw : {}) as MeetingEngagementConfig;
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const d = MEETING_ENGAGEMENT_DEFAULTS;
  return {
    late_threshold_minutes: num(cfg.late_threshold_minutes, d.late_threshold_minutes),
    join_doors_open_minutes: num(cfg.join_doors_open_minutes, d.join_doors_open_minutes),
    stay_tolerance_minutes: num(cfg.stay_tolerance_minutes, d.stay_tolerance_minutes),
    require_polls: cfg.require_polls === true,
    required_poll_count: Math.max(1, num(cfg.required_poll_count, d.required_poll_count)),
    require_quiz: cfg.require_quiz === true,
    quiz_pass_threshold: num(cfg.quiz_pass_threshold, d.quiz_pass_threshold),
    async_makeup_window_hours: num(
      cfg.async_makeup_window_hours,
      d.async_makeup_window_hours,
    ),
  };
}

/** One sub-gate as the UI renders it. */
export interface MeetingGate {
  key: 'joined' | 'polls' | 'stayed' | 'quiz';
  label: string;
  /** False when this meeting does not measure this signal at all. */
  counted: boolean;
  passed: boolean;
  /** Human detail, e.g. "2 of 3 polls answered". */
  detail: string;
}

export interface MeetingGateStatus {
  gates: MeetingGate[];
  /** Sub-gates this meeting actually measures. */
  counted_total: number;
  passed_count: number;
  is_engaged: boolean;
  /** 0–100, or null when this meeting measures nothing. */
  engagement_percent: number | null;
}

/**
 * Evaluate one participant against the rules their meeting actually set.
 *
 * The verdict is "passed every COUNTED gate", not a fraction. Joining and
 * staying are always counted (they cost the organiser nothing to measure and
 * are the minimum meaning of "attended"); polls and quiz are counted only when
 * the organiser turned them on AND, for polls, actually issued some.
 *
 * A meeting that enables nothing beyond the two defaults therefore reduces to
 * "joined on time and was still here at the end", which is what a plain
 * attendance register has always meant.
 */
export function evaluateMeetingGates(
  signals: EngagementSignals,
  endsAt: string | null,
  pollsIssued: number,
  rawConfig: unknown,
): MeetingGateStatus {
  const cfg = resolveMeetingConfig(rawConfig);

  const joined = joinedOnTime(signals);
  const stayed = isPresentAtEnd(
    signals,
    endThresholdFrom(endsAt, cfg.stay_tolerance_minutes),
  );

  // Polls count only when the organiser asked for them AND at least one was
  // actually issued. Requiring answers to polls that never happened is the
  // exact failure that made the AI Pulse 4-AND gate read 0% by construction.
  const pollsRequired = cfg.require_polls
    ? Math.min(cfg.required_poll_count, Math.max(0, pollsIssued))
    : 0;
  const pollsCounted = cfg.require_polls && pollsRequired > 0;
  const pollsAnswered = signals.polls_responded ?? 0;
  const pollsPassed = pollsAnswered >= pollsRequired;

  const quizCounted = cfg.require_quiz;
  const quizPassed = !!signals.quiz_passed;

  const gates: MeetingGate[] = [
    {
      key: 'joined',
      label: 'Joined on time',
      counted: true,
      passed: joined,
      detail: joined
        ? 'Joined within the on-time window'
        : `Not recorded as joining within ${cfg.late_threshold_minutes} min of the start`,
    },
    {
      key: 'polls',
      label: 'Answered polls',
      counted: pollsCounted,
      passed: pollsCounted ? pollsPassed : true,
      detail: !cfg.require_polls
        ? 'Polls are not part of this meeting'
        : pollsIssued === 0
          ? 'No polls were issued'
          : `${pollsAnswered} of ${pollsRequired} answered`,
    },
    {
      key: 'stayed',
      label: 'Present at the end',
      counted: true,
      passed: stayed,
      detail: signals.stayed_until
        ? `Last seen ${signals.stayed_until} IST`
        : 'No presence recorded at the end',
    },
    {
      key: 'quiz',
      label: 'Passed the quiz',
      counted: quizCounted,
      passed: quizCounted ? quizPassed : true,
      detail: !cfg.require_quiz
        ? 'No quiz for this meeting'
        : typeof signals.quiz_score === 'number'
          ? `Scored ${signals.quiz_score}% against a ${cfg.quiz_pass_threshold}% pass mark`
          : 'Not attempted',
    },
  ];

  const counted = gates.filter((g) => g.counted);
  const passed = counted.filter((g) => g.passed);

  return {
    gates,
    counted_total: counted.length,
    passed_count: passed.length,
    is_engaged: counted.length > 0 && passed.length === counted.length,
    engagement_percent:
      counted.length === 0
        ? null
        : Math.round((passed.length / counted.length) * 100),
  };
}
