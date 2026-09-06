import { describe, it, expect } from 'vitest';
import {
  resolveRow,
  FIXED_HEADERS,
  type BulkResolveLookups,
} from '@/lib/utils/mappings/fee-structure-excel-mappings';

// Focus: the "Package Type" column on sheet 1. It is the last editable
// fee-structure field the bulk round-trip could not reach -- structures created
// through Bulk Import always came out unclassified, and no edit to the sheet
// could ever set or clear it on an existing one, silently, because the import
// reported success either way.

const INST = '11111111-1111-4111-8111-111111111111';
const DEG = '22222222-2222-4222-8222-222222222222';
const DEPT = '33333333-3333-4333-8333-333333333333';
const PROG = '44444444-4444-4444-8444-444444444444';
const YEAR = '55555555-5555-4555-8555-555555555555';
const QUOTA = '66666666-6666-4666-8666-666666666666';
const COMM = '77777777-7777-4777-8777-777777777777';
const TUITION = '88888888-8888-4888-8888-888888888888';

const lookups: BulkResolveLookups = {
  institutions: new Map([['test college', INST]]),
  degrees: new Map([[`${INST}::undergraduate`, DEG]]),
  departments: new Map([[`${INST}::${DEG}::cse`, DEPT]]),
  programmes: new Map([[`${DEPT}::be cse`, PROG]]),
  admissionYears: new Map([[`${INST}::2026 - 2027`, YEAR]]),
  quotas: new Map([['management', QUOTA]]),
  accommodations: new Map(),
  hostelAccommodationId: null,
  roomCategories: new Map(),
  messCategories: new Map(),
  communities: new Map([['bc', COMM]]),
  categoriesByName: new Map([['1 year tuition fee', TUITION]]),
  amountHeaders: ['1 Year Tuition Fee'],
  learnerStatuses: new Map([['reserved', 'reserved']]),
} as unknown as BulkResolveLookups;

/** A row that resolves cleanly, so any error in a test is the thing under test. */
const baseRow = (over: Record<string, unknown> = {}) => {
  const row: Record<string, unknown> = {};
  for (const h of FIXED_HEADERS) row[h] = '';
  return {
    ...row,
    'Fee Structure ID': '99999999-9999-4999-8999-999999999999',
    Institution: 'Test College',
    Degree: 'Undergraduate',
    Department: 'CSE',
    Programme: 'BE CSE',
    'Admission Year': '2026 - 2027',
    Quota: 'Management',
    Communities: 'BC',
    Name: 'BE CSE — General — 2026',
    Status: 'draft',
    '1 Year Tuition Fee': 100000,
    ...over,
  };
};

describe('resolveRow — the base fixture is actually valid', () => {
  it('resolves with no errors, so later failures mean something', () => {
    const r = resolveRow(baseRow(), 2, lookups);
    expect(r.errors).toEqual([]);
    expect(r.payload!.institution_id).toBe(INST);
    expect(r.payload!.items).toEqual([
      { billing_category_id: TUITION, amount: 100000, is_optional: false },
    ]);
  });
});

describe('resolveRow — Package Type', () => {
  it('is one of the sheet-1 headers', () => {
    expect(FIXED_HEADERS).toContain('Package Type');
  });

  it('sets package_type from the label the UI shows', () => {
    expect(resolveRow(baseRow({ 'Package Type': 'Package' }), 2, lookups).payload!.package_type)
      .toBe('package');
    expect(resolveRow(baseRow({ 'Package Type': 'Non-Package' }), 2, lookups).payload!.package_type)
      .toBe('non_package');
  });

  it('accepts the stored codes and sloppy spacing/case too', () => {
    for (const v of ['package', 'PACKAGE', ' Package ']) {
      expect(resolveRow(baseRow({ 'Package Type': v }), 2, lookups).payload!.package_type)
        .toBe('package');
    }
    for (const v of ['non_package', 'NON PACKAGE', 'non-package', 'NonPackage']) {
      expect(resolveRow(baseRow({ 'Package Type': v }), 2, lookups).payload!.package_type)
        .toBe('non_package');
    }
  });

  it('a BLANK cell sends an explicit null — that is how you clear it', () => {
    const p = resolveRow(baseRow({ 'Package Type': '' }), 2, lookups).payload!;
    expect('package_type' in p).toBe(true);
    expect(p.package_type).toBeNull();
  });

  it('a MISSING column omits the key entirely, so the RPC preserves it', () => {
    // This is the old-export case: a workbook downloaded before the column
    // existed must not silently wipe the classification off every row in it.
    const row = baseRow();
    delete (row as Record<string, unknown>)['Package Type'];
    const p = resolveRow(row, 2, lookups).payload!;
    expect('package_type' in p).toBe(false);
  });

  it('rejects a value the CHECK constraint would refuse, naming the row', () => {
    const r = resolveRow(baseRow({ 'Package Type': 'Bundle' }), 7, lookups);
    expect(r.payload).toBeUndefined();
    expect(r.rowNumber).toBe(7);
    expect(r.errors.join(' ')).toMatch(/Package Type "Bundle" must be Package, Non-Package, or blank/);
  });

  it('does not make Package Type part of the dimension identity', () => {
    // package_type is a label: no resolver reads it, so changing it on an
    // UPDATE row is legal where changing a dimension is not.
    const r = resolveRow(baseRow({ 'Package Type': 'Package' }), 2, lookups);
    expect(r.errors).toEqual([]);
    expect(r.payload!.structure_id).toBe('99999999-9999-4999-8999-999999999999');
  });
});
