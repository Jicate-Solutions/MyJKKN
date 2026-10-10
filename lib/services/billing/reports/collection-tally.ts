// Pure helpers for the Collection report's Tally export
// (/billing/reports?tab=collection → "Tally XML"): turning receipts into
// TallyPrime Receipt vouchers, the import XML itself, the list of receipts
// left out, and parsing the ledger-mapping sheet. No Supabase, no React, no
// xlsx — unit-tested directly, like collection-daywise.ts.
//
// Books of account this mirrors (one Tally company per institution): every
// learner is a Tally ledger, and a fee collection is a Receipt voucher that
// debits a cash/bank ledger and credits the learner's ledger. Tally matches
// ledgers by NAME, so both names come from setup (billing_tally_settings and
// billing_tally_learner_ledgers) and a receipt with either one missing is
// skipped and listed rather than guessed at.
import type { CollectionDaywiseRow } from '@/types/billing-schedule';
import { daywiseModeLabel, learnerName } from './collection-daywise';

/** Which Tally company a file is for. Transport Maintenance Fee is kept in
 *  its own books, so it gets its own file and its own ledger names. */
export type TallyBook = 'fees' | 'transport';

export const TALLY_BOOK_LABELS: Record<TallyBook, string> = {
  fees: 'Fees',
  transport: 'Transport Maintenance Fee'
};

/** Payment modes that can be given a Tally ledger. 'combined' is absent on
 *  purpose: the receipt holds one amount with no cash/bank split. */
export const TALLY_MODES = ['cash', 'online', 'bank_transfer', 'dd', 'cheque'] as const;

/** payment_mode → exact Tally cash/bank ledger name. */
export type TallyModeLedgers = Record<string, string>;

export type TallySkipReason =
  | 'combined'
  | 'no_mode_ledger'
  | 'no_jkkn_id'
  | 'no_learner_ledger'
  | 'no_amount';

export const TALLY_SKIP_REASON_LABELS: Record<TallySkipReason, string> = {
  combined: 'Combined payment has no cash / bank split — enter in Tally by hand',
  no_mode_ledger: 'No Tally ledger set for this payment mode',
  no_jkkn_id: 'Learner has no MyJKKN ID',
  no_learner_ledger: 'No Tally ledger name mapped for this learner',
  no_amount: 'Receipt amount is zero'
};

export interface TallyVoucher {
  /** Stable per receipt and book, so the same receipt always carries the
   *  same id into Tally. */
  remoteId: string;
  /** YYYYMMDD — the receipt date. */
  date: string;
  /** MyJKKN receipt number; Tally assigns its own voucher number. */
  reference: string;
  narration: string;
  /** Credited. */
  learnerLedger: string;
  /** Debited. */
  bankLedger: string;
  amount: number;
}

export interface TallySkipped {
  row: CollectionDaywiseRow;
  reason: TallySkipReason;
}

export interface TallyExport {
  vouchers: TallyVoucher[];
  skipped: TallySkipped[];
  /** Exported at the full receipt amount although a refund exists — refunds
   *  are not sent to Tally, so these need a manual entry there. */
  refunded: CollectionDaywiseRow[];
  total: number;
}

/** MyJKKN IDs are matched trimmed and case-insensitively. */
export function normaliseJkknId(id: string | null | undefined): string {
  return (id ?? '').trim().toUpperCase();
}

const money = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

function narrationFor(r: CollectionDaywiseRow): string {
  const parts = [`MyJKKN receipt ${r.receipt_number}`];
  if (r.jkkn_id) parts.push(`MyJKKN ID ${r.jkkn_id.trim()}`);
  const name = learnerName(r);
  if (name) parts.push(name);
  const mode = [daywiseModeLabel(r.payment_mode)];
  if (r.payment_reference_number) mode.push(`Ref ${r.payment_reference_number}`);
  if (r.payment_mode === 'dd') {
    const bank = [r.dd_bank_name, r.dd_branch].filter(Boolean).join(', ');
    if (bank) mode.push(bank);
  }
  parts.push(mode.join(' '));
  if (r.categories) parts.push(r.categories);
  return parts.join(' | ');
}

/**
 * One Receipt voucher per receipt, in the order given. `ledgerByJkknId` must
 * be keyed by normaliseJkknId(). Rows should already be cut to the book's fee
 * categories (projectRowsByCategory), so payment_amount is that book's share.
 */
