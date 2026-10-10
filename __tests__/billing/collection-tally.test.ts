import { describe, it, expect } from 'vitest';
import {
  buildTallyExport,
  buildTallyXml,
  buildUnmappedLearnerRows,
  buildSkippedReceiptRows,
  buildMappingReferenceRows,
  parseLedgerMappingRows,
  normaliseJkknId,
  tallyFileSlug,
  xmlText,
  TALLY_MAPPING_HEADER,
} from '@/lib/services/billing/reports/collection-tally';
import type { CollectionDaywiseRow } from '@/types/billing-schedule';

function row(p: Partial<CollectionDaywiseRow>): CollectionDaywiseRow {
  return {
    receipt_id: p.receipt_id ?? 'r1',
    receipt_number: 'RCP-2026-000421',
    receipt_date: '2026-09-01',
    first_name: 'ABHINAV',
    last_name: 'BIJU',
    institution_name: 'Sresakthimayeil Institute of Nursing',
    payment_mode: 'online',
    payment_amount: 50000,
    total_refunds: 0,
    net_amount: 50000,
    has_refunds: false,
    jkkn_id: 'JKKN1001',
    ...p,
  };
}

const LEARNER = 'ABHINAV BIJU - B.SC.NUR. 2024-2025 ( II 150000)';
const opts = {
  book: 'fees' as const,
  ledgerByJkknId: new Map([['JKKN1001', LEARNER]]),
  modeLedgers: { cash: 'Cash', online: 'HDFC A/C 50100843279416', bank_transfer: 'IB.JKKN SSIN   5907' },
};

describe('buildTallyExport', () => {
  it('turns a mapped receipt into one voucher: bank debited, learner credited', () => {
    const exp = buildTallyExport([row({ payment_reference_number: 'UTR123', categories: 'I - TERM FEE' })], opts);
    expect(exp.skipped).toEqual([]);
    expect(exp.total).toBe(50000);
    expect(exp.vouchers).toEqual([
      {
        remoteId: 'myjkkn-fees-r1',
        date: '20260901',
        reference: 'RCP-2026-000421',
        narration: 'MyJKKN receipt RCP-2026-000421 | MyJKKN ID JKKN1001 | ABHINAV BIJU | Online Ref UTR123 | I - TERM FEE',
        learnerLedger: LEARNER,
        bankLedger: 'HDFC A/C 50100843279416',
        amount: 50000,
      },
    ]);
  });

  it('matches the MyJKKN ID ignoring case and surrounding spaces', () => {
    const exp = buildTallyExport([row({ jkkn_id: ' jkkn1001 ' })], opts);
    expect(exp.vouchers).toHaveLength(1);
    expect(normaliseJkknId(' jkkn1001 ')).toBe('JKKN1001');
  });

  it('keeps inner spaces of a bank ledger name exactly', () => {
    const exp = buildTallyExport([row({ payment_mode: 'bank_transfer' })], opts);
    expect(exp.vouchers[0].bankLedger).toBe('IB.JKKN SSIN   5907');
  });

  it('skips with a reason instead of guessing', () => {
    const exp = buildTallyExport(
      [
        row({ receipt_id: 'a', payment_mode: 'combined' }),
        row({ receipt_id: 'b', payment_mode: 'cheque' }),
        row({ receipt_id: 'c', jkkn_id: null }),
        row({ receipt_id: 'd', jkkn_id: 'JKKN9999' }),
        row({ receipt_id: 'e', payment_amount: 0 }),
        row({ receipt_id: 'f', payment_mode: null as unknown as string }),
      ],
      opts
    );
    expect(exp.vouchers).toEqual([]);
    expect(exp.skipped.map((s) => [s.row.receipt_id, s.reason])).toEqual([
      ['a', 'combined'],
      ['b', 'no_mode_ledger'],
      ['c', 'no_jkkn_id'],
      ['d', 'no_learner_ledger'],
      ['e', 'no_amount'],
      ['f', 'no_mode_ledger'],
    ]);
    expect(exp.total).toBe(0);
  });

  it('exports a refunded receipt at its full amount and flags it', () => {
    const exp = buildTallyExport([row({ total_refunds: 5000, net_amount: 45000, has_refunds: true })], opts);
    expect(exp.vouchers[0].amount).toBe(50000);
    expect(exp.refunded).toHaveLength(1);
  });

  it('keeps the two books apart in the voucher id and tolerates numeric strings', () => {
    const exp = buildTallyExport([row({ payment_amount: '1250.50' as unknown as number })], { ...opts, book: 'transport' });
    expect(exp.vouchers[0].remoteId).toBe('myjkkn-transport-r1');
    expect(exp.vouchers[0].amount).toBe(1250.5);
  });
});

