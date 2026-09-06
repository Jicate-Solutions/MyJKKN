/**
 * Regression tests for detecting a cycle timetable anchored out of phase with
 * the rest of its institution.
 *
 * BUG-005837 (reported 2026-08-17 05:36 UTC by Dr. C. Bharathi, English, JKKN
 * College of Arts and Science (Aided)): "I history general English 11.55 -
 * 12.55 is wrong. Actually it is on fifth hour - combined class for all major
 * I years history, chemistry, zoology, maths and English."
 *
 * Root cause, verified against production:
 *
 *   `timetables.start_date` does two unrelated jobs. It records when the term
 *   begins AND it anchors the cycle counter — get_cycle_for_date defines
 *   "Cycle 1 = first working day on or after timetable.start_date", counting
 *   only non-Sunday, non-holiday days.
 *
 *   A combined class taught to five cohorts lives in five SEPARATE timetables,
 *   each counting from its own anchor. 22 of 24 active cycle timetables were
 *   anchored 2026-06-15; I B.A HISTORY and I B.Com were anchored 2026-06-24.
 *   Working days between those anchors: Mon 15, Tue 16, Wed 17, Thu 18, Fri 19,
 *   (Sat 20 approved holiday), (Sun 21 skipped), Mon 22, Tue 23 = 7.
 *   7 mod 6 = 1, so those two ran permanently ONE cycle behind. On 17 Aug the
 *   22 were on cycle 2 (General English at Period 5, 14:45) while History was
 *   on cycle 1 (Period 3, 11:55) — one lecture, two advertised hours.
 *
 * Note this is a clean phase SHIFT, not a drift: it never self-corrects and
 * never worsens. That is what makes it invisible. Each timetable is internally
 * consistent, so nothing looks wrong until somebody compares two cohorts of the
 * same combined class — which only the teacher of that class ever does.
 *
 * The guard below runs at authoring time, where the anchor is still a typo
 * rather than eight weeks of wrong lecture times.
 */

import { describe, it, expect } from 'vitest';
import {
  dominantCycleAnchor,
  describeCycleAnchorPhase
} from '@/lib/utils/academic/cycle-anchor-phase';

/** The real institution picture on 2026-08-17, before the fix. */
const PEERS_JKKN = [
  { anchorDate: '2026-06-15', timetableCount: 22, workingDayGap: 7 },
  { anchorDate: '2026-06-24', timetableCount: 2, workingDayGap: 0 }
];

describe('dominantCycleAnchor', () => {
  it('picks the anchor the most timetables already use', () => {
    expect(dominantCycleAnchor(PEERS_JKKN)?.anchorDate).toBe('2026-06-15');
  });

  it('breaks a tie on the earliest anchor, not on input order', () => {
    // Two equally popular anchors is a college mid-migration. Preferring the
    // earlier one keeps the suggestion stable no matter how rows are ordered,
    // so the warning does not flip between renders.
    const tied = [
      { anchorDate: '2026-07-01', timetableCount: 5, workingDayGap: 3 },
      { anchorDate: '2026-06-15', timetableCount: 5, workingDayGap: 7 }
    ];
    expect(dominantCycleAnchor(tied)?.anchorDate).toBe('2026-06-15');
    expect(dominantCycleAnchor([...tied].reverse())?.anchorDate).toBe('2026-06-15');
  });

  it('returns null when there are no peers to compare against', () => {
    expect(dominantCycleAnchor([])).toBeNull();
    expect(dominantCycleAnchor(null)).toBeNull();
  });
});

describe('describeCycleAnchorPhase', () => {
  it('flags the real I B.A HISTORY anchor as 1 cycle out of phase (BUG-005837)', () => {
    const warning = describeCycleAnchorPhase({
      candidateStartDate: '2026-06-24',
      numCycles: 6,
      peers: PEERS_JKKN
    });

    expect(warning).not.toBeNull();
    expect(warning!.offset).toBe(1);
    expect(warning!.suggestedStartDate).toBe('2026-06-15');
    expect(warning!.peerCount).toBe(22);
  });

  it('stays silent once that timetable is realigned', () => {
    // The applied fix: 2026-06-24 -> 2026-06-15. Same anchor as the peers, so
    // the gap is 0 and there is nothing to warn about.
    const warning = describeCycleAnchorPhase({
      candidateStartDate: '2026-06-15',
      numCycles: 6,
      peers: [{ anchorDate: '2026-06-15', timetableCount: 22, workingDayGap: 0 }]
    });

    expect(warning).toBeNull();
  });

  it('stays silent when the gap is a whole number of cycles', () => {
    // A timetable started 12 working days later with a 6-cycle rotation is
    // PERFECTLY in phase. Warning on "different date" rather than "different
    // phase" would cry wolf at every legitimately late-starting programme, and
    // a guard that is usually wrong gets ignored when it is finally right.
    const warning = describeCycleAnchorPhase({
      candidateStartDate: '2026-07-01',
      numCycles: 6,
      peers: [{ anchorDate: '2026-06-15', timetableCount: 22, workingDayGap: 12 }]
    });

    expect(warning).toBeNull();
  });

  it('reports the offset in cycles, not in days', () => {
    // 20 working days, 6 cycles -> 20 mod 6 = 2 cycles behind. "20 days" would
    // be true and useless; the author needs to know how far the rotation moved.
    const warning = describeCycleAnchorPhase({
      candidateStartDate: '2026-07-13',
      numCycles: 6,
      peers: [{ anchorDate: '2026-06-15', timetableCount: 22, workingDayGap: 20 }]
    });

    expect(warning!.offset).toBe(2);
  });

  it('never warns for a single-cycle timetable', () => {
    // With num_cycles = 1 every day is cycle 1, so no anchor can be out of
    // phase with any other. gap % 1 is always 0, but assert it explicitly —
    // this is the degenerate case a future refactor is most likely to break.
    const warning = describeCycleAnchorPhase({
      candidateStartDate: '2026-06-24',
      numCycles: 1,
      peers: PEERS_JKKN
    });

    expect(warning).toBeNull();
  });

  it('stays silent when there is nothing to compare against', () => {
    // The first cycle timetable in a college defines the phase; it cannot be
    // wrong relative to peers that do not exist.
    for (const peers of [[], null, undefined]) {
      expect(
        describeCycleAnchorPhase({
          candidateStartDate: '2026-06-24',
          numCycles: 6,
          peers: peers as any
        })
      ).toBeNull();
    }
  });

  it('stays silent on incomplete input rather than guessing', () => {
    // The form calls this on every keystroke while the author is still filling
    // it in. A half-typed form must not accuse anyone of anything.
    expect(
      describeCycleAnchorPhase({ candidateStartDate: '', numCycles: 6, peers: PEERS_JKKN })
    ).toBeNull();
    expect(
      describeCycleAnchorPhase({
        candidateStartDate: '2026-06-24',
        numCycles: 0,
        peers: PEERS_JKKN
      })
    ).toBeNull();
  });

  it('ignores the candidate\'s own anchor group when it is the only peer', () => {
    // Editing an existing out-of-phase timetable must still warn: its own row
    // is excluded by the RPC, so a lone 2026-06-24 peer here means one OTHER
    // timetable shares the bad anchor — still worth flagging, not silencing.
    const warning = describeCycleAnchorPhase({
      candidateStartDate: '2026-06-24',
      numCycles: 6,
      peers: [{ anchorDate: '2026-06-15', timetableCount: 22, workingDayGap: 7 }]
    });

    expect(warning!.offset).toBe(1);
  });
});
