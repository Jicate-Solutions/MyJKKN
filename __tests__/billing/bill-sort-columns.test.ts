import { describe, it, expect } from 'vitest';
import {
  BILL_SORT_COLUMNS,
  DEFAULT_BILL_SORT,
  LEARNER_EMBED_ALIAS,
  learnerSortPath,
  resolveBillSortPaths
} from '@/lib/services/billing/schedule/bill-sort-columns';

const FIRST_LAST = [learnerSortPath('first_name'), learnerSortPath('last_name')];
const LAST_FIRST = [learnerSortPath('last_name'), learnerSortPath('first_name')];

describe('resolveBillSortPaths', () => {
  it('defaults to created_at when nothing is requested', () => {
    expect(resolveBillSortPaths()).toEqual([DEFAULT_BILL_SORT]);
    expect(resolveBillSortPaths(undefined)).toEqual(['created_at']);
    expect(resolveBillSortPaths(null)).toEqual(['created_at']);
    expect(resolveBillSortPaths('')).toEqual(['created_at']);
    expect(resolveBillSortPaths('   ')).toEqual(['created_at']);
  });

  it('passes real billing_student_bills columns through untouched', () => {
    for (const column of BILL_SORT_COLUMNS) {
      expect(resolveBillSortPaths(column)).toEqual([column]);
    }
  });

  it('orders on the PostgREST alias(column) path of the learner embed', () => {
    expect(learnerSortPath('first_name')).toBe(`${LEARNER_EMBED_ALIAS}(first_name)`);
  });

  // BUG-005360 / BUG-003999: this is the exact value the "Student" header
  // sends, and ordering the raw table by it was a 400 / 42703.
  it('never orders the bill table by the non-existent student_name column', () => {
    expect(resolveBillSortPaths('student_name')).toEqual(FIRST_LAST);
  });

  it('maps every learner-name variant onto the embedded learner columns', () => {
    for (const key of [
      LEARNER_EMBED_ALIAS,
      `${LEARNER_EMBED_ALIAS}.name`,
      'first_name',
      `${LEARNER_EMBED_ALIAS}.first_name`
    ]) {
      expect(resolveBillSortPaths(key)).toEqual(FIRST_LAST);
    }
    for (const key of ['last_name', `${LEARNER_EMBED_ALIAS}.last_name`]) {
      expect(resolveBillSortPaths(key)).toEqual(LAST_FIRST);
    }
  });

  it('maps the other embedded table columns to their order paths', () => {
    expect(resolveBillSortPaths('lifecycle_status')).toEqual([
      learnerSortPath('lifecycle_status')
    ]);
    expect(resolveBillSortPaths('institution_name')).toEqual([
      'institution(name)'
    ]);
    expect(resolveBillSortPaths('institution.name')).toEqual([
      'institution(name)'
    ]);
    expect(resolveBillSortPaths('item_category_category_name')).toEqual([
      'item_category(category_name)'
    ]);
    expect(resolveBillSortPaths('academic_year')).toEqual([
      'academic_year(academic_year_name)'
    ]);
  });

  it('falls back to the default for unknown or hostile keys', () => {
    for (const key of [
      'department_semester', // a computed table column, not a DB column
      'student_name_x',
      'nope',
      'constructor', // must not leak an Object.prototype member
      'toString',
      '__proto__',
      'created_at; drop table billing_student_bills'
    ]) {
      expect(resolveBillSortPaths(key)).toEqual(['created_at']);
    }
  });

  it('only ever emits whitelisted columns or embedded alias(column) paths', () => {
    const keys = [
      'student_name',
      'institution_name',
      'academic_year',
      'lifecycle_status',
      'item_category_category_name',
      'garbage',
      ...BILL_SORT_COLUMNS
    ];
    for (const key of keys) {
      for (const path of resolveBillSortPaths(key)) {
        const isColumn = (BILL_SORT_COLUMNS as readonly string[]).includes(path);
        const isEmbedded = /^[a-z_]+\([a-z_]+\)$/.test(path);
        expect(isColumn || isEmbedded).toBe(true);
        // The dotted form is what PostgREST rejects with PGRST100.
        expect(path.includes('.')).toBe(false);
      }
    }
  });
});
