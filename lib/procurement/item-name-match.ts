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
