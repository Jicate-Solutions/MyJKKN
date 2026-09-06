// __tests__/lib/services/accreditation/reported-figures.test.ts
// ============================================================================
// Guards the client-side half of Director decision 7 — "keep both the figure
// that was reported and the figure that is actual today".
//
// The two rules under test are the ones that, if broken, silently destroy the
// feature rather than breaking it visibly:
//
//   MERGE   — the export page already writes `filename`, `metrics_seeded`,
//             `evidence_rows`, `exported_at` and `note` into the same metadata
//             object. A replace instead of a merge loses the paper trail and
//             nothing complains.
//   ONCE    — re-freezing rewrites history to match the present. The drift the
//             feature exists to show collapses to zero and the screen looks
//             perfectly healthy.
//
// The fixture below is a real `metadata` object as the DCF export page writes
// it (app/(routes)/accreditation/naac/dcf-export/page.tsx).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  REPORTED_METRICS_KEY,
  REPORTED_AT_KEY,
  describeDrift,
  isFrozen,
  mergeReportedMetrics,
  readReportedSnapshot,
} from '@/lib/services/accreditation/reported-figures';

/** What the DCF export page writes into metadata on every download. */
const EXPORT_METADATA = {
  filename: 'NAAC_AQAR_2024_25_JKKN_DENTAL_2026-08-02.xlsx',
  metrics_seeded: 26,
  evidence_rows: 61,
  exported_at: '2026-08-02T04:15:00.000Z',
  note: 'Auto-generated stub export; values pending substrate fan-out',
} as const;

const FROZEN_AT = '2026-08-02T04:20:00.000Z';
const FILED = { '1.1.1': 12, '2.2.1': 31, '3.3': 18 };

describe('mergeReportedMetrics — the merge', () => {
  it('keeps every key the export page already wrote', () => {
    const { merged } = mergeReportedMetrics(EXPORT_METADATA, FILED, FROZEN_AT);

    expect(merged.filename).toBe(EXPORT_METADATA.filename);
    expect(merged.metrics_seeded).toBe(26);
    expect(merged.evidence_rows).toBe(61);
    expect(merged.exported_at).toBe(EXPORT_METADATA.exported_at);
    expect(merged.note).toBe(EXPORT_METADATA.note);
  });

  it('adds exactly the two reserved keys and nothing else', () => {
    const { merged } = mergeReportedMetrics(EXPORT_METADATA, FILED, FROZEN_AT);
    const added = Object.keys(merged).filter(
      (k) => !Object.prototype.hasOwnProperty.call(EXPORT_METADATA, k),
    );

    expect(added.sort()).toEqual([REPORTED_AT_KEY, REPORTED_METRICS_KEY].sort());
    expect(merged[REPORTED_METRICS_KEY]).toEqual(FILED);
    expect(merged[REPORTED_AT_KEY]).toBe(FROZEN_AT);
  });

  it('does not mutate the metadata it was handed', () => {
    const before = { ...EXPORT_METADATA };
    mergeReportedMetrics(EXPORT_METADATA, FILED, FROZEN_AT);
    expect(EXPORT_METADATA).toEqual(before);
  });

  it('copies the metrics rather than aliasing the caller’s object', () => {
    const live: Record<string, number> = { '1.1.1': 12 };
    const { merged } = mergeReportedMetrics({}, live, FROZEN_AT);

    live['1.1.1'] = 999;

    expect(merged[REPORTED_METRICS_KEY]).toEqual({ '1.1.1': 12 });
  });

  it('treats a null or non-object metadata as an empty object', () => {
    for (const input of [null, undefined, 'not-json', 42, ['a']]) {
      const { merged, frozen } = mergeReportedMetrics(input, FILED, FROZEN_AT);
      expect(frozen).toBe(true);
      expect(merged[REPORTED_METRICS_KEY]).toEqual(FILED);
    }
  });
});

