// __tests__/lib/id-cards/duplex-contract.test.ts
// Duplex pickup contract: hasBackSide() is the single definition of
// "this template has a configured back side" shared by the pickup route's
// has_back field and (semantically) the render route's side=back DARK gate.
// The two MUST agree: has_back=true ⇔ ?side=back renders instead of 404ing
// with back_not_configured.

import { describe, it, expect } from 'vitest';
import { hasBackSide, type IdCardPrintJobPickup } from '@/lib/id-cards/types';

describe('hasBackSide (duplex hint)', () => {
  it('is false for NULL back_layout_json (every prod template by default)', () => {
    expect(hasBackSide(null)).toBe(false);
  });

  it('is false for undefined (column missing from a partial select)', () => {
    expect(hasBackSide(undefined)).toBe(false);
  });

  it('is true for {} — opted in with the default back design', () => {
    expect(hasBackSide({})).toBe(true);
  });

  it('is true for a populated back layout object', () => {
    expect(
      hasBackSide({ show_barcode: false, background_image: 'back.png' })
    ).toBe(true);
  });

  it('matches the render-route gate for odd-but-non-null jsonb shapes', () => {
    // The render route's gate is `=== null || === undefined` — any other
    // jsonb value (array, string, number, boolean) passes it and renders
    // with defaults via parseBackLayout's defenses. The hint must agree so
    // the bridge never fetches a 404 (hint true, render gate closed) and
    // never skips a renderable back (hint false, render gate open).
    expect(hasBackSide([])).toBe(true);
    expect(hasBackSide('')).toBe(true);
    expect(hasBackSide(0)).toBe(true);
    expect(hasBackSide(false)).toBe(true);
  });
});

describe('IdCardPrintJobPickup shape', () => {
  it('is the job row plus has_back (additive — old bridges ignore it)', () => {
    const pickup: IdCardPrintJobPickup = {
      id: 'f2b7f7f0-0000-4000-8000-000000000001',
      profile_id: 'f2b7f7f0-0000-4000-8000-000000000002',
      template_id: 'f2b7f7f0-0000-4000-8000-000000000003',
      status: 'sent_to_agent',
      enqueued_by: 'f2b7f7f0-0000-4000-8000-000000000004',
      enqueued_at: '2026-07-25T00:00:00.000Z',
      picked_up_at: '2026-07-25T00:00:05.000Z',
      result: null,
      has_back: false
    };
    // Compile-time: the assignment above type-checks. Runtime: the duplex
    // hint is a plain boolean field, JSON-serializable as-is.
    expect(typeof pickup.has_back).toBe('boolean');
    expect(JSON.parse(JSON.stringify(pickup)).has_back).toBe(false);
  });
});
