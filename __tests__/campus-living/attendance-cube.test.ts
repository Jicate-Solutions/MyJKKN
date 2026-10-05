import { describe, expect, it } from 'vitest';
import {
  addDays,
  bucketFor,
  csvField,
  groupBy,
  groupRowsToCsv,
  hasFilter,
  heatmap,
  istToday,
  periodRange,
  rank,
  statusMix,
  toCsv,
  toggleFilter,
  totals,
  treeFor,
  trendBy,
  weekStart,
} from '@/lib/campus-living/attendance-cube';
import type { AttendanceBreakdown } from '@/types/campus-living/attendance-analytics';

const I1 = 'inst-eng';
const I2 = 'inst-pharm';
const P1 = 'dept-cse';
const P2 = 'dept-ece';
const P3 = 'dept-bpharm';
const B1 = 'block-a';
const B2 = 'block-b';

function row(d: string, b: string, i: string, p: string, pr: number, la: number, ab: number, ol = 0, me = 0) {
  return { d, b, i, p, m: pr + la + ab + ol + me, pr, la, ab, ol, me };
}

function data(overrides: Partial<AttendanceBreakdown> = {}): AttendanceBreakdown {
  return {
    range: { from: '2026-10-01', to: '2026-10-02' },
    block_id: null,
    risk_pct: 75,
    cube: [
      row('2026-10-01', B1, I1, P1, 8, 1, 1),
      row('2026-10-01', B1, I1, P2, 4, 0, 6, 2),
      row('2026-10-01', B2, I2, P3, 5, 0, 0, 0, 1),
      row('2026-10-02', B1, I1, P1, 9, 0, 1),
      row('2026-10-02', B2, I2, P3, 3, 0, 2),
    ],
    residents: [
      { b: B1, i: I1, p: P1, residents: 12, marked: 11 },
      { b: B1, i: I1, p: P2, residents: 14, marked: 10 },
      { b: B2, i: I2, p: P3, residents: 6, marked: 6 },
    ],
    risk: [
      { b: B1, i: I1, p: P1, learners: 11, at_risk: 1 },
      { b: B1, i: I1, p: P2, learners: 10, at_risk: 6 },
      { b: B2, i: I2, p: P3, learners: 6, at_risk: 2 },
    ],
    institutions: [
      { id: I1, name: 'Engineering' },
      { id: I2, name: 'Pharmacy' },
    ],
    departments: [
      { id: P1, name: 'CSE', institution_id: I1 },
      { id: P2, name: 'ECE', institution_id: I1 },
      { id: P3, name: 'B.Pharm', institution_id: I2 },
    ],
    blocks: [
      { id: B1, name: 'Block A', code: 'A' },
      { id: B2, name: 'Block B', code: 'B' },
    ],
    residents_visible: true,
    ...overrides,
  };
}

describe('totals — the overall row', () => {
  it('sums every cube row, and the rate counts present+late over present+late+absent', () => {
    const t = totals(data());
    expect(t.marks).toBe(10 + 12 + 6 + 10 + 5);
    expect(t.present).toBe(8 + 4 + 5 + 9 + 3);
    expect(t.late).toBe(1);
    expect(t.absent).toBe(1 + 6 + 0 + 1 + 2);
    expect(t.onLeave).toBe(2);
    expect(t.medical).toBe(1);
    // attended 30, denom 30 + 10 = 40
    expect(t.denom).toBe(40);
    expect(t.pct).toBe(75);
  });

  it('on leave and medical do not enter the denominator', () => {
    const t = totals(data({ cube: [row('2026-10-01', B1, I1, P1, 5, 0, 5, 40, 40)] }));
    expect(t.denom).toBe(10);
    expect(t.pct).toBe(50);
  });

  it('is null — not 0% — when nothing counted', () => {
    const t = totals(data({ cube: [row('2026-10-01', B1, I1, P1, 0, 0, 0, 7)] }));
    expect(t.denom).toBe(0);
    expect(t.pct).toBeNull();
  });

  it('carries residents, marked and not-marked from the residents cells', () => {
    const t = totals(data());
    expect(t.residents).toBe(32);
    expect(t.marked).toBe(27);
    expect(t.notMarked).toBe(5);
    expect(t.atRisk).toBe(9);
  });

  it('reports residents as null — never "N of 0" — when allocations are not visible', () => {
    const t = totals(data({ residents_visible: false, residents: [] }));
    expect(t.residents).toBeNull();
    expect(t.marked).toBeNull();
    expect(t.notMarked).toBeNull();
  });

  it('applies the filter to every part', () => {
    const t = totals(data(), { institutionId: I2 });
    expect(t.marks).toBe(11);
    expect(t.residents).toBe(6);
    expect(t.atRisk).toBe(2);
  });
});

