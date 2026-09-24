import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbookModel } from '@/lib/services/billing/reports/collection-daywise';
import { writeCollectionWorkbook } from '@/lib/services/billing/reports/collection-excel';
import type { CollectionDaywiseRow } from '@/types/billing-schedule';

const r = (p: Partial<CollectionDaywiseRow>): CollectionDaywiseRow => ({
  receipt_id: Math.random().toString(36).slice(2),
  receipt_number: 'RCP-1',
  receipt_date: '2026-09-22',
  first_name: 'A',
  institution_name: 'JKKN College of Pharmacy',
  payment_mode: 'cash',
  payment_amount: 1000,
  total_refunds: 0,
  net_amount: 1000,
  has_refunds: false,
  ...p,
});

describe('writeCollectionWorkbook', () => {
  it('produces Summary, All and per-mode sheets that round-trip through exceljs', async () => {
    const rows = [
      r({ receipt_number: 'RCP-1' }),
      r({ receipt_number: 'RCP-2', payment_mode: 'online', payment_amount: 500, net_amount: 500, institution_name: 'JKKN College of Education' }),
      r({ receipt_number: 'RCP-3', payment_mode: 'dd', dd_bank_name: 'SBI', receipt_date: '2026-09-23' }),
    ];
    const buf = await writeCollectionWorkbook(buildWorkbookModel(rows, { rangeLabel: '22 – 23 Sep' }));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'All', 'Cash', 'Online', 'DD']);
    const summary = wb.getWorksheet('Summary')!;
    expect(String(summary.getCell('A1').value)).toBe('Fee Collection Report');
    expect(summary.getCell('A3').value).toBeNull(); // two institutions → no scope line
    const all = wb.getWorksheet('All')!;
    expect(all.getCell('A1').value).toBe('Date');
    expect(all.getCell('B2').value).toBe('RCP-1');
    expect(all.autoFilter).toBeTruthy();
    expect(wb.getWorksheet('DD')!.getCell('K2').value).toBe('SBI');
  });

  it('names the college under the title for a single-institution export', async () => {
    const buf = await writeCollectionWorkbook(buildWorkbookModel([r({}), r({ receipt_number: 'RCP-2' })], { rangeLabel: 'x' }));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Buffer);
    expect(wb.getWorksheet('Summary')!.getCell('A3').value).toBe('Institution: JKKN College of Pharmacy');
  });
});
