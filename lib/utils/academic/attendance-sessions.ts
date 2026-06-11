/**
 * Attendance session helpers (FN / AN)
 * ------------------------------------------------------------------
 * Shared logic for `session_wise` (school day-wise) attendance, where a day is
 * collected at only two touchpoints — the FIRST forenoon period and the FIRST
 * afternoon period — instead of every period.
 *
 * Used by:
 *   - the marking UI (which two period slots to show as Morning / Afternoon),
 *   - the pending/escalation service (which periods "should" have been marked),
 *   - consolidation (deriving a full / half / absent daily status).
 *
 * Design notes
 *   - A period is classified FN/AN by its explicit `session` tag when present
 *     (periods.session, copied into the timetable's periods JSONB), and falls
 *     back to comparing start_time against the institution forenoon/afternoon
 *     boundaries. This keeps schools that start before 09:00 from being
 *     mis-derived once they set the tag, while remaining zero-config by default.
 *   - Break periods (is_break) are never eligible — lunch is not a session.
 */

import {
  DEFAULT_VALIDATION_RULES,
  type ValidationRules,
} from '@/types/leave-onduty';

export type SessionTag = 'FN' | 'AN';

/** Minimal shape this module needs from a period (from periods table or the
 *  timetable's embedded `periods` JSONB snapshot). */
export interface PeriodLike {
  id?: string | null;
  period_id?: string | null;
  period_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  is_break?: boolean | null;
  /** Optional explicit half-day tag; overrides time-based derivation. */
  session?: SessionTag | string | null;
}

export type DailyAttendanceStatus = 'full' | 'half' | 'absent';

/** The two period ids that a session_wise timetable collects per day. */
export interface SessionPeriods {
  morningFirstPeriodId: string | null;
  afternoonFirstPeriodId: string | null;
}

const TIME_RULES = DEFAULT_VALIDATION_RULES.periods;

/** Parse "HH:MM" or "HH:MM:SS" into minutes-since-midnight. Returns null when
 *  unparseable so callers can skip rather than mis-sort. */
export function parseTimeToMinutes(time?: string | null): number | null {
  if (!time || typeof time !== 'string') return null;
  const m = time.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function periodId(p: PeriodLike): string | null {
  return p.id ?? p.period_id ?? null;
}

/**
 * Classify a single period as FN or AN.
 *   1. explicit `session` tag wins,
 *   2. otherwise: start_time before the afternoon boundary => FN, else AN.
 * The afternoon boundary (default 14:00) is the single clean midday split —
 * periods that fall in the lunch gap (13:00–14:00) resolve to FN.
 * Returns null for break periods or when the time cannot be parsed.
 */
export function classifyPeriodSession(
  period: PeriodLike,
  rules: ValidationRules['periods'] = TIME_RULES
): SessionTag | null {
  if (period.is_break) return null;

  const tag = (period.session ?? '').toString().toUpperCase();
  if (tag === 'FN' || tag === 'AN') return tag;

  const start = parseTimeToMinutes(period.start_time);
  if (start === null) return null;

  const afternoonStart = parseTimeToMinutes(rules.afternoonStart) ?? 14 * 60;
  return start < afternoonStart ? 'FN' : 'AN';
}

/**
 * Given a day's periods, return the id of the first (earliest start_time)
 * forenoon period and the first afternoon period. These are the only two slots
 * a session_wise timetable collects attendance for.
 */
export function getSessionPeriods(
  periods: PeriodLike[] | null | undefined,
  rules: ValidationRules['periods'] = TIME_RULES
): SessionPeriods {
  const result: SessionPeriods = {
    morningFirstPeriodId: null,
    afternoonFirstPeriodId: null,
  };
  if (!Array.isArray(periods) || periods.length === 0) return result;

  let earliestFn = Number.POSITIVE_INFINITY;
  let earliestAn = Number.POSITIVE_INFINITY;

  for (const p of periods) {
    const id = periodId(p);
    if (!id) continue;
    const session = classifyPeriodSession(p, rules);
    if (!session) continue;
    const start = parseTimeToMinutes(p.start_time);
    if (start === null) continue;

    if (session === 'FN' && start < earliestFn) {
      earliestFn = start;
      result.morningFirstPeriodId = id;
    } else if (session === 'AN' && start < earliestAn) {
      earliestAn = start;
      result.afternoonFirstPeriodId = id;
    }
  }

  return result;
}

/** True when the given period id is one of the two collected session slots. */
export function isSessionPeriod(
  periodIdToCheck: string,
  sessionPeriods: SessionPeriods
): boolean {
  return (
    periodIdToCheck === sessionPeriods.morningFirstPeriodId ||
    periodIdToCheck === sessionPeriods.afternoonFirstPeriodId
  );
}

/**
 * Derive a student's daily status from their two session marks, per the locked
 * rule: BOTH present => full day, ONE present => half day, NEITHER => absent.
 */
export function deriveDailyStatus(input: {
  fnPresent: boolean;
  anPresent: boolean;
}): DailyAttendanceStatus {
  const { fnPresent, anPresent } = input;
  if (fnPresent && anPresent) return 'full';
  if (fnPresent || anPresent) return 'half';
  return 'absent';
}

/** Day-fraction a status contributes to attendance %: full=1, half=0.5, absent=0. */
export function dailyStatusToDays(status: DailyAttendanceStatus): number {
  switch (status) {
    case 'full':
      return 1;
    case 'half':
      return 0.5;
    case 'absent':
    default:
      return 0;
  }
}
