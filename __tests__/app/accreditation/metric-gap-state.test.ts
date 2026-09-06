// __tests__/app/accreditation/metric-gap-state.test.ts
// ============================================================================
// The regression these tests exist to catch is a ONE-CHARACTER one: putting
// `?? 0` back. That collapses "nothing feeds this metric" into "we measured
// zero", and the screen goes on rendering perfectly while telling an assessor
// something untrue about a college.
//
// So the first assertion is not that the output is pretty. It is that an ABSENT
// count and a ZERO count produce DIFFERENT output — the exact property a
// coalesce destroys.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  resolveMetricGap,
  countGaps,
  countNotApplicable,
  measuredTotal,
  nirfSourceFor,
  NIRF_METRIC_SOURCE_KIND,
  type EvidenceSourceRoute,
} from '@/app/(routes)/accreditation/_lib/metric-gap-state';

/** A registry row with a verified destination. */
const routedSource: EvidenceSourceRoute = {
  source_kind: 'sh_publication',
  fix_route: '/solutions/publications',
  fix_hint:
    'Add each published paper with its Journal, Indexing and Year. Filter the list to Indexing: blank to see which entries an assessor could not verify.',
  owner_role: 'hod',
};

/** A registry row that exists but has no verified destination. */
const unroutedSource: EvidenceSourceRoute = {
  source_kind: 'coe_result_snapshot',
  fix_route: null,
  fix_hint: null,
  owner_role: 'coe_office',
};

describe('resolveMetricGap — zero and absent are different claims', () => {
  it('renders a ZERO count as a measurement, not a gap', () => {
    const d = resolveMetricGap({ metricCode: 'RPC_PU', count: 0 });
    expect(d.state).toBe('measured');
    expect(d.count).toBe(0);
    expect(d.label).toBe('0');
  });

  it('renders an ABSENT count as a gap, never as zero', () => {
    const d = resolveMetricGap({ metricCode: 'RPC_PU', count: undefined });
    expect(d.state).toBe('not-captured');
    expect(d.count).toBeNull();
    expect(d.label).toBe('Not captured yet');
    expect(d.label).not.toContain('0');
  });

  it('produces DIFFERENT output for zero and for absent', () => {
    const zero = resolveMetricGap({ metricCode: 'RPC_PU', count: 0 });
    const absent = resolveMetricGap({ metricCode: 'RPC_PU', count: undefined });

    // The whole point. If a `?? 0` is reintroduced anywhere upstream or in the
    // resolver, these two become identical and this assertion is the tripwire.
    expect(zero).not.toEqual(absent);
    expect(zero.state).not.toBe(absent.state);
    expect(zero.label).not.toBe(absent.label);
  });

  it('renders a positive count plainly', () => {
    const d = resolveMetricGap({ metricCode: 'TLR_SS', count: 3559 });
    expect(d.state).toBe('measured');
    expect(d.label).toBe('3559');
    expect(d.fixRoute).toBeNull();
    expect(d.detail).toBe('');
  });
});

describe('resolveMetricGap — a null fix_route renders no link', () => {
  it('offers a link when the source carries a route', () => {
    const d = resolveMetricGap({
      metricCode: 'RPC_PU',
      count: undefined,
      source: routedSource,
    });
    expect(d.state).toBe('not-captured');
    expect(d.fixRoute).toBe('/solutions/publications');
    expect(d.detail).toBe(routedSource.fix_hint);
  });

  it('offers NO link when the source has a null route', () => {
    const d = resolveMetricGap({
      metricCode: 'GO_GUE',
      count: undefined,
      source: unroutedSource,
    });
    expect(d.state).toBe('not-captured');
    expect(d.fixRoute).toBeNull();
    // Still says something useful — the reader is not left with a bare label.
    expect(d.detail.length).toBeGreaterThan(0);
  });

  it('offers NO link when the metric has no source at all', () => {
    const d = resolveMetricGap({ metricCode: 'PR_PEER', count: undefined, source: null });
    expect(d.fixRoute).toBeNull();
    expect(d.detail).toBe('Nothing in the platform feeds this metric yet.');
  });

  it('never offers a link on a measured metric, however routed the source', () => {
    const d = resolveMetricGap({ metricCode: 'RPC_PU', count: 7, source: routedSource });
    expect(d.fixRoute).toBeNull();
  });
});