export function buildTallyExport(
  rows: CollectionDaywiseRow[],
  opts: {
    book: TallyBook;
    ledgerByJkknId: Map<string, string>;
    modeLedgers: TallyModeLedgers;
  }
): TallyExport {
  const out: TallyExport = { vouchers: [], skipped: [], refunded: [], total: 0 };
  for (const r of rows) {
    const amount = money(r.payment_amount);
    const mode = r.payment_mode || '';
    const bankLedger = (opts.modeLedgers[mode] ?? '').trim();
    const jkknId = normaliseJkknId(r.jkkn_id);
    const learnerLedger = jkknId ? (opts.ledgerByJkknId.get(jkknId) ?? '').trim() : '';

    let reason: TallySkipReason | null = null;
    if (amount <= 0) reason = 'no_amount';
    else if (mode === 'combined') reason = 'combined';
    else if (!bankLedger) reason = 'no_mode_ledger';
    else if (!jkknId) reason = 'no_jkkn_id';
    else if (!learnerLedger) reason = 'no_learner_ledger';
    if (reason) {
      out.skipped.push({ row: r, reason });
      continue;
    }

    out.vouchers.push({
      remoteId: `myjkkn-${opts.book}-${r.receipt_id}`,
      date: (r.receipt_date || '').slice(0, 10).replace(/-/g, ''),
      reference: r.receipt_number,
      narration: narrationFor(r),
      learnerLedger,
      bankLedger,
      amount
    });
    out.total = money(out.total + amount);
    if (r.has_refunds) out.refunded.push(r);
  }
  return out;
}

// ── XML ──────────────────────────────────────────────────────────────────────

/** Escapes text for an XML node and drops the control characters XML 1.0
 *  forbids (a stray one makes Tally reject the whole file). */
export function xmlText(v: string): string {
  return v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * TallyPrime "Import Data → Vouchers" envelope. No company name is written, so
 * the file imports into whichever company is open in Tally, and no voucher
 * number, so Tally numbers the receipts itself. In Tally's XML a debit is
 * ISDEEMEDPOSITIVE=Yes with a negative amount; a credit is No with a positive.
 */
export function buildTallyXml(vouchers: TallyVoucher[]): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ENVELOPE>',
    ' <HEADER>',
    '  <TALLYREQUEST>Import Data</TALLYREQUEST>',
    ' </HEADER>',
    ' <BODY>',
    '  <IMPORTDATA>',
    '   <REQUESTDESC>',
    '    <REPORTNAME>Vouchers</REPORTNAME>',
    '   </REQUESTDESC>',
    '   <REQUESTDATA>'
  ];
  for (const v of vouchers) {
    const amount = v.amount.toFixed(2);
    lines.push(
      '    <TALLYMESSAGE xmlns:UDF="TallyUDF">',
      `     <VOUCHER REMOTEID="${xmlText(v.remoteId)}" VCHTYPE="Receipt" ACTION="Create" OBJVIEW="Accounting Voucher View">`,
      `      <DATE>${v.date}</DATE>`,
      `      <EFFECTIVEDATE>${v.date}</EFFECTIVEDATE>`,
      `      <GUID>${xmlText(v.remoteId)}</GUID>`,
      '      <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>',
      `      <REFERENCE>${xmlText(v.reference)}</REFERENCE>`,
      `      <NARRATION>${xmlText(v.narration)}</NARRATION>`,
      `      <PARTYLEDGERNAME>${xmlText(v.learnerLedger)}</PARTYLEDGERNAME>`,
      '      <ALLLEDGERENTRIES.LIST>',
      `       <LEDGERNAME>${xmlText(v.learnerLedger)}</LEDGERNAME>`,
      '       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>',
      `       <AMOUNT>${amount}</AMOUNT>`,
      '      </ALLLEDGERENTRIES.LIST>',
      '      <ALLLEDGERENTRIES.LIST>',
      `       <LEDGERNAME>${xmlText(v.bankLedger)}</LEDGERNAME>`,
      '       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>',
      `       <AMOUNT>-${amount}</AMOUNT>`,
      '      </ALLLEDGERENTRIES.LIST>',
      '     </VOUCHER>',
      '    </TALLYMESSAGE>'
    );
  }
  lines.push('   </REQUESTDATA>', '  </IMPORTDATA>', ' </BODY>', '</ENVELOPE>', '');
  return lines.join('\r\n');
}

/** File-name-safe institution slug. */
export function tallyFileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'institution'
  );
}

// ── Not-exported workbook ────────────────────────────────────────────────────

export type TallyCell = string | number;

/** Sheet the upload reads back: its header row doubles as the mapping
 *  template, with the last column left blank to fill in. */
export const TALLY_MAPPING_SHEET = 'Unmapped Learners';
export const TALLY_MAPPING_HEADER = [
  'MyJKKN ID',
  'Learner',
  'Roll No',
  'Program',
  'Tally Ledger Name'
] as const;

/** "Reference" sheet of the blank template: what goes in each column, with an
 *  example. Laid out one column per row so no row here carries both mapping
 *  headers — parseLedgerMappingRows can never mistake it for the mapping. */
