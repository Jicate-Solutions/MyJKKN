/**
 * Detecting a cycle timetable anchored out of phase with its institution.
 *
 * Added: 2026-08-17 (BUG-005837).
 *
 * `timetables.start_date` carries two unrelated meanings. It records when the
 * term begins, and it anchors the cycle counter: get_cycle_for_date defines
 * "Cycle 1 = the first working day on or after start_date", advancing only on
 * non-Sunday, non-holiday days.
 *
 * Nothing ties that anchor to anything institution-wide, so two timetables in
 * the same college rotate independently. That is invisible until a class is
 * shared: a combined lecture taught to five cohorts lives in five separate
 * timetables, and if their anchors differ by a working-day count that is not a
 * multiple of `num_cycles`, the same lecture is advertised at different hours to
 * different cohorts, every week, forever.
 *
 * It is a phase SHIFT, not a drift — it never self-corrects and never worsens,
 * and each timetable stays internally consistent. Only the teacher of the shared
 * class is positioned to notice, which is exactly how BUG-005837 was found: 22
 * of 24 timetables anchored 2026-06-15, two anchored 2026-06-24, 7 working days
 * apart, 7 mod 6 = 1 cycle behind.
 *
 * These helpers are pure. Counting working days needs the institution's approved
 * holiday calendar, so the gap arrives precomputed from the
 * `fn_cycle_anchor_peers` RPC — the same skip rules get_cycle_for_date applies.
 */

/** One distinct anchor date in use by an institution's other cycle timetables. */
export interface CycleAnchorPeer {
  /** `timetables.start_date` shared by this group. */
  anchorDate: string;
  /** How many active cycle timetables use it. */
  timetableCount: number;
  /**
   * Working days between this anchor and the candidate's, Sundays and approved
   * institution holidays excluded, sign-independent.
   */
  workingDayGap: number;
}

export interface CycleAnchorPhaseWarning {
  /** How many cycles behind/ahead of the dominant anchor, 1..numCycles-1. */
  offset: number;
  /** The anchor most of the institution already uses. */
  suggestedStartDate: string;
  /** How many timetables use it — the weight behind the suggestion. */
  peerCount: number;
  /** Working days between the two anchors, for the explanatory line. */
  workingDayGap: number;
}

/**
 * The anchor the institution has effectively standardised on.
 *
 * Ties break on the earliest date rather than input order: a college
 * mid-migration can genuinely have two equally popular anchors, and an
 * order-dependent answer would make the warning flip between renders for no
 * reason the author could see.
 */
export function dominantCycleAnchor(
  peers: CycleAnchorPeer[] | null | undefined
): CycleAnchorPeer | null {
  if (!Array.isArray(peers) || peers.length === 0) return null;

  return peers.reduce((best, peer) => {
    if (peer.timetableCount > best.timetableCount) return peer;
    if (peer.timetableCount === best.timetableCount && peer.anchorDate < best.anchorDate) {
      return peer;
    }
    return best;
  });
}

/**
 * Warn only when the rotation is genuinely out of phase — never merely because
 * a date differs.
 *
 * A programme that starts twelve working days late with a six-cycle rotation is
 * perfectly in phase and must not be flagged. Warning on "different date" would
 * fire at every legitimately late-starting programme, and a guard that is
 * usually wrong gets ignored on the day it is finally right.
 *
 * Returns null for incomplete input: the form calls this while the author is
 * still typing, and a half-filled form must not accuse anyone of anything.
 */
export function describeCycleAnchorPhase(params: {
  candidateStartDate: string | null | undefined;
  numCycles: number | null | undefined;
  peers: CycleAnchorPeer[] | null | undefined;
}): CycleAnchorPhaseWarning | null {
  const { candidateStartDate, numCycles, peers } = params;

  if (!candidateStartDate) return null;
  if (!numCycles || numCycles < 2) return null; // num_cycles 1 => every day is cycle 1

  const dominant = dominantCycleAnchor(peers);
  if (!dominant) return null;
  if (dominant.anchorDate === candidateStartDate) return null;

  const offset = Math.abs(dominant.workingDayGap) % numCycles;
  if (offset === 0) return null;

  return {
    offset,
    suggestedStartDate: dominant.anchorDate,
    peerCount: dominant.timetableCount,
    workingDayGap: Math.abs(dominant.workingDayGap)
  };
}

/** The warning sentence shown under the start-date field. */
export function formatCycleAnchorWarning(warning: CycleAnchorPhaseWarning): string {
  const cycles = warning.offset === 1 ? 'cycle' : 'cycles';
  const tables = warning.peerCount === 1 ? 'timetable' : 'timetables';

  return (
    `This start date puts the rotation ${warning.offset} ${cycles} out of phase with ` +
    `${warning.peerCount} other active cycle ${tables} (anchored ${warning.suggestedStartDate}, ` +
    `${warning.workingDayGap} working days apart). Sessions shared with those cohorts — ` +
    `combined, allied and non-major electives — will show at a different hour here than ` +
    `they do for everyone else.`
  );
}
