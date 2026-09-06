import { describe, expect, it } from 'vitest';
import { computeSchemeTotals } from '@/lib/utils/bos/course-scheme-totals';

// Shorthand row builder: [group_order, credit, L, T, P, marks]
const row = (
  group_order: number | null,
  credit: number,
  theory_hours: number,
  tutorial_hours: number,
  practical_hours: number,
  total_max_mark: number,
) => ({ group_order, credit, theory_hours, tutorial_hours, practical_hours, total_max_mark });

describe('computeSchemeTotals', () => {
  it('sums every row when nothing is grouped', () => {
    const totals = computeSchemeTotals([
      row(null, 3, 6, 0, 0, 100),
      row(null, 5, 5, 0, 0, 100),
      row(null, 5, 0, 0, 5, 100),
    ]);
    expect(totals).toMatchObject({ credits: 13, theory: 11, practical: 5, marks: 300, hours: 16 });
  });

  it('sums singleton groups like ungrouped rows', () => {
    // group_order usually equals the row's own course order, so standalone
    // courses each carry a unique number — they must count individually.
    const totals = computeSchemeTotals([
      row(1, 3, 6, 0, 0, 100),
      row(2, 5, 5, 0, 0, 100),
      row(3, 5, 0, 0, 5, 100),
    ]);
    expect(totals).toMatchObject({ credits: 13, theory: 11, practical: 5, marks: 300, hours: 16 });
  });

  it('counts a group once across credits, L/T/P and marks', () => {
    // The reported case: three DSE options sharing one group_order. Each is
    // 3 credits, 4 L, 100 marks — the group must contribute 3 / 4 / 100,
    // not 9 / 12 / 300.
    const totals = computeSchemeTotals([
      row(6, 3, 4, 0, 0, 100),
      row(6, 3, 4, 0, 0, 100),
      row(6, 3, 4, 0, 0, 100),
    ]);
    expect(totals).toMatchObject({ credits: 3, theory: 4, practical: 0, marks: 100, hours: 4 });
  });

  it('keeps separate groups separate and adds ungrouped rows alongside', () => {
    const totals = computeSchemeTotals([
      row(null, 4, 5, 0, 0, 100), // standalone core (no group_order)
      row(2, 3, 4, 0, 0, 100),    // group 2 - two options
      row(2, 3, 4, 0, 0, 100),
      row(5, 3, 0, 0, 4, 100),    // group 5 - three options
      row(5, 3, 0, 0, 4, 100),
      row(5, 3, 0, 0, 4, 100),
    ]);
    // 4 + 3 + 3 credits; 5 + 4 L; 4 P; 300 marks
    expect(totals).toMatchObject({ credits: 10, theory: 9, practical: 4, marks: 300, hours: 13 });
  });

  it('picks the highest-credit member as the group representative', () => {
    const totals = computeSchemeTotals([
      row(7, 2, 2, 0, 0, 100),
      row(7, 4, 5, 0, 1, 100), // highest credit wins, and its hours come with it
      row(7, 3, 3, 0, 0, 100),
    ]);
    expect(totals).toMatchObject({ credits: 4, theory: 5, practical: 1, hours: 6 });
  });

  it('keeps the first-listed option when credits tie', () => {
    const totals = computeSchemeTotals([
      row(9, 3, 5, 0, 0, 100),
      row(9, 3, 1, 0, 4, 100),
    ]);
    expect(totals).toMatchObject({ credits: 3, theory: 5, practical: 0 });
  });

  it('treats missing/non-numeric values as zero rather than NaN', () => {
    const totals = computeSchemeTotals([
      { group_order: null, credit: null, total_max_mark: 100 },
      { group_order: null },
    ]);
    expect(totals).toMatchObject({ credits: 0, theory: 0, marks: 100, hours: 0 });
  });
});