describe('resolveMetricGap — the owner line, with an empty owner register', () => {
  // accreditation_metric_owners holds 0 rows today, so this is the live path.
  it('says nobody is assigned when the register was read and is empty', () => {
    const d = resolveMetricGap({
      metricCode: 'RPC_PU',
      count: undefined,
      source: routedSource,
      owner: null,
    });
    expect(d.ownerLine).toContain('No owner assigned yet');
    expect(d.ownerLine).toContain('hod');
  });

  it('says nobody is assigned even with no role hint to fall back on', () => {
    const d = resolveMetricGap({ metricCode: 'PR_PEER', count: undefined, owner: null });
    expect(d.ownerLine).toBe('No owner assigned yet');
  });

  it('names the person when one is on record', () => {
    const d = resolveMetricGap({
      metricCode: 'RPC_PU',
      count: undefined,
      source: routedSource,
      owner: 'A. Rahman',
    });
    expect(d.ownerLine).toBe('Owner: A. Rahman');
  });

  it('treats a blank name as no name rather than printing "Owner: "', () => {
    const d = resolveMetricGap({
      metricCode: 'RPC_PU',
      count: undefined,
      source: routedSource,
      owner: '   ',
    });
    expect(d.ownerLine).not.toBe('Owner: ');
    expect(d.ownerLine).toContain('Owner not visible to you');
  });

  it('does NOT claim nobody is assigned when the register could not be read', () => {
    // An RLS denial returns zero rows with no error, so "unread" and "empty"
    // arrive looking identical. undefined is the only way to keep them apart.
    const unread = resolveMetricGap({
      metricCode: 'RPC_PU',
      count: undefined,
      source: routedSource,
      owner: undefined,
    });
    const empty = resolveMetricGap({
      metricCode: 'RPC_PU',
      count: undefined,
      source: routedSource,
      owner: null,
    });
    expect(unread.ownerLine).not.toBe(empty.ownerLine);
    expect(unread.ownerLine).not.toContain('No owner assigned yet');
  });

  it('leaves the owner line empty on a measured metric', () => {
    const d = resolveMetricGap({ metricCode: 'TLR_SS', count: 12, owner: null });
    expect(d.ownerLine).toBe('');
  });
});

describe('resolveMetricGap — not-applicable is only ever passed in', () => {
  it('renders the third state when a caller supplies the verdict', () => {
    const d = resolveMetricGap({
      metricCode: 'PR_PEER',
      count: undefined,
      applicability: 'not-applicable',
    });
    expect(d.state).toBe('not-applicable');
    expect(d.label).toBe('Does not apply');
    expect(d.fixRoute).toBeNull();
  });

  it('keeps not-applicable distinct from not-captured', () => {
    const na = resolveMetricGap({
      metricCode: 'PR_PEER',
      count: undefined,
      applicability: 'not-applicable',
    });
    const nc = resolveMetricGap({ metricCode: 'PR_PEER', count: undefined });
    expect(na.state).not.toBe(nc.state);
    expect(na.label).not.toBe(nc.label);
  });

  it('does not derive not-applicable from anything — an applicable metric stays a gap', () => {
    const d = resolveMetricGap({
      metricCode: 'PR_PEER',
      count: undefined,
      applicability: 'applicable',
    });
    expect(d.state).toBe('not-captured');
  });

  it('suppresses the link even when the source is routed', () => {
    const d = resolveMetricGap({
      metricCode: 'RPC_PU',
      count: undefined,
      source: routedSource,
      applicability: 'not-applicable',
    });
    expect(d.fixRoute).toBeNull();
  });
});

describe('group summaries do not re-introduce the zero', () => {
  const group = [
    resolveMetricGap({ metricCode: 'A', count: 4 }),
    resolveMetricGap({ metricCode: 'B', count: 0 }),
    resolveMetricGap({ metricCode: 'C', count: undefined }),
  ];

  it('counts only the states that are not measured as gaps', () => {
    expect(countGaps(group)).toBe(1);
  });

  it('totals the measured metrics and ignores the gap', () => {
    expect(measuredTotal(group)).toBe(4);
  });

  it('returns null — not 0 — when NOTHING in the group was measured', () => {
    const allGaps = [
      resolveMetricGap({ metricCode: 'A', count: undefined }),
      resolveMetricGap({ metricCode: 'B', count: undefined }),
    ];
    expect(measuredTotal(allGaps)).toBeNull();
    expect(countGaps(allGaps)).toBe(2);
  });

  it('returns 0 when the group WAS measured and genuinely totals zero', () => {
    const measuredZero = [resolveMetricGap({ metricCode: 'A', count: 0 })];
    expect(measuredTotal(measuredZero)).toBe(0);
    expect(countGaps(measuredZero)).toBe(0);
  });
});

