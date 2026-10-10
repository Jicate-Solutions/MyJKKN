// lib/procurement/item-name-match.ts
//
// A cheap, deterministic sanity check on an AI match between a requested item
// ("Keyboard") and a quotation line ("POE INJECTOR 48V"). If the two names share
// no meaningful word, the match is never shown as confirmed — a person has to
// look. It cannot prove a match is right (synonyms slip past it), only catch the
// obviously wrong ones, which is exactly the failure that matters: a confident
// wrong price going to the Super Admin.

const STOP = new Set([
  'the', 'and', 'for', 'with', 'set', 'pcs', 'nos', 'box', 'pack', 'each', 'unit', 'units',
  'item', 'items', 'type', 'size', 'new', 'model', 'make', 'brand', 'full', 'high', 'low',
]);

function words(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)) // cameras → camera
    // Short codes with a digit count too: "A4" paper, "M8" bolt.
    .filter((w) => (w.length >= 3 || (w.length === 2 && /\d/.test(w))) && !STOP.has(w));
}

/** True when the two names share at least one meaningful word (either direction, as a prefix). */
export function namesShareAWord(requested: string, quoted: string): boolean {
  const a = words(requested);
  const b = words(quoted);
  if (!a.length || !b.length) return false;
  return a.some((x) => b.some((y) => y.startsWith(x) || x.startsWith(y)));
}

/**
 * Stricter than namesShareAWord: every meaningful word of the requested name is in
 * the quoted one (as a prefix either way). "Molisch Reagent" ← "MOLISCH'S REAGENT
 * 500ML" agrees; "Magnesium sulphate" ← "CUPRIC SULPHATE" does not, nor does
 * "Copper sulphate" ← "Cupric sulphate" (a synonym — the AI's second look settles those).
 */
export function namesAgree(requested: string, quoted: string): boolean {
  const a = words(requested);
  const b = words(quoted);
  if (!a.length || !b.length) return false;
  return a.every((x) => b.some((y) => y.startsWith(x) || x.startsWith(y)));
}

/**
 * How well a catalog name covers a name read from a file, 0..1: the share of the
 * catalog name's meaningful words found in the file's name (prefixes count, so
 * "glove" matches "gloves"). "Nitrile Gloves" vs "Gloves nitrile medium" → 1.
 */
export function nameMatchScore(catalogName: string, fileName: string): number {
  const a = words(catalogName);
  const b = words(fileName);
  if (!a.length || !b.length) return 0;
  const hit = a.filter((x) => b.some((y) => y.startsWith(x) || x.startsWith(y))).length;
  // Penalise a catalog name that only covers a small part of a long file name.
  return (hit / a.length) * Math.min(1, (hit + 1) / b.length);
}
