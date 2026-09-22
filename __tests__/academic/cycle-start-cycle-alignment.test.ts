/**
 * Regression tests for a cycle timetable that begins mid-term on a day order
 * other than Cycle 1.
 *
 * BUG-006085 (reported 2026-09-10 by DR. B. PALANISAMY, HOD Chemistry, JKKN
 * College of Arts and Science (Aided)): "I PG time table start date -
 * 18.8.2026 and Day order - III, but not matching."
 *
 * Root cause, verified against production:
 *
 *   `timetables.start_date` is BOTH the term start and the rotation anchor.
 *   get_cycle_for_date defines "Cycle 1 = the first working day on or after
 *   start_date", so a timetable can only ever begin on Cycle 1.
 *
 *   I M.SC CHEMISTRY (27bb781a-4768-4a92-924c-d4d68ad25e82) is anchored
 *   2026-08-18 while 23 of the college's other active cycle timetables are
 *   anchored 2026-06-15. Working days between those anchors (Sundays and
 *   approved institution holidays excluded): 44. 44 mod 6 = 2, so this
 *   timetable reports Cycle 1 on 18 Aug while the college is on Cycle 3, and
 *   stays two cycles behind for the whole term.
 *
 *   BUG-005837 added a warning for exactly this shape, but the only remedy it
 *   could offer was moving start_date — which would misstate when the
 *   programme actually begins. `start_cycle` separates the two meanings: the
 *   term still starts 18 Aug, and that first working day carries Cycle 3.
 */

import { describe, it, expect } from 'vitest';
import {
  alignedStartCycle,
  describeCycleAnchorPhase
} from '@/lib/utils/academic/cycle-anchor-phase';

/** The real picture for JKKN College of Arts and Science (Aided) on 2026-09-10. */
const PEERS_AIDED = [
  { anchorDate: '2026-06-15', timetableCount: 23, workingDayGap: 44 }
];

describe('alignedStartCycle', () => {
  it('gives I M.SC CHEMISTRY the Cycle 3 its college is on (BUG-006085)', () => {
    expect(
      alignedStartCycle({
        candidateStartDate: '2026-08-18',
        numCycles: 6,
        peers: PEERS_AIDED
      })
    ).toBe(3);
  });

  it('returns Cycle 1 when the candidate already shares the dominant anchor', () => {
    expect(
      alignedStartCycle({
        candidateStartDate: '2026-06-15',
        numCycles: 6,
        peers: [{ anchorDate: '2026-06-15', timetableCount: 23, workingDayGap: 0 }]
      })
    ).toBe(1);
  });

  it('returns Cycle 1 when the gap is a whole number of cycles', () => {
    // Twelve working days on a six-cycle rotation is perfectly in phase, so the
    // ordinary "starts on Cycle 1" behaviour is already correct.
    expect(
      alignedStartCycle({
        candidateStartDate: '2026-07-01',
        numCycles: 6,
        peers: [{ anchorDate: '2026-06-15', timetableCount: 23, workingDayGap: 12 }]
      })
    ).toBe(1);
  });

  it('counts backwards when the college anchor is LATER than this start date', () => {
    // fn_cycle_anchor_peers reports the gap sign-independently, so direction has
    // to come from the dates. A timetable starting two working days BEFORE the
    // college anchor is two cycles ahead of Cycle 1, i.e. Cycle 5 of 6 — not
    // Cycle 3, which is what an unsigned gap would wrongly produce.
    expect(
      alignedStartCycle({
        candidateStartDate: '2026-06-11',
        numCycles: 6,
        peers: [{ anchorDate: '2026-06-15', timetableCount: 23, workingDayGap: 2 }]
      })
    ).toBe(5);
  });

  it('stays within 1..numCycles for a gap far larger than the rotation', () => {
    const cycle = alignedStartCycle({
      candidateStartDate: '2026-12-01',
      numCycles: 6,
      peers: [{ anchorDate: '2026-06-15', timetableCount: 23, workingDayGap: 143 }]
    });
    expect(cycle).toBeGreaterThanOrEqual(1);
    expect(cycle).toBeLessThanOrEqual(6);
    expect(cycle).toBe(6); // 143 mod 6 = 5
  });

  it('declines to guess on incomplete input rather than defaulting to 1', () => {
    // The form calls this while the author is still typing. Returning 1 would
    // silently overwrite a deliberate choice with a wrong one.
    expect(
      alignedStartCycle({ candidateStartDate: '', numCycles: 6, peers: PEERS_AIDED })
    ).toBeNull();
    expect(
      alignedStartCycle({ candidateStartDate: '2026-08-18', numCycles: null, peers: PEERS_AIDED })
    ).toBeNull();
    expect(
      alignedStartCycle({ candidateStartDate: '2026-08-18', numCycles: 6, peers: [] })
    ).toBeNull();
  });
});

describe('describeCycleAnchorPhase carries the remedy', () => {
  it('names the day order that would put I M.SC CHEMISTRY back in phase', () => {
    const warning = describeCycleAnchorPhase({
      candidateStartDate: '2026-08-18',
      numCycles: 6,
      peers: PEERS_AIDED
    });

    expect(warning).not.toBeNull();
    expect(warning?.offset).toBe(2);
    // The old advice was "move start_date", which would misstate the term start.
    // The honest remedy keeps 18 Aug and starts it on Cycle 3.
    expect(warning?.suggestedStartCycle).toBe(3);
  });

  it('offers no start cycle when there is nothing out of phase to fix', () => {
    expect(
      describeCycleAnchorPhase({
        candidateStartDate: '2026-07-01',
        numCycles: 6,
        peers: [{ anchorDate: '2026-06-15', timetableCount: 23, workingDayGap: 12 }]
      })
    ).toBeNull();
  });
});
