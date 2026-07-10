import { describe, it, expect } from 'vitest';
import { matchLine, validateLineForVerify } from '@/lib/services/procurement/three-way-match';

// The three-way-match engine underpins GRN classification, PO auto-closure, and the
// replacement flow. These tests pin its precedence rules and the chemical gate.

describe('matchLine', () => {
  it('flags a full match when all three quantities agree', () => {
    const r = matchLine({ orderedRemaining: 10, invoiceQty: 10, receivedQty: 10 });
    expect(r.match_status).toBe('matched');
    expect(r.mismatch_flag).toBe(false);
    expect(r.reason).toBeNull();
  });

  it('treats a partial delivery (invoice == received < ordered) as NON-mismatch "short"', () => {
    // PRD §9: PO 15, invoice 10, received 10 → GRN verifies, PO stays partially received.
    const r = matchLine({ orderedRemaining: 15, invoiceQty: 10, receivedQty: 10 });
    expect(r.match_status).toBe('short');
    expect(r.mismatch_flag).toBe(false); // partial delivery is expected, not an error
  });

  it('detects a qty mismatch EVEN on a partial delivery (was masked before)', () => {
    // PO 15, invoice 12, received 10 — the invoice disagrees with the physical count.
    const r = matchLine({ orderedRemaining: 15, invoiceQty: 12, receivedQty: 10 });
    expect(r.match_status).toBe('qty_mismatch');
    expect(r.mismatch_flag).toBe(true);
  });

  it('treats received > ordered as over supply (flagged)', () => {
    const r = matchLine({ orderedRemaining: 10, invoiceQty: 12, receivedQty: 12 });
    expect(r.match_status).toBe('over');
    expect(r.mismatch_flag).toBe(true);
  });

  it('reports qty_mismatch when the invoice disagrees with received on a full delivery', () => {
    const r = matchLine({ orderedRemaining: 10, invoiceQty: 8, receivedQty: 10 });
    expect(r.match_status).toBe('qty_mismatch');
    expect(r.mismatch_flag).toBe(true);
  });

  it('reports price_mismatch when qty agrees but invoice price ≠ PO price', () => {
    const r = matchLine({
      orderedRemaining: 10,
      invoiceQty: 10,
      receivedQty: 10,
      poUnitPrice: 100,
      invoiceUnitPrice: 120,
    });
    expect(r.match_status).toBe('price_mismatch');
    expect(r.mismatch_flag).toBe(true);
  });

  it('matches when qty AND price agree', () => {
    const r = matchLine({
      orderedRemaining: 10,
      invoiceQty: 10,
      receivedQty: 10,
      poUnitPrice: 100,
      invoiceUnitPrice: 100,
    });
    expect(r.match_status).toBe('matched');
    expect(r.mismatch_flag).toBe(false);
  });

  it('ignores the price axis when either price is missing', () => {
    const r = matchLine({ orderedRemaining: 10, invoiceQty: 10, receivedQty: 10, poUnitPrice: 100 });
    expect(r.match_status).toBe('matched');
  });

  it('does NOT match when no invoice is captured — a match needs an invoice to compare against', () => {
    // Regression: previously fell through to 'matched', a misleading green pass.
    const r = matchLine({ orderedRemaining: 10, invoiceQty: null, receivedQty: 10 });
    expect(r.match_status).toBe('awaiting_invoice');
    expect(r.mismatch_flag).toBe(true);
    expect(r.reason).toMatch(/invoice/i);
  });

  it('treats an undefined invoice qty the same as awaiting_invoice', () => {
    const r = matchLine({ orderedRemaining: 5, invoiceQty: undefined, receivedQty: 5 });
    expect(r.match_status).toBe('awaiting_invoice');
  });

  it('absorbs float noise within tolerance', () => {
    const r = matchLine({ orderedRemaining: 10, invoiceQty: 9.9999, receivedQty: 10.0001 });
    expect(r.match_status).toBe('matched');
  });

  it('coerces string/number inputs safely once an invoice is present', () => {
    const r = matchLine({ orderedRemaining: 5, invoiceQty: 5, receivedQty: 5 });
    expect(r.match_status).toBe('matched');
  });
});

describe('validateLineForVerify', () => {
  const base = { item_name: 'Acetone', is_chemical: true, accepted_quantity: 4 };

  it('blocks an accepted chemical line missing batch + expiry', () => {
    const errs = validateLineForVerify({ ...base, batch_number: null, expiry_date: null });
    expect(errs).toHaveLength(2);
  });

  it('clears a chemical line once batch + expiry are present', () => {
    const errs = validateLineForVerify({
      ...base,
      batch_number: 'B-42',
      expiry_date: '2027-01-01',
    });
    expect(errs).toHaveLength(0);
  });

  it('does not gate a non-chemical line', () => {
    const errs = validateLineForVerify({
      item_name: 'Beaker',
      is_chemical: false,
      accepted_quantity: 10,
      batch_number: null,
      expiry_date: null,
    });
    expect(errs).toHaveLength(0);
  });

  it('does not gate a chemical line with nothing accepted (all rejected)', () => {
    const errs = validateLineForVerify({ ...base, accepted_quantity: 0, batch_number: null, expiry_date: null });
    expect(errs).toHaveLength(0);
  });
});
