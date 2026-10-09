import { describe, expect, it } from 'vitest';
import {
  cleanText,
  isGeneralPool,
  looksLikeDate,
  normaliseCities,
  normaliseEmail,
  normaliseJobTitle,
  normalisePhone,
  parseExportDate,
} from '@/lib/hr/intake/normalise';

describe('normalisePhone — Indian mobile numbers only', () => {
  it.each([
    ['9840011122', '9840011122'],
    ["'9840011122", '9840011122'],
    ["'+91 9786543210", '9786543210'],
    ["'+91+91 9001122334", '9001122334'],
    ["'+91-9123456780", '9123456780'],
    ["'+919812345678", '9812345678'],
    ['+91 98123 45678', '9812345678'],
    ['09812345678', '9812345678'],
    ['00919812345678', '9812345678'],
    ['+91 9198765432', '9198765432'],
  ])('%s -> %s', (raw, phone) => {
    expect(normalisePhone(raw)).toEqual({ phone, phone_issue: null });
  });

  it('reads a date in the phone column as an issue, not a number', () => {
    const r = normalisePhone('14/03/88');
    expect(r.phone).toBeNull();
    expect(r.phone_issue).toBe('Looks like a date (14/03/88), not a phone number');
  });

  it('refuses a landline-shaped or short number with a plain reason', () => {
    expect(normalisePhone('0424 2345678')).toEqual({
      phone: null,
      phone_issue: 'An Indian mobile number starts with 6, 7, 8 or 9',
    });
    expect(normalisePhone('98400111').phone_issue).toBe('Too short for a mobile number (8 digits)');
    expect(normalisePhone('984001112233').phone_issue).toBe('Too long for a mobile number (12 digits)');
    expect(normalisePhone('call me').phone_issue).toMatch(/letters/);
    expect(normalisePhone('').phone_issue).toBe('No phone number in the export');
  });
});

describe('cleaning cells', () => {
  it('drops trailing spaces, trailing commas and "NA"', () => {
    expect(cleanText('Mohan ')).toBe('Mohan');
    expect(cleanText('Vice Principal, ')).toBe('Vice Principal');
    expect(cleanText('NA')).toBeNull();
    expect(cleanText('  ')).toBeNull();
  });

  it('lower-cases emails and refuses anything that is not one address', () => {
    expect(normaliseEmail(' Arun.K.Demo@Example.TEST ')).toBe('arun.k.demo@example.test');
    expect(normaliseEmail('vikram.sen@univ.example.ac.in')).toBe('vikram.sen@univ.example.ac.in');
    expect(normaliseEmail('a@b.test, c@d.test')).toBeNull();
    expect(normaliseEmail('not an email')).toBeNull();
  });

  it('turns comma-junk city lists into unique cities', () => {
    expect(normaliseCities(',Karur,Nagar,Namakkal')).toEqual(['Karur', 'Nagar', 'Namakkal']);
    expect(normaliseCities(',')).toEqual([]);
    expect(normaliseCities('Chennai,Chennai')).toEqual(['Chennai']);
  });
});

describe('job titles', () => {
  it('normalises case, punctuation and trailing commas for rule matching', () => {
    expect(normaliseJobTitle('Vice Principal, ')).toBe('vice principal');
    expect(normaliseJobTitle('Head - Accounts/Finance')).toBe('head accounts finance');
    expect(normaliseJobTitle('R&D Officer')).toBe('r and d officer');
  });

  it('knows the general pool is not a job', () => {
    expect(isGeneralPool('Candidates Database')).toBe(true);
    expect(isGeneralPool('')).toBe(true);
    expect(isGeneralPool(null)).toBe(true);
    expect(isGeneralPool('Principal')).toBe(false);
  });
});

describe('dates', () => {
  it('reads the JavaScript date string CVViZ writes', () => {
    expect(parseExportDate('Wed Sep 30 2026 09:14:05 GMT+0000 (Coordinated Universal Time)')).toBe('2026-09-30T09:14:05.000Z');
    expect(parseExportDate('Wed Sep 30 2026 14:44:05 GMT+0530 (India Standard Time)')).toBe('2026-09-30T09:14:05.000Z');
  });

  it('reads dd/mm/yyyy, ISO and Excel serial days; refuses nonsense', () => {
    expect(parseExportDate('20/09/2026')).toBe('2026-09-20T00:00:00.000Z');
    expect(parseExportDate('2026-09-20')).toBe('2026-09-20T00:00:00.000Z');
    expect(parseExportDate(46285)).toBe('2026-09-20T00:00:00.000Z');
    expect(parseExportDate('31/02/2026')).toBeNull();
    expect(parseExportDate('soon')).toBeNull();
  });

  it('spots a date sitting in the job code column', () => {
    expect(looksLikeDate('Wed Sep 30 2026 09:14:05 GMT+0000 (Coordinated Universal Time)')).toBe(true);
    expect(looksLikeDate('AP-ENG')).toBe(false);
  });
});
