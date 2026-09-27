import { describe, it, expect } from 'vitest';
import {
  groupByDay,
  summarise,
  buildDetailRows,
  buildSummaryModel,
  buildWorkbookModel,
  modesPresent,
  safeSheetName,
  transactionDetail,
  localIsoDate,
  DAYWISE_EXPORT_HEADER,
  projectRowsByCategory,
  isTransportMaintenanceFee,
} from '@/lib/services/billing/reports/collection-daywise';
import type { CollectionDaywiseRow } from '@/types/billing-schedule';

function row(p: Partial<CollectionDaywiseRow>): CollectionDaywiseRow {
  return {
    receipt_id: p.receipt_id ?? Math.random().toString(36).slice(2),
    receipt_number: p.receipt_number ?? 'RCP-1',
    receipt_date: p.receipt_date ?? '2026-09-22',
    first_name: p.first_name ?? 'A',
    institution_name: 'JKKN College of Education',
    payment_mode: p.payment_mode ?? 'cash',
    payment_amount: p.payment_amount ?? 1000,
    total_refunds: p.total_refunds ?? 0,
    net_amount: p.net_amount ?? (p.payment_amount ?? 1000) - (p.total_refunds ?? 0),
    has_refunds: (p.total_refunds ?? 0) > 0,
    ...p,
  };
}

describe('groupByDay', () => {
  it('groups by receipt_date ascending and sorts receipts by number', () => {
    const s = groupByDay([
      row({ receipt_date: '2026-09-22', receipt_number: 'RCP-2', payment_mode: 'online', payment_amount: 500 }),
      row({ receipt_date: '2026-09-21', receipt_number: 'RCP-1', payment_amount: 100 }),
      row({ receipt_date: '2026-09-22', receipt_number: 'RCP-1', payment_amount: 1000 }),
    ]);
    expect(s.map((d) => d.date)).toEqual(['2026-09-21', '2026-09-22']);
    expect(s[1].rows.map((r) => r.receipt_number)).toEqual(['RCP-1', 'RCP-2']);
    expect(s[1].count).toBe(2);
    expect(s[1].net).toBe(1500);
    expect(s[1].byMode).toEqual([
      { mode: 'cash', count: 1, gross: 1000, refunds: 0, net: 1000 },
      { mode: 'online', count: 1, gross: 500, refunds: 0, net: 500 },
    ]);
  });

  it('nets refunds and tolerates numeric strings from PostgREST', () => {
    const s = groupByDay([
      row({ payment_amount: '5500' as unknown as number, total_refunds: '500' as unknown as number, net_amount: '5000' as unknown as number }),
    ]);
    expect(s[0]).toMatchObject({ gross: 5500, refunds: 500, net: 5000 });
    expect(summarise(s[0].rows)).toMatchObject({ count: 1, gross: 5500, refunds: 500, net: 5000 });
  });

  it('buckets a missing payment_mode under "" rather than dropping it', () => {
    const s = groupByDay([row({ payment_mode: null as unknown as string })]);
    expect(s[0].byMode[0].mode).toBe('');
  });
});

describe('buildDetailRows', () => {
  it('emits header, receipts, per-mode subtotals, day total, spacer, grand total', () => {
    const rows = buildDetailRows(groupByDay([
      row({ receipt_date: '2026-09-22', receipt_number: 'RCP-1', payment_amount: 1000 }),
      row({ receipt_date: '2026-09-22', receipt_number: 'RCP-2', payment_mode: 'online', payment_amount: 500, payment_reference_number: 'UTR123' }),
    ]));
    expect(rows.map((r) => r.kind)).toEqual([
      'header', 'data', 'data', 'subtotal', 'subtotal', 'day-total', 'spacer', 'grand-total',
    ]);
    expect(rows[0].cells).toEqual([...DAYWISE_EXPORT_HEADER]);
    expect(rows[1].cells[1]).toBe('RCP-1');
    expect(rows[2].cells[10]).toBe('UTR123');
    expect(rows[2].mode).toBe('online');
    // Subtotals by mode, descending by net: cash 1000 then online 500.
    expect(rows[3].cells[2]).toBe('Cash (1)');
    expect(rows[3].cells[22]).toBe(1000);
    expect(rows[4].cells[2]).toBe('Online (1)');
    expect(rows[5].cells[2]).toBe('Day Total (2)');
    expect(rows[5].cells[22]).toBe(1500);
    expect(rows[7].cells[2]).toBe('Grand Total (2)');
    expect(rows[7].cells[22]).toBe(1500);
    expect(rows[7].cells.length).toBe(DAYWISE_EXPORT_HEADER.length);
  });

  it('skips per-mode subtotals when asked (single-mode sheets)', () => {
    const rows = buildDetailRows(groupByDay([row({}), row({ receipt_number: 'RCP-2' })]), { withModeSubtotals: false });
    expect(rows.map((r) => r.kind)).toEqual(['header', 'data', 'data', 'day-total', 'spacer', 'grand-total']);
  });

  it('labels gateway receipts with no collector as System', () => {
    const rows = buildDetailRows(groupByDay([row({ collected_by: null })]));
    expect(rows[1].cells[18]).toBe('System');
  });
});

