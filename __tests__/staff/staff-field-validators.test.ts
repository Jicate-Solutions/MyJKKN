import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validatePhone,
  parseFlexibleDate
} from '@/lib/utils/staff-field-validators';

describe('validateEmail', () => {
  it('accepts a normal address', () => {
    expect(validateEmail('abdulnazeer_m@jkkn.ac.in')).toBe(true);
  });
  it('accepts the synthetic no-login address', () => {
    expect(validateEmail('staff.cop083.institution@nolog.jkkn.local')).toBe(true);
  });
  it('rejects a missing @', () => {
    expect(validateEmail('not-an-email')).toBe(false);
  });
  it('rejects embedded whitespace', () => {
    expect(validateEmail('a b@jkkn.ac.in')).toBe(false);
  });
});

describe('validatePhone', () => {
  it('accepts 10 plain digits', () => {
    expect(validatePhone('9876543210')).toBe(true);
  });
  it('accepts +91 with spaces', () => {
    expect(validatePhone('+91 98765 43210')).toBe(true);
  });
  it('rejects 9 digits', () => {
    expect(validatePhone('987654321')).toBe(false);
  });
});

describe('parseFlexibleDate', () => {
  it('passes through ISO', () => {
    expect(parseFlexibleDate('1990-05-02').convertedDate).toBe('1990-05-02');
  });
  it('reads DD/MM/YYYY', () => {
    expect(parseFlexibleDate('02/05/1990').convertedDate).toBe('1990-05-02');
  });
  it('reads DD-MM-YYYY', () => {
    expect(parseFlexibleDate('02-05-1990').convertedDate).toBe('1990-05-02');
  });
  it('reads DD.MM.YYYY', () => {
    expect(parseFlexibleDate('02.05.1990').convertedDate).toBe('1990-05-02');
  });
  it('reads a real Date (xlsx cellDates)', () => {
    expect(parseFlexibleDate(new Date(Date.UTC(1990, 4, 2))).convertedDate).toBe('1990-05-02');
  });
  it('flags junk', () => {
    expect(parseFlexibleDate('not a date').isValid).toBe(false);
  });
  it('flags an empty value', () => {
    expect(parseFlexibleDate('').isValid).toBe(false);
  });

  // Preserved from the original bulk-upload-staff.tsx `validateDate`: XLSX.read() is called
  // without `cellDates: true`, so date cells arrive as raw Excel serial numbers, not JS Dates
  // or strings. Losing this branch would silently break every real .xlsx upload.
  it('reads an Excel serial date number', () => {
    expect(parseFlexibleDate(32995).convertedDate).toBe('1990-05-02');
  });

  // Preserved from the original parser's DD/MM -> MM/DD fallback: when the second segment
  // can't be a month (>12), it retries treating the first segment as the month.
  it('falls back to MM/DD/YYYY when DD/MM is impossible', () => {
    expect(parseFlexibleDate('05/25/1990').convertedDate).toBe('1990-05-25');
  });

  // Fix round 1: a plain mm/dd range check accepts calendar days that don't exist.
  // The original validateDate rejected these via a Date round-trip; restored here.
  it('rejects 30 February', () => {
    expect(parseFlexibleDate('30/02/1990').isValid).toBe(false);
  });
  it('rejects 31 April (April has 30 days)', () => {
    expect(parseFlexibleDate('31/04/1990').isValid).toBe(false);
  });
  it('rejects 29 February in a non-leap year', () => {
    expect(parseFlexibleDate('29/02/1991').isValid).toBe(false);
  });
  it('accepts 29 February in a leap year', () => {
    expect(parseFlexibleDate('29/02/1992').convertedDate).toBe('1992-02-29');
  });
  it('still accepts 31 December', () => {
    expect(parseFlexibleDate('31/12/1990').convertedDate).toBe('1990-12-31');
  });
});
