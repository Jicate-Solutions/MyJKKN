/**
 * Turn one day's IN/OUT pair into an attendance verdict, using the shift
 * timing in force for that staff member on that date.
 * Created: 2026-08-06.
 * Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
 *
 * THE RULE (revised 2026-08-20): the FIRST half is gated on the grace
 * deadline, the SECOND on the midpoint of its window. A half also requires
 * staying to that half's end. The two halves may overlap (09:00-13:00 with
 * 12:30-16:30); that is the real JKKN pattern and the reason this is not a
 * lunch-break model.
 *
 *   first half  : IN <= first_half_start + grace_minutes  AND  OUT >= first_half_end
 *   second half : IN <= midpoint(second_half)             AND  OUT >= second_half_end
 *
 * THE ASYMMETRY IS DELIBERATE, and so is the cliff on the first half.
 *
 *   Grace applies to the morning only — a standing JKKN requirement. Arriving
 *   09:06 against a 09:05 deadline forfeits the morning and the day becomes a
 *   HALF DAY. That is a one-minute cliff and it is accepted knowingly: it was
 *   the rule until 2026-08-09, was replaced by a midpoint tolerance, and was
 *   reinstated on 2026-08-20 by explicit instruction after HR found 09:21
 *   arrivals being credited a full day. Raising grace_minutes moves the cliff;
 *   it does not remove it. Measured before the change, 662 of 3705 PRESENT days
 *   in the July import (17.9%, and 35.2% at CAS) become HALF_DAY under it.
 *
 *   The second half deliberately keeps the midpoint. There is no afternoon
 *   grace column to gate it with, and a deadline at second_half_start would
 *   forfeit a fully-worked afternoon for arriving 12:31 against a 12:30 start —
 *   a bug this file has already shipped once.
 *
 *   Dropping the arrival test entirely is not an option on either half: with
 *   only `OUT >= first_half_end`, an afternoon-only person (in 12:30, out
 *   16:30) satisfies the MORNING window too and is credited a full day.
 *
 *   This boundary is policy, not arithmetic. It is one line (graceDeadline /
 *   shLatestArrival) if JKKN wants a different tolerance again.
 *
 * APPROVED PERMISSIONS EXCUSE A SHORTFALL (2026-08-21). A half that the rules
 * above reject is reinstated when every minute it was short is covered by an
 * approved short-time-off window on that date:
 *
 *     required(morning)   = [grace deadline, first_half_end]
 *     required(afternoon) = [second_half_start, second_half_end]
 *     missing(half)       = required(half) MINUS [IN, OUT]
 *     half attended       = base rule above  OR  missing(half) is covered
 *
 * So 09:24 against an 09:05 deadline is short [09:05, 09:24]; a permission of
 * [09:05, 09:35] contains it and the morning counts, making the day PRESENT.
 *
 * COVERAGE, NOT A MINUTE TALLY. "19 late minutes, 30 permission minutes, so
 * excused" would let an afternoon permission pay for a morning shortfall.
 * Comparing intervals refuses that, and it costs nothing extra to also cover
 * leaving early — the mirror case, where the missing interval is at the end of
 * the window rather than the start.
 *
 * ALL OR NOTHING PER HALF. A permission shorter than the shortfall reinstates
 * nothing; excusedMinutes still reports what it did cover, so a half-measure is
 * visible rather than silent.
 *
 * The base rules are never made STRICTER by this. A half that already passes is
 * not re-tested, so nothing that counts today can start failing — in particular
 * the afternoon keeps its midpoint tolerance and a 12:31 arrival against a
 * 12:30 start is still a full afternoon.
 *
 * lateMinutes stays RAW. It reports arrival against the deadline whether or not
 * a permission excused it; excusedMinutes is the separate fact.
 *
 * CHANGING IT DOES NOT REWRITE HISTORY. Verdicts are computed at import time
 * and stored; an already-imported month keeps its old verdicts until that
 * (machine, month) is deleted and the file re-imported, or POST
 * /api/hr/attendance/recompute re-judges it from the stored punch pair.
 *
 * A LONE PUNCH IS A FULL-DAY ABSENCE (2026-08-21). One punch cannot show that
 * either half was worked to its end, so the day is ABSENT — an explicit
 * instruction, replacing the earlier behaviour of parking it as EXCEPTION for a
 * human to judge.
 *
 *   The reason is NOT discarded. exceptionReason still carries "Only one punch
 *   recorded (09:00). Missing OUT.", and the importer writes it to
 *   hr_attendance_records.notes, so an absence caused by a forgotten punch stays
 *   distinguishable from one caused by not turning up. Without that the two are
 *   the same row and nobody can tell them apart afterwards.
 *
 *   The machine files a lone evening punch under IN, so a "17:31 IN with no OUT"
 *   is a missed punch and not a 17:31 arrival — which is why this cannot be
 *   judged as a late arrival instead.
 *
 *   Genuinely unjudgeable days remain EXCEPTION: no shift timing configured,
 *   unreadable punch times, OUT before IN, or an incomplete shift window. Those
 *   are missing RULES, not missing attendance.
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

/** An approved short-time-off window on the day being judged. */
export interface PermissionWindow {
  /** hr_leave_applications.id, so the day can name what excused it. */
  id: string;
  /** 'HH:MM' or 'HH:MM:SS'. */
  from: string;
  to: string;
}

