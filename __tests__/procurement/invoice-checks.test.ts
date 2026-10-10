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
  invoiceNumberFormatOk,
  INVOICE_NUMBER_ALLOWED,
  blankInvoiceBlocksStock,
  receivedMatchingDelivery,
  isIsoDate,
  mergeInvoiceRead,
  isReusableInvoiceRead,
  INVOICE_READ_RESULT_VERSION,
  POSTED_GRN_STATUSES,
  selfCheckBlocks,
  linesChangedSinceCheck,
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
  it('strips invisible characters a verifier cannot see on screen (review round 2, red team)', () => {
    for (const ch of [
      '\u200b', // zero-width space
      '\u200c', // zero-width non-joiner
      '\u200d', // zero-width joiner
      '\u2060', // word joiner
      '\u00ad', // soft hyphen
      '\ufeff', // byte-order mark
      '\u180e', // Mongolian vowel separator
      '\u202e', // right-to-left override
      '\u2066', // left-to-right isolate
      '\u0007', // a control character
      '\u{e0041}', // a tag character
    ]) {
      expect(normaliseInvoiceNumber(`INV-001${ch}`)).toBe('inv001');
      expect(normaliseInvoiceNumber(`IN${ch}V-0${ch}01`)).toBe('inv001');
    }
  });
  it('folds look-alike compatibility forms (full-width letters, digits and dashes)', () => {
    expect(normaliseInvoiceNumber('\uff29\uff2e\uff36\uff0d\uff10\uff10\uff11')).toBe('inv001');
    expect(normaliseInvoiceNumber('INV\u2011001')).toBe('inv001'); // non-breaking hyphen
    expect(normaliseInvoiceNumber('\uff29\uff2e\uff36\uff0f\uff10\uff10\uff11')).toBe('inv/001');
  });
  it('agrees with fn_procurement_normalise_invoice_number on the same inputs', () => {
    // Expected values are what the migration's SQL function returned for these exact
    // inputs (scratch Postgres 16 with the migration loaded, and the same expression on
    // production Postgres 15.6, read-only). The two must never drift apart.
    const pairs: Array<[string, string | null]> = [
      ['INV-\u200b001', 'inv001'],
      ['INV\u00ad-0\u206001', 'inv001'],
      ['\uff29\uff2e\uff36\uff0d\uff10\uff10\uff11', 'inv001'],
      ['inv / 2041', 'inv/2041'],
      ['  Inv\u201320 41\u3000', 'inv2041'],
      ['\u0baa\u0bbf\u0bb2\u0bcd-12', '\u0baa\u0bbf\u0bb2\u0bcd12'],
      ['\u200b\u00ad -', null],
    ];
    for (const [raw, sql] of pairs) expect(normaliseInvoiceNumber(raw)).toBe(sql);
  });
  it('returns null for empty, blank, dash-only or missing numbers', () => {
    expect(normaliseInvoiceNumber('\u200b\u00ad')).toBeNull();
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
    expect(duplicateHold(base)).toEqual({
      held: true,
      canConfirm: true,
      blocksVerify: true,
      viewerIsParty: false,
      confirmationVoid: false,
    });
  });
  it('releases the hold once confirmed', () => {
    expect(duplicateHold({ ...base, confirmedBy: 'verifier' })).toEqual({
      held: false,
      canConfirm: false,
      blocksVerify: false,
      viewerIsParty: false,
      confirmationVoid: false,
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
  it('D4: a verifier who received the OTHER delivery cannot confirm (third-person rule)', () => {
    const r = duplicateHold({ ...base, viewerReceivedMatch: true });
    expect(r.canConfirm).toBe(false);
    expect(r.viewerIsParty).toBe(true);
    expect(r.blocksVerify).toBe(true);
  });
  it('D4: the receiver is a party too', () => {
    expect(duplicateHold({ ...base, viewerId: 'receiver' }).viewerIsParty).toBe(true);
  });
  it('D4 at verify time: a confirmation by someone who received another such delivery does not count', () => {
    const r = duplicateHold({ ...base, confirmedBy: 'v3', confirmerReceivedMatch: true });
    expect(r.confirmationVoid).toBe(true);
    expect(r.held).toBe(true);
    expect(r.blocksVerify).toBe(true);
    // a third person may confirm again
    expect(r.canConfirm).toBe(true);
  });
  it('D4 at verify time: a confirmation by the receiver (e.g. after an admin change) does not count', () => {
    expect(duplicateHold({ ...base, confirmedBy: 'receiver' }).blocksVerify).toBe(true);
  });
  it('D4 at verify time: a stray confirmation on a receipt that is not held blocks nothing', () => {
    const r = duplicateHold({ ...base, hasDuplicate: false, confirmedBy: 'v3', confirmerReceivedMatch: true });
    expect(r.confirmationVoid).toBe(false);
    expect(r.blocksVerify).toBe(false);
  });
});

describe('D4 receivedMatchingDelivery (fallback when the database cannot answer)', () => {
  const grn = { id: 'g2', supplier_id: 's1', invoice_number: 'INV-7', created_at: '2026-10-09T05:00:00Z' };
  const earlier = {
    id: 'g1',
    supplier_id: 's1',
    invoice_number: 'inv7',
    status: 'accepted',
    created_at: '2026-10-08T05:00:00Z',
    received_by: 'v3',
  };
  it('is true when the user received a receipt this one repeats', () => {
    expect(receivedMatchingDelivery([earlier], grn, 'v3')).toBe(true);
  });
  it('is false for someone who received neither', () => {
    expect(receivedMatchingDelivery([earlier], grn, 'v2')).toBe(false);
  });
  it('ignores receipts this one does not repeat (other supplier, other number, itself)', () => {
    expect(receivedMatchingDelivery([{ ...earlier, supplier_id: 's9' }], grn, 'v3')).toBe(false);
    expect(receivedMatchingDelivery([{ ...earlier, invoice_number: 'INV-8' }], grn, 'v3')).toBe(false);
    expect(receivedMatchingDelivery([{ ...earlier, id: 'g2' }], grn, 'v3')).toBe(false);
  });
  it('is false for an unknown user', () => {
    expect(receivedMatchingDelivery([earlier], grn, null)).toBe(false);
  });
  it('counts a LATER, never-posted receipt of the user (decisions round, red team RT1)', () => {
    const later = { ...earlier, status: 'pending_verification', created_at: '2026-10-10T05:00:00Z' };
    expect(receivedMatchingDelivery([later], grn, 'v3')).toBe(true);
  });
  it('counts a CANCELLED receipt of the user — it can be revived (red team RT2)', () => {
    const cancelled = { ...earlier, status: 'cancelled' };
    expect(receivedMatchingDelivery([cancelled], grn, 'v3')).toBe(true);
  });
});

describe('D3 invoiceNumberFormatOk (letters, digits, - and / only)', () => {
  it('accepts GST-style numbers', () => {
    for (const ok of ['INV-2041', 'inv/2026-27/001', 'A1', '2041', 'GST/24-25/0007-B']) {
      expect(invoiceNumberFormatOk(ok)).toBe(true);
    }
  });
  it('refuses spaces, other punctuation, look-alike letters and blanks', () => {
    for (const bad of [
      'INV 2041',
      ' INV-2041',
      'INV_2041',
      'INV#1',
      'INV.1',
      'І-1', // Cyrillic capital I (U+0406)
      'ＩＮＶ1', // full-width letters
      'INV‐1', // U+2010 hyphen
      'INV\u200b1',
      '',
      '-',
      '---',
      '/',
      '-/-',
    ]) {
      expect(invoiceNumberFormatOk(bad)).toBe(false);
    }
    expect(invoiceNumberFormatOk(null)).toBe(false);
    expect(invoiceNumberFormatOk(undefined)).toBe(false);
  });
  it('matches exactly the 64 allowed characters of U+0000-U+FFFF (same count as the DB CHECK)', () => {
    // Each character is tried next to a letter, since a number must hold a letter or digit.
    let n = 0;
    for (let c = 0; c <= 0xffff; c++) {
      if (c >= 0xd800 && c <= 0xdfff) continue;
      if (INVOICE_NUMBER_ALLOWED.test('A' + String.fromCharCode(c))) n++;
    }
    expect(n).toBe(64);
  });
  it('needs at least one letter or digit (decisions round, red team: "---" normalised to blank)', () => {
    for (const ok of ['-7-', '/A', 'A/', '1']) expect(invoiceNumberFormatOk(ok)).toBe(true);
    for (const bad of ['-', '--', '---', '/', '//', '-/-']) expect(invoiceNumberFormatOk(bad)).toBe(false);
  });
});

describe('D2 blankInvoiceBlocksStock', () => {
  it('blocks a missing, empty or punctuation-only number', () => {
    for (const blank of [null, undefined, '', '   ', '-', ' - ']) {
      expect(blankInvoiceBlocksStock(blank)).toBe(true);
    }
  });
  it('does not block a real number', () => {
    expect(blankInvoiceBlocksStock('INV-1')).toBe(false);
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

describe('I1 findDuplicateGrns — a posted receipt always holds (review round 2)', () => {
  // A = the original, recorded first; B = the repeat, recorded later.
  const A = { id: 'a', supplier_id: 's', invoice_number: 'INV-77', status: 'pending_verification', created_at: '2026-10-08T10:00:00Z' };
  const B = { id: 'b', supplier_id: 's', invoice_number: 'inv 77', status: 'pending_verification', created_at: '2026-10-09T10:00:00Z' };

  it.each(['accepted', 'partially_accepted', 'replacement_requested', 'completed'])(
    'a LATER repeat that is already %s holds the original (cancel-and-revive)',
    (status) => {
      expect(findDuplicateGrns([A, { ...B, status }], 's', 'INV-77', 'a', A).map((g) => g.id)).toEqual(['b']);
    }
  );
  it('a later repeat that is NOT posted still never holds the original', () => {
    for (const status of ['draft', 'pending_verification']) {
      expect(findDuplicateGrns([A, { ...B, status }], 's', 'INV-77', 'a', A)).toEqual([]);
    }
  });
  it('a cancelled one never holds, posted or not', () => {
    expect(findDuplicateGrns([A, { ...B, status: 'cancelled' }], 's', 'INV-77', 'a', A)).toEqual([]);
  });
  it('the posted set is exactly the database guard\'s', () => {
    expect([...POSTED_GRN_STATUSES].sort()).toEqual(
      ['accepted', 'completed', 'partially_accepted', 'replacement_requested']
    );
  });
});

describe('isReusableInvoiceRead — only a current, well-formed read is replayed (review round 2)', () => {
  const v = INVOICE_READ_RESULT_VERSION;
  const good = {
    version: v,
    from_scan: false,
    invoice: { invoice_number: 'INV-1', invoice_date: '2026-10-02', invoice_amount: 10 },
    lines: [{ po_item_id: 'p1', invoice_quantity: 2 }],
    unmatched_note: null,
  };
  it('reuses a read of the current contract', () => {
    expect(isReusableInvoiceRead(good)).toBe(true);
    expect(isReusableInvoiceRead({ ...good, version: v + 1 })).toBe(true);
    expect(isReusableInvoiceRead({ version: v, invoice: null, lines: [] })).toBe(true);
    expect(isReusableInvoiceRead({ version: String(v), invoice: null })).toBe(true);
  });
  it('reads again when the version is missing or older', () => {
    const { version: _v, ...noVersion } = good;
    expect(isReusableInvoiceRead(noVersion)).toBe(false);
    expect(isReusableInvoiceRead({ ...good, version: v - 1 })).toBe(false);
    expect(isReusableInvoiceRead({ ...good, version: 'new' })).toBe(false);
  });
  it('reads again when the shape is wrong', () => {
    for (const bad of [null, undefined, 'done', 42, [good], {}]) {
      expect(isReusableInvoiceRead(bad)).toBe(false);
    }
    expect(isReusableInvoiceRead({ ...good, invoice: 'INV-1' })).toBe(false);
    expect(isReusableInvoiceRead({ ...good, invoice: [good.invoice] })).toBe(false);
    expect(isReusableInvoiceRead({ ...good, lines: { po_item_id: 'p1' } })).toBe(false);
    expect(isReusableInvoiceRead({ ...good, lines: 'p1' })).toBe(false);
    expect(isReusableInvoiceRead({ ...good, lines: [good.lines[0], null] })).toBe(false);
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

describe('E1 selfCheckBlocks (Director 2026-10-10 afternoon: self-check banned)', () => {
  it('blocks the person who received the delivery', () => {
    expect(selfCheckBlocks('u1', 'u1')).toBe(true);
  });
  it('lets anyone else check it', () => {
    expect(selfCheckBlocks('u1', 'u2')).toBe(false);
  });
  it('blocks nothing while the viewer or the receiver is unknown', () => {
    expect(selfCheckBlocks('u1', null)).toBe(false);
    expect(selfCheckBlocks('u1', undefined)).toBe(false);
    expect(selfCheckBlocks(null, 'u1')).toBe(false);
    expect(selfCheckBlocks(undefined, undefined)).toBe(false);
  });
});

describe('M4 linesChangedSinceCheck (skeptic re-check: the lines checked are the lines that post)', () => {
  const line = (over: Record<string, unknown> = {}) => ({
    id: 'gi1',
    accepted_quantity: 4,
    rejected_quantity: 1,
    replacement_required: true,
    is_chemical: false,
    batch_number: 'B1',
    expiry_date: '2027-01-01',
    cost_price: '12.50',
    po_item_id: 'poi1',
    domain_item_id: null,
    domain_posted_at: null,
    item_name: 'Acid',
    ...over,
  });
  it('the same lines, re-read in another order and with numeric strings, have not changed', () => {
    const a = [line(), line({ id: 'gi2' })];
    const b = [line({ id: 'gi2' }), line({ accepted_quantity: '4', cost_price: 12.5 })];
    expect(linesChangedSinceCheck(a, b)).toBe(false);
  });
  it('a line added after the check is a change', () => {
    expect(linesChangedSinceCheck([line()], [line(), line({ id: 'gi9' })])).toBe(true);
  });
  it('a line removed after the check is a change', () => {
    expect(linesChangedSinceCheck([line(), line({ id: 'gi2' })], [line()])).toBe(true);
  });
  it('a line swapped for another of the same count is a change', () => {
    expect(linesChangedSinceCheck([line()], [line({ id: 'gi9' })])).toBe(true);
  });
  it.each([
    ['accepted_quantity', 40],
    ['rejected_quantity', 0],
    ['replacement_required', false],
    ['is_chemical', true],
    ['batch_number', 'B2'],
    ['expiry_date', '2026-10-01'],
    ['cost_price', '99'],
    ['domain_posted_at', '2026-10-09T10:00:00Z'],
  ])('a changed %s is a change', (field, value) => {
    expect(linesChangedSinceCheck([line()], [line({ [field]: value })])).toBe(true);
  });
  it('a field the check does not judge (the item name) is not a change', () => {
    expect(linesChangedSinceCheck([line()], [line({ item_name: 'Acid (500 ml)' })])).toBe(false);
  });
  it('null, undefined and empty are the same blank', () => {
    expect(linesChangedSinceCheck([line({ batch_number: null })], [line({ batch_number: '' })])).toBe(false);
    expect(linesChangedSinceCheck([line({ batch_number: null })], [line({ batch_number: 'B1' })])).toBe(true);
  });
});
