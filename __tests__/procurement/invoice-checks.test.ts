import { describe, it, expect } from 'vitest';
import {
  daysBetween,
  normaliseInvoiceNumber,
  findDuplicateGrns,
  expiryState,
  expiredLineBlocks,
  splitInvoiceLines,
  invoiceAgeCheck,
  lateReasonMissing,
  duplicateHold,
  isIsoDate,
  mergeInvoiceRead,
} from '@/lib/services/procurement/invoice-checks';

// Invoice checks I1–I4 (spec from Draft PR #4289). The model only reads the PDF; these
// rules decide what may be saved, so their edges are pinned here.

const TODAY = '2026-10-09';

describe('daysBetween', () => {
  it('counts whole calendar days, across a month end', () => {
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1);
    expect(daysBetween('2026-10-09', '2026-10-09')).toBe(0);
    expect(daysBetween('2026-10-10', '2026-10-09')).toBe(-1);
  });
  it('returns null for missing or malformed dates', () => {
    expect(daysBetween(null, TODAY)).toBeNull();
    expect(daysBetween(TODAY, undefined)).toBeNull();
    expect(daysBetween('09/10/2026', TODAY)).toBeNull();
    expect(daysBetween('', TODAY)).toBeNull();
  });
});

describe('I1 normaliseInvoiceNumber', () => {
  it('folds case and strips spaces and dashes', () => {
    expect(normaliseInvoiceNumber('INV-2041')).toBe('inv2041');
    expect(normaliseInvoiceNumber('  inv 2041 ')).toBe('inv2041');
    expect(normaliseInvoiceNumber('Inv--20 41')).toBe('inv2041');
  });
  it('treats unicode dashes (en, em, minus) like a hyphen', () => {
    expect(normaliseInvoiceNumber('INV–2041')).toBe('inv2041');
    expect(normaliseInvoiceNumber('INV—2041')).toBe('inv2041');
    expect(normaliseInvoiceNumber('INV−2041')).toBe('inv2041');
  });
  it('keeps other punctuation (a slash is part of the number)', () => {
    expect(normaliseInvoiceNumber('INV/2041')).toBe('inv/2041');
    expect(normaliseInvoiceNumber('INV/2041')).not.toBe(normaliseInvoiceNumber('INV-2041'));
  });
  it('returns null for empty, blank, dash-only or missing numbers', () => {
    expect(normaliseInvoiceNumber('')).toBeNull();
    expect(normaliseInvoiceNumber('   ')).toBeNull();
    expect(normaliseInvoiceNumber(' - ')).toBeNull();
    expect(normaliseInvoiceNumber(null)).toBeNull();
    expect(normaliseInvoiceNumber(undefined)).toBeNull();
  });
});

describe('I1 findDuplicateGrns', () => {
  const grns = [
    { id: 'g1', supplier_id: 's1', invoice_number: 'INV-2041', status: 'accepted' },
    { id: 'g2', supplier_id: 's2', invoice_number: 'INV-2041', status: 'accepted' },
    { id: 'g3', supplier_id: 's1', invoice_number: 'INV-9999', status: 'pending_verification' },
    { id: 'g4', supplier_id: 's1', invoice_number: 'inv 2041', status: 'cancelled' },
    { id: 'g5', supplier_id: 's1', invoice_number: null, status: 'completed' },
  ];

  it('finds the same number from the same supplier, across case/dash/space variants', () => {
    expect(findDuplicateGrns(grns, 's1', 'inv 2041').map((g) => g.id)).toEqual(['g1']);
    expect(findDuplicateGrns(grns, 's1', 'INV–2041').map((g) => g.id)).toEqual(['g1']);
  });
  it('ignores the same number from a different supplier', () => {
    expect(findDuplicateGrns(grns, 's3', 'INV-2041')).toEqual([]);
    expect(findDuplicateGrns(grns, 's2', 'INV-2041').map((g) => g.id)).toEqual(['g2']);
  });
  it('ignores cancelled receipts', () => {
    expect(findDuplicateGrns(grns, 's1', 'INV-2041').map((g) => g.id)).not.toContain('g4');
  });
  it('skips the record being edited', () => {
    expect(findDuplicateGrns(grns, 's1', 'INV-2041', 'g1')).toEqual([]);
  });
  it('never matches on an empty number or a missing supplier', () => {
    expect(findDuplicateGrns(grns, 's1', '')).toEqual([]);
    expect(findDuplicateGrns(grns, 's1', null)).toEqual([]);
    expect(findDuplicateGrns(grns, null, 'INV-2041')).toEqual([]);
  });
});

