// __tests__/meetings/monthly-slate-engine.test.ts
//
// Adversarial suite for the monthly slate proposal engine (piece 3).
//
// House style, same as native-slot-engine.test.ts: every expected instant is
// re-derived BY HAND in a comment, so the test encodes the arithmetic rather
// than the engine's own output. IST = UTC+05:30, fixed, no DST — so 10:00 IST
// is 04:30Z on the same date, always.
//
// November 2026 weekdays used below (verified against the system calendar):
//   Mondays  2, 9, 16, 23, 30
//   Tuesdays 3, 10, 17, 24

import { describe, expect, it } from 'vitest';

import {
  occurrencesPerMonth,
  proposeMonthlySlate,
  type ProposeSlateInput,
  type SlateSeries,
} from '@/lib/services/meetings/monthly-slate-engine';

// ── Instants (10:00 IST = 04:30Z; 14:00 IST = 08:30Z) ────────────────────────
const MON_02 = '2026-11-02T04:30:00.000Z';
const TUE_03 = '2026-11-03T04:30:00.000Z';
const TUE_03_PM = '2026-11-03T08:30:00.000Z';
const MON_02_PM = '2026-11-02T08:30:00.000Z';
const MON_09 = '2026-11-09T04:30:00.000Z';
const MON_16 = '2026-11-16T04:30:00.000Z';
const MON_23 = '2026-11-23T04:30:00.000Z';

const DIRECTOR = 'p-director';
const EAO = 'p-eao';

const CET = 'i-cet';
const DENTAL = 'i-dental';
const PHARM = 'i-pharm';

function series(over: Partial<SlateSeries> = {}): SlateSeries {
  return {
    id: 's-iqac',
    name: 'IQAC',
    hostProfileId: DIRECTOR,
    cadence: 'monthly',
    preferredWeekday: null,
    preferredStartMinute: null,
    durationMin: 60,
    mayBeOnline: true,
    coverageMode: 'all_institutions',
    priority: 100,
    rotationCursor: 0,
    units: [],
    attendees: [],
    ...over,
  };
}

function input(over: Partial<ProposeSlateInput> = {}): ProposeSlateInput {
  return {
    month: '2026-11',
    series: [series()],
    allInstitutionIds: [CET, DENTAL, PHARM],
    rotationOrder: [CET, DENTAL, PHARM],
    availability: [{ profileId: DIRECTOR, freeStarts: [MON_02, MON_09, MON_16, MON_23] }],
    ...over,
  };
}

// ============================================================================
// The core placement
// ============================================================================

describe('proposeMonthlySlate — placement', () => {
  it('places one meeting per covered college for a monthly series', () => {
    const out = proposeMonthlySlate(input());

    expect(out.placed).toHaveLength(3);
    expect(out.unplaceable).toHaveLength(0);
    expect(out.placed.map((p) => p.institutionId)).toEqual([CET, DENTAL, PHARM]);
    // Distinct slots — the same host cannot be in two places at once.
    expect(new Set(out.placed.map((p) => p.start)).size).toBe(3);
  });

  it('computes end as start + durationMin', () => {
    const out = proposeMonthlySlate(input());
    const first = out.placed[0];
    // 2026-11-02T04:30Z + 60 min = 2026-11-02T05:30Z
    expect(first.start).toBe(MON_02);
    expect(first.end).toBe('2026-11-02T05:30:00.000Z');
  });

  it('honours the rotation cursor for the pick order', () => {
    // cursor 1 rotates [CET, DENTAL, PHARM] -> [DENTAL, PHARM, CET].
    const out = proposeMonthlySlate(
      input({ series: [series({ rotationCursor: 1 })] }),
    );
    expect(out.placed.map((p) => p.institutionId)).toEqual([DENTAL, PHARM, CET]);
    // ...and the earliest slot goes to whoever is first in the rotated order.
    expect(out.placed[0].institutionId).toBe(DENTAL);
    expect(out.placed[0].start).toBe(MON_02);
  });

  it('gives a weekly series four occurrences per college', () => {
    expect(occurrencesPerMonth('weekly')).toBe(4);
    expect(occurrencesPerMonth('fortnightly')).toBe(2);
    expect(occurrencesPerMonth('twice_monthly')).toBe(2);
    expect(occurrencesPerMonth('monthly')).toBe(1);
  });

  it('excludes a college recorded as an exception under all_institutions', () => {
    const out = proposeMonthlySlate(
      input({
        series: [series({ units: [{ institutionId: DENTAL, isExcluded: true }] })],
      }),
    );
    expect(out.placed.map((p) => p.institutionId)).toEqual([CET, PHARM]);
    expect(out.unplaceable).toHaveLength(0);
  });

  it('covers ONLY the listed colleges under listed_only', () => {
    const out = proposeMonthlySlate(
      input({
        series: [
          series({
            coverageMode: 'listed_only',
            units: [{ institutionId: PHARM, isExcluded: false }],
          }),
        ],
      }),
    );
    expect(out.placed.map((p) => p.institutionId)).toEqual([PHARM]);
  });
});

