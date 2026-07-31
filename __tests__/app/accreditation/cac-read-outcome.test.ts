/**
 * Telling a broken feed apart from an empty college.
 *
 * The CAC grid has exactly one way to say "no value" in a per-institution cell —
 * "none recorded" — and its own legend defines that as a fact about that
 * institution. Every OTHER reason a value can be missing therefore has to be
 * caught before the cells are reached, or the page publishes a fault in its own
 * plumbing as a finding against fourteen colleges.
 *
 * There are three such reasons, and these tests exist to keep them apart:
 *
 *   - the request failed;
 *   - the request succeeded and carried nothing at all;
 *   - one wired metric returned nothing while the others returned numbers.
 *
 * The third is the one that motivated this file. Pass percentage and results
 * analysis come from coe_naac_evidence, filled by a nightly mirror of another
 * project. When that job breaks the RPC still answers 200 with the other metrics
 * intact, so the failure is invisible to the error path — and every institution
 * would read "none recorded" for as long as the job stayed down.
 *
 * Pure functions, tested without a database: the component itself cannot be
 * imported under vitest, because the module chain pulls in the Supabase client.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyMeasuredRead,
  metricsWithData,
  stoppedReportingMetrics,
  type CacMeasuredRow,
} from '@/hooks/accreditation/use-cac-metrics';
import {
  allMetrics,
  measuredMetricIds,
} from '@/app/(routes)/accreditation/cac/_lib/cac-metric-catalog';

/** A row as fn_cac_measured_metrics returns it. */
function row(
  institution_id: string,
  metric_key: string,
  value_numeric: number | null = 1,
  value_label: string | null = 'one',
): CacMeasuredRow {
  return { institution_id, metric_key, value_numeric, value_label, detail: null };
}

describe('classifyMeasuredRead — how much of the read can be believed', () => {
  it('reports values when something came back with a number', () => {
    expect(classifyMeasuredRead([row('i1', 'attendance', 82)], false)).toBe(
      'values',
    );
  });

  it('reports a failed read whenever the request errored', () => {
    expect(classifyMeasuredRead(undefined, true)).toBe('read-failed');
    // The error wins even if rows are somehow present: a partial response
    // beside an error is not something to render values from.
    expect(classifyMeasuredRead([row('i1', 'attendance', 82)], true)).toBe(
      'read-failed',
    );
  });

  it('separates a successful read that returned nothing from a failed one', () => {
    // The distinction the whole page turns on. Both leave the grid empty; only
    // one of them is a failure, and calling the other one "could not be read"
    // would describe an event that did not happen.
    expect(classifyMeasuredRead([], false)).toBe('nothing-returned');
    expect(classifyMeasuredRead(undefined, false)).toBe('nothing-returned');
  });

  it('treats value-less placeholder rows as nothing returned', () => {
    // A response of rows carrying neither a number nor a label holds exactly as
    // much information as no response. Counting them as a real read would give
    // the emptier-looking case the better wording.
    expect(
      classifyMeasuredRead(
        [row('i1', 'attendance', null, null), row('i2', 'attendance', null, '')],
        false,
      ),
    ).toBe('nothing-returned');
  });

  it('believes a read where a label carries the meaning and the number does not', () => {
    // A wired metric may legitimately report a labelled nothing — the dash state
    // in the legend. That is a read that worked.
    expect(
      classifyMeasuredRead([row('i1', 'attendance', null, 'no sessions')], false),
    ).toBe('values');
  });
});

