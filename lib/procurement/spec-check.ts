// lib/procurement/spec-check.ts
//
// Is the vendor offering what the requirement specifies? The name can match while
// the product does not: AR grade asked, LR quoted; 10% asked, 4% quoted; 0.1 N asked,
// 1 N quoted. A cheaper wrong grade wins "Lowest" every time, so a conflict is never
// accepted silently — the line is asked about, with the reason. Pure, deterministic.

// Chemical grades, strongest first. Two different grades on the two sides = conflict.
const GRADES: Array<{ key: string; re: RegExp }> = [
  { key: 'HPLC', re: /\bhplc\b/i },
  { key: 'GC', re: /\bgc\s*grade\b/i },
  { key: 'ACS', re: /\bacs\b/i },
  { key: 'AR', re: /\b(ar|a\.r\.|analytical\s+reagent|analar)\b/i },
  { key: 'GR', re: /\b(gr|g\.r\.|guaranteed\s+reagent)\b/i },
  { key: 'EP', re: /\b(ep|extra\s+pure)\b/i },
  // "Lab reagent" grade, written out in full or short.
  { key: 'LR', re: /\b(lr|l\.r\.|l(?:ab(?:oratory)?)\s+reagent)\b/i },
  { key: 'IP', re: /\b(ip|bp|usp)\b/i },
  { key: 'Commercial', re: /\b(commercial|technical|tech\.?)\s*(grade)?\b/i },
];

/** Every grade named in a piece of text. */
function gradesIn(text: string): Set<string> {
  return new Set(GRADES.filter((g) => g.re.test(text)).map((g) => g.key));
}

// Strengths: "10%", "0.1 N", "4N", "1 M", "0.5M". Not "500 ml" or "4MOL/L".
const STRENGTH_RE = /(\d+(?:\.\d+)?)\s?(%|n|m)(?![a-z])/gi;

/** "N/10" → "0.1 N", "M/20" → "0.05 M": the same strength written the old way. */
const fractional = (text: string) =>
  text.replace(/\b([NM])\s?\/\s?(\d+)\b/gi, (_, u: string, d: string) => `${Math.round((1 / Number(d)) * 1e6) / 1e6} ${u}`);

function strengthsIn(raw: string): Map<string, Set<number>> {
  const text = fractional(raw);
  const out = new Map<string, Set<number>>();
  for (const m of text.matchAll(STRENGTH_RE)) {
    const unit = m[2].toLowerCase();
    const set = out.get(unit) ?? new Set<number>();
    set.add(Number(m[1]));
    out.set(unit, set);
  }
  return out;
}

const UNIT_WORD: Record<string, string> = { '%': '%', n: ' N', m: ' M' };

/**
 * Why the quoted line is NOT what was specified, or null when nothing conflicts.
 * Only conflicts count: a grade or strength mentioned on one side only is not one.
 */
export function specConflict(asked: string | null | undefined, quoted: string | null | undefined): string | null {
  if (!asked?.trim() || !quoted?.trim()) return null;

  const a = gradesIn(asked);
  const q = gradesIn(quoted);
  if (a.size && q.size && ![...a].some((g) => q.has(g))) {
    return `Asked ${[...a].join('/')} grade, quoted ${[...q].join('/')}`;
  }

  const as = strengthsIn(asked);
  const qs = strengthsIn(quoted);
  for (const [unit, wanted] of as) {
    const got = qs.get(unit);
    if (got && ![...wanted].some((w) => got.has(w))) {
      const show = (xs: Set<number>) => [...xs].map((x) => `${x}${UNIT_WORD[unit]}`).join('/');
      return `Asked ${show(wanted)}, quoted ${show(got)}`;
    }
  }
  return null;
}
