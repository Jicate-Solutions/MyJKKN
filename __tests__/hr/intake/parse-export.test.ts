import { readFileSync } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { IntakeParseError, parseExport, parseExportText } from '@/lib/hr/intake/parse-export';

// Invented people; the quirks mirror a real CVViZ export (see the fixture builder note).
const TSV = readFileSync(path.join(__dirname, 'fixtures/cvviz-export-quirks.tsv'), 'utf-8');

describe('parseExport — CVViZ .tsv with every quirk', () => {
  const rows = parseExportText(TSV);

  it('reads all ten rows, numbered from 1', () => {
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.row_index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('cleans names, phones, cities, qualification and dates', () => {
    const mohan = rows[4].candidate;
    expect(mohan.first_name).toBe('Mohan');
    expect(mohan.phone).toBeNull();
    expect(mohan.phone_issue).toBe('Looks like a date (14/03/88), not a phone number');
    expect(mohan.cities).toEqual(['Karur', 'Nagar', 'Namakkal']);
    expect(mohan.qualification).toBeNull();
    expect(mohan.applied_at).toBe('2026-09-24T15:21:08.000Z');

    expect(rows[5].candidate.phone).toBe('9786543210');
    expect(rows[5].candidate.cities).toEqual([]);
    expect(rows[6].candidate.phone).toBe('9001122334');
    expect(rows[7].candidate.phone).toBe('9123456780');
    expect(rows[8].candidate.phone).toBe('9812345678');
    expect(rows[8].candidate.first_name).toBe('Vikram');
    expect(rows[8].candidate.email).toBe('vikram.sen@univ.example.ac.in');
  });

  it('keeps the job title for display but drops the trailing comma', () => {
    expect(rows[1].candidate.cvviz_job_title).toBe('Vice Principal');
    expect(rows[5].candidate.cvviz_job_title).toBe('Candidates Database');
  });

  it('does not take a date in "Job Code" for a code', () => {
    expect(rows[0].candidate.cvviz_job_code).toBeNull();
  });

  it('keeps odd file names exactly as the export wrote them', () => {
    expect(rows[3].file_name).toBe('DOC_20250830_WA0002pdf.doc-20250830-wa0002pdf');
    expect(rows[1].file_name).toBe('Image00732_1812345678901.pdf');
  });

  it('keeps the CVViZ profile link', () => {
    expect(rows[0].candidate.cvviz_profile_url).toBe('https://app.cvviz.example/c/1001');
  });
});

describe('parseExport — by header name, any format', () => {
  it('reads a comma file whose columns are in another order', () => {
    const csv = [
      'Job,Email Address,Phone Number,Last Name,First Name,File Name',
      '"Principal","Zoya.Demo@Example.test","\'+91 9876501234","Iqbal","Zoya","zoya.pdf"',
    ].join('\n');
    const [row] = parseExportText(csv);
    expect(row.candidate).toMatchObject({
      first_name: 'Zoya',
      last_name: 'Iqbal',
      email: 'zoya.demo@example.test',
      phone: '9876501234',
      cvviz_job_title: 'Principal',
    });
    expect(row.file_name).toBe('zoya.pdf');
  });

  it('reads an .xlsx workbook, including a phone stored as a number', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['First Name', 'Last Name', 'Email Address', 'Phone Number', 'Job'],
      ['Ravi', 'Demo', 'ravi.demo@example.test', 919876500001, 'Principal'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Candidates');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    const [row] = parseExport('export.xlsx', bytes);
    expect(row.candidate.phone).toBe('9876500001');
    expect(row.candidate.email).toBe('ravi.demo@example.test');
  });

  it('skips blank lines and a byte-order mark', () => {
    const rows = parseExportText('﻿First Name\tEmail Address\n\nAsha\tasha.demo@example.test\n\t\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].candidate.first_name).toBe('Asha');
  });

  it('refuses a file that is not a CVViZ export, in plain words', () => {
    expect(() => parseExportText('Name,Mobile\nA,1')).toThrow(IntakeParseError);
    expect(() => parseExportText('Name,Mobile\nA,1')).toThrow(/no "First Name" or "Email Address" column/);
    expect(() => parseExportText('First Name,Email Address\n')).toThrow(/no candidates/);
    expect(() => parseExport('export.pdf', new Uint8Array([1]))).toThrow(/\.csv, \.tsv or \.xlsx/);
  });
});