export interface EvaluateDayInput {
  /** 'HH:MM' or 'HH:MM:SS'; null when the machine printed '--:--'. */
  inTime: string | null;
  outTime: string | null;
  /** Result of fn_resolve_shift_timing for this staff member + date. */
  timing: ResolvedShiftTiming | null;
  /**
   * APPROVED short time off for this staff member on this date. Pending or
   * rejected windows must never be passed — a request that has not been decided
   * cannot reinstate a half.
   */
  permissions?: PermissionWindow[];
}

export interface EvaluateDayResult {
  verdict: AttendanceVerdict;
  dayCalc: DayCalc | null;
  firstHalfAttended: boolean | null;
  secondHalfAttended: boolean | null;
  /** Minutes past (first_half_start + grace). 0 when on time, null when not evaluable. */
  lateMinutes: number | null;
  /** Minutes of a required half-window reinstated by an approved permission. */
  excusedMinutes: number;
  /** hr_leave_applications.id of every permission that did the reinstating. */
  excusedBy: string[];
  /**
   * Why the day reads as it does, when the punches alone do not explain it.
   * Set for EXCEPTION (no rule to judge against) AND for a single-punch ABSENT
   * (a rule existed; the attendance did not prove itself). The importer routes
   * the first to hr_attendance_exceptions and the second to notes.
   */
  exceptionReason: string | null;
  /** The timing row applied, for auditability. */
  shiftTimingId: string | null;
}

/** Minutes from midnight, half-open [from, to). */
interface Span { from: number; to: number }

/** Merge overlapping and touching spans so coverage can be tested span by span. */
function merge(spans: Span[]): Span[] {
  const sorted = spans.filter((s) => s.to > s.from).sort((a, b) => a.from - b.from);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.from <= last.to) last.to = Math.max(last.to, s.to);
    else out.push({ ...s });
  }
  return out;
}

/**
 * `required` minus the time actually on site. Up to two gaps — a late start and
 * an early finish — which is why this returns a list and not a single span.
 */
function missingOf(required: Span, present: Span): Span[] {
  const gaps: Span[] = [];
  if (present.from > required.from) {
    gaps.push({ from: required.from, to: Math.min(present.from, required.to) });
  }
  if (present.to < required.to) {
    gaps.push({ from: Math.max(present.to, required.from), to: required.to });
  }
  return gaps.filter((g) => g.to > g.from);
}