describe('modesPresent / safeSheetName', () => {
  it('orders modes by catalogue, unknown after, not-recorded last', () => {
    expect(modesPresent([
      row({ payment_mode: null as unknown as string }),
      row({ payment_mode: 'upi_x' }),
      row({ payment_mode: 'online' }),
      row({ payment_mode: 'cash' }),
    ])).toEqual(['cash', 'online', 'upi_x', '']);
  });
  it('strips characters Excel rejects and caps at 31', () => {
    expect(safeSheetName('A/B:C?D*E[F]')).toBe('A B C D E F');
    expect(safeSheetName('x'.repeat(40)).length).toBe(31);
  });
});

describe('buildSummaryModel / buildWorkbookModel', () => {
  const multi = [
    row({ receipt_date: '2026-09-22', payment_mode: 'cash', payment_amount: 1000, institution_name: 'JKKN College of Pharmacy' }),
    row({ receipt_date: '2026-09-22', payment_mode: 'online', payment_amount: 500, institution_name: 'JKKN College of Education' }),
    row({ receipt_date: '2026-09-23', payment_mode: 'cash', payment_amount: 200, institution_name: 'JKKN College of Education' }),
  ];

  it('single institution: mode table + day-wise only', () => {
    const m = buildSummaryModel(multi.map((r) => ({ ...r, institution_name: 'X' })), { rangeLabel: 'r' });
    expect(m.tables.map((t) => t.title)).toEqual(['Collection by Payment Mode', 'Day-wise Collection']);
    expect(m.tiles.find((t) => t.label === 'Institutions')).toBeUndefined();
    expect(m.institutionLabel).toBe('X');
    expect(m.tiles.find((t) => t.label === 'Net Collected')?.value).toBe(1700);
  });

  it('multi institution: adds institution-wise pivot and per-institution day tables', () => {
    const m = buildSummaryModel(multi, { rangeLabel: 'r' });
    expect(m.institutionLabel).toBeNull();
    expect(m.tables.map((t) => t.title)).toEqual([
      'Collection by Payment Mode',
      'Institution-wise Collection',
      'Day-wise Collection',
      'JKKN College of Education — Day-wise',
      'JKKN College of Pharmacy — Day-wise',
    ]);
    const inst = m.tables[1];
    expect(inst.header).toEqual(['Institution', 'Receipts', 'Cash', 'Online', 'Total Net']);
    expect(inst.rows).toEqual([
      ['JKKN College of Education', 2, 200, 500, 700],
      ['JKKN College of Pharmacy', 1, 1000, 0, 1000],
      ['Total', 3, 1200, 500, 1700],
    ]);
    expect(inst.modeCols).toEqual({ 2: 'cash', 3: 'online' });
    const mode = m.tables[0];
    expect(mode.rows).toEqual([
      ['Cash', 2, 1200, 0, 1200, 70.6],
      ['Online', 1, 500, 0, 500, 29.4],
      ['Total', 3, 1700, 0, 1700, 100],
    ]);
  });

  it('adds fee-category tables when breakdowns are present', () => {
    const withCats = [
      row({ institution_name: 'A', category_breakdown: [{ category: 'Tuition Fee', amount: 800 }, { category: 'Exam Fee', amount: 200 }], categories: 'Exam Fee, Tuition Fee' }),
      row({ institution_name: 'B', category_breakdown: [{ category: 'Tuition Fee', amount: '500' }] }),
    ];
    const m = buildSummaryModel(withCats, { rangeLabel: 'r' });
    const cat = m.tables.find((t) => t.title === 'Collection by Fee Category')!;
    expect(cat.rows).toEqual([
      ['Tuition Fee', 2, 1300, 86.7],
      ['Exam Fee', 1, 200, 13.3],
      ['Total', 2, 1500, 100],
    ]);
    const ic = m.tables.find((t) => t.title === 'Institution-wise by Fee Category')!;
    expect(ic.header).toEqual(['Institution', 'Tuition Fee', 'Exam Fee', 'Total']);
    expect(ic.rows).toEqual([['A', 800, 200, 1000], ['B', 500, 0, 500], ['Total', 1300, 200, 1500]]);
    expect(buildDetailRows(groupByDay(withCats))[1].cells[8]).toBe('Exam Fee, Tuition Fee');
  });

  it('workbook: All sheet first, then one sheet per mode present', () => {
    const wb = buildWorkbookModel(multi, { rangeLabel: 'r' });
    expect(wb.detailSheets.map((s) => s.name)).toEqual(['All', 'Cash', 'Online']);
    expect(wb.detailSheets[1].rows.filter((r) => r.kind === 'data')).toHaveLength(2);
    expect(wb.detailSheets[1].rows.some((r) => r.kind === 'subtotal')).toBe(false);
    expect(wb.detailSheets[0].rows.some((r) => r.kind === 'subtotal')).toBe(true);
  });
});

