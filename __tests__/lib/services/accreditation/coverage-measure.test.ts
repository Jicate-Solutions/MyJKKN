// __tests__/lib/services/accreditation/coverage-measure.test.ts
// ============================================================================
// Regression suite for the accreditation coverage measure.
//
// Every number in the "production" block below was read off the live database
// on 2026-09-07, the day 14 accreditation owners were about to be pointed at
// these screens for the first time. They are here as fixtures precisely
// because the old formula looked plausible on made-up data — you only see the
// defect once the numerator is three orders of magnitude larger than the
// denominator, which is what NIRF actually looks like.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  measureCoverage,
  tallyEvidence,
  coverageBasisNote,
  type CatalogueIndex,
  type EvidenceRef,
} from '@/lib/services/accreditation/coverage-measure';

/** Active catalogue sizes on prod 2026-09-07 (sh_accreditation_metrics). */
const PROD_CATALOGUE_SIZE = {
  NAAC: 69,
  NIRF: 17,
  NBA: 9,
  INC: 2,
  PCI: 2,
  DCI: 2,
  QS: 2,
  UGC: 2,
  AICTE: 1,
  NCTE: 1,
} as const;

/** Build a catalogue index of N synthetic codes for a body. */
function catalogueOf(sizes: Partial<Record<string, number>>): CatalogueIndex {
  const index: Record<string, Set<string>> = {};
  for (const [body, size] of Object.entries(sizes)) {
    index[body] = new Set(
      Array.from({ length: size ?? 0 }, (_, i) => `${body}-${i + 1}`),
    );
  }
  return index;
}

/** `count` evidence rows spread over the first `distinct` codes of a body. */
function evidenceFor(
  body: string,
  institution: string,
  distinct: number,
  count: number,
): EvidenceRef[] {
  return Array.from({ length: count }, (_, i) => ({
    body_code: body,
    institution_id: institution,
    metric_code: `${body}-${(i % distinct) + 1}`,
  }));
}

describe('measureCoverage — the denominator is the whole active catalogue', () => {
  it('measures against every active metric, not just the answered ones', () => {
    // The defect in one line: 21 NAAC metrics carry evidence out of 69. The
    // broken alternative — dividing by the 21 metrics that happen to have
    // evidence — is 100%, which is what a reader must never be shown.
    expect(measureCoverage(69, 21).coveragePct).toBe(30);
    expect(measureCoverage(21, 21).coveragePct).toBe(100);
  });

  it('reports the catalogue size it measured against', () => {
    const m = measureCoverage(17, 4);
    expect(m).toEqual({ catalogueSize: 17, metricsWithEvidence: 4, coveragePct: 24 });
  });

  it('a body with zero evidence reads 0%, not 100%', () => {
    for (const body of ['DCI', 'PCI', 'INC', 'QS', 'UGC', 'AICTE', 'NCTE'] as const) {
      const m = measureCoverage(PROD_CATALOGUE_SIZE[body], 0);
      expect(m.coveragePct, `${body} with no evidence`).toBe(0);
      expect(m.catalogueSize, `${body} catalogue`).toBe(PROD_CATALOGUE_SIZE[body]);
    }
  });

  it('an empty catalogue reads 0%, never 100% — 0/0 must not look finished', () => {
    expect(measureCoverage(0, 0).coveragePct).toBe(0);
    expect(measureCoverage(0, 5).coveragePct).toBe(0);
  });

  it('a placeholder catalogue still reports its size so 1 of 2 cannot pass for done', () => {
    // AICTE holds a single metric. Answering it is genuinely 100% OF THE
    // CATALOGUE, and the only thing that stops that reading as "AICTE is
    // handled" is the catalogue size travelling with it. That is why
    // catalogueSize is part of the return type and not a caller's afterthought.
    const aicte = measureCoverage(PROD_CATALOGUE_SIZE.AICTE, 1);
    expect(aicte).toEqual({ catalogueSize: 1, metricsWithEvidence: 1, coveragePct: 100 });

    const pci = measureCoverage(PROD_CATALOGUE_SIZE.PCI, 1);
    expect(pci).toEqual({ catalogueSize: 2, metricsWithEvidence: 1, coveragePct: 50 });
  });

  it('cannot exceed the catalogue even if a caller forgets to filter', () => {
    // The old formula's signature failure: a numerator that outran its
    // denominator and got clamped to a confident 100%. If that ever happens
    // again the clamp is at the catalogue, so the ratio is at least arithmetic.
    expect(measureCoverage(17, 11396)).toEqual({
      catalogueSize: 17,
      metricsWithEvidence: 17,
      coveragePct: 100,
    });
  });

  it('ignores negative and fractional inputs rather than propagating them', () => {
    expect(measureCoverage(-5, 3).coveragePct).toBe(0);
    expect(measureCoverage(10, -3).coveragePct).toBe(0);
    expect(measureCoverage(10.9, 5.9)).toEqual({
      catalogueSize: 10,
      metricsWithEvidence: 5,
      coveragePct: 50,
    });
  });
});