// ============================================================================
// "A silently missing meeting is the worst failure this system can have."
// ============================================================================

describe('proposeMonthlySlate — nothing is ever silently dropped', () => {
  it('reports every college when the host has no availability at all', () => {
    const out = proposeMonthlySlate(input({ availability: [] }));

    expect(out.placed).toHaveLength(0);
    expect(out.unplaceable).toHaveLength(3);
    expect(out.unplaceable.every((u) => u.reason === 'no_shared_availability')).toBe(true);
    expect(out.unplaceable.map((u) => u.institutionId).sort()).toEqual(
      [CET, DENTAL, PHARM].sort(),
    );
  });

  it('accounts for every college x occurrence — placed + unplaceable, no gaps', () => {
    // 3 colleges x 2 occurrences (fortnightly) = 6 expected outcomes, but only
    // 4 slots exist for the host. Two must come back as unplaceable, not vanish.
    const out = proposeMonthlySlate(
      input({ series: [series({ cadence: 'fortnightly' })] }),
    );

    const real = out.unplaceable.filter((u) => u.occurrence > 0);
    expect(out.placed.length + real.length).toBe(6);
    expect(out.placed).toHaveLength(4);
    expect(real).toHaveLength(2);
  });

  it('treats a person with NO availability row as unknown, never as free', () => {
    // The EAO is required but we hold no calendar for them. Placing a meeting
    // they must attend would be a guess.
    const out = proposeMonthlySlate(
      input({
        series: [series({ attendees: [{ profileId: EAO, isRequired: true }] })],
      }),
    );
    expect(out.placed).toHaveLength(0);
    expect(out.unplaceable.every((u) => u.reason === 'no_shared_availability')).toBe(true);
  });
});

// ============================================================================
// Several people's calendars at once
// ============================================================================

describe('proposeMonthlySlate — multi-person availability', () => {
  it('uses only the times every required person shares', () => {
    const out = proposeMonthlySlate(
      input({
        series: [series({ attendees: [{ profileId: EAO, isRequired: true }] })],
        availability: [
          { profileId: DIRECTOR, freeStarts: [MON_02, MON_09, MON_16, MON_23] },
          { profileId: EAO, freeStarts: [MON_09, MON_23] }, // only two in common
        ],
      }),
    );

    expect(out.placed).toHaveLength(2);
    expect(out.placed.map((p) => p.start)).toEqual([MON_09, MON_23]);
    expect(out.placed[0].requiredProfileIds).toEqual([DIRECTOR, EAO]);
    // The third college has nothing left.
    expect(out.unplaceable).toHaveLength(1);
    expect(out.unplaceable[0].institutionId).toBe(PHARM);
  });

  it('an OPTIONAL attendee never vetoes a slot', () => {
    const out = proposeMonthlySlate(
      input({
        series: [series({ attendees: [{ profileId: EAO, isRequired: false }] })],
        availability: [
          { profileId: DIRECTOR, freeStarts: [MON_02, MON_09, MON_16] },
          // EAO free for nothing — and it must not matter.
          { profileId: EAO, freeStarts: [] },
        ],
      }),
    );
    expect(out.placed).toHaveLength(3);
    expect(out.placed[0].optionalProfileIds).toEqual([EAO]);
    expect(out.placed[0].requiredProfileIds).toEqual([DIRECTOR]);
  });
});

// ============================================================================
// Holidays and festivals
// ============================================================================