describe('groupBy', () => {
  it('institution: one row each with its overall counts, sorted by name', () => {
    const rows = groupBy(data(), 'institution');
    expect(rows.map((r) => r.label)).toEqual(['Engineering', 'Pharmacy']);
    expect(rows[0].marks).toBe(10 + 12 + 10);
    expect(rows[0].residents).toBe(26);
    expect(rows[1].residents).toBe(6);
  });

  it('the group totals add up to the overall row', () => {
    const d = data();
    for (const dim of ['institution', 'department', 'block'] as const) {
      const rows = groupBy(d, dim);
      expect(rows.reduce((s, r) => s + r.marks, 0)).toBe(totals(d).marks);
      expect(rows.reduce((s, r) => s + (r.residents ?? 0), 0)).toBe(totals(d).residents);
    }
  });

  it('department rows name their institution', () => {
    const rows = groupBy(data(), 'department');
    expect(rows.find((r) => r.key === P3)?.parentLabel).toBe('Pharmacy');
  });

  it('date: ascending, and has no resident count', () => {
    const rows = groupBy(data(), 'date');
    expect(rows.map((r) => r.key)).toEqual(['2026-10-01', '2026-10-02']);
    expect(rows[0].residents).toBeNull();
  });

  it('a filter narrows every dimension at once', () => {
    const rows = groupBy(data(), 'block', { departmentId: P1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Block A');
    expect(rows[0].marks).toBe(10 + 10);
  });

  it('an unresolvable id is labelled, not dropped', () => {
    const d = data({ cube: [row('2026-10-01', B1, 'inst-ghost', P1, 1, 0, 0)] });
    const g = groupBy(d, 'institution').find((r) => r.key === 'inst-ghost');
    expect(g?.label).toBe('Unknown institution');
  });

  it('a null dimension is its own Unknown group', () => {
    const d = data({ cube: [{ ...row('2026-10-01', B1, I1, P1, 1, 0, 0), p: null }] });
    expect(groupBy(d, 'department').map((r) => r.label)).toContain('Unknown department');
  });

  it('an empty cube yields no rows and a null-rate overall', () => {
    const d = data({ cube: [], residents: [], risk: [] });
    expect(groupBy(d, 'institution')).toEqual([]);
    expect(totals(d).pct).toBeNull();
  });
});

describe('rank', () => {
  it('orders best and worst by rate, then by evidence, then by name', () => {
    // CSE 18/20 = 90, B.Pharm 8/10 = 80, ECE 4/10 = 40
    const { best, worst } = rank(groupBy(data(), 'department'), 5, 1);
    expect(best.map((r) => r.label)).toEqual(['CSE', 'B.Pharm', 'ECE']);
    expect(worst.map((r) => r.label)).toEqual(['ECE', 'B.Pharm', 'CSE']);
  });

  it('does not rank a row with too little evidence', () => {
    const rows = groupBy(data(), 'department');
    expect(rank(rows, 5, 1000).best).toEqual([]);
  });

  it('breaks a tie on evidence, deterministically', () => {
    const d = data({
      cube: [row('2026-10-01', B1, I1, P1, 5, 0, 5), row('2026-10-01', B1, I1, P2, 10, 0, 10)],
    });
    const { best } = rank(groupBy(d, 'department'), 5, 1);
    expect(best.map((r) => r.key)).toEqual([P2, P1]);
  });
});

describe('statusMix', () => {
  it('lists only statuses that occurred', () => {
    expect(statusMix(totals(data())).map((s) => s.key)).toEqual(['present', 'late', 'absent', 'onLeave', 'medical']);
    expect(statusMix(totals(data({ cube: [row('2026-10-01', B1, I1, P1, 3, 0, 0)] }))).map((s) => s.key)).toEqual([
      'present',
    ]);
  });
});

describe('trend + heatmap', () => {
  it('one series per institution, one point per day, null where nothing counted', () => {
    const t = trendBy(data(), 'institution');
    expect(t.series.map((s) => s.label)).toEqual(['Engineering', 'Pharmacy']);
    expect(t.buckets).toEqual(['2026-10-01', '2026-10-02']);
    // Engineering on the 1st: attended 8+1+4 = 13 of 13 + 1 + 6 absent = 20 → 65%
    expect(t.points[0][I1]).toBe(65);
  });

  it('a gap is null, not 0', () => {
    const d = data({ cube: [row('2026-10-01', B1, I1, P1, 5, 0, 0), row('2026-10-02', B2, I2, P3, 5, 0, 0)] });
    const t = trendBy(d, 'institution');
    expect(t.points[0][I2]).toBeNull();
    expect(t.points[1][I1]).toBeNull();
  });

  it('buckets by week once the range passes 31 days', () => {
    expect(bucketFor('2026-10-01', '2026-10-31')).toBe('day');
    expect(bucketFor('2026-09-01', '2026-10-31')).toBe('week');
    const d = data({
      range: { from: '2026-08-01', to: '2026-10-31' },
      cube: [row('2026-10-05', B1, I1, P1, 1, 0, 0), row('2026-10-07', B1, I1, P1, 1, 0, 1)],
    });
    expect(trendBy(d, 'institution').buckets).toEqual(['2026-10-05']);
  });

  it('weekStart is the Monday, in UTC', () => {
    expect(weekStart('2026-10-05')).toBe('2026-10-05');
    expect(weekStart('2026-10-11')).toBe('2026-10-05');
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
  });

  it('heatmap cells carry the evidence behind the colour', () => {
    const h = heatmap(data(), 'institution');
    expect(h.rows).toHaveLength(2);
    expect(h.cells[I2]['2026-10-01'].denom).toBe(5);
    expect(h.cells[I2]['2026-10-01'].pct).toBe(100);
  });
});

describe('treeFor', () => {
  it('nests institution → department → block and each node carries its click filter', () => {
    const tree = treeFor(data());
    const eng = tree.find((n) => n.id === I1)!;
    expect(eng.children?.map((c) => c.name)).toEqual(['CSE', 'ECE']);
    expect(eng.children![0].children![0].filter).toEqual({ institutionId: I1, departmentId: P1, blockId: B1 });
    expect(eng.filter).toEqual({ institutionId: I1 });
  });

  it('a parent size is the sum of its children', () => {
    const eng = treeFor(data()).find((n) => n.id === I1)!;
    expect(eng.size).toBe(eng.children!.reduce((s, c) => s + c.size, 0));
  });

  it('drops a node with nothing counted rather than drawing a zero-size box', () => {
    const d = data({ cube: [row('2026-10-01', B1, I1, P1, 0, 0, 0, 5)] });
    expect(treeFor(d)).toEqual([]);
  });
});

describe('toggleFilter', () => {
  const d = data();

  it('sets, then clears, the same value', () => {
    const on = toggleFilter({}, 'institution', I1, d);
    expect(on.institutionId).toBe(I1);
    expect(toggleFilter(on, 'institution', I1, d).institutionId).toBeNull();
  });

  it('picking a department also sets its institution', () => {
    expect(toggleFilter({}, 'department', P3, d)).toEqual({ departmentId: P3, institutionId: I2 });
  });

  it('picking another institution drops a department that is not in it', () => {
    const f = toggleFilter({ institutionId: I1, departmentId: P1 }, 'institution', I2, d);
    expect(f).toEqual({ institutionId: I2, departmentId: null });
  });

  it('clearing the institution clears its department too', () => {
    const f = toggleFilter({ institutionId: I1, departmentId: P1 }, 'institution', I1, d);
    expect(f).toEqual({ institutionId: null, departmentId: null });
  });

  it('toggles a block independently', () => {
    expect(toggleFilter({ institutionId: I1 }, 'block', B1, d)).toEqual({ institutionId: I1, blockId: B1 });
  });

  it('ignores the unknown bucket', () => {
    expect(toggleFilter({}, 'institution', '__unknown__', d)).toEqual({});
  });

  it('hasFilter', () => {
    expect(hasFilter({})).toBe(false);
    expect(hasFilter({ blockId: B1 })).toBe(true);
  });
});

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('l1\nl2')).toBe('"l1\nl2"');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('-2')).toBe("'-2");
    expect(csvField('@x')).toBe("'@x");
  });

  it('keeps numbers numeric (a negative number is not a formula) and null empty', () => {
    expect(csvField(-3)).toBe('-3');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('writes a header, the rows and an overall line', () => {
    const rows = groupBy(data(), 'institution');
    const csv = groupRowsToCsv(rows, 'institution', totals(data()));
    const lines = csv.split('\r\n');
    expect(lines[0].startsWith('Institution,Residents,Marked,Not marked,Marks')).toBe(true);
    expect(lines).toHaveLength(1 + rows.length + 1);
    expect(lines[lines.length - 1].startsWith('Overall,')).toBe(true);
  });

  it('a department export adds the institution column', () => {
    const csv = groupRowsToCsv(groupBy(data(), 'department'), 'department');
    expect(csv.split('\r\n')[0].startsWith('Department,Institution,')).toBe(true);
  });

  it('toCsv of nothing is just the header', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b');
  });
});