describe('nirfSourceFor — only mapped metrics resolve to a source', () => {
  const registry: Record<string, EvidenceSourceRoute> = {
    sh_publication: routedSource,
    coe_result_snapshot: unroutedSource,
  };

  it('resolves a mapped metric to its registry row', () => {
    expect(nirfSourceFor('RPC_PU', registry)).toBe(routedSource);
  });

  it('is case-insensitive on the metric code', () => {
    expect(nirfSourceFor('rpc_qp', registry)).toBe(routedSource);
  });

  it('returns null for a metric with no mapping', () => {
    expect(nirfSourceFor('PR_PEER', registry)).toBeNull();
    expect(nirfSourceFor('GO_PL', registry)).toBeNull();
  });

  it('returns null when the mapped source is absent from the registry', () => {
    expect(nirfSourceFor('RPC_IP', registry)).toBeNull();
  });

  it('maps exactly the six metrics whose source is a registered one', () => {
    expect(Object.keys(NIRF_METRIC_SOURCE_KIND).sort()).toEqual([
      'RPC_IP',
      'RPC_PU',
      'RPC_QP',
      'TLR_FE',
      'TLR_FP',
      'TLR_QF',
    ]);
  });

  it('never maps PR_PEER, which JKKN cannot hold at all', () => {
    expect(NIRF_METRIC_SOURCE_KIND.PR_PEER).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Added after an adversarial review found the module's own thesis — never
// collapse three distinguishable states into two — violated one level up, in
// the summary counters and in the registry-read fallback.
// ---------------------------------------------------------------------------

describe('the summary counters keep the three states apart', () => {
  const measured = resolveMetricGap({ metricCode: 'TLR_SS', count: 3559 });
  const gap = resolveMetricGap({ metricCode: 'PR_PEER', count: undefined });
  const notOurs = resolveMetricGap({
    metricCode: 'RPC_PU',
    count: undefined,
    applicability: 'not-applicable',
  });

  it('does not count a not-applicable metric as an outstanding gap', () => {
    // A body that does not inspect this institution is not somebody's task.
    // Counting it puts a number on screen that no amount of work can reduce.
    expect(countGaps([measured, gap, notOurs])).toBe(1);
  });

  it('reports not-applicable separately rather than silently', () => {
    expect(countNotApplicable([measured, gap, notOurs])).toBe(1);
  });

  it('never lets the two totals double-count a metric', () => {
    const group = [measured, gap, notOurs];
    expect(countGaps(group) + countNotApplicable(group)).toBeLessThanOrEqual(group.length);
  });

  it('a group of only not-applicable metrics has zero gaps', () => {
    expect(countGaps([notOurs, notOurs])).toBe(0);
  });
});

describe('an unread registry is not an empty registry', () => {
  it('says it could not load, rather than claiming nothing feeds the metric', () => {
    // undefined = the registry read has not answered.
    const unread = resolveMetricGap({ metricCode: 'RPC_PU', count: undefined, source: undefined });
    expect(unread.detail).toMatch(/could not be loaded/i);
    expect(unread.detail).not.toMatch(/Nothing in the platform feeds/i);
  });

  it('only claims nothing feeds it once the registry HAS been read', () => {
    // null = read, and genuinely no source registered for this metric.
    const read = resolveMetricGap({ metricCode: 'RPC_PU', count: undefined, source: null });
    expect(read.detail).toMatch(/Nothing in the platform feeds/i);
  });

  it('offers no Fix link in either case', () => {
    expect(resolveMetricGap({ metricCode: 'X', count: undefined, source: undefined }).fixRoute).toBeNull();
    expect(resolveMetricGap({ metricCode: 'X', count: undefined, source: null }).fixRoute).toBeNull();
  });
});