describe('proposeMonthlySlate — blocked periods', () => {
  it('never places inside a global blocked period', () => {
    const out = proposeMonthlySlate(
      input({
        blockedPeriods: [
          { institutionId: null, name: 'Deepavali', startsOn: '2026-11-02', endsOn: '2026-11-09' },
        ],
      }),
    );
    // 2 and 9 Nov are gone; 16 and 23 survive.
    expect(out.placed.map((p) => p.start)).toEqual([MON_16, MON_23]);
    expect(out.placed).toHaveLength(2);
    expect(out.unplaceable).toHaveLength(1);
  });

  it('an institution-scoped block affects ONLY that institution', () => {
    const out = proposeMonthlySlate(
      input({
        blockedPeriods: [
          { institutionId: CET, name: 'CET founders day', startsOn: '2026-11-02', endsOn: '2026-11-02' },
        ],
      }),
    );
    // CET picks first but cannot use 2 Nov, so it takes 9 Nov; the others
    // then take what is left, in order.
    const byInst = Object.fromEntries(out.placed.map((p) => [p.institutionId, p.start]));
    expect(byInst[CET]).toBe(MON_09);
    expect(byInst[DENTAL]).toBe(MON_02);
    expect(byInst[PHARM]).toBe(MON_16);
  });

  it('says so plainly when every candidate is inside a holiday', () => {
    const out = proposeMonthlySlate(
      input({
        blockedPeriods: [
          { institutionId: null, name: 'Long festival', startsOn: '2026-11-01', endsOn: '2026-11-30' },
        ],
      }),
    );
    expect(out.placed).toHaveLength(0);
    expect(out.unplaceable.every((u) => u.reason === 'all_candidates_blocked')).toBe(true);
    expect(out.unplaceable[0].detail).toContain('holiday or festival');
  });
});

// ============================================================================
// Travel turns a meeting online; it does not lose it
// ============================================================================

describe('proposeMonthlySlate — travel', () => {
  it('keeps the meeting and flips it online when a required person is away', () => {
    const out = proposeMonthlySlate(
      input({
        awayPeriods: [
          { profileId: DIRECTOR, startsOn: '2026-11-02', endsOn: '2026-11-02', label: 'Delhi visit' },
        ],
      }),
    );
    // Nothing slips: 2 Nov is still used, just online.
    expect(out.placed[0].start).toBe(MON_02);
    expect(out.placed[0].mode).toBe('online');
    expect(out.placed[0].onlineBecause).toBe('Delhi visit');
    // The later ones are unaffected.
    expect(out.placed[1].mode).toBe('in_person');
    expect(out.placed[1].onlineBecause).toBeUndefined();
  });

  it('skips an away slot for a series that may NOT be held online', () => {
    const out = proposeMonthlySlate(
      input({
        series: [series({ mayBeOnline: false })],
        awayPeriods: [
          { profileId: DIRECTOR, startsOn: '2026-11-02', endsOn: '2026-11-02' },
        ],
      }),
    );
    expect(out.placed.map((p) => p.start)).toEqual([MON_09, MON_16, MON_23]);
    expect(out.placed.every((p) => p.mode === 'in_person')).toBe(true);
  });

  it('reports cannot_be_online when away is the ONLY thing left', () => {
    const out = proposeMonthlySlate(
      input({
        series: [series({ mayBeOnline: false })],
        availability: [{ profileId: DIRECTOR, freeStarts: [MON_02] }],
        awayPeriods: [
          { profileId: DIRECTOR, startsOn: '2026-11-01', endsOn: '2026-11-30' },
        ],
      }),
    );
    expect(out.placed).toHaveLength(0);
    expect(out.unplaceable[0].reason).toBe('cannot_be_online');
  });
});

// ============================================================================
// Collisions between series
// ============================================================================

