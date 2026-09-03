import { describe, it, expect } from 'vitest';
import {
  resolveUnifiedSheet,
  normalizeAppliesTo,
  parseYearOfStudy,
  APPLIES_TO_LABELS,
  UNIFIED_HEADERS,
  UNIFIED_ITEM_HEADERS,
  headerColumn,
  type BulkResolveLookups,
} from '@/lib/utils/mappings/fee-structure-excel-mappings';

// What these tests cover: the "Applies To" / "Year of Study" pair, which says
// WHICH YEARS OF THE COURSE a fee is billed in.
//
// Two things make it worth pinning down:
//
//  1. The column defaults to 'every_year' in Postgres. Before the sheet carried
//     it, every fee the importer created was re-billed in year 2, 3 and 4 —
//     including one-off admission and uniform charges. A BLANK cell must
//     therefore mean "leave it alone", NOT "every year", or re-importing an
//     older workbook would quietly quadruple those fees.
//
//  2. afsi_applies_year_chk is a BICONDITIONAL:
//         (applies_to = 'specific_year') = (applies_year_of_study IS NOT NULL)
//     Both halves have to fail as a readable row error here, or they surface as
//     a raw constraint name partway through an import.

const INST = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const DEG = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
const DEPT = 'cccccccc-1111-4111-8111-cccccccccccc';
const PROG = 'dddddddd-1111-4111-8111-dddddddddddd';
const YEAR = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee';
const QUOTA = 'ffffffff-1111-4111-8111-ffffffffffff';
const COMM = '99999999-1111-4111-8111-999999999999';
const TUITION = '22222222-2222-4222-8222-222222222222';
const UNIFORM = '33333333-3333-4333-8333-333333333333';
const STRUCT = '11111111-1111-4111-8111-111111111111';

const lookups = {
  institutions: new Map([['test college', INST]]),
  degrees: new Map([[`${INST}::undergraduate`, DEG]]),
  departments: new Map([[`${INST}::${DEG}::cse`, DEPT]]),
  programmes: new Map([[`${DEPT}::be cse`, PROG]]),
  admissionYears: new Map([[`${INST}::2026 - 2027`, YEAR]]),
  quotas: new Map([['management quota', QUOTA]]),
  accommodations: new Map<string, string>(),
  hostelAccommodationId: null,
  roomCategories: new Map<string, string>(),
  messCategories: new Map<string, string>(),
  communities: new Map([['bc', COMM]]),
  categoriesByName: new Map([
    ['1 year tuition fee', TUITION],
    ['uniform fee', UNIFORM],
  ]),
  amountHeaders: ['1 Year Tuition Fee', 'Uniform Fee'],
  // "Promotes To" resolves through this map. Every structure must name both
  // rungs (Reserved AND Admitted) somewhere, so the fixtures below — which are
  // about "Applies To" — carry them on rows that say nothing else about it.
  learnerStatuses: new Map([
    ['reserved', 'reserved'],
    ['admitted', 'admitted'],
  ]),
} as unknown as BulkResolveLookups;

const STRUCTURE = {
  'Fee Structure ID': STRUCT,
  Institution: 'Test College',
  Degree: 'Undergraduate',
  Department: 'CSE',
  Programme: 'BE CSE',
  'Admission Year': '2026 - 2027',
  Quota: 'Management Quota',
  Communities: 'BC',
  Name: 'BE CSE — General — 2026',
  Status: 'draft',
} as const;

const row = (over: Partial<Record<(typeof UNIFIED_HEADERS)[number], unknown>>) => {
  const base: Record<string, unknown> = {};
  for (const h of UNIFIED_HEADERS) base[h] = '';
  return { ...base, ...STRUCTURE, ...over };
};

/** A row set with NO "Applies To" column at all — an export taken before it existed. */
const legacyRow = (over: Record<string, unknown>) => {
  const r = row(over) as Record<string, unknown>;
  delete r['Applies To'];
  delete r['Year of Study'];
  return r;
};

const one = (rows: Record<string, unknown>[]) => resolveUnifiedSheet(rows, lookups).resolutions[0];

const itemFor = (res: ReturnType<typeof one>, categoryId: string) =>
  res.payload!.items.find((i) => i.billing_category_id === categoryId)!;