describe('mergeReportedMetrics — write-once', () => {
  it('refuses to overwrite an existing freeze and returns the row unchanged', () => {
    const already = {
      ...EXPORT_METADATA,
      [REPORTED_METRICS_KEY]: { '1.1.1': 12 },
      [REPORTED_AT_KEY]: '2026-07-01T00:00:00.000Z',
    };

    const { merged, frozen, reason } = mergeReportedMetrics(
      already,
      { '1.1.1': 84 },
      FROZEN_AT,
    );

    expect(frozen).toBe(false);
    expect(reason).toBe('already-frozen');
    expect(merged[REPORTED_METRICS_KEY]).toEqual({ '1.1.1': 12 });
    expect(merged[REPORTED_AT_KEY]).toBe('2026-07-01T00:00:00.000Z');
  });

  it('treats a freeze that captured zero metrics as frozen, not as never-frozen', () => {
    const emptyFreeze = { [REPORTED_METRICS_KEY]: {}, [REPORTED_AT_KEY]: FROZEN_AT };

    expect(isFrozen(emptyFreeze)).toBe(true);

    const { frozen, reason } = mergeReportedMetrics(emptyFreeze, FILED, FROZEN_AT);
    expect(frozen).toBe(false);
    expect(reason).toBe('already-frozen');
  });

  it('reports an unfrozen submission as unfrozen', () => {
    expect(isFrozen(EXPORT_METADATA)).toBe(false);
    expect(isFrozen({})).toBe(false);
    expect(isFrozen(null)).toBe(false);
    expect(isFrozen([REPORTED_METRICS_KEY])).toBe(false);
  });
});

describe('readReportedSnapshot', () => {
  it('returns null when the submission was never frozen', () => {
    expect(readReportedSnapshot(EXPORT_METADATA)).toBeNull();
    expect(readReportedSnapshot(null)).toBeNull();
    expect(readReportedSnapshot('{}')).toBeNull();
  });

  it('totals the filed figures', () => {
    const { merged } = mergeReportedMetrics(EXPORT_METADATA, FILED, FROZEN_AT);
    const snap = readReportedSnapshot(merged);

    expect(snap).not.toBeNull();
    expect(snap!.metricCount).toBe(3);
    expect(snap!.evidenceRows).toBe(61);
    expect(snap!.reportedAt).toBe(FROZEN_AT);
  });

  it('accepts figures that came back from jsonb as strings', () => {
    const snap = readReportedSnapshot({
      [REPORTED_METRICS_KEY]: { '1.1.1': '12', '2.2.1': 31 },
      [REPORTED_AT_KEY]: FROZEN_AT,
    });

    expect(snap!.metrics).toEqual({ '1.1.1': 12, '2.2.1': 31 });
    expect(snap!.evidenceRows).toBe(43);
  });

  it('drops an unreadable figure instead of poisoning the whole snapshot', () => {
    const snap = readReportedSnapshot({
      [REPORTED_METRICS_KEY]: { '1.1.1': 12, '2.2.1': null, '3.3': 'n/a' },
      [REPORTED_AT_KEY]: FROZEN_AT,
    });

    expect(snap!.metrics).toEqual({ '1.1.1': 12 });
    expect(snap!.metricCount).toBe(1);
    expect(snap!.evidenceRows).toBe(12);
  });

  it('survives a freeze whose timestamp went missing', () => {
    const snap = readReportedSnapshot({ [REPORTED_METRICS_KEY]: { '1.1.1': 12 } });

    expect(snap).not.toBeNull();
    expect(snap!.reportedAt).toBeNull();
    expect(snap!.metricCount).toBe(1);
  });

  it('returns an empty snapshot — not null — for a freeze that captured nothing', () => {
    const snap = readReportedSnapshot({
      [REPORTED_METRICS_KEY]: {},
      [REPORTED_AT_KEY]: FROZEN_AT,
    });

    expect(snap).not.toBeNull();
    expect(snap!.metricCount).toBe(0);
    expect(snap!.evidenceRows).toBe(0);
  });
});

describe('describeDrift', () => {
  it('states both numbers and the gap', () => {
    expect(describeDrift(61, 84)).toBe(
      'Reported 61; 84 today (23 rows more since filing)',
    );
  });

  it('says fewer when evidence was withdrawn after filing', () => {
    expect(describeDrift(84, 61)).toBe(
      'Reported 84; 61 today (23 rows fewer since filing)',
    );
  });

  it('singularises a gap of one', () => {
    expect(describeDrift(61, 62)).toBe(
      'Reported 61; 62 today (1 row more since filing)',
    );
  });

  it('says unchanged rather than printing a zero gap', () => {
    expect(describeDrift(61, 61)).toBe('Reported 61; 61 today (unchanged since filing)');
  });

  it('never claims zero was reported for a metric that was not in the filing', () => {
    const sentence = describeDrift(null, 84);
    expect(sentence).toBe('Not part of the filing; 84 today');
    expect(sentence).not.toMatch(/Reported 0/);
  });

  it('shows a metric that was filed and has since fallen to zero', () => {
    expect(describeDrift(12, 0)).toBe(
      'Reported 12; 0 today (12 rows fewer since filing)',
    );
  });
});
