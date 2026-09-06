// __tests__/accreditation/my-gaps-worklist.test.ts
// ============================================================================
// Tests for the /accreditation/my-gaps worklist logic.
//
// These exercise the resolution rules against hand-written fixtures rather than
// re-deriving them: the assertions state what a person should SEE, so a test
// cannot pass merely because it agrees with the implementation's own arithmetic.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  buildWorklist,
  classifyAssignment,
  compareMetricCodes,
  daysUntil,
  indexEvidence,
  metricCodesToScan,
  pickDueDate,
  readFixHint,
  readFixRoute,
  resolveSources,
  type MetricCatalogRow,
  type OwnerAssignmentRow,
  type SubmissionRow,
} from '@/app/(routes)/accreditation/my-gaps/_lib/worklist';

const INST_A = '11111111-1111-1111-1111-111111111111';
const INST_B = '22222222-2222-2222-2222-222222222222';

function assignment(over: Partial<OwnerAssignmentRow> & { id: string }): OwnerAssignmentRow {
  return {
    institution_id: INST_A,
    body_code: 'NAAC',
    metric_code: null,
    programme_id: null,
    assignment_status: 'confirmed',
    acknowledged_at: null,
    previous_owner_user_id: null,
    owner_changed_at: null,
    ...over,
  };
}

const NAAC_METRICS: MetricCatalogRow[] = [
  { metric_type: 'NAAC', metric_code: '1.2', metric_name: 'Stakeholder participation', category: 'Attribute 1' },
  { metric_type: 'NAAC', metric_code: '3.1.1', metric_name: 'Geo-tagged classrooms', category: 'Attribute 3' },
  { metric_type: 'NAAC', metric_code: '1.10', metric_name: 'Curriculum review cycle', category: 'Attribute 1' },
  { metric_type: 'NIRF', metric_code: 'TLR_SS', metric_name: 'Learner strength', category: 'TLR' },
];

const EMPTY = { metrics: NAAC_METRICS, submissions: [], evidence: [], registry: [] };

// ---------------------------------------------------------------------------
describe('classifyAssignment', () => {
  it('treats only confirmed as owed and only declined as declined', () => {
    expect(classifyAssignment('confirmed')).toBe('owed');
    expect(classifyAssignment('declined')).toBe('declined');
    expect(classifyAssignment('pending')).toBe('awaiting');
  });

  it('is case and whitespace insensitive', () => {
    expect(classifyAssignment('  Confirmed ')).toBe('owed');
    expect(classifyAssignment('DECLINED')).toBe('declined');
  });

  it('treats anything unrecognised as still needing an answer, never as accepted', () => {
    // Putting somebody on the hook for work they never agreed to is the one
    // failure this page must not have.
    expect(classifyAssignment(null)).toBe('awaiting');
    expect(classifyAssignment('')).toBe('awaiting');
    expect(classifyAssignment('reassigned')).toBe('awaiting');
    expect(classifyAssignment('confirmed_by_iqac')).toBe('awaiting');
  });
});

// ---------------------------------------------------------------------------
describe('compareMetricCodes', () => {
  it('reads 1.2 as before 1.10, which a string sort gets backwards', () => {
    expect(compareMetricCodes('1.2', '1.10')).toBeLessThan(0);
    expect('1.2' < '1.10').toBe(false); // the bug this guards against
  });

  it('reads 2.1 as before 10.1', () => {
    expect(compareMetricCodes('2.1', '10.1')).toBeLessThan(0);
  });

  it('treats a shorter code as coming first when the prefix matches', () => {
    expect(compareMetricCodes('3.1', '3.1.1')).toBeLessThan(0);
  });

  it('falls back to a string compare for non-numeric codes', () => {
    expect(compareMetricCodes('TLR_SS', 'TLR_FSR')).toBeGreaterThan(0);
    expect(compareMetricCodes('TLR_SS', 'TLR_SS')).toBe(0);
  });

  it('sorts nulls last', () => {
    expect(compareMetricCodes(null, '1.1')).toBeGreaterThan(0);
    expect(compareMetricCodes('1.1', null)).toBeLessThan(0);
    expect(compareMetricCodes(null, null)).toBe(0);
  });

  it('produces a full ascending order over a mixed list', () => {
    const sorted = ['10.1', '1.10', '2.1', '1.2', '1.2.1'].sort(compareMetricCodes);
    expect(sorted).toEqual(['1.2', '1.2.1', '1.10', '2.1', '10.1']);
  });
});