/** Every gap must sit inside ONE merged cover — see "all or nothing" above. */
function isCovered(gaps: Span[], covers: Span[]): boolean {
  if (gaps.length === 0) return true;
  if (covers.length === 0) return false;
  const merged = merge(covers);
  return gaps.every((g) => merged.some((c) => c.from <= g.from && c.to >= g.to));
}

function spanMinutes(spans: Span[]): number {
  return merge(spans).reduce((n, s) => n + (s.to - s.from), 0);
}

function overlaps(a: Span, b: Span): boolean {
  return a.from < b.to && b.from < a.to;
}

export function evaluateDay({ inTime, outTime, timing, permissions }: EvaluateDayInput): EvaluateDayResult {
  const base = {
    excusedMinutes: 0,
    excusedBy: [] as string[],
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

  // 4. One punch only — a full-day absence, with the reason kept. See the
  //    header: neither half can be shown as worked to its end from a single
  //    punch, and the importer preserves the explanation in notes so this is
  //    not confused with a plain no-show.
  if (hasIn !== hasOut) {
    return {
      ...base,
      verdict: 'ABSENT',
      dayCalc: 'NONE',
      firstHalfAttended: false,
      secondHalfAttended: false,
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

  // The morning is gated on the grace deadline; the afternoon on the midpoint
  // of its own window. See the header for why the two differ.
  const shLatestArrival = Math.floor((shStart + shEnd) / 2);

  const baseFirst = inMin <= graceDeadline && outMin >= fhEnd;
  const baseSecond = inMin <= shLatestArrival && outMin >= shEnd;

  // Grace applies to the first half only — an explicit requirement. Since
  // 2026-08-20 this figure also DECIDES the morning: any value above zero means
  // the base morning test fails (a permission may still reinstate it below).
  const lateMinutes = Math.max(0, inMin - graceDeadline);

  // ---- Approved permissions reinstate a half they fully cover --------------
  const covers: Span[] = [];
  const coverIds: string[] = [];
  for (const p of permissions ?? []) {
    const from = timeToMinutes(p.from);
    const to = timeToMinutes(p.to);
    if (from === null || to === null || to <= from) continue;
    covers.push({ from, to });
    coverIds.push(p.id);
  }

  const present: Span = { from: inMin, to: outMin };
  const firstMissing = baseFirst ? [] : missingOf({ from: graceDeadline, to: fhEnd }, present);
  const secondMissing = baseSecond ? [] : missingOf({ from: shStart, to: shEnd }, present);

  const firstExcused = !baseFirst && isCovered(firstMissing, covers);
  const secondExcused = !baseSecond && isCovered(secondMissing, covers);

  const firstHalfAttended = baseFirst || firstExcused;
  const secondHalfAttended = baseSecond || secondExcused;

  // The two halves overlap (13:00 end vs 12:30 start), so union the excused
  // gaps before measuring rather than adding the two totals.
  const excusedGaps = [
    ...(firstExcused ? firstMissing : []),
    ...(secondExcused ? secondMissing : []),
  ];
  const excusedMinutes = spanMinutes(excusedGaps);
  const excusedBy = excusedGaps.length === 0
    ? []
    : coverIds.filter((_, i) => excusedGaps.some((g) => overlaps(g, covers[i])));

  const decided = { ...base, firstHalfAttended, secondHalfAttended, lateMinutes, excusedMinutes, excusedBy };

  if (firstHalfAttended && secondHalfAttended) {
    return { ...decided, verdict: 'PRESENT', dayCalc: 'FULL' };
  }
  if (firstHalfAttended || secondHalfAttended) {
    return { ...decided, verdict: 'HALF_DAY', dayCalc: 'HALF' };
  }
  // On site, but covering neither window — e.g. in at 11:00, out at 14:00.
  // hours_worked is still stored, so the shortfall is visible rather than hidden.
  return { ...decided, verdict: 'ABSENT', dayCalc: 'NONE' };
}
