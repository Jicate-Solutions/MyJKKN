// __tests__/meetings/recurring-series-config.test.ts
//
// The rules of a recurring series, pinned.
//
// These are the three answers the configuration screen and (later) the proposal
// engine must agree on, and each one encodes a decision the Director actually
// took on 25 August 2026 rather than a shape that happened to be convenient:
//
//   * The EAO PICKS the frequency from a list — so weekly has to be in it. The
//     sample sheet was all monthly, which is exactly the sort of thing that
//     quietly becomes a hardcoded assumption.
//   * Coverage is "every college EXCEPT a few known exceptions", so an
//     exception has to SUBTRACT. A test that only checked "the covered list is
//     non-empty" would pass on a version that ignored exceptions entirely.
//   * The host is always required and needs no row, and an optional attendee
//     must not end up vetoing a slot.
//
// The service module is deliberately free of Supabase imports, so unlike the
// rest of __tests__/meetings this file needs no import-time mocks.

import { describe, it, expect } from 'vitest';

import {
  CADENCE_OPTIONS,
  BLOCK_KIND_OPTIONS,
  cadenceLabel,
  hhmmToMinutes,
  isBlockKind,
  isSeriesCadence,
  minutesToHHmm,
  resolveCoveredInstitutions,
  resolveRequiredAttendees,
  rotateOrder,
  weekdayLabel,
} from '@/lib/services/meetings/recurring-series-config';

const A = 'inst-a';
const B = 'inst-b';
const C = 'inst-c';
const ALL = [A, B, C];

describe('cadence is chosen, not hardcoded', () => {
  it('offers exactly the four the Director chose', () => {
    expect(CADENCE_OPTIONS.map((c) => c.value)).toEqual([
      'weekly',
      'fortnightly',
      'twice_monthly',
      'monthly',
    ]);
  });

  it('includes weekly — the sample sheet was monthly-only and the real set is not', () => {
    expect(CADENCE_OPTIONS.some((c) => c.value === 'weekly')).toBe(true);
  });

  it('does not offer anything outside the four', () => {
    expect(isSeriesCadence('daily')).toBe(false);
    expect(isSeriesCadence('quarterly')).toBe(false);
    expect(isSeriesCadence('')).toBe(false);
    expect(isSeriesCadence(undefined)).toBe(false);
  });

  it('accepts each of the four', () => {
    for (const option of CADENCE_OPTIONS) {
      expect(isSeriesCadence(option.value)).toBe(true);
    }
  });

  it('labels a weekly series as weekly, and falls back to the raw value', () => {
    expect(cadenceLabel('weekly')).toBe('Weekly');
    expect(cadenceLabel('monthly')).toBe('Monthly');
    // A row written before a cadence was retired still renders as something.
    expect(cadenceLabel('quarterly' as never)).toBe('quarterly');
  });

  it('sizes weekly far above monthly — this is what makes the volume warning true', () => {
    const weekly = CADENCE_OPTIONS.find((c) => c.value === 'weekly');
    const monthly = CADENCE_OPTIONS.find((c) => c.value === 'monthly');
    expect(weekly!.approxPerYear).toBeGreaterThan(monthly!.approxPerYear * 3);
  });
});

describe('coverage: every college, minus the recorded exceptions', () => {
  it('covers everything when nothing is excepted', () => {
    const result = resolveCoveredInstitutions({
      coverageMode: 'all_institutions',
      allInstitutionIds: ALL,
      units: [],
    });
    expect(result.covered).toEqual(ALL);
    expect(result.excluded).toEqual([]);
  });

  it('an exception SUBTRACTS a college', () => {
    const result = resolveCoveredInstitutions({
      coverageMode: 'all_institutions',
      allInstitutionIds: ALL,
      units: [{ institutionId: B, isExcluded: true }],
    });
    expect(result.covered).toEqual([A, C]);
    expect(result.excluded).toEqual([B]);
  });

  it('would have FAILED on a version that ignored exceptions', () => {
    // Proves the check discriminates rather than agreeing with anything.
    const result = resolveCoveredInstitutions({
      coverageMode: 'all_institutions',
      allInstitutionIds: ALL,
      units: [{ institutionId: B, isExcluded: true }],
    });
    expect(result.covered).not.toEqual(ALL);
  });

  it('a non-excluded row does NOT narrow an all-institutions series', () => {
    // The exception rows are the only thing that means anything in this mode —
    // a stray "included" row must not silently turn coverage into a whitelist.
    const result = resolveCoveredInstitutions({
      coverageMode: 'all_institutions',
      allInstitutionIds: ALL,
      units: [{ institutionId: A, isExcluded: false }],
    });
    expect(result.covered).toEqual(ALL);
  });

  it('listed_only covers only what is listed', () => {
    const result = resolveCoveredInstitutions({
      coverageMode: 'listed_only',
      allInstitutionIds: ALL,
      units: [
        { institutionId: A, isExcluded: false },
        { institutionId: C, isExcluded: false },
      ],
    });
    expect(result.covered).toEqual([A, C]);
    expect(result.excluded).toEqual([B]);
  });

  it('a college with no meeting is expressible, not an error', () => {
    // "Absence must be expressible" — the spec's own edge case.
    const result = resolveCoveredInstitutions({
      coverageMode: 'listed_only',
      allInstitutionIds: ALL,
      units: [],
    });
    expect(result.covered).toEqual([]);
    expect(result.excluded).toEqual(ALL);
  });

  it('drops an exception naming a college that is no longer active', () => {
    const result = resolveCoveredInstitutions({
      coverageMode: 'all_institutions',
      allInstitutionIds: [A, B],
      units: [{ institutionId: 'closed-college', isExcluded: true }],
    });
    expect(result.covered).toEqual([A, B]);
    expect(result.excluded).toEqual([]);
  });

  it('returns coverage in display order regardless of how rows were entered', () => {
    const result = resolveCoveredInstitutions({
      coverageMode: 'listed_only',
      allInstitutionIds: ALL,
      units: [
        { institutionId: C, isExcluded: false },
        { institutionId: A, isExcluded: false },
      ],
    });
    expect(result.covered).toEqual([A, C]);
  });
});

