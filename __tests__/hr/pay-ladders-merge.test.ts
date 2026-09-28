/**
 * Year ladders — "Load JKKN reference ladders" merge rules.
 *
 * REFERENCE ONLY (Director ruling 2026-09-18): ladders never change anyone's
 * pay. The merge must only ADD reference ladders whose id is missing; a ladder
 * already stored (possibly hand-edited) is never changed, replaced or moved.
 *
 * Run: npx vitest run __tests__/hr/pay-ladders-merge.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  mergeNotes,
  mergeReferenceLadders,
} from '@/app/(routes)/hr/admin/policies/pay-scales/_components/pay-ladders-section';
import type { PayLadder } from '@/types/hr-pay-ladders';

function ladder(id: string, pays: number[], o: Partial<PayLadder> = {}): PayLadder {
  return {
    id,
    staff_group: 'teaching',
    designation: `Designation ${id}`,
    qualification: null,
    steps: pays.map((basic_pay, i) => ({ label: String(i), basic_pay })),
    note: null,
    source: 'JKKN pay band.xlsx · Sheet1 · 2026-09-18',
    ...o,
  };
}

describe('mergeReferenceLadders', () => {
  it('adds only the reference ladders whose id is missing', () => {
    const current = [ladder('a', [100, 200])];
    const reference = [ladder('a', [999, 999]), ladder('b', [300]), ladder('c', [400])];
    const { merged, added } = mergeReferenceLadders(current, reference);
    expect(added.map((l) => l.id)).toEqual(['b', 'c']);
    expect(merged.map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('never changes or reorders an existing ladder, and never mutates its inputs', () => {
    // Existing ladders in a non-reference order, one hand-edited.
    const current = [
      ladder('z', [50_000, 52_000], { note: 'hand-edited' }),
      ladder('a', [30_000]),
    ];
    const reference = [ladder('a', [31_000]), ladder('m', [40_000]), ladder('z', [1, 2])];
    const currentSnapshot = structuredClone(current);
    const referenceSnapshot = structuredClone(reference);

    const { merged } = mergeReferenceLadders(current, reference);

    expect(merged.slice(0, 2)).toEqual(currentSnapshot);
    expect(merged[0]).toBe(current[0]);
    expect(merged[1]).toBe(current[1]);
    expect(merged.map((l) => l.id)).toEqual(['z', 'a', 'm']);
    expect(current).toEqual(currentSnapshot);
    expect(reference).toEqual(referenceSnapshot);
    expect(merged).not.toBe(current);
  });

  it('lists the already-present reference ladders as skipped', () => {
    const current = [ladder('a', [1]), ladder('b', [2])];
    const reference = [ladder('b', [20]), ladder('c', [30]), ladder('a', [10])];
    const { skipped, added } = mergeReferenceLadders(current, reference);
    expect(skipped.map((l) => l.id)).toEqual(['b', 'a']);
    expect(added.map((l) => l.id)).toEqual(['c']);
  });

  it('merging twice is a no-op', () => {
    const current = [ladder('a', [1])];
    const reference = [ladder('a', [10]), ladder('b', [20])];
    const once = mergeReferenceLadders(current, reference).merged;
    const twice = mergeReferenceLadders(once, reference);
    expect(twice.added).toEqual([]);
    expect(twice.merged).toEqual(once);
    expect(twice.skipped.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('handles empty inputs', () => {
    expect(mergeReferenceLadders([], [])).toEqual({ merged: [], added: [], skipped: [] });
    const ref = [ladder('a', [1])];
    expect(mergeReferenceLadders([], ref).merged).toEqual(ref);
  });

  it('does not add a duplicated reference id twice', () => {
    const { merged, added } = mergeReferenceLadders([], [ladder('a', [1]), ladder('a', [2])]);
    expect(added).toHaveLength(1);
    expect(merged.map((l) => l.id)).toEqual(['a']);
  });
});

describe('mergeNotes', () => {
  it('unions the lists, current order first, without duplicates', () => {
    expect(mergeNotes(['x', 'y'], ['y', 'z', 'x', 'w'])).toEqual(['x', 'y', 'z', 'w']);
  });

  it('dedups within each list too', () => {
    expect(mergeNotes(['a', 'a'], ['b', 'b'])).toEqual(['a', 'b']);
  });

  it('does not mutate its inputs', () => {
    const cur = ['a'];
    const ref = ['b'];
    mergeNotes(cur, ref);
    expect(cur).toEqual(['a']);
    expect(ref).toEqual(['b']);
  });
});
