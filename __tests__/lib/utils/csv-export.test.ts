import { describe, it, expect } from 'vitest';
import { buildCsvDocument, escapeCsvField } from '@/lib/utils/csv-export';

const BOM = '﻿';

describe('escapeCsvField', () => {
  it('leaves a plain field untouched', () => {
    expect(escapeCsvField('Lalitha')).toBe('Lalitha');
  });

  it('quotes a field containing a comma', () => {
    expect(escapeCsvField('Doe, Jane')).toBe('"Doe, Jane"');
  });

  it('doubles embedded quotes and wraps the field', () => {
    expect(escapeCsvField('she said "yes"')).toBe('"she said ""yes"""');
  });

  it('quotes fields containing newlines (CR and LF)', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('neutralises spreadsheet formula injection', () => {
    // A learner-entered name is free text and lands in Excel unmodified
    // unless the leading formula character is escaped.
    expect(escapeCsvField('=1+1')).toBe("'=1+1");
    expect(escapeCsvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCsvField('+1234')).toBe("'+1234");
  });
});

describe('buildCsvDocument', () => {
  it('prefixes a UTF-8 BOM so Excel renders non-ASCII correctly', () => {
    const csv = buildCsvDocument(['name'], [['Lalitha']]);
    expect(csv.startsWith(BOM)).toBe(true);
  });

  it('emits the header row alone when there are no data rows', () => {
    const csv = buildCsvDocument(['a', 'b', 'c'], []);
    expect(csv).toBe(`${BOM}a,b,c`);
    // Honest empty export: a real header, no placeholder prose, no error.
    expect(csv).not.toMatch(/no data/i);
  });

  it('separates rows with CRLF per RFC 4180', () => {
    const csv = buildCsvDocument(['a'], [['1'], ['2']]);
    expect(csv).toBe(`${BOM}a\r\n1\r\n2`);
  });

  it('renders null and undefined as empty fields rather than the strings', () => {
    const csv = buildCsvDocument(['a', 'b', 'c'], [[null, undefined, 0]]);
    expect(csv).toBe(`${BOM}a,b,c\r\n,,0`);
  });

  it('escapes values inside data rows', () => {
    const csv = buildCsvDocument(['name', 'note'], [['Doe, Jane', 'said "hi"']]);
    expect(csv).toBe(`${BOM}name,note\r\n"Doe, Jane","said ""hi"""`);
  });

  it('keeps ragged rows aligned to whatever fields they carry', () => {
    // Dynamic OSCE domain columns can legitimately produce blank trailing
    // cells; they must serialise as empty fields, not be dropped.
    const csv = buildCsvDocument(['a', 'b'], [['1', '']]);
    expect(csv).toBe(`${BOM}a,b\r\n1,`);
  });
});