describe('buildTallyXml', () => {
  it('writes a Receipt voucher Tally can import, with no voucher number or company', () => {
    const xml = buildTallyXml(buildTallyExport([row({})], opts).vouchers);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
    expect(xml).toContain('<REPORTNAME>Vouchers</REPORTNAME>');
    expect(xml).toContain('<VOUCHER REMOTEID="myjkkn-fees-r1" VCHTYPE="Receipt" ACTION="Create"');
    expect(xml).toContain('<DATE>20260901</DATE>');
    expect(xml).toContain('<REFERENCE>RCP-2026-000421</REFERENCE>');
    expect(xml).not.toContain('VOUCHERNUMBER');
    expect(xml).not.toContain('SVCURRENTCOMPANY');
    // Credit the learner (positive, not deemed positive), debit the bank.
    const flat = xml.replace(/\s*\r\n\s*/g, '');
    expect(flat).toContain(
      `<LEDGERNAME>${LEARNER}</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>50000.00</AMOUNT>`
    );
    expect(flat).toContain(
      '<LEDGERNAME>HDFC A/C 50100843279416</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-50000.00</AMOUNT>'
    );
  });

  it('escapes markup and drops control characters', () => {
    expect(xmlText('M & S <Sons> "A" \'B\'\u0007')).toBe('M &amp; S &lt;Sons&gt; &quot;A&quot; &apos;B&apos;');
    const xml = buildTallyXml(
      buildTallyExport([row({})], { ...opts, ledgerByJkknId: new Map([['JKKN1001', 'R & D <X>']]) }).vouchers
    );
    expect(xml).toContain('<LEDGERNAME>R &amp; D &lt;X&gt;</LEDGERNAME>');
  });

  it('is an empty but well-formed envelope with no vouchers', () => {
    const xml = buildTallyXml([]);
    expect(xml).toContain('<REQUESTDATA>');
    expect(xml).not.toContain('<VOUCHER');
  });
});

describe('not-exported sheets', () => {
  const exp = buildTallyExport(
    [
      row({ receipt_id: 'a', jkkn_id: 'JKKN2002', first_name: 'B', last_name: '', roll_number: '24N01', program_name: 'B.Sc Nursing' }),
      row({ receipt_id: 'b', jkkn_id: 'jkkn2002', first_name: 'B', last_name: '' }),
      row({ receipt_id: 'c', payment_mode: 'combined' }),
      row({ receipt_id: 'd', total_refunds: 1000, has_refunds: true }),
    ],
    opts
  );

  it('lists each unmapped learner once, ledger name left blank to fill in', () => {
    expect(buildUnmappedLearnerRows(exp.skipped)).toEqual([
      [...TALLY_MAPPING_HEADER],
      ['JKKN2002', 'B', '24N01', 'B.Sc Nursing', ''],
    ]);
  });

  it('lists skipped receipts with the reason, then refunded ones that were exported', () => {
    const rows = buildSkippedReceiptRows(exp);
    expect(rows).toHaveLength(5);
    expect(rows[1].slice(-2)).toEqual(['Not exported', 'No Tally ledger name mapped for this learner']);
    expect(rows[3][8]).toBe('Not exported');
    expect(String(rows[3][9])).toMatch(/^Combined payment/);
    expect(rows[4][8]).toBe('Exported');
    expect(rows[4][7]).toBe(1000);
  });
});

describe('parseLedgerMappingRows', () => {
  it('finds the two columns wherever they are and skips blank ledger names', () => {
    const parsed = parseLedgerMappingRows([
      ['Learner ledger mapping'],
      ['MyJKKN ID', 'Learner', 'Roll No', 'Program', 'Tally Ledger Name'],
      ['JKKN1001', 'ABHINAV BIJU', '', '', `  ${LEARNER} `],
      ['JKKN1002', 'X', '', '', ''],
      ['', '', '', '', 'orphan name'],
    ]);
    expect(parsed).toEqual({
      entries: [{ jkkn_id: 'JKKN1001', tally_ledger_name: LEARNER }],
      blank: 1,
    });
  });

  it('accepts loosely typed headers and keeps the last name for a repeated ID', () => {
    const parsed = parseLedgerMappingRows([
      ['tally ledger name', 'myjkkn id'],
      ['Old Name', 'JKKN1001'],
      ['New Name', 'jkkn1001'],
      ['Numeric', 1003],
    ]);
    expect(parsed?.entries).toEqual([
      { jkkn_id: 'jkkn1001', tally_ledger_name: 'New Name' },
      { jkkn_id: '1003', tally_ledger_name: 'Numeric' },
    ]);
  });

  it('never reads the template\'s Reference sheet as a mapping', () => {
    const ref = buildMappingReferenceRows();
    expect(parseLedgerMappingRows(ref)).toBeNull();
    expect(ref.flat().join(' ')).toContain('HDFC A/C 50100843279416');
  });

  it('returns null when the columns are missing', () => {
    expect(parseLedgerMappingRows([['Name', 'Ledger'], ['a', 'b']])).toBeNull();
    expect(parseLedgerMappingRows([])).toBeNull();
  });
});

describe('tallyFileSlug', () => {
  it('makes a file-name-safe slug', () => {
    expect(tallyFileSlug('Sresakthimayeil Institute of Nursing (2008-09)')).toBe('sresakthimayeil-institute-of-nursing-200');
    expect(tallyFileSlug('***')).toBe('institution');
  });
});
