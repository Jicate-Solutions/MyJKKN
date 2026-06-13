import { describe, it, expect } from 'vitest';
import {
  computeFeeBreakdown,
  computeProRata,
  computeUpgradeDifferential,
  remainingWholeMonths,
} from '@/lib/services/campus-living/hostel-fee-compute-service';
import type { FeeComputeInput, HostelYearWindow } from '@/types/hostel-fee-compute';

// Hostel year: June 1 2026 → May 31 2027 (June–May per hostel.year.start_month = 6).
const HOSTEL_YEAR: HostelYearWindow = {
  start_date: '2026-06-01',
  end_date: '2027-05-31',
};

// ₹100,000 per bed × 6 beds = ₹600,000 full room cost.
const PER_BED = 100000;
const CAPACITY = 6;

function ctx(overrides: Partial<FeeComputeInput> = {}): FeeComputeInput {
  return {
    perBedAnnualRate: PER_BED,
    roomCapacity: CAPACITY,
    activeOccupants: CAPACITY,
    acConfig: null,
    messAnnualFee: 0,
    ...overrides,
  };
}

describe('computeFeeBreakdown — base room share (fractional occupancy)', () => {
  it('6-bed room full (6 occupants): each pays 1× per-bed; sum = full room cost', () => {
    const b = computeFeeBreakdown(ctx({ activeOccupants: 6 }));
    expect(b.base_share).toBe(100000); // 600000 / 6
    expect(b.base_share * 6).toBe(600000); // recovers full room
    expect(b.currency).toBe('INR');
  });

  it('6-bed room with 3 occupants: each pays 2× per-bed (decision 1-3)', () => {
    const b = computeFeeBreakdown(ctx({ activeOccupants: 3 }));
    expect(b.base_share).toBe(200000); // 600000 / 3 = 2× the 100000 per-bed
  });

  it('6-bed room with 1 occupant: pays 6× (full room), NO cap (decision 4)', () => {
    const b = computeFeeBreakdown(ctx({ activeOccupants: 1 }));
    expect(b.base_share).toBe(600000); // sole occupant absorbs whole room
  });

  it('mess fee is FLAT per learner — NOT divided by occupants (decision 10)', () => {
    const solo = computeFeeBreakdown(ctx({ activeOccupants: 1, messAnnualFee: 50000 }));
    const shared = computeFeeBreakdown(ctx({ activeOccupants: 6, messAnnualFee: 50000 }));
    expect(solo.mess_fee).toBe(50000);
    expect(shared.mess_fee).toBe(50000); // unchanged by occupancy
  });

  it('total = base_share + ac_share + mess_fee', () => {
    const b = computeFeeBreakdown(ctx({ activeOccupants: 6, messAnnualFee: 50000 }));
    expect(b.total_annual).toBe(b.base_share + b.ac_share + b.mess_fee);
    expect(b.total_annual).toBe(100000 + 0 + 50000);
  });
});

describe('computeFeeBreakdown — AC share (decisions 26-29)', () => {
  // AC: 1.5 ton × ₹6000/mo (24h) × 12 = ₹108,000 room cost / occupants.
  const AC = { tonnage: 1.5, base_inr_per_month_24h: 6000 };

  it('AC room: ac_share added, shared by active occupants', () => {
    const b = computeFeeBreakdown(ctx({ activeOccupants: 6, acConfig: AC }));
    // room AC = 1.5 × 6000 × 12 = 108000 / 6 = 18000
    expect(b.ac_share).toBe(18000);
    expect(b.total_annual).toBe(100000 + 18000 + 0);
  });

  it('AC shared by fewer occupants → bigger per-head AC share', () => {
    const b3 = computeFeeBreakdown(ctx({ activeOccupants: 3, acConfig: AC }));
    expect(b3.ac_share).toBe(36000); // 108000 / 3
  });

  it('Non-AC room: ac_share = 0', () => {
    const b = computeFeeBreakdown(ctx({ activeOccupants: 6, acConfig: null }));
    expect(b.ac_share).toBe(0);
  });

  it('AC config with zero tonnage → treated as no AC', () => {
    const b = computeFeeBreakdown(
      ctx({ activeOccupants: 6, acConfig: { tonnage: 0, base_inr_per_month_24h: 6000 } })
    );
    expect(b.ac_share).toBe(0);
  });
});

describe('computeFeeBreakdown — divide-by-zero guard', () => {
  it('0 occupants is treated as 1 (no throw; decision 4 no cap)', () => {
    const b = computeFeeBreakdown(ctx({ activeOccupants: 0 }));
    expect(b.base_share).toBe(600000); // treated as sole occupant
  });

  it('negative occupants treated as 1', () => {
    const b = computeFeeBreakdown(ctx({ activeOccupants: -5 }));
    expect(b.base_share).toBe(600000);
  });
});

describe('remainingWholeMonths', () => {
  it('join in June (start month) → 12 months', () => {
    expect(remainingWholeMonths('2026-06-15', HOSTEL_YEAR)).toBe(12);
  });

  it('join in October → 8 months (Oct,Nov,Dec,Jan,Feb,Mar,Apr,May)', () => {
    expect(remainingWholeMonths('2026-10-03', HOSTEL_YEAR)).toBe(8);
  });

  it('join in May (end month) → 1 month', () => {
    expect(remainingWholeMonths('2027-05-10', HOSTEL_YEAR)).toBe(1);
  });

  it('join after year end → 0 months', () => {
    expect(remainingWholeMonths('2027-07-01', HOSTEL_YEAR)).toBe(0);
  });
});

describe('computeProRata (mid-year join)', () => {
  it('join in October (8 months to May): total × 8/12', () => {
    const total = 120000;
    const r = computeProRata(total, '2026-10-03', HOSTEL_YEAR);
    expect(r.remaining_months).toBe(8);
    expect(r.prorated_total).toBe(80000); // 120000 × 8/12
  });

  it('full-year join (June): pro-rata equals full total', () => {
    const r = computeProRata(120000, '2026-06-01', HOSTEL_YEAR);
    expect(r.prorated_total).toBe(120000);
  });
});

describe('computeUpgradeDifferential (decision 7)', () => {
  // Classic: ₹100k/bed × 6 / 6 occ = ₹100k. Premium: ₹150k/bed × 6 / 6 = ₹150k.
  const classicCtx: FeeComputeInput = ctx({ perBedAnnualRate: 100000, activeOccupants: 6 });
  const premiumCtx: FeeComputeInput = ctx({ perBedAnnualRate: 150000, activeOccupants: 6 });

  it('upgrader pays premium pro-rata minus classic pro-rata for remaining months', () => {
    // Oct join → 8/12. Classic total 100000 → prorata 66667. Premium 150000 → prorata 100000.
    const r = computeUpgradeDifferential(classicCtx, premiumCtx, '2026-10-03', HOSTEL_YEAR);
    expect(r.classic_prorata).toBe(Math.round(100000 * (8 / 12))); // 66667
    expect(r.premium_prorata).toBe(Math.round(150000 * (8 / 12))); // 100000
    expect(r.differential).toBe(r.premium_prorata - r.classic_prorata); // 33333
  });

  it('differential is floored at 0 when premium is cheaper than classic', () => {
    const r = computeUpgradeDifferential(premiumCtx, classicCtx, '2026-10-03', HOSTEL_YEAR);
    expect(r.differential).toBe(0);
  });
});
