import { describe, it, expect } from 'vitest';
import {
  fetchEvidencePaged,
  countEvidenceByMetric,
  aggregateBySource,
  periodLabelsIn,
  EVIDENCE_PAGE_SIZE,
  type EvidenceMappingRow,
} from '@/hooks/accreditation/use-iqac-framework';

// ---------------------------------------------------------------------------
// This hook reads EVERY body at once, so it was the first caller to breach
// PostgREST's 10,000-row cap when NIRF evidence was seeded on 2026-08-02
// (258 rows → 11,608). The cap is reported only in the `content-range` header,
// which the JS client does not surface, so the read came back short with
// `error === null`.
//
// The fake server below therefore ENFORCES the cap. A fixture array counted in
// memory would pass against the unpaged version too and prove nothing.
// ---------------------------------------------------------------------------

const SERVER_MAX_ROWS = 10_000;

function fakeServer(rows: EvidenceMappingRow[]) {
  let calls = 0;
  return {
    fetchPage: async (from: number, to: number) => {
      calls += 1;
      const capped = Math.min(to - from + 1, SERVER_MAX_ROWS);
      return rows.slice(from, from + capped);
    },
    callCount: () => calls,
  };
}

const row = (body: string, metric: string, i: number): EvidenceMappingRow => ({
  body_code: body,
  metric_code: metric,
  source_table: body === 'NIRF' ? 'learners_profiles' : 'obe_course_attainment_rollup',
  source_id: `${body}-${metric}-${i}`,
  period_label: 'AY 2026-27',
});

/** Production shape on 2026-08-02: NIRF 11,396 · NAAC 166 · NBA 46 = 11,608. */
function productionShape(): EvidenceMappingRow[] {
  const out: EvidenceMappingRow[] = [];
  const nirf: Record<string, number> = {
    TLR_SS: 3559, OI_GD: 3559, OI_RD: 3547, OI_ESCS: 731,
  };
  for (const [m, n] of Object.entries(nirf)) {
    for (let i = 0; i < n; i += 1) out.push(row('NIRF', m, i));
  }
  for (let i = 0; i < 166; i += 1) out.push(row('NAAC', '3.4.3', i));
  for (let i = 0; i < 46; i += 1) out.push(row('NBA', 'T1_CO', i));
  return out;
}

describe('fetchEvidencePaged', () => {
  it('returns every row past the 10,000 server cap', async () => {
    const rows = productionShape();
    expect(rows).toHaveLength(11_608);

    const { fetchPage } = fakeServer(rows);
    const got = await fetchEvidencePaged(fetchPage);

    expect(got).toHaveLength(11_608);
    // The pre-fix behaviour. If this ever equals 10,000 again, the cap is back.
    expect(got.length).not.toBe(SERVER_MAX_ROWS);
  });

  it('does not drop the final partial page', async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => row('NIRF', 'TLR_SS', i));
    const { fetchPage } = fakeServer(rows);
    expect(await fetchEvidencePaged(fetchPage)).toHaveLength(2001);
  });

  it('stops on the first short page', async () => {
    const server = fakeServer(Array.from({ length: 1500 }, (_, i) => row('NIRF', 'OI_GD', i)));
    await fetchEvidencePaged(server.fetchPage);
    expect(server.callCount()).toBe(2);
  });

  it('is bounded when a server ignores range', async () => {
    let calls = 0;
    const runaway = async () => {
      calls += 1;
      return Array.from({ length: EVIDENCE_PAGE_SIZE }, (_, i) => row('NIRF', 'X', i));
    };
    await fetchEvidencePaged(runaway);
    expect(calls).toBe(100);
  });
});

describe('the derived cuts survive the full set', () => {
  it('counts each metric against the true total, not the truncated one', async () => {
    const { fetchPage } = fakeServer(productionShape());
    const all = await fetchEvidencePaged(fetchPage);
    const counts = countEvidenceByMetric(all);

    // Counts DISTINCT source records, and every source_id here is unique.
    expect(counts['NIRF::TLR_SS']).toBe(3559);
    expect(counts['NAAC::3.4.3']).toBe(166);
    expect(counts['NBA::T1_CO']).toBe(46);
    // 3559 is above the per-page size and only reachable if paging worked.
    expect(counts['NIRF::TLR_SS']).toBeGreaterThan(EVIDENCE_PAGE_SIZE);
  });

  it('still groups by source across the page boundary', async () => {
    const { fetchPage } = fakeServer(productionShape());
    const all = await fetchEvidencePaged(fetchPage);
    const bySource = aggregateBySource(all);

    const learners = bySource.find(
      (s) => s.source_table === 'learners_profiles' && s.body_code === 'NIRF',
    );
    expect(learners?.rows).toBe(11_396);
  });

  it('finds the period label even though it only appears on rows past the cap', async () => {
    expect(periodLabelsIn(await fetchEvidencePaged(fakeServer(productionShape()).fetchPage)))
      .toEqual(['AY 2026-27']);
  });
});
