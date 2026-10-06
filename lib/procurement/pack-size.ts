// lib/procurement/pack-size.ts
//
// What a price is FOR. A request says "Molisch Reagent × 1" with "500 ml" in its
// specification; a vendor prints "Molisch Reagent 100 ml — ₹135". Taken as-is,
// ₹135 is compared against other vendors' 500 ml prices and wins as "lowest".
//
// These helpers read the pack out of free text ("500 g", "125ml", "2.5 L") and
// say how the quoted pack relates to the requested one, so the quotation review
// can scale a price to the requested pack — or stop and ask a person when the two
// can't be compared (a 500 ml solution quoted for 500 g of the solid).

export type PackDim = 'mass' | 'volume';

export interface Pack {
  dim: PackDim;
  /** In grams (mass) or millilitres (volume). */
  base: number;
  /** As a person reads it: "500 g", "2.5 L". */
  label: string;
}

const UNITS: Record<string, { dim: PackDim; factor: number; show: string }> = {
  mg: { dim: 'mass', factor: 0.001, show: 'mg' },
  g: { dim: 'mass', factor: 1, show: 'g' },
  gm: { dim: 'mass', factor: 1, show: 'g' },
  gms: { dim: 'mass', factor: 1, show: 'g' },
  grm: { dim: 'mass', factor: 1, show: 'g' },
  gram: { dim: 'mass', factor: 1, show: 'g' },
  grams: { dim: 'mass', factor: 1, show: 'g' },
  kg: { dim: 'mass', factor: 1000, show: 'kg' },
  kgs: { dim: 'mass', factor: 1000, show: 'kg' },
  kilo: { dim: 'mass', factor: 1000, show: 'kg' },
  kilogram: { dim: 'mass', factor: 1000, show: 'kg' },
  kilograms: { dim: 'mass', factor: 1000, show: 'kg' },
  ml: { dim: 'volume', factor: 1, show: 'ml' },
  mls: { dim: 'volume', factor: 1, show: 'ml' },
  l: { dim: 'volume', factor: 1000, show: 'L' },
  lt: { dim: 'volume', factor: 1000, show: 'L' },
  ltr: { dim: 'volume', factor: 1000, show: 'L' },
  ltrs: { dim: 'volume', factor: 1000, show: 'L' },
  litre: { dim: 'volume', factor: 1000, show: 'L' },
  litres: { dim: 'volume', factor: 1000, show: 'L' },
  liter: { dim: 'volume', factor: 1000, show: 'L' },
  liters: { dim: 'volume', factor: 1000, show: 'L' },
};

// A number glued to (or one space from) a unit word. "0.1N", "10%", "4MOL/L" never
// match: N and % aren't units here, and "MOL/L" has no number in front of the L.
const PACK_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s?(${Object.keys(UNITS).sort((a, b) => b.length - a.length).join('|')})(?![a-z])`, 'gi');

/** The pack in a piece of text — the LAST one, since sizes are usually written after the grade. */
export function parsePack(text: string | null | undefined): Pack | null {
  if (!text) return null;
  let last: Pack | null = null;
  for (const m of text.matchAll(PACK_RE)) {
    const n = Number(m[1]);
    const u = UNITS[m[2].toLowerCase()];
    if (!u || !(n > 0)) continue;
    last = { dim: u.dim, base: n * u.factor, label: `${m[1]} ${u.show}` };
  }
  return last;
}

/** True when the unit the item is counted in is itself a weight or volume (g, ml, kg…). */
export function isMeasuredUnit(unitLabel: string | null | undefined): boolean {
  return !!unitLabel && !!UNITS[unitLabel.trim().toLowerCase()];
}

/**
 * What to print after a quantity: "× 500 ml" when the quantity counts packs
 * (unit "ml"/"g" or none, pack in the specification), else the unit itself.
 * Without this, "1" bottle of 500 ml reads as "1 ml".
 */
export function packOrUnit(item: { unit_label?: string | null; item_spec?: string | null }): string {
  const unit = item.unit_label?.trim() ?? '';
  const pack = parsePack(item.item_spec);
  if (pack && (!unit || isMeasuredUnit(unit))) return `× ${pack.label}`;
  return unit;
}

/** "2 × 500 ml", "10 Nos", "5". */
export function qtyWithPack(
  qty: number | string,
  item: { unit_label?: string | null; item_spec?: string | null },
): string {
  const suffix = packOrUnit(item);
  return suffix ? `${Number(qty)} ${suffix}` : String(Number(qty));
}

/** The pack one unit of a requested item stands for: from its specification, else its name. */
export function requestedPack(item: { item_name: string; item_spec?: string | null }): Pack | null {
  return parsePack(item.item_spec) ?? parsePack(item.item_name);
}

export type PackCheck =
  /** Nothing to compare — no pack on one side. The price stands as quoted. */
  | { kind: 'unknown' }
  /** Same pack. */
  | { kind: 'same' }
  /** Same kind of measure, different size: the price is multiplied by `factor`. */
  | { kind: 'scaled'; factor: number }
  /** Can't be put on the same footing — a person must look. */
  | { kind: 'mismatch'; reason: string };

/**
 * How a quoted pack relates to the requested one.
 *
 * Scaling is only safe for things bought by weight or volume (chemicals,
 * reagents). A 125 ml bottle is not a quarter of a 500 ml bottle — so for a
 * counted item a different size is a mismatch, never a scaled price.
 */
export function comparePacks(
  requested: Pack | null,
  quoted: Pack | null,
  opts: { soldByMeasure: boolean },
): PackCheck {
  if (!requested || !quoted) return { kind: 'unknown' };
  if (requested.dim !== quoted.dim) {
    return {
      kind: 'mismatch',
      reason: `Asked ${requested.label}, quoted ${quoted.label} — ${requested.dim === 'mass' ? 'solid' : 'liquid'} vs ${quoted.dim === 'mass' ? 'solid' : 'liquid'}`,
    };
  }
  const factor = requested.base / quoted.base;
  if (Math.abs(factor - 1) < 1e-9) return { kind: 'same' };
  if (!opts.soldByMeasure) {
    return { kind: 'mismatch', reason: `Asked ${requested.label}, quoted ${quoted.label}` };
  }
  // A 1000× gap is a misread (a line total, a unit typo), not a pack size.
  if (factor > 100 || factor < 0.01) {
    return { kind: 'mismatch', reason: `Asked ${requested.label}, quoted ${quoted.label} — please check` };
  }
  return { kind: 'scaled', factor: Math.round(factor * 1e6) / 1e6 };
}