describe('transactionDetail', () => {
  it('shows DD bank/branch only for dd and remitter only for bank_transfer', () => {
    expect(transactionDetail(row({ payment_mode: 'dd', payment_reference_number: 'DD9', dd_bank_name: 'SBI', dd_branch: 'Erode' })))
      .toBe('DD9 · SBI, Erode');
    expect(transactionDetail(row({ payment_mode: 'bank_transfer', payment_reference_number: 'UTR1', remitter_name: 'R Kumar' })))
      .toBe('UTR1 · Remitter: R Kumar');
    expect(transactionDetail(row({ payment_mode: 'cash', dd_bank_name: 'SBI' }))).toBe('');
  });
});

describe('localIsoDate', () => {
  it('uses the local calendar day, zero-padded', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 1, 0, 0))).toBe('2026-01-05');
  });
});

describe('projectRowsByCategory', () => {
  const mixed = row({
    receipt_number: 'RCP-M',
    payment_amount: 10500,
    net_amount: 10500,
    categories: '1 Year Tuition Fee, Transport Maintenance Fee',
    category_breakdown: [
      { category: '1 Year Tuition Fee', amount: 10000 },
      { category: 'Transport Maintenance Fee', amount: 500 },
    ],
  });
  const tmfOnly = row({
    receipt_number: 'RCP-T',
    payment_amount: 5500,
    net_amount: 5500,
    categories: 'Transport Maintenance Fee',
    category_breakdown: [{ category: 'Transport Maintenance Fee', amount: 5500 }],
  });

  it('excluding TMF drops TMF-only receipts and trims mixed ones', () => {
    const out = projectRowsByCategory([mixed, tmfOnly], (c) => !isTransportMaintenanceFee(c));
    expect(out.map((r) => r.receipt_number)).toEqual(['RCP-M']);
    expect(out[0].payment_amount).toBe(10000);
    expect(out[0].net_amount).toBe(10000);
    expect(out[0].categories).toBe('1 Year Tuition Fee');
  });

  it('TMF-only keeps just the TMF part of each receipt', () => {
    const out = projectRowsByCategory([mixed, tmfOnly], isTransportMaintenanceFee);
    expect(out.map((r) => [r.receipt_number, r.payment_amount])).toEqual([
      ['RCP-M', 500],
      ['RCP-T', 5500],
    ]);
  });
});
