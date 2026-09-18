// ============================================================================
// LIVE LOOPS — the row builder behind /admin/loops/live
// ============================================================================
// What the Director asked to see, tested where the decisions actually are:
//
//   1. EMPTY — a loop with no measurement rows says so in words. On the day the
//      page ships that is all 43 active loops, so this is the main state.
//   2. FINAL ONLY — the settled row is the verdict; nothing is greyed.
//   3. IN-PROGRESS NEWEST — a partial reading is carried SEPARATELY and never
//      replaces the settled figure underneath it (the whole point of the
//      greying). An in-progress row with no settled row behind it leaves the
//      verdict empty rather than borrowing the partial number.
//   4. CEILING vs FLOOR — a 'threshold' bar is a ceiling (cleared at or below),
//      every other kind a floor (cleared at or above); `met` is read from the
//      row, never recomputed, so the page cannot disagree with the measurement
//      that moved the miss streak.
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  buildLiveLoopRow,
  buildLiveLoopRows,
  NO_FINAL_YET,
  NO_MEASUREMENT_YET,
  type LoopMeasurementRow,
  type LoopRegistryBarRow,
} from '@/app/(routes)/admin/loops/live/_lib/build-live-rows';

function loop(over: Partial<LoopRegistryBarRow> = {}): LoopRegistryBarRow {
  return {
    loop_key: 'attendance-intervention',
    name: 'Attendance intervention',
    bar: null,
    bar_kind: null,
    bar_set_at: null,
    bar_set_by: null,
    bar_miss_streak: 0,
    ...over,
  };
}

function measurement(over: Partial<LoopMeasurementRow> = {}): LoopMeasurementRow {
  return {
    measured_at: '2026-09-18T06:00:00.000Z',
    value: 90,
    bar_value: 85,
    met: true,
    gap: '5.00 vs the bar (floor)',
    run_id: 'run-1',
    status: 'final',
    ...over,
  };
}

describe('buildLiveLoopRow — empty', () => {
  it('reports no measurement recorded yet, with no verdict and no greyed figure', () => {
    const row = buildLiveLoopRow(loop(), []);

    expect(row.hasAnyMeasurement).toBe(false);
    expect(row.lastFinal).toBeNull();
    expect(row.inProgress).toBeNull();
    expect(NO_MEASUREMENT_YET).toBe('no measurement recorded yet');
  });

  it('falls back to the loop key when the registry row has no name', () => {
    const row = buildLiveLoopRow(loop({ name: '  ' }), []);
    expect(row.name).toBe('attendance-intervention');
  });

  it('says there is no bar when none is approved', () => {
    const row = buildLiveLoopRow(loop(), []);
    expect(row.bar).toBeNull();
    expect(row.barDirection).toBeNull();
    expect(row.barReadsAs).toBeNull();
  });
});

describe('buildLiveLoopRow — final only', () => {
  it('uses the newest settled row as the verdict and greys nothing', () => {
    const row = buildLiveLoopRow(loop(), [
      measurement({ measured_at: '2026-09-10T06:00:00.000Z', value: 70, met: false }),
      measurement({ measured_at: '2026-09-17T06:00:00.000Z', value: 91 }),
    ]);

    expect(row.inProgress).toBeNull();
    expect(row.hasAnyMeasurement).toBe(true);
    expect(row.lastFinal?.value).toBe(91);
    expect(row.lastFinal?.verdict).toBe('cleared');
  });

  it('calls a NULL met "not comparable", never a miss', () => {
    const row = buildLiveLoopRow(loop(), [
      measurement({ met: null, bar_value: null, gap: 'no numeric bar yet' }),
    ]);
    expect(row.lastFinal?.verdict).toBe('not-comparable');
    expect(row.lastFinal?.met).toBeNull();
  });
});

