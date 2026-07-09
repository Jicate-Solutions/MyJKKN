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

  it('treats received < ordered as short supply (goods-vs-PO wins over invoice)', () => {
    // Even though invoice == received, the goods fall short of the PO.
    const r = matchLine({ orderedRemaining: 10, invoiceQty: 7, receivedQty: 7 });
    expect(r.match_status).toBe('short');
    expect(r.mismatch_flag).toBe(true);
  });

  it('treats received > ordered as over supply', () => {
    const r = matchLine({ orderedRemaining: 10, invoiceQty: 12, receivedQty: 12 });
    expect(r.match_status).toBe('over');
    expect(r.mismatch_flag).toBe(true);
  });

  it('reports qty_mismatch only when goods match the PO but the invoice disagrees', () => {
    const r = matchLine({ orderedRemaining: 10, invoiceQty: 8, receivedQty: 10 });
    expect(r.match_status).toBe('qty_mismatch');
    expect(r.mismatch_flag).toBe(true);
  });

  it('matches when no invoice is captured and goods equal the PO', () => {
    const r = matchLine({ orderedRemaining: 10, invoiceQty: null, receivedQty: 10 });
    expect(r.match_status).toBe('matched');
    expect(r.mismatch_flag).toBe(false);
  });

  it('absorbs float noise within tolerance', () => {
    const r = matchLine({ orderedRemaining: 10, invoiceQty: 9.9999, receivedQty: 10.0001 });
    expect(r.match_status).toBe('matched');
  });

  it('coerces string/undefined inputs to numbers safely', () => {
    // Service passes NUMERIC columns that PostgREST returns as strings.
    const r = matchLine({ orderedRemaining: 5, invoiceQty: undefined, receivedQty: 5 });
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