export const TALLY_REFERENCE_SHEET = 'Reference';
export function buildMappingReferenceRows(): TallyCell[][] {
  return [
    ['Tally learner ledger mapping — how to fill the "Unmapped Learners" sheet'],
    [],
    ['Column', 'What to enter', 'Example'],
    ['MyJKKN ID', 'Required. The learner’s MyJKKN ID, as shown in the Collection report.', '123456-7'],
    ['Learner', 'Optional — for your reference only.', 'ARUN KUMAR S'],
    ['Roll No', 'Optional — for your reference only.', 'NB24001'],
    ['Program', 'Optional — for your reference only.', 'BSC (Nursing)'],
    [
      'Tally Ledger Name',
      'Required. The learner’s ledger name exactly as it is spelled in Tally — copy it from Tally’s ledger list; every space and bracket matters.',
      'ARUN KUMAR S - B.SC.NUR. 2024-2025 ( II 150000)'
    ],
    [],
    ['Notes'],
    ['1', 'Only the "Unmapped Learners" sheet is read on upload. This sheet is ignored.'],
    ['2', 'One row per learner. A row with a blank Tally Ledger Name is skipped.'],
    ['3', 'Uploading again adds new learners and replaces the name of a learner already mapped.'],
    ['4', 'Fees and Transport Maintenance Fee are separate Tally companies — upload under the matching tab.'],
    [
      '5',
      'Cash / bank ledgers are not entered here. Type them in Tally Setup, one per payment mode.',
      'Cash  ·  HDFC A/C 50100843279416'
    ]
  ];
}

/** One line per learner still to be mapped (not per receipt). */
export function buildUnmappedLearnerRows(skipped: TallySkipped[]): TallyCell[][] {
  const seen = new Set<string>();
  const out: TallyCell[][] = [[...TALLY_MAPPING_HEADER]];
  for (const s of skipped) {
    if (s.reason !== 'no_learner_ledger') continue;
    const id = normaliseJkknId(s.row.jkkn_id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push([
      (s.row.jkkn_id ?? '').trim(),
      learnerName(s.row),
      s.row.roll_number ?? '',
      s.row.program_name ?? '',
      ''
    ]);
  }
  return out;
}

export const TALLY_SKIPPED_HEADER = [
  'Date',
  'Receipt No',
  'Learner',
  'MyJKKN ID',
  'Roll No',
  'Payment Mode',
  'Amount',
  'Refunds',
  'Status',
  'Reason'
] as const;

/** Every receipt the accountant has to act on: those left out of the XML, then
 *  those exported at full value although a refund exists. */
export function buildSkippedReceiptRows(exp: TallyExport): TallyCell[][] {
  const line = (r: CollectionDaywiseRow, status: string, reason: string): TallyCell[] => [
    (r.receipt_date || '').slice(0, 10),
    r.receipt_number,
    learnerName(r),
    (r.jkkn_id ?? '').trim(),
    r.roll_number ?? '',
    daywiseModeLabel(r.payment_mode),
    money(r.payment_amount),
    money(r.total_refunds),
    status,
    reason
  ];
  return [
    [...TALLY_SKIPPED_HEADER],
    ...exp.skipped.map((s) => line(s.row, 'Not exported', TALLY_SKIP_REASON_LABELS[s.reason])),
    ...exp.refunded.map((r) =>
      line(r, 'Exported', 'Has a refund — exported at the full receipt amount; enter the refund in Tally')
    )
  ];
}

// ── Mapping sheet upload ─────────────────────────────────────────────────────

export interface TallyLedgerMapping {
  jkkn_id: string;
  tally_ledger_name: string;
}

const headerKey = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Reads a sheet (array of rows) holding a "MyJKKN ID" and a "Tally Ledger
 * Name" column, in any position, under a header row within the first 10 rows.
 * Rows with a blank ledger name are ignored (the template ships them blank);
 * a MyJKKN ID repeated in the sheet keeps its last ledger name. Returns null
 * when the two columns cannot be found.
 */
export function parseLedgerMappingRows(
  sheet: unknown[][]
): { entries: TallyLedgerMapping[]; blank: number } | null {
  let headerRow = -1;
  let idCol = -1;
  let nameCol = -1;
  for (let i = 0; i < Math.min(sheet.length, 10); i++) {
    const keys = (sheet[i] ?? []).map(headerKey);
    const id = keys.indexOf('myjkknid');
    const name = keys.indexOf('tallyledgername');
    if (id !== -1 && name !== -1) {
      headerRow = i;
      idCol = id;
      nameCol = name;
      break;
    }
  }
  if (headerRow === -1) return null;

  const byId = new Map<string, TallyLedgerMapping>();
  let blank = 0;
  for (let i = headerRow + 1; i < sheet.length; i++) {
    const row = sheet[i] ?? [];
    const id = String(row[idCol] ?? '').trim();
    const name = String(row[nameCol] ?? '').trim();
    if (!id) continue;
    if (!name) {
      blank += 1;
      continue;
    }
    byId.set(normaliseJkknId(id), { jkkn_id: id, tally_ledger_name: name });
  }
  return { entries: Array.from(byId.values()), blank };
}