describe('proposeMonthlySlate — collisions', () => {
  it('lower priority number takes the slot first', () => {
    const out = proposeMonthlySlate(
      input({
        series: [
          series({ id: 's-low', name: 'Review', priority: 200, coverageMode: 'listed_only', units: [{ institutionId: CET, isExcluded: false }] }),
          series({ id: 's-high', name: 'IQAC', priority: 10, coverageMode: 'listed_only', units: [{ institutionId: CET, isExcluded: false }] }),
        ],
        availability: [{ profileId: DIRECTOR, freeStarts: [MON_02, MON_09] }],
      }),
    );
    const iqac = out.placed.find((p) => p.seriesId === 's-high');
    const review = out.placed.find((p) => p.seriesId === 's-low');
    expect(iqac?.start).toBe(MON_02);
    expect(review?.start).toBe(MON_09);
  });

  it('never double-books the same person at the same instant', () => {
    const out = proposeMonthlySlate(
      input({
        series: [
          series({ id: 's-a', name: 'A', coverageMode: 'listed_only', units: [{ institutionId: CET, isExcluded: false }] }),
          series({ id: 's-b', name: 'B', coverageMode: 'listed_only', units: [{ institutionId: CET, isExcluded: false }] }),
        ],
        availability: [{ profileId: DIRECTOR, freeStarts: [MON_02] }],
      }),
    );
    expect(out.placed).toHaveLength(1);
    expect(out.unplaceable).toHaveLength(1);
    expect(out.unplaceable[0].reason).toBe('all_candidates_taken');
  });

  it('overlapping — not just identical — instants clash', () => {
    // A 120-minute meeting at 10:00 IST runs to 12:00 and must block 11:00.
    const ELEVEN = '2026-11-02T05:30:00.000Z'; // 11:00 IST
    const out = proposeMonthlySlate(
      input({
        series: [
          series({ id: 's-a', name: 'A', durationMin: 120, priority: 1, coverageMode: 'listed_only', units: [{ institutionId: CET, isExcluded: false }] }),
          series({ id: 's-b', name: 'B', durationMin: 60, priority: 2, coverageMode: 'listed_only', units: [{ institutionId: CET, isExcluded: false }] }),
        ],
        availability: [{ profileId: DIRECTOR, freeStarts: [MON_02, ELEVEN] }],
      }),
    );
    expect(out.placed).toHaveLength(1);
    expect(out.placed[0].seriesId).toBe('s-a');
    expect(out.unplaceable[0].reason).toBe('all_candidates_taken');
  });
});

// ============================================================================
// Availability is duration-dependent
// ============================================================================

describe('proposeMonthlySlate — duration-aware availability', () => {
  it('uses the set computed for THIS series length, not another one', () => {
    // The host has a 60-minute gap at 10:00 and a 120-minute gap at 14:00.
    // A two-hour series must land at 14:00 — placing it at 10:00 would book
    // it straight over whatever follows.
    const out = proposeMonthlySlate(
      input({
        series: [
          series({
            durationMin: 120,
            coverageMode: 'listed_only',
            units: [{ institutionId: CET, isExcluded: false }],
          }),
        ],
        availability: [
          { profileId: DIRECTOR, durationMin: 60, freeStarts: [MON_02] },
          { profileId: DIRECTOR, durationMin: 120, freeStarts: [MON_02_PM] },
        ],
      }),
    );
    expect(out.placed).toHaveLength(1);
    expect(out.placed[0].start).toBe(MON_02_PM);
    // 04:30Z + 120 min would be 06:30Z; 08:30Z + 120 min = 10:30Z.
    expect(out.placed[0].end).toBe('2026-11-02T10:30:00.000Z');
  });

  it('does NOT borrow another duration\'s answer when its own is missing', () => {
    const out = proposeMonthlySlate(
      input({
        series: [series({ durationMin: 120 })],
        availability: [{ profileId: DIRECTOR, durationMin: 60, freeStarts: [MON_02, MON_09] }],
      }),
    );
    expect(out.placed).toHaveLength(0);
    expect(out.unplaceable.every((u) => u.reason === 'no_shared_availability')).toBe(true);
  });

  it('an entry with no durationMin still answers for any length', () => {
    // The simple case: every series the same length, one availability set.
    const out = proposeMonthlySlate(
      input({
        series: [series({ durationMin: 90 })],
        availability: [{ profileId: DIRECTOR, freeStarts: [MON_02, MON_09, MON_16] }],
      }),
    );
    expect(out.placed).toHaveLength(3);
  });

  it('matches each person on the SAME duration when they differ', () => {
    const out = proposeMonthlySlate(
      input({
        series: [
          series({
            durationMin: 120,
            attendees: [{ profileId: EAO, isRequired: true }],
            coverageMode: 'listed_only',
            units: [{ institutionId: CET, isExcluded: false }],
          }),
        ],
        availability: [
          { profileId: DIRECTOR, durationMin: 120, freeStarts: [MON_02_PM, MON_09] },
          // The EAO's 120-minute set shares only MON_09.
          { profileId: EAO, durationMin: 120, freeStarts: [MON_09] },
          // A decoy 60-minute set that must not be consulted.
          { profileId: EAO, durationMin: 60, freeStarts: [MON_02_PM] },
        ],
      }),
    );
    expect(out.placed).toHaveLength(1);
    expect(out.placed[0].start).toBe(MON_09);
  });
});