// ---------------------------------------------------------------------------
describe('pickDueDate', () => {
  const submissions: SubmissionRow[] = [
    { institution_id: INST_A, body_code: 'NAAC', period_label: 'AY 2026-27', due_date: '2026-11-30', submitted_at: null },
    { institution_id: INST_A, body_code: 'NAAC', period_label: 'AY 2025-26', due_date: '2026-09-15', submitted_at: null },
    { institution_id: INST_A, body_code: 'NAAC', period_label: 'AY 2024-25', due_date: '2026-01-31', submitted_at: '2026-01-20T00:00:00Z' },
    { institution_id: INST_A, body_code: 'NAAC', period_label: 'no date', due_date: null, submitted_at: null },
    { institution_id: INST_B, body_code: 'NAAC', period_label: 'other campus', due_date: '2026-02-01', submitted_at: null },
    { institution_id: INST_A, body_code: 'NIRF', period_label: 'other body', due_date: '2026-03-01', submitted_at: null },
  ];

  it('picks the earliest unsubmitted due date for that institution and body', () => {
    expect(pickDueDate(submissions, INST_A, 'NAAC')).toEqual({
      dueDate: '2026-09-15',
      periodLabel: 'AY 2025-26',
    });
  });

  it('ignores a period that has already been submitted, even if it is earliest', () => {
    const only = submissions.filter((s) => s.period_label === 'AY 2024-25');
    expect(pickDueDate(only, INST_A, 'NAAC')).toBeNull();
  });

  it('returns null rather than a stale date when nothing is scheduled', () => {
    expect(pickDueDate([], INST_A, 'NAAC')).toBeNull();
    expect(pickDueDate(submissions, INST_A, 'UGC')).toBeNull();
  });

  it('never reads another campus or another body as this one', () => {
    expect(pickDueDate(submissions, INST_B, 'NAAC')?.dueDate).toBe('2026-02-01');
    expect(pickDueDate(submissions, INST_A, 'NIRF')?.dueDate).toBe('2026-03-01');
  });
});

