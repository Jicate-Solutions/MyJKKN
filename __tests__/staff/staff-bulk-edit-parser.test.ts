import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseStaffBulkEditWorkbook } from '@/lib/services/staff/staff-bulk-edit-parser';

function build(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const HEADERS = ['Institution Email', 'Staff ID', 'Name', 'Institution', 'Phone', 'Gender'];

describe('parseStaffBulkEditWorkbook', () => {
  it('reads the data sheet and keys cells by header', () => {
    const buf = build({
      Staff: [HEADERS, ['a@jkkn.ac.in', 'COP083', 'Nazeer', 'Dental', '9000000001', 'male']]
    });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.error).toBeUndefined();
    expect(out.sheetName).toBe('Staff');
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].institutionEmail).toBe('a@jkkn.ac.in');
    expect(out.rows[0].cells.Phone).toBe('9000000001');
  });

  it('skips the Instructions sheet even when it comes first', () => {
    const buf = build({
      Instructions: [['How to use this template'], ['Blank means leave unchanged']],
      Staff: [HEADERS, ['a@jkkn.ac.in', '', 'Nazeer', 'Dental', '9000000001', 'male']]
    });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.sheetName).toBe('Staff');
    expect(out.rows).toHaveLength(1);
  });

  it('finds the data sheet even if it was renamed', () => {
    const buf = build({
      Instructions: [['notes']],
      'Staff (edited)': [HEADERS, ['a@jkkn.ac.in', '', 'N', 'D', '9000000001', 'male']]
    });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.sheetName).toBe('Staff (edited)');
  });

  it('tolerates reordered columns', () => {
    const buf = build({
      Staff: [
        ['Gender', 'Phone', 'Institution Email'],
        ['male', '9000000001', 'a@jkkn.ac.in']
      ]
    });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.rows[0].institutionEmail).toBe('a@jkkn.ac.in');
    expect(out.rows[0].cells.Gender).toBe('male');
  });

  it('reports a workbook with no match-key column', () => {
    const buf = build({ Sheet1: [['Phone', 'Gender'], ['9000000001', 'male']] });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.error).toMatch(/Institution Email/);
    expect(out.rows).toEqual([]);
  });

  it('drops rows whose match key is blank', () => {
    const buf = build({
      Staff: [HEADERS, ['', '', '', '', '9000000001', 'male'], ['a@jkkn.ac.in', '', '', '', '9', 'male']]
    });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.rows).toHaveLength(1);
  });

  it('numbers rows by their real sheet position', () => {
    const buf = build({
      Staff: [HEADERS, ['a@jkkn.ac.in', '', '', '', '1', 'male'], ['b@jkkn.ac.in', '', '', '', '2', 'male']]
    });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.rows.map(r => r.rowNumber)).toEqual([2, 3]);
  });

  it('stringifies a date cell to YYYY-MM-DD', () => {
    const wb = XLSX.utils.book_new();
    const aoa = [
      ['Institution Email', 'Date of Birth'],
      ['a@jkkn.ac.in', new Date(Date.UTC(1990, 4, 2))]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), 'Staff');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.rows[0].cells['Date of Birth']).toBe('1990-05-02');
  });

  // Not one of the 8 given in the brief. A genuinely blank row (every cell empty, not
  // just the match key) is a real row in the sheet — e.g. a visual spacer someone left
  // between two blocks of staff. sheet_to_json's `blankrows: false` option drops such
  // rows from its output array entirely, which shifts every subsequent row's array index
  // out of sync with its real sheet row and corrupts rowNumber for everything after the
  // gap. This guards that the parser keeps blankrows at its true default instead.
  it('keeps rowNumber correct across a fully blank spacer row', () => {
    const buf = build({
      Staff: [
        HEADERS,
        ['a@jkkn.ac.in', '', '', '', '1', 'male'], // row 2
        [], // row 3 — fully blank spacer, not just a blank match key
        ['b@jkkn.ac.in', '', '', '', '2', 'male'] // row 4
      ]
    });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.rows.map(r => r.institutionEmail)).toEqual(['a@jkkn.ac.in', 'b@jkkn.ac.in']);
    expect(out.rows.map(r => r.rowNumber)).toEqual([2, 4]);
  });
});
