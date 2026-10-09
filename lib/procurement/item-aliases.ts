// lib/procurement/item-aliases.ts
//
// The quotation reader's memory. Vendors each have their own name for an item —
// "Whatman No.1 125mm" for "Filter paper", "NaOH pellets AR" for "Sodium hydroxide".
// The first time, a person says "yes, that is the item" (or "no"); the answer is kept
// in procurement_item_aliases and every later quote using that name is matched
// without asking. Pure — keys and lookups only, no I/O.

import { nameMatchScore } from '@/lib/procurement/item-name-match';

export interface ItemAlias {
  supplier_id: string;
  quoted_name: string;
  quoted_key: string;
  item_key: string;
  item_name: string;
  same: boolean;
}

// Pack sizes ("100 ml", "500g") are left out of the key: the size is checked on its
// own (pack-size.ts), so "Ninhydrin 100ml" and "Ninhydrin 125 ml" are one name.
const SIZE_RE = /\b\d+(?:\.\d+)?\s?(?:mg|gms?|grm|grams?|g|kgs?|kilo(?:grams?)?|mls?|ltrs?|lt|lit(?:re|er)s?|l)\b/gi;

/** A vendor's line name reduced to what identifies the product. */
export function quotedKey(name: string): string {
  return name
    .toLowerCase()
    .replace(SIZE_RE, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** The requested item: its item-master id when it has one, else its name. */
export function itemKeyOf(item: { item_name: string; domain_item_id?: string | null }): string {
  return item.domain_item_id ? `item:${item.domain_item_id}` : `name:${quotedKey(item.item_name)}`;
}

/**
 * What the memory says about this vendor line and this requested item:
 * true = a person confirmed it is the item, false = a person said it is not,
 * null = never answered. This vendor's answer wins over another vendor's
 * (brand names are shared between dealers, so another dealer's answer still counts).
 */
export function recall(
  aliases: ItemAlias[],
  supplierId: string | null,
  lineName: string,
  itemKey: string,
): boolean | null {
  return recallKey(aliases, supplierId, quotedKey(lineName), itemKey);
}

/**
 * A vendor's catalogue code as a memory key ("code:106498"). Steadier than a name:
 * the same vendor prints the same code on every quotation, however the name is spelt.
 */
export function codeKey(code: string | null | undefined): string {
  const c = (code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return c.length >= 3 ? `code:${c}` : '';
}

/** recall() for a key already made (quotedKey or codeKey). */
export function recallKey(
  aliases: ItemAlias[],
  supplierId: string | null,
  key: string,
  itemKey: string,
): boolean | null {
  if (!key) return null;
  const hits = aliases.filter((a) => a.quoted_key === key && a.item_key === itemKey);
  const own = supplierId ? hits.find((a) => a.supplier_id === supplierId) : undefined;
  if (own) return own.same;
  if (hits.some((a) => !a.same)) return null; // dealers disagree — ask
  return hits.length ? true : null;
}

/** The requested item a remembered name belongs to (only "yes" answers), or null. */
export function recallItem(
  aliases: ItemAlias[],
  supplierId: string | null,
  lineName: string,
  itemKeys: string[],
): string | null {
  for (const k of itemKeys) if (recall(aliases, supplierId, lineName, k) === true) return k;
  return null;
}

/**
 * The best line for a requested item by name alone, when the AI gave none:
 * the highest word-overlap score, not merely the first line sharing a word —
 * "Sodium hydroxide" must not land on "Sodium chloride" because it comes first.
 */
export function bestNameGuess<T extends { name: string }>(
  itemName: string,
  lines: T[],
  // 0.5 is "half the words" — Sodium hydroxide vs Sodium chloride. Needs more than that.
  minScore = 0.6,
): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const l of lines) {
    const s = nameMatchScore(itemName, l.name);
    if (s > bestScore) {
      best = l;
      bestScore = s;
    }
  }
  return bestScore >= minScore ? best : null;
}

/** Example names a person already confirmed for an item — shown to the AI as hints. */
export function knownNamesFor(aliases: ItemAlias[], itemKey: string, max = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of aliases) {
    if (!a.same || a.item_key !== itemKey || seen.has(a.quoted_key)) continue;
    seen.add(a.quoted_key);
    out.push(a.quoted_name);
    if (out.length >= max) break;
  }
  return out;
}