// ---------------------------------------------------------------------------
describe('normalizeAppliesTo', () => {
  it('accepts the picker label, the stored code, and what people type', () => {
    expect(normalizeAppliesTo('First year only')).toBe('first_year_only');
    expect(normalizeAppliesTo('first_year_only')).toBe('first_year_only');
    expect(normalizeAppliesTo('1st year')).toBe('first_year_only');
    expect(normalizeAppliesTo('Every year')).toBe('every_year');
    expect(normalizeAppliesTo('all years')).toBe('every_year');
    expect(normalizeAppliesTo('Specific year')).toBe('specific_year');
  });

  it('returns null for blank — "the sheet did not say", not "every year"', () => {
    expect(normalizeAppliesTo('')).toBeNull();
    expect(normalizeAppliesTo('   ')).toBeNull();
    expect(normalizeAppliesTo(undefined)).toBeNull();
  });

  it('rejects anything else rather than guessing', () => {
    expect(normalizeAppliesTo('second year')).toBe('INVALID');
    expect(normalizeAppliesTo('yes')).toBe('INVALID');
  });
});

describe('parseYearOfStudy', () => {
  it('takes 1 through 10 and nothing else', () => {
    expect(parseYearOfStudy(1)).toBe(1);
    expect(parseYearOfStudy('3')).toBe(3);
    expect(parseYearOfStudy(10)).toBe(10);
    expect(parseYearOfStudy('')).toBeNull();
    expect(parseYearOfStudy(0)).toBe('INVALID');
    expect(parseYearOfStudy(11)).toBe('INVALID');
    expect(parseYearOfStudy(2.5)).toBe('INVALID');
    expect(parseYearOfStudy('first')).toBe('INVALID');
  });
});