// ============================================================================
// Preference ranking
// ============================================================================

describe('proposeMonthlySlate — preferences', () => {
  it('prefers the stated weekday over an earlier date', () => {
    // Tuesday 3 Nov is LATER than Monday 2 Nov, but Tuesday is preferred.
    const out = proposeMonthlySlate(
      input({
        series: [series({ preferredWeekday: 2, coverageMode: 'listed_only', units: [{ institutionId: CET, isExcluded: false }] })],
        availability: [{ profileId: DIRECTOR, freeStarts: [MON_02, TUE_03] }],
      }),
    );
    expect(out.placed[0].start).toBe(TUE_03);
  });

  it('prefers the time nearest the stated start minute', () => {
    // 14:00 IST = 840 minutes. 08:30Z is 14:00 IST; 04:30Z is 10:00 IST.
    const out = proposeMonthlySlate(
      input({
        series: [series({ preferredStartMinute: 840, coverageMode: 'listed_only', units: [{ institutionId: CET, isExcluded: false }] })],
        availability: [{ profileId: DIRECTOR, freeStarts: [TUE_03, TUE_03_PM] }],
      }),
    );
    expect(out.placed[0].start).toBe(TUE_03_PM);
  });
});

// ============================================================================
// Regeneration must be disposable
// ============================================================================

describe('proposeMonthlySlate — regeneration', () => {
  it('is deterministic: the same input twice gives the same slate', () => {
    const a = proposeMonthlySlate(input());
    const b = proposeMonthlySlate(input());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('does NOT mutate the input series or its rotation cursor', () => {
    const s = series({ rotationCursor: 2 });
    const inp = input({ series: [s] });
    const snapshot = JSON.stringify(inp);

    proposeMonthlySlate(inp);

    expect(JSON.stringify(inp)).toBe(snapshot);
    expect(s.rotationCursor).toBe(2);
  });

  it('returns the NEXT cursor for the caller to persist on approval', () => {
    const out = proposeMonthlySlate(input({ series: [series({ rotationCursor: 2 })] }));
    // 3 institutions in the rotation order: (2 + 1) % 3 = 0
    expect(out.nextRotationCursor['s-iqac']).toBe(0);
  });

  it('leaves the cursor alone when no rotation order has been set up', () => {
    const out = proposeMonthlySlate(
      input({ rotationOrder: [], series: [series({ rotationCursor: 5 })] }),
    );
    expect(out.nextRotationCursor['s-iqac']).toBe(5);
  });
});

// ============================================================================
// The rules screen is allowed to be half-filled
// ============================================================================

describe('proposeMonthlySlate — incomplete configuration', () => {
  it('still places a covered college missing from the rotation order, and flags it', () => {
    const out = proposeMonthlySlate(
      input({ rotationOrder: [CET, DENTAL] }), // PHARM is covered but unordered
    );

    expect(out.placed.map((p) => p.institutionId)).toEqual([CET, DENTAL, PHARM]);
    const flag = out.unplaceable.find((u) => u.reason === 'no_rotation_position');
    expect(flag?.institutionId).toBe(PHARM);
    expect(flag?.occurrence).toBe(0); // a notice, not a missing meeting
  });

  it('returns an empty slate — not an error — when nothing is configured', () => {
    const out = proposeMonthlySlate(input({ series: [] }));
    expect(out.placed).toEqual([]);
    expect(out.unplaceable).toEqual([]);
    expect(out.month).toBe('2026-11');
  });
});
