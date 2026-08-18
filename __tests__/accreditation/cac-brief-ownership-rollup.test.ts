/**
 * The CEO's one-page brief — "how many metrics have somebody's name against
 * them", rolled up across every college.
 *
 * The owner desk answers this ONE COLLEGE AT A TIME. The brief sums it. The
 * risk in summing is that the summer quietly re-derives the resolution rules and
 * gets a different answer from the desk for the same data — body-level rows that
 * every metric inherits, an explicit row that overrides the inherited one, and a
 * decline that must NOT fall back to the body owner. So `rollUpOwnership` calls
 * the desk's own pure helpers and does nothing but add.
 *
 * These assertions therefore check the SUM, and check that the inheritance and
 * decline semantics survive it — because a roll-up that silently flattened them
 * would still produce plausible numbers.
 */
import { describe, it, expect } from 'vitest';
import {
  rollUpOwnership,
  addTally,
  EMPTY_TALLY,
} from '@/app/(routes)/accreditation/cac/brief/_lib/use-ownership-rollup';
import type {
  FrameworkMetric,
  OwnerRow,
} from '@/app/(routes)/accreditation/manage/owners/_lib/owner-inheritance';

const COLLEGE_A = 'inst-a';
const COLLEGE_B = 'inst-b';

const metrics: FrameworkMetric[] = [
  { metric_code: '1.1.1', metric_type: 'NAAC', category: 'Curricular', metric_name: 'One' },
  { metric_code: '1.1.2', metric_type: 'NAAC', category: 'Curricular', metric_name: 'Two' },
  { metric_code: 'N-1', metric_type: 'NIRF', category: 'Teaching', metric_name: 'Three' },
];

const row = (over: Partial<OwnerRow>): OwnerRow => ({
  id: Math.random().toString(36).slice(2),
  institution_id: COLLEGE_A,
  body_code: 'NAAC',
  metric_code: null,
  programme_id: null,
  owner_user_id: 'user-1',
  assignment_status: 'pending',
  acknowledged_at: null,
  previous_owner_user_id: null,
  owner_changed_at: null,
  ...over,
});

describe('addTally', () => {
  it('is the identity on the empty tally', () => {
    const t = { ...EMPTY_TALLY, total: 3, unassigned: 3 };
    expect(addTally(EMPTY_TALLY, t)).toEqual(t);
  });
});

describe('rollUpOwnership', () => {
  it('counts one pair per college per metric, not one per metric', () => {
    const r = rollUpOwnership(metrics, [], [COLLEGE_A, COLLEGE_B]);
    expect(r.total).toBe(6);
    expect(r.metrics).toBe(3);
    expect(r.institutions).toBe(2);
  });

  it('reports every pair unassigned when no owner row exists — the live state', () => {
    const r = rollUpOwnership(metrics, [], [COLLEGE_A, COLLEGE_B]);
    expect(r.unassigned).toBe(6);
    expect(r.assigned).toBe(0);
    expect(r.confirmed).toBe(0);
    expect(r.pending).toBe(0);
  });

  it('lets ONE body-level row settle every metric of that body, in that college only', () => {
    // The whole reason naming a body owner is the cheap action: one row, both
    // NAAC metrics — and it must not leak into the other college.
    const r = rollUpOwnership(metrics, [row({})], [COLLEGE_A, COLLEGE_B]);
    expect(r.assigned).toBe(2);
    expect(r.inherited).toBe(2);
    expect(r.pending).toBe(2);
    expect(r.unassigned).toBe(4); // NIRF in A, plus all three in B
  });

  it('counts a confirmed assignment apart from one still waiting', () => {
    const r = rollUpOwnership(
      metrics,
      [
        row({ assignment_status: 'confirmed', acknowledged_at: '2026-08-13T00:00:00Z' }),
        row({ institution_id: COLLEGE_B, body_code: 'NIRF' }),
      ],
      [COLLEGE_A, COLLEGE_B],
    );
    expect(r.confirmed).toBe(2); // both NAAC metrics in A
    expect(r.pending).toBe(1); // the single NIRF metric in B
    expect(r.assigned).toBe(3);
  });

  it('does NOT count a declined pair as assigned, and does not fall back to the body owner', () => {
    const r = rollUpOwnership(
      metrics,
      [
        row({}), // body owner for NAAC in A
        row({
          metric_code: '1.1.2',
          assignment_status: 'declined',
          acknowledged_at: '2026-08-13T00:00:00Z',
        }),
      ],
      [COLLEGE_A],
    );
    expect(r.assigned).toBe(1); // 1.1.1 only
    expect(r.declined).toBe(1); // 1.1.2 stays refused, visibly
    expect(r.unassigned).toBe(1); // the NIRF metric
    expect(r.total).toBe(3);
  });

  it('returns a zero-college roll-up rather than inventing a denominator', () => {
    const r = rollUpOwnership(metrics, [], []);
    expect(r.total).toBe(0);
    expect(r.institutions).toBe(0);
  });
});
