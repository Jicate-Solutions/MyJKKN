/**
 * Which awarding bodies apply to one institution.
 *
 * The bug this closes is a WRONG DENOMINATOR, so the assertions that matter
 * are arithmetic on the filtered set, not on the rendered list. A test that
 * only checked "DCI is not in the list" would pass against the half-fix that
 * leaves "of 107" in place — which is the actual bug.
 *
 * Every count below is derived from a fixture built in the test, never from a
 * live query: production counts drift (nine panes write to it) and a hardcoded
 * live number is not a fixture.
 */

import { describe, it, expect } from 'vitest';
import {
  scopeFromRows,
  isBodyInScope,
  appliesToNobody,
  filterMetricsToScope,
  bodiesForScope,
  scopeSentence,
  UNPROVISIONED_SCOPE,
} from '@/app/(routes)/accreditation/_lib/institution-body-scope';

/**
 * A framework shaped like production's: `metric_type` IS the awarding body.
 * Counts mirror the live distribution (NAAC 69, NIRF 17, NBA 9, five bodies
 * with 2, two with 1) so the arithmetic below is the arithmetic that matters.
 */
function framework() {
  const rows: Array<{ metric_type: string; metric_code: string }> = [];
  const push = (body: string, n: number) => {
    for (let i = 1; i <= n; i += 1) {
      rows.push({ metric_type: body, metric_code: `${body}-${i}` });
    }
  };
  push('NAAC', 69);
  push('NIRF', 17);
  push('NBA', 9);
  push('INC', 2);
  push('PCI', 2);
  push('DCI', 2);
  push('QS', 2);
  push('UGC', 2);
  push('AICTE', 1);
  push('NCTE', 1);
  return rows;
}

const ENGINEERING = ['NAAC', 'NIRF', 'NBA', 'AICTE', 'ABET'];

describe('scopeFromRows', () => {
  it('keeps active rows and drops inactive ones', () => {
    const scope = scopeFromRows([
      { body_code: 'NAAC', is_active: true },
      { body_code: 'DCI', is_active: false },
      { body_code: 'NIRF' },
    ]);
    expect(scope).toEqual({ kind: 'known', bodies: ['NAAC', 'NIRF'] });
  });

  it('reads zero rows as a KNOWN empty scope, not as unknown', () => {
    const scope = scopeFromRows([]);
    expect(scope.kind).toBe('known');
    expect(appliesToNobody(scope)).toBe(true);
  });

  it('de-duplicates', () => {
    const scope = scopeFromRows([
      { body_code: 'QS', is_active: true },
      { body_code: 'QS', is_active: true },
    ]);
    expect(scope).toEqual({ kind: 'known', bodies: ['QS'] });
  });
});

describe('the denominator', () => {
  it('Engineering is measured against 96 metrics, not 107', () => {
    const all = framework();
    expect(all).toHaveLength(107);

    const scope = scopeFromRows(ENGINEERING.map((body_code) => ({ body_code })));
    const scoped = filterMetricsToScope(all, scope);

    // NAAC 69 + NIRF 17 + NBA 9 + AICTE 1 + ABET 0.
    expect(scoped).toHaveLength(96);

    // And the eleven that were unreachable are gone — 7 that can never apply
    // (DCI 2 + INC 2 + PCI 2 + NCTE 1) plus QS 2 and UGC 2, neither of which
    // Engineering was mapped to.
    expect(all.length - scoped.length).toBe(11);
    for (const body of ['DCI', 'INC', 'PCI', 'NCTE', 'QS', 'UGC']) {
      expect(scoped.some((m) => m.metric_type === body)).toBe(false);
    }
  });

  it('a college mapped to nobody is measured against nothing', () => {
    const scoped = filterMetricsToScope(framework(), scopeFromRows([]));
    expect(scoped).toHaveLength(0);
  });

  it('never invents a metric the framework does not carry', () => {
    // ABET is mapped but has no metrics yet, so it contributes zero — the body
    // still appears (see bodiesForScope) but the denominator does not grow.
    const scope = scopeFromRows([{ body_code: 'ABET' }]);
    expect(filterMetricsToScope(framework(), scope)).toHaveLength(0);
  });
});

describe('an unread mapping fails OPEN', () => {
  // The migration is Director-gated and unapplied, so this is the state on
  // production today. Failing closed would hide 96 real metrics from a college
  // that has them, silently — strictly worse than the bug being fixed.
  it('shows every metric', () => {
    const all = framework();
    expect(filterMetricsToScope(all, UNPROVISIONED_SCOPE)).toHaveLength(all.length);
  });

  it('admits every body', () => {
    expect(isBodyInScope(UNPROVISIONED_SCOPE, 'DCI')).toBe(true);
    expect(isBodyInScope(UNPROVISIONED_SCOPE, 'ANYTHING')).toBe(true);
  });

  it('is never reported as "answers to nobody"', () => {
    // The distinction the whole module exists for: a failed read must not be
    // rendered as a factual claim about a college.
    expect(appliesToNobody(UNPROVISIONED_SCOPE)).toBe(false);
    expect(appliesToNobody(scopeFromRows([]))).toBe(true);
  });

  it('returns a copy, so a caller cannot mutate the framework it was given', () => {
    const all = framework();
    const out = filterMetricsToScope(all, UNPROVISIONED_SCOPE);
    out.pop();
    expect(all).toHaveLength(107);
  });
});

describe('bodiesForScope', () => {
  it('keeps a mapped body that has no metrics yet', () => {
    const scope = scopeFromRows(ENGINEERING.map((body_code) => ({ body_code })));
    // What the framework alone would offer: everything except ABET.
    const withMetrics = ['NAAC', 'NIRF', 'NBA', 'AICTE'];
    const offered = bodiesForScope(scope, withMetrics);
    expect(offered).toContain('ABET');
    expect(offered).toHaveLength(5);
    // Metric-carrying bodies keep their largest-first order; the empty one
    // follows rather than being interleaved.
    expect(offered.slice(0, 4)).toEqual(withMetrics);
  });

  it('never offers a body outside the scope', () => {
    const scope = scopeFromRows([{ body_code: 'NAAC' }]);
    expect(bodiesForScope(scope, ['NAAC', 'DCI', 'PCI'])).toEqual(['NAAC']);
  });

  it('offers everything the framework carries when the scope is unread', () => {
    const withMetrics = ['NAAC', 'DCI'];
    expect(bodiesForScope(UNPROVISIONED_SCOPE, withMetrics)).toEqual(withMetrics);
  });
});

describe('scopeSentence', () => {
  it('says a filter is in force and names the bodies', () => {
    const scope = scopeFromRows([{ body_code: 'MATRIC' }]);
    const line = scopeSentence(scope, 'JKKN Matric Higher Secondary School');
    expect(line).toContain('1 awarding body');
    expect(line).toContain('MATRIC');
    expect(line).toContain('JKKN Matric Higher Secondary School');
  });

  it('does not claim a college is unaccredited when the mapping was not read', () => {
    const line = scopeSentence(UNPROVISIONED_SCOPE, 'JKKN College of Engineering');
    expect(line).toContain('has not been recorded');
    expect(line).not.toContain('No awarding body is recorded for');
  });

  it('states plainly when nothing applies', () => {
    expect(scopeSentence(scopeFromRows([]), 'JKKN Main Office')).toBe(
      'No awarding body is recorded for JKKN Main Office.',
    );
  });
});