describe('I2 expiryState', () => {
  it('marks a date before today as expired; today itself is not expired', () => {
    expect(expiryState('2026-10-08', TODAY, 30)).toBe('expired');
    expect(expiryState(TODAY, TODAY, 30)).toBe('near_expiry');
    expect(expiryState(TODAY, TODAY, 0)).toBe('ok');
  });
  it('warns inside the near-expiry window, inclusive of its last day', () => {
    expect(expiryState('2026-11-08', TODAY, 30)).toBe('near_expiry'); // 30 days
    expect(expiryState('2026-11-09', TODAY, 30)).toBe('ok'); // 31 days
  });
  it('uses the window passed in, not a fixed one', () => {
    expect(expiryState('2026-10-20', TODAY, 7)).toBe('ok');
    expect(expiryState('2026-10-20', TODAY, 14)).toBe('near_expiry');
  });
  it('disables the warning when the window is missing or non-positive', () => {
    expect(expiryState('2026-10-10', TODAY, null)).toBe('ok');
    expect(expiryState('2026-10-10', TODAY, -5)).toBe('ok');
  });
  it('returns null when there is no valid expiry date', () => {
    expect(expiryState(null, TODAY, 30)).toBeNull();
    expect(expiryState(undefined, TODAY, 30)).toBeNull();
    expect(expiryState('not-a-date', TODAY, 30)).toBeNull();
  });
});

describe('I2 expiredLineBlocks', () => {
  it('blocks an expired line that is being accepted into stock', () => {
    expect(expiredLineBlocks({ expiry_date: '2026-01-01', accepted_quantity: 5 }, TODAY)).toBe(true);
  });
  it('lets an expired line be recorded when all of it is rejected', () => {
    expect(expiredLineBlocks({ expiry_date: '2026-01-01', accepted_quantity: 0 }, TODAY)).toBe(false);
  });
  it('never blocks a near-expiry, in-date or undated line', () => {
    expect(expiredLineBlocks({ expiry_date: '2026-10-12', accepted_quantity: 5 }, TODAY)).toBe(false);
    expect(expiredLineBlocks({ expiry_date: TODAY, accepted_quantity: 5 }, TODAY)).toBe(false);
    expect(expiredLineBlocks({ expiry_date: null, accepted_quantity: 5 }, TODAY)).toBe(false);
  });
});

describe('I3 splitInvoiceLines', () => {
  const po = ['p1', 'p2'];

  it('keeps lines that point at this order and lists the rest as not ordered', () => {
    const r = splitInvoiceLines(
      [
        { po_item_id: 'p1', item_name: 'Beaker' },
        { po_item_id: null, item_name: 'Freight', not_on_po: true },
      ],
      po,
    );
    expect(r.ordered.map((l) => l.item_name)).toEqual(['Beaker']);
    expect(r.notOrdered.map((l) => l.item_name)).toEqual(['Freight']);
  });
  it('re-derives: a po_item_id from another order is NOT ordered, even if the model says it is', () => {
    const r = splitInvoiceLines([{ po_item_id: 'other-po-line', not_on_po: false }], po);
    expect(r.ordered).toEqual([]);
    expect(r.notOrdered).toHaveLength(1);
  });
  it('re-derives: a real PO line stays ordered even if the model flags not_on_po', () => {
    const r = splitInvoiceLines([{ po_item_id: 'p2', not_on_po: true }], po);
    expect(r.ordered).toHaveLength(1);
    expect(r.notOrdered).toEqual([]);
  });
  it('sends a second line claiming the same PO line to duplicates', () => {
    const r = splitInvoiceLines(
      [
        { po_item_id: 'p1', invoice_quantity: 4 },
        { po_item_id: 'p1', invoice_quantity: 6 },
      ],
      po,
    );
    expect(r.ordered.map((l) => l.invoice_quantity)).toEqual([4]);
    expect(r.duplicates.map((l) => l.invoice_quantity)).toEqual([6]);
  });
  it('handles a missing or empty line list', () => {
    expect(splitInvoiceLines(null, po)).toEqual({ ordered: [], notOrdered: [], duplicates: [] });
    expect(splitInvoiceLines([], po)).toEqual({ ordered: [], notOrdered: [], duplicates: [] });
  });
});

