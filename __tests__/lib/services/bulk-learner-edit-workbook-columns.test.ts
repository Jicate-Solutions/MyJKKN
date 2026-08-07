import { describe, it, expect } from 'vitest';
import {
  buildBulkEditColumns,
  type BulkEditColumn,
} from '@/lib/services/bulk-learner-edit-workbook';
import type { ReferenceResolvers } from '@/lib/services/bulk-learner-reference-fields';

/**
 * The import side of bulk edit matches on header NAME (see the file header of
 * bulk-learner-edit-workbook.ts), so these strings are a contract with the
 * COLUMN_MAPPING tables in:
 *   app/api/learners/bulk-edit-preview/route.ts
 *   app/api/learners/bulk-edit-exited/route.ts
 * Renaming a header without updating both drops the column from every upload
 * silently — no error, the edit just never applies.
 */
const FIRST_NAME_TAMIL_HEADER = 'First Name (Tamil)';
const LAST_NAME_TAMIL_HEADER = 'Last Name (Tamil)';

const emptyResolvers = {
  byId: new Map(),
  byName: new Map(),
  candidates: [],
} as unknown as ReferenceResolvers;

function columns(): BulkEditColumn[] {
  return buildBulkEditColumns(emptyResolvers);
}

function headers(): string[] {
  return columns().map((c) => c.header);
}

describe('Bulk edit workbook — Tamil name columns', () => {
  it('exports both Tamil columns', () => {
    expect(headers()).toEqual(
      expect.arrayContaining([FIRST_NAME_TAMIL_HEADER, LAST_NAME_TAMIL_HEADER]),
    );
  });

  it('places them immediately after Last Name', () => {
    const h = headers();
    const lastName = h.indexOf('Last Name');
    expect(lastName).toBeGreaterThan(-1);
    expect(h[lastName + 1]).toBe(FIRST_NAME_TAMIL_HEADER);
    expect(h[lastName + 2]).toBe(LAST_NAME_TAMIL_HEADER);
  });

  it('does not disturb the columns that follow', () => {
    const h = headers();
    expect(h[h.indexOf(LAST_NAME_TAMIL_HEADER) + 1]).toBe('Date of Birth');
  });

  it('reads the values straight off the learner row', () => {
    const cols = columns();
    const learner = {
      first_name_tamil: 'முருகன்',
      last_name_tamil: 'செல்வம்',
    };
    const read = (header: string) => cols.find((c) => c.header === header)!.value(learner);
    expect(read(FIRST_NAME_TAMIL_HEADER)).toBe('முருகன்');
    expect(read(LAST_NAME_TAMIL_HEADER)).toBe('செல்வம்');
  });

  it('exports blank rather than null for a learner with no Tamil name', () => {
    const cols = columns();
    const learner = { first_name_tamil: null, last_name_tamil: undefined };
    const read = (header: string) => cols.find((c) => c.header === header)!.value(learner);
    // A null cell would round-trip as the string "null" through Excel.
    expect(read(FIRST_NAME_TAMIL_HEADER)).toBe('');
    expect(read(LAST_NAME_TAMIL_HEADER)).toBe('');
  });

  it('keeps the reference columns findable by name (positions are derived)', () => {
    // buildBulkEditWorkbook derives the data-validation ranges with
    // findIndex(header === 'Reference Type' | 'Reference Person'), so inserting
    // columns above them must not break the dropdowns.
    const h = headers();
    expect(h).toContain('Reference Type');
    expect(h).toContain('Reference Person');
  });
});

describe('Bulk edit workbook — external identifier columns', () => {
  const ID_HEADERS = ['ABC ID', 'EMIS Number', 'UMIS Number'];

  it('exports all three identifier columns', () => {
    expect(headers()).toEqual(expect.arrayContaining(ID_HEADERS));
  });

  it('groups them together right after Blood Group', () => {
    const h = headers();
    const bloodGroup = h.indexOf('Blood Group');
    expect(bloodGroup).toBeGreaterThan(-1);
    expect(h.slice(bloodGroup + 1, bloodGroup + 4)).toEqual(ID_HEADERS);
  });

  it('reads each identifier off its own column (no cross-wiring)', () => {
    const cols = columns();
    const learner = { abc_id: 'ED453871909686', emis: '33150200123', umis: 'UM2024005567' };
    const read = (header: string) => cols.find((c) => c.header === header)!.value(learner);
    expect(read('ABC ID')).toBe('ED453871909686');
    expect(read('EMIS Number')).toBe('33150200123');
    expect(read('UMIS Number')).toBe('UM2024005567');
  });

  it('exports blank for a learner with no identifiers', () => {
    const cols = columns();
    const learner = { abc_id: null, emis: null, umis: undefined };
    for (const header of ID_HEADERS) {
      expect(cols.find((c) => c.header === header)!.value(learner)).toBe('');
    }
  });

  it('exports letters intact — the value is not numeric', () => {
    const cols = columns();
    const value = cols.find((c) => c.header === 'ABC ID')!.value({ abc_id: 'ED453871909686' });
    // Guards against anyone "helpfully" number-sanitising these later: a
    // digits-only pass would silently reduce this to 453871909686.
    expect(value).toMatch(/^[A-Z]{2}\d+$/);
  });
});