describe('buildLiveLoopRow — in-progress newest', () => {
  it('carries the partial reading separately and keeps the older settled verdict', () => {
    const row = buildLiveLoopRow(loop(), [
      measurement({ measured_at: '2026-09-17T06:00:00.000Z', value: 88, met: true }),
      measurement({
        measured_at: '2026-09-18T06:00:00.000Z',
        value: 12,
        met: null,
        status: 'in_progress',
      }),
    ]);

    expect(row.inProgress?.value).toBe(12);
    expect(row.lastFinal?.value).toBe(88);
    expect(row.lastFinal?.verdict).toBe('cleared');
  });

  it('leaves the verdict empty when every row is still in progress', () => {
    const row = buildLiveLoopRow(loop(), [
      measurement({ value: 12, met: null, status: 'in_progress' }),
    ]);

    expect(row.lastFinal).toBeNull();
    expect(row.inProgress?.value).toBe(12);
    expect(row.hasAnyMeasurement).toBe(true);
    expect(NO_FINAL_YET).toBe('no settled measurement yet');
  });

  it('does not grey a settled row that happens to be newest', () => {
    const row = buildLiveLoopRow(loop(), [
      measurement({ measured_at: '2026-09-17T06:00:00.000Z', status: 'in_progress', value: 5 }),
      measurement({ measured_at: '2026-09-18T06:00:00.000Z', value: 95 }),
    ]);

    expect(row.inProgress).toBeNull();
    expect(row.lastFinal?.value).toBe(95);
  });
});

describe('buildLiveLoopRow — ceiling vs floor', () => {
  it('reads a threshold bar as a ceiling: cleared at or below', () => {
    const row = buildLiveLoopRow(
      loop({ bar: '85', bar_kind: 'threshold' }),
      [measurement({ value: 80, bar_value: 85, met: true, gap: '-5.00 vs the bar (ceiling)' })]
    );

    expect(row.barDirection).toBe('ceiling');
    expect(row.barReadsAs).toBe('cleared at or below 85');
    expect(row.lastFinal?.verdict).toBe('cleared');
  });

  it('reads a comparison bar as a floor: cleared at or above', () => {
    const row = buildLiveLoopRow(
      loop({ bar: '85', bar_kind: 'comparison' }),
      [measurement({ value: 80, bar_value: 85, met: false, gap: '-5.00 vs the bar (floor)' })]
    );

    expect(row.barDirection).toBe('floor');
    expect(row.barReadsAs).toBe('cleared at or above 85');
    expect(row.lastFinal?.verdict).toBe('missed');
  });

  it('treats a reference bar as a floor too', () => {
    const row = buildLiveLoopRow(loop({ bar: '12.5', bar_kind: 'reference' }), []);
    expect(row.barDirection).toBe('floor');
    expect(row.barReadsAs).toBe('cleared at or above 12.5');
  });

  it('never turns a prose bar into a number', () => {
    const row = buildLiveLoopRow(
      loop({ bar: 'forward-move rate vs own trailing 8 weeks', bar_kind: 'comparison' }),
      []
    );
    expect(row.barReadsAs).toBe('read as a floor — cleared at or above the bar');
  });

  it('reports met exactly as recorded, even when it disagrees with the numbers', () => {
    // fn_loop_record_measurement already judged this run; the page reports that
    // judgement rather than re-deriving one that could contradict the row which
    // moved the miss streak.
    const row = buildLiveLoopRow(
      loop({ bar: '85', bar_kind: 'comparison' }),
      [measurement({ value: 90, bar_value: 85, met: false })]
    );
    expect(row.lastFinal?.met).toBe(false);
    expect(row.lastFinal?.verdict).toBe('missed');
  });
});

describe('buildLiveLoopRows — ordering', () => {
  it('sorts loops in trouble first, then by name', () => {
    const rows = buildLiveLoopRows(
      [
        loop({ loop_key: 'b', name: 'Bravo', bar_miss_streak: 0 }),
        loop({ loop_key: 'a', name: 'Alpha', bar_miss_streak: 0 }),
        loop({ loop_key: 'z', name: 'Zulu', bar_miss_streak: 4 }),
      ],
      {}
    );

    expect(rows.map((r) => r.loopKey)).toEqual(['z', 'a', 'b']);
  });

  it('treats a missing miss streak as zero rather than NaN', () => {
    const rows = buildLiveLoopRows(
      [loop({ bar_miss_streak: null })],
      {}
    );
    expect(rows[0].missStreak).toBe(0);
  });
});