describe('stoppedReportingMetrics — one wired feed going quiet', () => {
  it('flags a wired metric that returned nothing while others returned numbers', () => {
    const rows = [row('i1', 'attendance', 82), row('i2', 'attendance', 77)];
    const stopped = stoppedReportingMetrics(
      ['attendance', 'pass-percentage'],
      metricsWithData(rows),
      'values',
    );
    expect(stopped.has('pass-percentage')).toBe(true);
    expect(stopped.has('attendance')).toBe(false);
  });

  it('does not flag a metric that reports for even one institution', () => {
    // Pass percentage genuinely covers a minority of the cluster. A metric
    // present for one institution and missing for thirteen is the page working
    // as designed, and the other thirteen cells are true "none recorded" facts.
    const rows = [row('i1', 'pass-percentage', 91)];
    const stopped = stoppedReportingMetrics(
      ['pass-percentage'],
      metricsWithData(rows),
      'values',
    );
    expect(stopped.size).toBe(0);
  });

  it('stays silent when the whole read returned nothing', () => {
    // The screamed-ten-times case. Every wired metric is trivially absent here,
    // and reporting each as independently stopped would turn one fault into a
    // screenful of alarms. That case belongs to the page's banner.
    const stopped = stoppedReportingMetrics(
      measuredMetricIds(),
      metricsWithData([]),
      'nothing-returned',
    );
    expect(stopped.size).toBe(0);
  });

  it('stays silent when the read failed', () => {
    // "Could not be read" already covers every row. Adding "stopped reporting"
    // on top would assert something about a feed nobody managed to ask.
    const stopped = stoppedReportingMetrics(
      measuredMetricIds(),
      new Set<string>(),
      'read-failed',
    );
    expect(stopped.size).toBe(0);
  });

  it('never flags a metric the catalog does not call measured', () => {
    // A metric with no substrate has its own row state and its own reason. It
    // has not stopped reporting; it never started.
    const rows = [row('i1', 'attendance', 82)];
    const stopped = stoppedReportingMetrics(
      measuredMetricIds(),
      metricsWithData(rows),
      'values',
    );
    const notMeasured = allMetrics()
      .filter((m) => m.substrate !== 'measured')
      .map((m) => m.id);
    expect(notMeasured.length).toBeGreaterThan(0);
    for (const id of notMeasured) {
      expect(stopped.has(id), `${id} is not a measured metric`).toBe(false);
    }
  });

  it('flags every wired metric except the ones that reported', () => {
    // The set is derived from the catalog, so this holds at whatever number of
    // metrics is wired on the day it runs — which is the point of not writing
    // that number down anywhere.
    const wired = measuredMetricIds();
    const reporting = wired.slice(0, 1);
    const rows = reporting.map((id) => row('i1', id, 5));
    const stopped = stoppedReportingMetrics(wired, metricsWithData(rows), 'values');
    expect(stopped.size).toBe(wired.length - reporting.length);
    expect(stopped.has(reporting[0])).toBe(false);
  });
});

describe('the four missing-value states stay four different things', () => {
  it('gives a broken feed a different verdict from an empty institution', () => {
    // The bug this build fixes, stated as a test. Both situations leave a cell
    // with no row; only one of them is about the institution.
    const brokenFeed = [row('i1', 'attendance', 82)];
    const emptyInstitution = [row('i1', 'attendance', 82), row('i2', 'pass-percentage', 91)];

    expect(
      stoppedReportingMetrics(
        ['attendance', 'pass-percentage'],
        metricsWithData(brokenFeed),
        'values',
      ).has('pass-percentage'),
    ).toBe(true);

    expect(
      stoppedReportingMetrics(
        ['attendance', 'pass-percentage'],
        metricsWithData(emptyInstitution),
        'values',
      ).has('pass-percentage'),
    ).toBe(false);
  });

  it('leaves exactly one outcome in which per-institution cells may render', () => {
    // Every other outcome must be intercepted before the cells, because the cell
    // has no vocabulary for a missing value that is not the institution's fault.
    const outcomes = ['values', 'read-failed', 'nothing-returned'] as const;
    const rendering = outcomes.filter((o) => o === 'values');
    expect(rendering).toEqual(['values']);
    for (const outcome of outcomes.filter((o) => o !== 'values')) {
      expect(
        stoppedReportingMetrics(measuredMetricIds(), new Set(), outcome).size,
      ).toBe(0);
    }
  });
});

describe('measuredMetricIds — derived, never written down', () => {
  it('returns exactly the metrics the catalog calls measured', () => {
    const expected = allMetrics()
      .filter((m) => m.substrate === 'measured')
      .map((m) => m.id);
    expect(measuredMetricIds()).toEqual(expected);
  });

  it('is a non-empty minority of the framework', () => {
    // No count is asserted. One was written into comments before and went stale
    // in the same commit that changed it; the runtime derives this and prose
    // cannot. What must hold is the shape: some metrics are wired, not all.
    const wired = measuredMetricIds();
    expect(wired.length).toBeGreaterThan(0);
    expect(wired.length).toBeLessThan(allMetrics().length);
  });

  it('carries no duplicate, because the id is the key the database returns', () => {
    expect(new Set(measuredMetricIds()).size).toBe(measuredMetricIds().length);
  });
});
