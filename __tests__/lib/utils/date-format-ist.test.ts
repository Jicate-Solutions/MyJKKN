// __tests__/lib/utils/date-format-ist.test.ts
//
// The events module pins every typed and displayed time to IST. These helpers
// must give the same answer on a UTC-configured CI box as on a laptop in
// Chennai — so nothing here depends on process.env.TZ.

import { describe, it, expect } from 'vitest';
import {
  formatIstDate,
  formatIstDateTime,
  formatIstTime,
  isoToIstDateInput,
  isoToIstLocalInput,
  istDateTimeToIso,
  istLocalInputToIso,
} from '@/lib/utils/date-format';

describe('istLocalInputToIso', () => {
  it('reads a datetime-local value as +05:30', () => {
    expect(istLocalInputToIso('2026-09-21T14:00')).toBe('2026-09-21T08:30:00.000Z');
    expect(istLocalInputToIso('2026-09-21T02:00')).toBe('2026-09-20T20:30:00.000Z');
  });
  it('accepts seconds and rejects blanks / junk', () => {
    expect(istLocalInputToIso('2026-09-21T14:00:15')).toBe('2026-09-21T08:30:15.000Z');
    expect(istLocalInputToIso('')).toBeNull();
    expect(istLocalInputToIso(null)).toBeNull();
    expect(istLocalInputToIso('not-a-date')).toBeNull();
    expect(istLocalInputToIso('2026-09-21')).toBeNull();
  });
});

describe('istDateTimeToIso', () => {
  it('combines a date input and a time input as IST', () => {
    expect(istDateTimeToIso('2026-08-10', '09:45')).toBe('2026-08-10T04:15:00.000Z');
    expect(istDateTimeToIso('', '09:45')).toBeNull();
    expect(istDateTimeToIso('2026-08-10', '')).toBeNull();
  });
});

describe('isoToIstLocalInput / isoToIstDateInput', () => {
  it('round-trips a stored instant back to the same IST wall clock', () => {
    expect(isoToIstLocalInput('2026-09-21T08:30:00+00:00')).toBe('2026-09-21T14:00');
    expect(isoToIstLocalInput('2026-09-21 08:30:00+00')).toBe('2026-09-21T14:00');
    expect(isoToIstLocalInput(istLocalInputToIso('2026-12-31T23:59'))).toBe('2026-12-31T23:59');
  });
  it('gives the IST calendar day, not the UTC one', () => {
    // 20:30Z on the 20th is 02:00 IST on the 21st.
    expect(isoToIstDateInput('2026-09-20T20:30:00Z')).toBe('2026-09-21');
  });
  it('renders midnight as 00, never 24', () => {
    expect(isoToIstLocalInput('2026-09-20T18:30:00Z')).toBe('2026-09-21T00:00');
  });
  it('is blank for missing / invalid', () => {
    expect(isoToIstLocalInput(null)).toBe('');
    expect(isoToIstLocalInput('garbage')).toBe('');
  });
});

describe('formatIst*', () => {
  const iso = '2026-09-21T08:30:00Z'; // 2:00 pm IST, 21 Sep 2026
  it('formats in IST', () => {
    expect(formatIstDate(iso)).toBe('21 Sept 2026');
    expect(formatIstTime(iso).toLowerCase().replace(/\s/g, ' ')).toMatch(/^2:00 pm$/);
    expect(formatIstDateTime(iso)).toMatch(/^21 Sept 2026, 2:00 pm$/i);
  });
  it('crosses the date line correctly', () => {
    expect(formatIstDate('2026-09-20T20:30:00Z')).toBe('21 Sept 2026');
  });
  it('is blank for missing / invalid', () => {
    expect(formatIstDate(null)).toBe('');
    expect(formatIstTime('nope')).toBe('');
  });
});