describe('who must be free', () => {
  const HOST = 'director';

  it('the host is required without needing a row', () => {
    const { required, optional } = resolveRequiredAttendees({
      hostProfileId: HOST,
      attendees: [],
    });
    expect(required).toEqual([HOST]);
    expect(optional).toEqual([]);
  });

  it('named people join the host, in the order they were added', () => {
    const { required } = resolveRequiredAttendees({
      hostProfileId: HOST,
      attendees: [
        { profileId: 'principal', isRequired: true },
        { profileId: 'iqac-coordinator', isRequired: true },
      ],
    });
    expect(required).toEqual([HOST, 'principal', 'iqac-coordinator']);
  });

  it('an optional attendee never vetoes a slot', () => {
    const { required, optional } = resolveRequiredAttendees({
      hostProfileId: HOST,
      attendees: [
        { profileId: 'principal', isRequired: true },
        { profileId: 'note-taker', isRequired: false },
      ],
    });
    expect(required).toEqual([HOST, 'principal']);
    expect(required).not.toContain('note-taker');
    expect(optional).toEqual(['note-taker']);
  });

  it('never returns the host twice, even if a row names them', () => {
    const { required } = resolveRequiredAttendees({
      hostProfileId: HOST,
      attendees: [{ profileId: HOST, isRequired: true }],
    });
    expect(required).toEqual([HOST]);
  });

  it('de-duplicates a person added twice', () => {
    const { required } = resolveRequiredAttendees({
      hostProfileId: HOST,
      attendees: [
        { profileId: 'principal', isRequired: true },
        { profileId: 'principal', isRequired: true },
      ],
    });
    expect(required).toEqual([HOST, 'principal']);
  });

  it('each series carries its own list — two series do not leak into each other', () => {
    const iqac = resolveRequiredAttendees({
      hostProfileId: HOST,
      attendees: [{ profileId: 'iqac-coordinator', isRequired: true }],
    });
    const review = resolveRequiredAttendees({
      hostProfileId: HOST,
      attendees: [{ profileId: 'principal', isRequired: true }],
    });
    expect(iqac.required).not.toContain('principal');
    expect(review.required).not.toContain('iqac-coordinator');
  });
});

describe('rotation', () => {
  it('whoever went first last cycle goes later this cycle', () => {
    expect(rotateOrder(ALL, 0)).toEqual([A, B, C]);
    expect(rotateOrder(ALL, 1)).toEqual([B, C, A]);
    expect(rotateOrder(ALL, 2)).toEqual([C, A, B]);
  });

  it('wraps rather than running off the end', () => {
    expect(rotateOrder(ALL, 3)).toEqual([A, B, C]);
    expect(rotateOrder(ALL, 7)).toEqual([B, C, A]);
  });

  it('survives a negative cursor instead of returning an empty month', () => {
    expect(rotateOrder(ALL, -1)).toEqual([C, A, B]);
  });

  it('an unset rotation order is a normal state, not a crash', () => {
    expect(rotateOrder([], 4)).toEqual([]);
  });

  it('never drops or duplicates a college', () => {
    const rotated = rotateOrder(ALL, 2);
    expect([...rotated].sort()).toEqual([...ALL].sort());
  });
});

describe('preferred slot round-trips', () => {
  it('turns minutes into the time the EAO typed', () => {
    expect(minutesToHHmm(0)).toBe('00:00');
    expect(minutesToHHmm(9 * 60 + 30)).toBe('09:30');
    expect(minutesToHHmm(1439)).toBe('23:59');
    expect(minutesToHHmm(null)).toBe('');
  });

  it('turns the time back into minutes', () => {
    expect(hhmmToMinutes('09:30')).toBe(570);
    expect(hhmmToMinutes('00:00')).toBe(0);
    expect(hhmmToMinutes('')).toBeNull();
    expect(hhmmToMinutes('25:00')).toBeNull();
    expect(hhmmToMinutes('nonsense')).toBeNull();
  });

  it('"any day" is a real answer, not a missing one', () => {
    expect(weekdayLabel(null)).toBe('Any day');
    expect(weekdayLabel(3)).toBe('Wednesday');
    expect(weekdayLabel(0)).toBe('Sunday');
  });
});

describe('only holidays and festivals block a period', () => {
  it('offers exactly two kinds', () => {
    expect(BLOCK_KIND_OPTIONS.map((o) => o.value)).toEqual(['public_holiday', 'festival']);
  });

  it('travel is NOT a block kind — a travel week turns a meeting online instead', () => {
    expect(isBlockKind('travel')).toBe(false);
  });

  it('exam weeks are not a block kind either — deliberately left unblocked', () => {
    expect(isBlockKind('exam')).toBe(false);
  });
});