// ---------------------------------------------------------------------------
describe('resolveUnifiedSheet — Applies To', () => {
  it('carries a per-fee setting through to the payload', () => {
    const res = one([
      row({
        'Fee Category': '1 Year Tuition Fee',
        Amount: 100000,
        'Applies To': APPLIES_TO_LABELS.every_year,
        'Promotes To': 'Reserved',
      }),
      row({
        'Fee Category': 'Uniform Fee',
        Amount: 5000,
        'Applies To': APPLIES_TO_LABELS.first_year_only,
        'Promotes To': 'Admitted',
      }),
    ]);
    expect(res.errors).toEqual([]);
    expect(itemFor(res, TUITION).applies_to).toBe('every_year');
    expect(itemFor(res, UNIFORM).applies_to).toBe('first_year_only');
    // Only ever set next to specific_year, mirroring the DB biconditional.
    expect(itemFor(res, UNIFORM).applies_year_of_study).toBeUndefined();
  });

  it('sets the year alongside Specific year', () => {
    const res = one([
      row({
        'Fee Category': 'Uniform Fee',
        Amount: 2500,
        'Applies To': APPLIES_TO_LABELS.specific_year,
        'Year of Study': 3,
        'Promotes To': 'Reserved',
      }),
      row({ 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Promotes To': 'Admitted' }),
    ]);
    expect(res.errors).toEqual([]);
    expect(itemFor(res, UNIFORM).applies_to).toBe('specific_year');
    expect(itemFor(res, UNIFORM).applies_year_of_study).toBe(3);
  });

  // The whole reason a blank cell cannot mean "every year".
  it('OMITS the keys on a blank cell, so the stored value survives', () => {
    const res = one([
      row({ 'Fee Category': 'Uniform Fee', Amount: 5000, 'Applies To': '', 'Promotes To': 'Reserved' }),
      row({ 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Promotes To': 'Admitted' }),
    ]);
    expect(res.errors).toEqual([]);
    expect(itemFor(res, UNIFORM)).not.toHaveProperty('applies_to');
    expect(itemFor(res, UNIFORM)).not.toHaveProperty('applies_year_of_study');
  });

  it('OMITS the keys for a workbook with no Applies To column at all', () => {
    const res = one([
      legacyRow({ 'Fee Category': 'Uniform Fee', Amount: 5000, 'Promotes To': 'Reserved' }),
      legacyRow({ 'Fee Category': '1 Year Tuition Fee', Amount: 100000, 'Promotes To': 'Admitted' }),
    ]);
    expect(res.errors).toEqual([]);
    expect(itemFor(res, UNIFORM)).not.toHaveProperty('applies_to');
  });

  it('repeats down a split fee’s rows, like the Amount does', () => {
    const res = one([
      row({
        'Fee Category': '1 Year Tuition Fee', Amount: 100000,
        'Applies To': APPLIES_TO_LABELS.every_year,
        'Instalment #': 1, 'Share %': 60, 'Due After (Days)': 15, 'Promotes To': 'Reserved',
      }),
      row({
        'Fee Category': '1 Year Tuition Fee', Amount: 100000,
        'Applies To': APPLIES_TO_LABELS.every_year,
        'Instalment #': 2, 'Share %': 40, 'Due After (Days)': 90, 'Promotes To': 'Admitted',
      }),
    ]);
    expect(res.errors).toEqual([]);
    expect(itemFor(res, TUITION).applies_to).toBe('every_year');
  });
});

// ---------------------------------------------------------------------------
describe('resolveUnifiedSheet — Applies To rejections', () => {
  const errorsOf = (rows: Record<string, unknown>[]) => one(rows).errors.join(' | ');

  it('rejects two different values down one fee', () => {
    const msg = errorsOf([
      row({
        'Fee Category': '1 Year Tuition Fee', Amount: 100000,
        'Applies To': APPLIES_TO_LABELS.every_year,
        'Instalment #': 1, 'Share %': 60, 'Due After (Days)': 15,
      }),
      row({
        'Fee Category': '1 Year Tuition Fee', Amount: 100000,
        'Applies To': APPLIES_TO_LABELS.first_year_only,
        'Instalment #': 2, 'Share %': 40, 'Due After (Days)': 90,
      }),
    ]);
    expect(msg).toMatch(/more than one "Applies To"/i);
    expect(msg).toMatch(/Row 3/);
  });

  // Biconditional, half one.
  it('rejects Specific year with no Year of Study', () => {
    const msg = errorsOf([
      row({
        'Fee Category': 'Uniform Fee', Amount: 2500,
        'Applies To': APPLIES_TO_LABELS.specific_year,
      }),
    ]);
    expect(msg).toMatch(/Specific year, so it needs a "Year of Study"/i);
  });

  // Biconditional, half two.
  it('rejects a Year of Study next to Every year', () => {
    const msg = errorsOf([
      row({
        'Fee Category': 'Uniform Fee', Amount: 2500,
        'Applies To': APPLIES_TO_LABELS.every_year,
        'Year of Study': 2,
      }),
    ]);
    expect(msg).toMatch(/only means something next to Specific year/i);
  });

  it('rejects a Year of Study with Applies To left blank', () => {
    const msg = errorsOf([
      row({ 'Fee Category': 'Uniform Fee', Amount: 2500, 'Year of Study': 2 }),
    ]);
    expect(msg).toMatch(/blank/i);
  });

  it('rejects an unrecognised value and an out-of-range year', () => {
    expect(
      errorsOf([row({ 'Fee Category': 'Uniform Fee', Amount: 2500, 'Applies To': 'second year' })]),
    ).toMatch(/unrecognised "Applies To"/i);

    expect(
      errorsOf([
        row({
          'Fee Category': 'Uniform Fee', Amount: 2500,
          'Applies To': APPLIES_TO_LABELS.specific_year,
          'Year of Study': 99,
        }),
      ]),
    ).toMatch(/invalid "Year of Study"/i);
  });
});

// ---------------------------------------------------------------------------
// Column placement. Both writers attach their dropdowns by LETTER, derived from
// this array's indexes -- so inserting two columns after "Amount" shifts every
// instalment column right. The codebase has been bitten by this before: adding
// "Room Category"/"Mess Category" once moved Status from L to N and the
// hardcoded letters that survived pinned the Status dropdown to Communities.
describe('UNIFIED_HEADERS placement', () => {
  it('puts the pair with the fee it describes, not with the instalments', () => {
    expect([...UNIFIED_ITEM_HEADERS]).toEqual([
      'Fee Category', 'Amount', 'Applies To', 'Year of Study',
    ]);
    const at = (h: string) => UNIFIED_HEADERS.indexOf(h as never);
    expect(at('Applies To')).toBe(at('Amount') + 1);
    expect(at('Year of Study')).toBe(at('Applies To') + 1);
    // Still ahead of every instalment column.
    expect(at('Year of Study')).toBeLessThan(at('Instalment #'));
  });

  it('gives every dropdown column a letter, and no two the same', () => {
    const targets = [
      'Institution', 'Quota', 'Gender', 'Accommodation', 'Room Category',
      'Mess Category', 'Status', 'Package Type', 'Fee Category', 'Due Anchor',
      'Promotes To', 'Applies To', 'Year of Study',
    ];
    const letters = targets.map((h) => headerColumn(UNIFIED_HEADERS, h));
    expect(letters.every((l) => l !== null)).toBe(true);
    expect(new Set(letters).size).toBe(letters.length);
  });
});