// ---------------------------------------------------------------------------
describe('daysUntil', () => {
  it('counts forward, backward and same-day without timezone drift', () => {
    expect(daysUntil('2026-08-12', '2026-08-02')).toBe(10);
    expect(daysUntil('2026-07-28', '2026-08-02')).toBe(-5);
    expect(daysUntil('2026-08-02', '2026-08-02')).toBe(0);
  });

  it('handles a full timestamp on either side', () => {
    expect(daysUntil('2026-08-12T23:59:59Z', '2026-08-02T00:00:01Z')).toBe(10);
  });

  it('crosses a month and a year boundary correctly', () => {
    expect(daysUntil('2026-09-01', '2026-08-31')).toBe(1);
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('readFixRoute / readFixHint', () => {
  // The columns arrive in a separate, currently unmerged change. The page has
  // to render identically before and after it lands.
  it('returns null when the column is absent from the row entirely', () => {
    expect(readFixRoute({ source_table: 'ip_filings', display_name: 'IP Filings' })).toBeNull();
    expect(readFixHint({ source_table: 'ip_filings', display_name: 'IP Filings' })).toBeNull();
  });

  it('returns null for a missing row, a null value and a blank string', () => {
    expect(readFixRoute(undefined)).toBeNull();
    expect(readFixRoute({ source_table: 't', display_name: null, fix_route: null })).toBeNull();
    expect(readFixRoute({ source_table: 't', display_name: null, fix_route: '   ' })).toBeNull();
  });

  it('returns the route once the column exists', () => {
    expect(
      readFixRoute({ source_table: 't', display_name: null, fix_route: '/research/ip-filings' }),
    ).toBe('/research/ip-filings');
  });
});

// ---------------------------------------------------------------------------
describe('indexEvidence / resolveSources', () => {
  it('counts rows per metric and lists each source table once', () => {
    const index = indexEvidence([
      { institution_id: INST_A, body_code: 'NAAC', metric_code: '1.2', source_table: 'bos_meetings' },
      { institution_id: INST_A, body_code: 'NAAC', metric_code: '1.2', source_table: 'bos_meetings' },
      { institution_id: INST_A, body_code: 'NAAC', metric_code: '1.2', source_table: 'ip_filings' },
      { institution_id: INST_B, body_code: 'NAAC', metric_code: '1.2', source_table: 'bos_meetings' },
    ]);
    expect(index.get(`${INST_A}|NAAC|1.2`)).toEqual({
      count: 3,
      sourceTables: ['bos_meetings', 'ip_filings'],
    });
    expect(index.get(`${INST_B}|NAAC|1.2`)?.count).toBe(1);
  });

  it('falls back to the raw table name when the registry does not list it', () => {
    const [known, unknown] = resolveSources(
      ['bos_meetings', 'mystery_table'],
      [{ source_table: 'bos_meetings', display_name: 'Board of Studies Meetings' }],
    );
    expect(known.label).toBe('Board of Studies Meetings');
    expect(unknown.label).toBe('mystery_table');
    expect(unknown.fixRoute).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('buildWorklist — the empty state', () => {
  it('is empty when the viewer owns nothing at all', () => {
    const w = buildWorklist({ assignments: [], ...EMPTY });
    expect(w.isEmpty).toBe(true);
    expect(w.owed).toEqual([]);
    expect(w.awaiting).toEqual([]);
    expect(w.declinedCount).toBe(0);
  });

  it('is NOT empty when the only assignment is one still awaiting an answer', () => {
    const w = buildWorklist({
      assignments: [assignment({ id: 'a', assignment_status: 'pending' })],
      ...EMPTY,
    });
    expect(w.isEmpty).toBe(false);
    expect(w.owed).toEqual([]);
    expect(w.awaiting).toHaveLength(1);
  });

  it('is NOT empty when the only assignment was declined', () => {
    // Otherwise the page would say "nothing is assigned to you" to somebody who
    // had just turned work down, and they would have no way to see they had.
    const w = buildWorklist({
      assignments: [assignment({ id: 'a', assignment_status: 'declined' })],
      ...EMPTY,
    });
    expect(w.isEmpty).toBe(false);
    expect(w.declinedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('buildWorklist — inheritance', () => {
  it('expands a confirmed body-wide row to every metric of that body only', () => {
    const w = buildWorklist({ assignments: [assignment({ id: 'a', metric_code: null })], ...EMPTY });
    expect(w.owed.map((i) => i.metricCode)).toEqual(['1.2', '1.10', '3.1.1']);
    expect(w.owed.every((i) => i.via === 'inherited')).toBe(true);
    // NIRF sits in the same catalog and must not be dragged in.
    expect(w.owed.some((i) => i.bodyCode === 'NIRF')).toBe(false);
  });

  it('does NOT expand a body-wide row that is still awaiting an answer', () => {
    // You accept the assignment, not 107 separate metrics.
    const w = buildWorklist({
      assignments: [assignment({ id: 'a', metric_code: null, assignment_status: 'pending' })],
      ...EMPTY,
    });
    expect(w.owed).toEqual([]);
    expect(w.awaiting).toHaveLength(1);
    expect(w.awaiting[0].metricCode).toBeNull();
  });

  it('lists a direct assignment once, with via=direct', () => {
    const w = buildWorklist({ assignments: [assignment({ id: 'a', metric_code: '3.1.1' })], ...EMPTY });
    expect(w.owed).toHaveLength(1);
    expect(w.owed[0].via).toBe('direct');
    expect(w.owed[0].metricName).toBe('Geo-tagged classrooms');
  });

  it('lets a direct assignment override the inherited entry rather than duplicate it', () => {
    const w = buildWorklist({
      assignments: [
        assignment({ id: 'a-body', metric_code: null }),
        assignment({ id: 'b-direct', metric_code: '3.1.1' }),
      ],
      ...EMPTY,
    });
    expect(w.owed).toHaveLength(3);
    const direct = w.owed.filter((i) => i.metricCode === '3.1.1');
    expect(direct).toHaveLength(1);
    expect(direct[0].via).toBe('direct');
    expect(direct[0].assignmentId).toBe('b-direct');
  });

  it('overrides regardless of which row is processed first', () => {
    const w = buildWorklist({
      assignments: [
        assignment({ id: 'z-direct', metric_code: '3.1.1' }),
        assignment({ id: 'a-body', metric_code: null }),
      ],
      ...EMPTY,
    });
    expect(w.owed.filter((i) => i.metricCode === '3.1.1')).toHaveLength(1);
    expect(w.owed.find((i) => i.metricCode === '3.1.1')?.via).toBe('direct');
  });

  it('keeps a confirmed body-wide row visible even when the catalog knows no metrics for that body', () => {
    const w = buildWorklist({
      assignments: [assignment({ id: 'a', body_code: 'QS', metric_code: null })],
      ...EMPTY,
    });
    expect(w.owed).toHaveLength(1);
    expect(w.owed[0].via).toBe('body');
    expect(w.owed[0].metricCode).toBeNull();
  });

  it('keeps a confirmed direct row visible when its metric is not in the catalog', () => {
    // A retired or re-tagged metric_code must not make the assignment vanish.
    const w = buildWorklist({
      assignments: [assignment({ id: 'a', metric_code: '9.9.9' })],
      ...EMPTY,
    });
    expect(w.owed).toHaveLength(1);
    expect(w.owed[0].metricCode).toBe('9.9.9');
    expect(w.owed[0].metricName).toBeNull();
  });

  it('keeps the same metric separate per institution and per programme', () => {
    const programme = '33333333-3333-3333-3333-333333333333';
    const w = buildWorklist({
      assignments: [
        assignment({ id: 'a', metric_code: '1.2' }),
        assignment({ id: 'b', metric_code: '1.2', institution_id: INST_B }),
        assignment({ id: 'c', metric_code: '1.2', programme_id: programme }),
      ],
      ...EMPTY,
    });
    expect(w.owed).toHaveLength(3);
    expect(new Set(w.owed.map((i) => i.key)).size).toBe(3);
  });

  it('shows a metric as owed and as awaiting at once when both rows exist', () => {
    const w = buildWorklist({
      assignments: [
        assignment({ id: 'a-body', metric_code: null }),
        assignment({ id: 'b-direct', metric_code: '1.2', assignment_status: 'pending' }),
      ],
      ...EMPTY,
    });
    expect(w.owed.some((i) => i.metricCode === '1.2')).toBe(true);
    expect(w.awaiting.map((i) => i.assignmentId)).toEqual(['b-direct']);
    expect(w.awaiting[0].metricName).toBe('Stakeholder participation');
  });
});

// ---------------------------------------------------------------------------
describe('buildWorklist — dates, evidence and ordering', () => {
  const submissions: SubmissionRow[] = [
    { institution_id: INST_A, body_code: 'NAAC', period_label: 'AY 2026-27', due_date: '2026-11-30', submitted_at: null },
    { institution_id: INST_B, body_code: 'NAAC', period_label: 'AY 2026-27', due_date: '2026-09-01', submitted_at: null },
  ];

  it('stamps each item with its own institution due date, not a shared one', () => {
    const w = buildWorklist({
      assignments: [
        assignment({ id: 'a', metric_code: '1.2' }),
        assignment({ id: 'b', metric_code: '1.2', institution_id: INST_B }),
      ],
      ...EMPTY,
      submissions,
    });
    const a = w.owed.find((i) => i.institutionId === INST_A);
    const b = w.owed.find((i) => i.institutionId === INST_B);
    expect(a?.dueDate).toBe('2026-11-30');
    expect(b?.dueDate).toBe('2026-09-01');
  });

  it('puts dated work before undated work, soonest first', () => {
    const w = buildWorklist({
      assignments: [
        assignment({ id: 'a', metric_code: '1.2', body_code: 'NIRF' }), // no submission → undated
        assignment({ id: 'b', metric_code: '1.2' }), // 2026-11-30
        assignment({ id: 'c', metric_code: '1.2', institution_id: INST_B }), // 2026-09-01
      ],
      ...EMPTY,
      submissions,
    });
    expect(w.owed.map((i) => i.dueDate)).toEqual(['2026-09-01', '2026-11-30', null]);
  });

  it('attaches evidence counts and resolved source labels to the right metric', () => {
    const w = buildWorklist({
      assignments: [assignment({ id: 'a', metric_code: null })],
      metrics: NAAC_METRICS,
      submissions: [],
      evidence: [
        { institution_id: INST_A, body_code: 'NAAC', metric_code: '1.2', source_table: 'bos_meetings' },
        { institution_id: INST_A, body_code: 'NAAC', metric_code: '1.2', source_table: 'bos_meetings' },
      ],
      registry: [
        {
          source_table: 'bos_meetings',
          display_name: 'Board of Studies Meetings',
          fix_route: '/academic/bos/meetings',
        },
      ],
    });
    const withEvidence = w.owed.find((i) => i.metricCode === '1.2');
    const without = w.owed.find((i) => i.metricCode === '3.1.1');
    expect(withEvidence?.evidenceCount).toBe(2);
    expect(withEvidence?.sources[0]).toEqual({
      sourceTable: 'bos_meetings',
      label: 'Board of Studies Meetings',
      fixRoute: '/academic/bos/meetings',
      fixHint: null,
    });
    expect(without?.evidenceCount).toBe(0);
    expect(without?.sources).toEqual([]);
  });

  it('marks every count as a floor once the evidence scan was truncated', () => {
    const w = buildWorklist({
      assignments: [assignment({ id: 'a', metric_code: '1.2' })],
      ...EMPTY,
      evidenceTruncated: true,
    });
    // A zero under truncation means "none in the records scanned", not "none".
    expect(w.owed[0].evidenceCount).toBe(0);
    expect(w.owed[0].evidenceCountIsFloor).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('metricCodesToScan', () => {
  it('returns each owned metric code once, in reading order, dropping body-level rows', () => {
    const w = buildWorklist({
      assignments: [
        assignment({ id: 'a', metric_code: null }),
        assignment({ id: 'b', body_code: 'QS', metric_code: null }),
      ],
      ...EMPTY,
    });
    expect(metricCodesToScan(w.owed)).toEqual(['1.2', '1.10', '3.1.1']);
  });
});
