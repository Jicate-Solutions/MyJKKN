/**
 * Turn one day's IN/OUT pair into an attendance verdict, using the shift
 * timing in force for that staff member on that date.
 * Created: 2026-08-06.
 * Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
 *
 * THE RULE (revised 2026-08-09): "work the window, arrive while it is open".
 * A half counts as attended when the person arrived at or before the MIDPOINT
 * of that half and stayed to its end. The two halves may overlap (09:00-13:00
 * with 12:30-16:30); that is the real JKKN pattern and the reason this is not
 * a lunch-break model.
 *
 * Being late does NOT cost the day — late_minutes is recorded and flagged, and
 * the day still counts. That was an explicit policy decision.
 *
 * WHY THE MIDPOINT, AND NOT THE GRACE DEADLINE (the 2026-08-06 rule).
 *   The original rule was `IN <= first_half_start + grace`, which made grace a
 *   CLIFF rather than a tolerance: with a 09:00 start and grace 5, arriving
 *   09:05 earned a full half and 09:06 earned nothing. One minute cost half a
 *   day's pay, and raising grace only relocated the cliff. It also contradicted
 *   the paragraph above — `late_minutes` is non-zero only past the deadline, so
 *   under that rule the field could never describe a day that still counted.
 *
 *   Dropping the arrival test entirely is not the fix either: with only
 *   `OUT >= first_half_end`, an afternoon-only person (in 12:30, out 16:30)
 *   satisfies the MORNING window too and is credited a full day.
 *
 *   The midpoint keeps both ends honest. Arriving 09:06 — or 10:59 — earns the
 *   morning with the lateness recorded; arriving 12:30 does not. It also fixes
 *   the mirror-image bug on the second half, where arriving 12:31 against a
 *   12:30 start used to forfeit an afternoon that was fully worked.
 *
 *   This boundary is policy, not arithmetic. It is two lines (fhLatestArrival /
 *   shLatestArrival) if JKKN wants a different tolerance.
 *
 * OUR CONFIG OVERRIDES THE MACHINE, never the reverse. The machines have no
 * weekly off configured and stamp every Sunday 'A' (192 of them in the July
 * export), so is_working_day is checked BEFORE the device status is consulted.
 * The device verdict is still stored alongside ours so disagreements stay
 * auditable.
 *
 * Pure: no I/O, no clock, no Supabase. Same function backs dry-run and commit.
 */

import { timeToMinutes } from '@/types/hr-shift-timings';
import type { ResolvedShiftTiming } from '@/types/hr-shift-timings';

export type AttendanceVerdict =
  | 'PRESENT'
  | 'HALF_DAY'
  | 'ABSENT'
  | 'WEEKLY_OFF'
  | 'EXCEPTION';

export type DayCalc = 'FULL' | 'HALF' | 'NONE';

export interface EvaluateDayInput {
  /** 'HH:MM' or 'HH:MM:SS'; null when the machine printed '--:--'. */
  inTime: string | null;
  outTime: string | null;
  /** Result of fn_resolve_shift_timing for this staff member + date. */
  timing: ResolvedShiftTiming | null;
}

export interface EvaluateDayResult {
  verdict: AttendanceVerdict;
  dayCalc: DayCalc | null;
  firstHalfAttended: boolean | null;
  secondHalfAttended: boolean | null;
  /** Minutes past (first_half_start + grace). 0 when on time, null when not evaluable. */
  lateMinutes: number | null;
  /** Set only when verdict is EXCEPTION — why the day could not be decided. */
  exceptionReason: string | null;
  /** The timing row applied, for auditability. */
  shiftTimingId: string | null;
}