describe('I4 invoiceAgeCheck / lateReasonMissing', () => {
  it('fires only when the invoice is strictly older than the limit', () => {
    expect(invoiceAgeCheck('2026-09-09', TODAY, 30)).toEqual({ ageDays: 30, tooOld: false });
    expect(invoiceAgeCheck('2026-09-08', TODAY, 30)).toEqual({ ageDays: 31, tooOld: true });
  });
  it('does nothing when no limit is set', () => {
    expect(invoiceAgeCheck('2020-01-01', TODAY, null).tooOld).toBe(false);
    expect(invoiceAgeCheck('2020-01-01', TODAY, 0).tooOld).toBe(false);
  });
  it('does nothing for a missing or malformed invoice date', () => {
    expect(invoiceAgeCheck(null, TODAY, 30)).toEqual({ ageDays: null, tooOld: false });
    expect(invoiceAgeCheck('garbage', TODAY, 30).tooOld).toBe(false);
  });
  it('a future-dated invoice is not "old"', () => {
    expect(invoiceAgeCheck('2026-10-20', TODAY, 5).tooOld).toBe(false);
  });
  it('requires a non-blank reason only when the invoice is too old', () => {
    expect(lateReasonMissing('2026-01-01', TODAY, 30, '')).toBe(true);
    expect(lateReasonMissing('2026-01-01', TODAY, 30, '   ')).toBe(true);
    expect(lateReasonMissing('2026-01-01', TODAY, 30, null)).toBe(true);
    expect(lateReasonMissing('2026-01-01', TODAY, 30, 'Supplier re-sent the bill')).toBe(false);
    expect(lateReasonMissing('2026-10-01', TODAY, 30, '')).toBe(false);
  });
});

describe('I1 duplicateHold (held save)', () => {
  const base = {
    hasDuplicate: true,
    confirmedBy: null,
    viewerId: 'verifier',
    receivedBy: 'receiver',
    viewerCanVerify: true,
  };

  it('holds an unconfirmed duplicate and blocks verify', () => {
    expect(duplicateHold(base)).toEqual({ held: true, canConfirm: true, blocksVerify: true });
  });
  it('releases the hold once confirmed', () => {
    expect(duplicateHold({ ...base, confirmedBy: 'verifier' })).toEqual({
      held: false,
      canConfirm: false,
      blocksVerify: false,
    });
  });
  it('never holds a receipt with no duplicate', () => {
    expect(duplicateHold({ ...base, hasDuplicate: false }).blocksVerify).toBe(false);
  });
  it('the receiver can never confirm, even with verify rights', () => {
    const r = duplicateHold({ ...base, viewerId: 'receiver' });
    expect(r.canConfirm).toBe(false);
    expect(r.blocksVerify).toBe(true);
  });
  it('someone without verify rights cannot confirm', () => {
    expect(duplicateHold({ ...base, viewerCanVerify: false }).canConfirm).toBe(false);
  });
  it('an unknown viewer cannot confirm', () => {
    expect(duplicateHold({ ...base, viewerId: null }).canConfirm).toBe(false);
  });
});

