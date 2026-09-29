/**
 * The server-side band reader: parsing, and the rule that an empty matrix is
 * "no band" in BOTH places a college's band is judged — the By-college label
 * and each person's verdict.
 *
 * The bug this pins: a college whose band row existed with an empty matrix was
 * labelled "has band" in the By-college table while every person in it read
 * "College has no pay band".
 *
 * Run: npx vitest run __tests__/hr/pay-band-policy-service.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  collegePayBandsFromRows,
  parsePayBandPolicy,
  type PayBandPolicyRow,
} from '@/lib/services/hr/pay-bands/pay-band-policy-service';
import {
  checkPayBand,
  summarisePayBandByCollege,
  usablePayBandRungs,
} from '@/lib/hr/pay-band-check';

const LIBRARIAN_RUNG = { designation: 'Librarian', qualification: 'M.L.I.Sc', basic_pay: 40000 };

function row(scopeId: string | null, value: unknown): PayBandPolicyRow {
  return { scope_id: scopeId, value, updated_at: '2026-09-01T00:00:00Z' };
}

/** Run the rows through exactly the path the screen takes: server list → Map → check → summary. */
function byCollegeLabel(rows: PayBandPolicyRow[], collegeId: string) {
  const bands = collegePayBandsFromRows(rows);
  const byInstitution = new Map(bands.map((b) => [b.institutionId, b.policy]));
  const result = checkPayBand(
    { designation: 'Librarian', monthlyPay: 30000 },
    byInstitution.get(collegeId) ?? null
  );
  const [summary] = summarisePayBandByCollege(
    [{ collegeId, collegeName: 'A College', result }],
    new Set(byInstitution.keys())
  );
  return { summary, result };
}

describe('collegePayBandsFromRows — an empty matrix means no band', () => {
  it('lists a college whose band has a usable rung', () => {
    const bands = collegePayBandsFromRows([row('eng', { pay_matrix: [LIBRARIAN_RUNG] })]);
    expect(bands.map((b) => b.institutionId)).toEqual(['eng']);
    expect(bands[0].policy.rungs).toHaveLength(1);
    expect(bands[0].updatedAt).toBe('2026-09-01T00:00:00Z');
  });

  it('leaves out a college whose band row has an empty matrix', () => {
    expect(collegePayBandsFromRows([row('dental', { pay_matrix: [] })])).toEqual([]);
  });

  it('leaves out a college whose every rung is unusable', () => {
    const rows = [
      row('dental', {
        pay_matrix: [
          { designation: '   ', basic_pay: 30000 },
          { designation: 'Bus Driver', basic_pay: 'not a number' },
          { designation: 'Typist', basic_pay: -5 },
        ],
      }),
    ];
    expect(collegePayBandsFromRows(rows)).toEqual([]);
  });

  it('leaves out a row with no college on it', () => {
    expect(collegePayBandsFromRows([row(null, { pay_matrix: [LIBRARIAN_RUNG] })])).toEqual([]);
  });

  it('agrees with checkPayBand about which rungs count', () => {
    const policy = parsePayBandPolicy({
      pay_matrix: [LIBRARIAN_RUNG, { designation: 'Typist', basic_pay: -5 }],
    });
    expect(usablePayBandRungs(policy)).toHaveLength(1);
  });
});

describe('the By-college label agrees with the people in it', () => {
  it('labels a college with an EMPTY matrix "no band", matching every person in it', () => {
    const { summary, result } = byCollegeLabel([row('dental', { pay_matrix: [] })], 'dental');

    expect(result.reason).toBe('no_band_configured');
    expect(summary.hasBand).toBe(false);
  });

  it('labels a college with a usable band "has band", matching a real verdict', () => {
    const { summary, result } = byCollegeLabel([row('eng', { pay_matrix: [LIBRARIAN_RUNG] })], 'eng');

    expect(result.verdict).toBe('below_band');
    expect(summary.hasBand).toBe(true);
  });
});

describe('parsePayBandPolicy', () => {
  it('unwraps a payload stored as { value: {...} }', () => {
    const policy = parsePayBandPolicy({
      value: { pay_matrix: [LIBRARIAN_RUNG], overrides: { net_set_basic: '15000' } },
    });
    expect(policy?.rungs[0]).toEqual({ designation: 'Librarian', qualification: 'M.L.I.Sc', basicPay: 40000 });
    expect(policy?.guaranteedMinimum).toBe(15000);
  });

  it('returns null for a value that is not an object', () => {
    expect(parsePayBandPolicy(null)).toBeNull();
    expect(parsePayBandPolicy('band')).toBeNull();
  });
});
