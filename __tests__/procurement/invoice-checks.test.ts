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