describe('tallyEvidence — rows filed vs metrics answered', () => {
  const catalogue = catalogueOf(PROD_CATALOGUE_SIZE);

  it('counts DISTINCT metrics, so a thousand rows on one metric is still one', () => {
    // Prod NBA: 46 evidence rows, all on a single metric, catalogue of 9.
    const tally = tallyEvidence(
      evidenceFor('NBA', 'engg', 1, 46),
      catalogue,
      (r) => r.body_code,
    );
    expect(tally.NBA).toEqual({
      bodyCode: 'NBA',
      evidenceRows: 46,
      metricsWithEvidence: 1,
    });
    expect(measureCoverage(9, tally.NBA!.metricsWithEvidence).coveragePct).toBe(11);
  });

  it('the previously-broken 100%: NIRF 11,396 rows on 4 of 17 metrics', () => {
    const tally = tallyEvidence(
      evidenceFor('NIRF', 'assf', 4, 11396),
      catalogue,
      (r) => r.body_code,
    );
    const broken = Math.min(
      100,
      Math.round((tally.NIRF!.evidenceRows / PROD_CATALOGUE_SIZE.NIRF) * 100),
    );
    expect(broken).toBe(100); // what production rendered: a full green bar
    expect(measureCoverage(17, tally.NIRF!.metricsWithEvidence).coveragePct).toBe(24);
  });

  it('splits by (body × institution) when asked for that grain', () => {
    const evidence = [
      ...evidenceFor('NAAC', 'dent', 13, 112),
      ...evidenceFor('NAAC', 'engg', 10, 63),
    ];
    const tally = tallyEvidence(evidence, catalogue, (r) => `${r.body_code}::${r.institution_id}`);
    expect(tally['NAAC::dent']).toEqual({
      bodyCode: 'NAAC',
      evidenceRows: 112,
      metricsWithEvidence: 13,
    });
    // 112 rows over a 69-metric catalogue read 100% before this fix.
    expect(measureCoverage(69, 13).coveragePct).toBe(19);
    expect(measureCoverage(69, 10).coveragePct).toBe(14);
    expect(tally['NAAC::engg']!.evidenceRows).toBe(63);
  });

  it('a body with no evidence gets no bucket at all — callers must default to 0', () => {
    const tally = tallyEvidence(
      evidenceFor('NAAC', 'dent', 3, 3),
      catalogue,
      (r) => r.body_code,
    );
    expect(tally.PCI).toBeUndefined();
    expect(measureCoverage(PROD_CATALOGUE_SIZE.PCI, tally.PCI?.metricsWithEvidence ?? 0))
      .toEqual({ catalogueSize: 2, metricsWithEvidence: 0, coveragePct: 0 });
  });

  it('evidence on a code outside the active catalogue counts as a row, never as coverage', () => {
    // A retired metric or a mistyped manual tag. It is real material on file,
    // so hiding it from evidence_rows would be its own lie — but it answers
    // nothing the catalogue asks, so it must not move the percentage.
    const evidence: EvidenceRef[] = [
      { body_code: 'NAAC', institution_id: 'dent', metric_code: 'NAAC-1' },
      { body_code: 'NAAC', institution_id: 'dent', metric_code: 'RETIRED-99' },
    ];
    const tally = tallyEvidence(evidence, catalogue, (r) => r.body_code);
    expect(tally.NAAC).toEqual({
      bodyCode: 'NAAC',
      evidenceRows: 2,
      metricsWithEvidence: 1,
    });
  });

  it('evidence for a body with no catalogue at all contributes no coverage', () => {
    const tally = tallyEvidence(
      [{ body_code: 'MATRIC', institution_id: 'mhss', metric_code: 'X' }],
      catalogue,
      (r) => r.body_code,
    );
    expect(tally.MATRIC!.metricsWithEvidence).toBe(0);
    expect(measureCoverage(0, 0).coveragePct).toBe(0);
  });
});

describe('coverageBasisNote', () => {
  it('names the denominator and refuses to imply the catalogue is the body', () => {
    const note = coverageBasisNote();
    expect(note).toContain('framework catalogue');
    expect(note).toContain('not the same thing');
    expect(note).toContain('placeholder');
  });
});

// ----------------------------------------------------------------------------
// Table-driven: the four shapes a reader of the percentage has to be able to
// trust, each run through the same tally → measure path the dashboards use,
// with the retired rows/metrics formula alongside so the divergence is visible
// in the table rather than in prose.
// ----------------------------------------------------------------------------
describe('coverage table — 0 of N, N of N, many rows on one metric, a metric with no rows', () => {
  const byBody = (r: EvidenceRef) => r.body_code;

  it.each([
    // label                                              size distinct rows answered new old
    ['0 of N — catalogue seeded, no evidence at all',       69,  0,     0,    0,       0,  0],
    ['N of N — every metric answered exactly once',          9,  9,     9,    9,     100, 100],
    ['N of N — every metric answered a hundred times over',  9,  9,   900,    9,     100, 100],
    ['many rows on ONE metric — 1,000 rows on 1 of 17',     17,  1,  1000,    1,       6, 100],
    ['a metric with no rows — 4 of 5 answered, fifth empty', 5,  4,     4,    4,      80,  80],
    ['thin body, many rows on one of two — 4 rows on 1 of 2', 2, 1,     4,    1,      50, 100],
  ])('%s', (_label, size, distinct, rows, answered, newPct, oldPct) => {
    const catalogue = catalogueOf({ NAAC: size });
    const evidence = evidenceFor('NAAC', 'dent', distinct, rows);
    const tally = tallyEvidence(evidence, catalogue, byBody);
    const measure = measureCoverage(size, tally.NAAC?.metricsWithEvidence ?? 0);

    expect(tally.NAAC?.evidenceRows ?? 0).toBe(rows);
    expect(measure.metricsWithEvidence).toBe(answered);
    expect(measure.coveragePct).toBe(newPct);

    // The retired formula: rows over metrics, clamped. Pinned so the table
    // shows exactly which shapes it got wrong (every "many rows" case).
    const retired = size === 0 ? 0 : Math.min(100, Math.round((rows / size) * 100));
    expect(retired).toBe(oldPct);
  });
});