describe('scope helpers', () => {
  it('istToday does not roll back a day at UTC evening', () => {
    // 2026-10-05 20:00 UTC is already 01:30 on the 6th in IST.
    expect(istToday(Date.parse('2026-10-05T20:00:00Z'))).toBe('2026-10-06');
    expect(istToday(Date.parse('2026-10-05T10:00:00Z'))).toBe('2026-10-05');
  });

  it('addDays crosses a month boundary', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('periodRange', () => {
    const custom = { from: '2026-09-01', to: '2026-09-10' };
    expect(periodRange('day', '2026-10-05', '2026-10-03', custom)).toEqual({ from: '2026-10-03', to: '2026-10-03' });
    expect(periodRange('7d', '2026-10-05', '', custom)).toEqual({ from: '2026-09-29', to: '2026-10-05' });
    expect(periodRange('30d', '2026-10-05', '', custom)).toEqual({ from: '2026-09-06', to: '2026-10-05' });
    expect(periodRange('90d', '2026-10-05', '', custom)).toEqual({ from: '2026-07-08', to: '2026-10-05' });
    expect(periodRange('custom', '2026-10-05', '', custom)).toEqual(custom);
  });

  it('a reversed custom range is swapped, not refused', () => {
    expect(periodRange('custom', '2026-10-05', '', { from: '2026-09-10', to: '2026-09-01' })).toEqual({
      from: '2026-09-01',
      to: '2026-09-10',
    });
  });
});
