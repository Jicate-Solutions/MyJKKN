import { describe, it, expect } from 'vitest';
import { sanitizeValue } from '@/lib/utils/excel-parser';

/**
 * Regression for the "+042842-01-01" date-of-birth corruption (2026-09-22):
 * an Excel serial arriving as a string was handed to `new Date("42842")`,
 * which V8 reads as year 42842. 456 learner DOBs were stored that way.
 */
describe("sanitizeValue(..., 'date')", () => {
  it('reads Excel serials whether numeric or string', () => {
    expect(sanitizeValue(42842, 'date')).toBe('2017-04-17');
    expect(sanitizeValue('42842', 'date')).toBe('2017-04-17');
    expect(sanitizeValue('38579', 'date')).toBe('2005-08-15');
  });

  it('never emits an expanded-year ISO string', () => {
    for (const v of ['42842', '39793', 42842]) {
      expect(sanitizeValue(v, 'date')).not.toMatch(/^\+/);
    }
  });

  it('reads day-first separators without swapping day and month', () => {
    expect(sanitizeValue('05-08-2005', 'date')).toBe('2005-08-05');
    expect(sanitizeValue('13.12.2017', 'date')).toBe('2017-12-13');
    expect(sanitizeValue('21.8.1995', 'date')).toBe('1995-08-21');
    expect(sanitizeValue('15/08/2005', 'date')).toBe('2005-08-15');
  });

  it('keeps ISO input as-is', () => {
    expect(sanitizeValue('2005-08-15', 'date')).toBe('2005-08-15');
    expect(sanitizeValue('2005-08-15T00:00:00.000Z', 'date')).toBe('2005-08-15');
    expect(sanitizeValue(new Date(Date.UTC(2005, 7, 15)), 'date')).toBe('2005-08-15');
  });

  it('rejects impossible dates and out-of-range years as empty', () => {
    expect(sanitizeValue('31-02-2005', 'date')).toBe('');
    expect(sanitizeValue('0004-07-05', 'date')).toBe('');
    expect(sanitizeValue('82009-05-28', 'date')).toBe('');
    expect(sanitizeValue('not a date', 'date')).toBe('');
    expect(sanitizeValue('', 'date')).toBe('');
    expect(sanitizeValue(null, 'date')).toBe('');
  });
});