export function evaluateDay({ inTime, outTime, timing }: EvaluateDayInput): EvaluateDayResult {
  const base = {
    firstHalfAttended: null,
    secondHalfAttended: null,
    lateMinutes: null,
    exceptionReason: null,
    shiftTimingId: timing?.timing_id ?? null,
  };

  // 1. No rule to judge against. Importing a verdict here would be a guess.
  if (!timing) {
    return {
      ...base,
      verdict: 'EXCEPTION',
      dayCalc: null,
      exceptionReason: 'No shift timing configured for this staff member on this date.',
    };
  }

  // 2. Non-working day wins over whatever the machine said.
  if (!timing.is_working_day) {
    return { ...base, verdict: 'WEEKLY_OFF', dayCalc: 'NONE' };
  }

  const hasIn = Boolean(inTime);
  const hasOut = Boolean(outTime);

  // 3. Genuinely no punch at all.
  if (!hasIn && !hasOut) {
    return { ...base, verdict: 'ABSENT', dayCalc: 'NONE' };
  }

  // 4. One punch only — cannot be judged. The machine files a lone evening
  //    punch under IN, so a "17:31 IN with no OUT" is a missed punch, not a
  //    17:31 arrival. Send it to the regularization queue instead of guessing.
  if (hasIn !== hasOut) {
    return {
      ...base,
      verdict: 'EXCEPTION',
      dayCalc: null,
      exceptionReason: hasIn
        ? `Only one punch recorded (${inTime}). Missing OUT.`
        : `Only one punch recorded (${outTime}). Missing IN.`,
    };
  }

  const inMin = timeToMinutes(inTime);
  const outMin = timeToMinutes(outTime);
  const fhStart = timeToMinutes(timing.first_half_start);
  const fhEnd = timeToMinutes(timing.first_half_end);
  const shStart = timeToMinutes(timing.second_half_start);
  const shEnd = timeToMinutes(timing.second_half_end);

  if (inMin === null || outMin === null) {
    return {
      ...base,
      verdict: 'EXCEPTION',
      dayCalc: null,
      exceptionReason: `Unreadable punch time (in="${inTime}", out="${outTime}").`,
    };
  }
  if (fhStart === null || fhEnd === null || shStart === null || shEnd === null) {
    return {
      ...base,
      verdict: 'EXCEPTION',
      dayCalc: null,
      exceptionReason: 'The shift timing for this date is a working day but has incomplete windows.',
    };
  }
  if (outMin < inMin) {
    return {
      ...base,
      verdict: 'EXCEPTION',
      dayCalc: null,
      exceptionReason: `OUT (${outTime}) is earlier than IN (${inTime}).`,
    };
  }

  const grace = Number.isFinite(timing.grace_minutes) ? timing.grace_minutes : 0;
  const graceDeadline = fhStart + grace;

  // Latest arrival that still counts as having worked each half. See the
  // header: the midpoint, not the grace deadline, so lateness is flagged
  // rather than charged — while an afternoon-only punch still cannot claim
  // the morning.
  const fhLatestArrival = Math.floor((fhStart + fhEnd) / 2);
  const shLatestArrival = Math.floor((shStart + shEnd) / 2);

  const firstHalfAttended = inMin <= fhLatestArrival && outMin >= fhEnd;
  const secondHalfAttended = inMin <= shLatestArrival && outMin >= shEnd;

  // Grace applies to the first half only — an explicit requirement. This is now
  // purely a reporting figure: it never changes the verdict.
  const lateMinutes = Math.max(0, inMin - graceDeadline);

  if (firstHalfAttended && secondHalfAttended) {
    return { ...base, verdict: 'PRESENT', dayCalc: 'FULL', firstHalfAttended, secondHalfAttended, lateMinutes };
  }
  if (firstHalfAttended || secondHalfAttended) {
    return { ...base, verdict: 'HALF_DAY', dayCalc: 'HALF', firstHalfAttended, secondHalfAttended, lateMinutes };
  }
  // On site, but covering neither window — e.g. in at 11:00, out at 14:00.
  // hours_worked is still stored, so the shortfall is visible rather than hidden.
  return { ...base, verdict: 'ABSENT', dayCalc: 'NONE', firstHalfAttended, secondHalfAttended, lateMinutes };
}