describe('isIsoDate (review round: AI-read dates)', () => {
  it('accepts a real YYYY-MM-DD date', () => {
    expect(isIsoDate('2026-10-09')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
  });
  it('refuses printed, impossible and empty dates', () => {
    expect(isIsoDate('03/04/2025')).toBe(false);
    expect(isIsoDate('2025-02-30')).toBe(false);
    expect(isIsoDate('2025-13-01')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe('I1 findDuplicateGrns — earlierThan (review round)', () => {
  const rows = [
    { id: 'a', supplier_id: 's', invoice_number: 'INV-77', status: 'pending_verification', created_at: '2026-10-08T10:00:00Z' },
    { id: 'b', supplier_id: 's', invoice_number: 'INV-77', status: 'pending_verification', created_at: '2026-10-09T10:00:00Z' },
  ];
  it('holds the later repeat (B), never the original (A)', () => {
    expect(findDuplicateGrns(rows, 's', 'INV-77', 'b', rows[1]).map((g) => g.id)).toEqual(['a']);
    expect(findDuplicateGrns(rows, 's', 'INV-77', 'a', rows[0])).toEqual([]);
  });
  it('breaks a same-instant tie by id, like the database', () => {
    const tie = [
      { ...rows[0], id: 'x1', created_at: '2026-10-09T10:00:00Z' },
      { ...rows[1], id: 'x2', created_at: '2026-10-09T10:00:00Z' },
    ];
    expect(findDuplicateGrns(tie, 's', 'INV-77', 'x2', tie[1]).map((g) => g.id)).toEqual(['x1']);
    expect(findDuplicateGrns(tie, 's', 'INV-77', 'x1', tie[0])).toEqual([]);
  });
  it('without earlierThan (a receipt not saved yet) every other receipt counts', () => {
    expect(findDuplicateGrns(rows, 's', 'INV-77').map((g) => g.id)).toEqual(['a', 'b']);
  });
});

describe('mergeInvoiceRead — what the person typed always wins (review round)', () => {
  const seeded = (id: string, over: Record<string, unknown> = {}) => ({
    po_item_id: id,
    item_name: `Item ${id}`,
    invoice_quantity: 10,
    received_quantity: 10,
    accepted_quantity: 10,
    rejected_quantity: 0,
    batch_number: null as string | null,
    expiry_date: null as string | null,
    manufacturing_date: null as string | null,
    cost: null as number | null,
    ...over,
  });
  const blankHeader = { invoice_number: '', invoice_date: '', invoice_amount: '' };
  const read = { invoice_quantity: 8, batch_number: 'AI-B', expiry_date: '2027-01-01', invoice_unit_price: 12 };

  it('fills a blank form completely', () => {
    const m = mergeInvoiceRead({
      header: blankHeader,
      aiMarked: {},
      lines: [seeded('p1')],
      touched: new Set(),
      invoice: { invoice_number: 'INV-1', invoice_date: '2026-10-01', invoice_amount: 96 },
      readLines: [{ po_item_id: 'p1', ...read }],
    });
    expect(m.header).toEqual({ invoice_number: 'INV-1', invoice_date: '2026-10-01', invoice_amount: '96' });
    expect(m.lines[0]).toMatchObject({ invoice_quantity: 8, received_quantity: 8, accepted_quantity: 8, batch_number: 'AI-B', cost: 12 });
    expect(m.marks).toMatchObject({ invoice_number: 'ai', 'line:p1': 'ai' });
    expect(m.kept).toBe(0);
  });

  it('keeps a typed invoice number but replaces one the AI filled earlier', () => {
    const typed = mergeInvoiceRead({
      header: { ...blankHeader, invoice_number: 'INV-77' },
      aiMarked: {},
      lines: [],
      touched: new Set(),
      invoice: { invoice_number: 'INV-1' },
    });
    expect(typed.header.invoice_number).toBeUndefined();
    expect(typed.kept).toBe(1);
    const aiEarlier = mergeInvoiceRead({
      header: { ...blankHeader, invoice_number: 'INV-OLD' },
      aiMarked: { invoice_number: 'ai' },
      lines: [],
      touched: new Set(),
      invoice: { invoice_number: 'INV-1' },
    });
    expect(aiEarlier.header.invoice_number).toBe('INV-1');
  });

  it('never overwrites the quantities, typed batch or rejection on a line the person edited', () => {
    const line = seeded('p1', { accepted_quantity: 8, rejected_quantity: 2, batch_number: 'TYPED' });
    const m = mergeInvoiceRead({
      header: blankHeader,
      aiMarked: {},
      lines: [line],
      touched: new Set(['p1']),
      readLines: [{ po_item_id: 'p1', ...read }],
    });
    expect(m.lines[0]).toMatchObject({
      invoice_quantity: 10,
      received_quantity: 10,
      accepted_quantity: 8,
      rejected_quantity: 2,
      batch_number: 'TYPED',
      expiry_date: '2027-01-01', // blank before: filled
      cost: 12, // blank before: filled
    });
    expect(m.kept).toBe(1);
  });

  it('on an untouched line, accepted is the read quantity less what is already rejected', () => {
    const m = mergeInvoiceRead({
      header: blankHeader,
      aiMarked: {},
      lines: [seeded('p1', { rejected_quantity: 3 })],
      touched: new Set(),
      readLines: [{ po_item_id: 'p1', invoice_quantity: 8 }],
    });
    expect(m.lines[0]).toMatchObject({ received_quantity: 8, accepted_quantity: 5, rejected_quantity: 3 });
  });

  it('leaves out a date that is not a real YYYY-MM-DD and marks the line uncertain', () => {
    const m = mergeInvoiceRead({
      header: blankHeader,
      aiMarked: {},
      lines: [seeded('p1')],
      touched: new Set(),
      invoice: { invoice_date: '01/10/2026' },
      readLines: [{ po_item_id: 'p1', expiry_date: '03/04/2025' }],
    });
    expect(m.header.invoice_date).toBeUndefined();
    expect(m.lines[0].expiry_date).toBeNull();
    expect(m.marks['line:p1']).toBe('uncertain');
    expect(m.unreadable).toHaveLength(2);
  });

  it('returns a second invoice line for the same order line instead of dropping it', () => {
    const m = mergeInvoiceRead({
      header: blankHeader,
      aiMarked: {},
      lines: [seeded('p1')],
      touched: new Set(),
      readLines: [
        { po_item_id: 'p1', invoice_quantity: 5, batch_number: 'B1' },
        { po_item_id: 'p1', invoice_quantity: 5, batch_number: 'B2' },
      ],
    });
    expect(m.lines[0]).toMatchObject({ invoice_quantity: 5, batch_number: 'B1' });
    expect(m.duplicates).toEqual([{ po_item_id: 'p1', invoice_quantity: 5, batch_number: 'B2' }]);
    expect(m.marks['line:p1']).toBe('uncertain');
    expect(m.matched).toBe(1);
  });
});
