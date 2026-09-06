// File: lib/onemark/pdf/layout.ts
//
// OneMark — the three data-driven decisions the paper renderer makes before
// a single glyph is set:
//
//   1. Option layout (PRD Physics §4.3 / English §4.5): inline_4, inline_2x2 or
//      stacked, from fp_items.option_layout — `auto` is decided here from the
//      longest option and the assertion_set tag. Never eyeballed.
//   2. Series arrangement (decision 16): A prints the Senior Learner's own
//      order and lettering; B–D reorder items and re-letter options from a
//      seed of assessment id + series letter, so the same paper prints the
//      same series every time and the answer key always matches.
//   3. Grouped directives (PRD English §4.2 / §5.2): consecutive items under
//      one directive collapse to a single heading above the first of them.

import type {
  ArrangedItem,
  ArrangedPaper,
  DirectiveRun,
  PaperItem,
  PaperModel,
  PaperOption,
  PaperSeries,
  ResolvedOptionLayout,
} from './types';
import type { OneMarkOptionLayout } from '@/types/onemark';
import { isTamilRunChar, tamilRunWidthChars } from './fonts';

/** Longest option above this → one option per line (PRD Physics §4.3 "~40"). */
export const STACKED_THRESHOLD = 40;
/** Longest option above this → two rows of two (PRD English §4.5 "~15"). */
export const TWO_BY_TWO_THRESHOLD = 15;

/**
 * Width of a Tamil run in Latin-character equivalents when the embedded faces
 * cannot be measured: Noto Sans Tamil sets ~1.7 Tinos lowercase letters per
 * code point (அதிபரவளையம் = 11 code points, measured 18.9). Only the fallback.
 */
export const TAMIL_FALLBACK_WIDTH_PER_CODEPOINT = 1.7;

/**
 * Text length as the reader sees it, in the PRD's unit — Latin characters.
 * TeX/markup stripped; Latin and notation counted per code point; a TAMIL run
 * measured in the embedded Noto Sans Tamil and converted with the Tinos
 * lowercase average (fonts.ts), because Tamil sets far wider per code point
 * and the board prints both language blocks in the SAME grid. Reviewer
 * finding, PR #3276 round 2: Q11's (இ) அதிபரவளையம் overflowed an inline_4
 * classified from "a hyperbola".
 */
export function visibleWidthChars(text: string): number {
  const stripped = text
    .replace(/\$[^$]+\$/g, (m) => m.slice(1, -1))
    .replace(/<\/?u>/gi, '')
    .replace(/\\[a-zA-Z]+/g, 'x');
  let width = 0;
  let tamil = '';
  const flushTamil = () => {
    if (!tamil) return;
    const measured = tamilRunWidthChars(tamil);
    width += measured ?? Array.from(tamil).length * TAMIL_FALLBACK_WIDTH_PER_CODEPOINT;
    tamil = '';
  };
  for (const ch of Array.from(stripped)) {
    if (isTamilRunChar(ch)) {
      tamil += ch;
      continue;
    }
    flushTamil();
    width += 1;
  }
  flushTamil();
  return width;
}

/** Both language blocks print under ONE layout class, so the longest option
 *  in EITHER language decides it. */
export function classifyOptionLayout(
  declared: OneMarkOptionLayout | null | undefined,
  options: PaperOption[],
  tags: string[],
  optionsTa?: PaperOption[] | null,
): ResolvedOptionLayout {
  if (declared && declared !== 'auto') return declared;
  if (tags.includes('assertion_set')) return 'stacked';
  const all = [...options, ...(optionsTa ?? [])];
  const longest = all.reduce((max, o) => Math.max(max, visibleWidthChars(o.text ?? '')), 0);
  if (longest > STACKED_THRESHOLD) return 'stacked';
  if (longest > TWO_BY_TWO_THRESHOLD) return 'inline_2x2';
  return 'inline_4';
}

/** FNV-1a over the seed string — stable across Node versions and platforms. */
export function seriesSeed(assessmentId: string, series: PaperSeries): number {
  const s = `${assessmentId}:${series}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, deterministic, good enough to shuffle 20 questions. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rand: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Options that name their siblings cannot be re-lettered: "All of the above"
 * must stay last, "Both (a) and (b)" must keep (a) and (b) where they are.
 * Such an item keeps its canonical option order in every series.
 */
const PINNED_OPTION = /\b(all|none|both)\s+of\s+(the\s+above|these|the\s+given)\b|\(\s*[a-dஅஆஇஈ]\s*\)|மேற்கண்ட|இவை\s*அனைத்தும்|எதுவும்\s*இல்லை/i;

export function optionsArePinned(item: PaperItem): boolean {
  const all = [...item.optionsEn, ...(item.optionsTa ?? [])];
  return all.some((o) => PINNED_OPTION.test(o.text ?? ''));
}

/**
 * Split the item list into segments that may be shuffled internally but never
 * across each other: a run of items under one grouped directive is a segment,
 * and the free items between/after runs are segments. Keeps Q1–3 synonyms in
 * Q1–3 for every series (decision 15's board shape survives decision 16).
 */
function segments(items: PaperItem[]): PaperItem[][] {
  const out: PaperItem[][] = [];
  let current: PaperItem[] = [];
  let currentDirective: string | null | undefined = undefined;
  for (const item of items) {
    const d = item.directive ?? null;
    if (currentDirective === undefined || d !== currentDirective) {
      if (current.length) out.push(current);
      current = [];
      currentDirective = d;
    }
    current.push(item);
  }
  if (current.length) out.push(current);
  return out;
}

export function arrangeForSeries(model: PaperModel, series: PaperSeries): ArrangedPaper {
  // position, then id: two items on one position (nothing in the schema forbids
  // it) must still order the same way for the paper and, in a separate
  // request, its key.
  const ordered = model.items
    .slice()
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let itemOrder: PaperItem[];
  let rand: (() => number) | null = null;

  if (series === 'A') {
    itemOrder = ordered;
  } else {
    rand = mulberry32(seriesSeed(model.assessmentId, series));
    const r = rand;
    itemOrder = segments(ordered).flatMap((seg) => (seg.length > 1 ? shuffled(seg, r) : seg));
  }

  const items: ArrangedItem[] = itemOrder.map((item, idx) => {
    const n = item.optionsEn.length;
    const identity = Array.from({ length: n }, (_, i) => i);
    let optionOrder = identity;
    if (rand && n > 1 && !optionsArePinned(item)) {
      optionOrder = shuffled(identity, rand);
    }
    return {
      item,
      number: idx + 1,
      optionOrder,
      layout: classifyOptionLayout(item.optionLayout, item.optionsEn, item.tags, item.optionsTa),
    };
  });

  return { model, series, items };
}

/** Where the arranged paper's answer sits after re-lettering, as a printed
 *  option key (`a`–`d`). Null when the item carries no key or the key does not
 *  match any option. */
export function printedAnswerKey(arranged: ArrangedItem, optionKeys: string[]): string | null {
  const canonical = arranged.item.answerKey;
  if (!canonical) return null;
  const canonicalIndex = arranged.item.optionsEn.findIndex(
    (o) => (o.key ?? '').toLowerCase() === canonical.toLowerCase(),
  );
  if (canonicalIndex < 0) return null;
  const printedIndex = arranged.optionOrder.indexOf(canonicalIndex);
  if (printedIndex < 0) return null;
  return optionKeys[printedIndex] ?? null;
}

export function directiveRuns(items: ArrangedItem[]): DirectiveRun[] {
  const runs: DirectiveRun[] = [];
  for (let i = 0; i < items.length; i++) {
    const d = items[i].item.directive;
    if (!d) continue;
    const last = runs[runs.length - 1];
    if (last && last.directive === d && last.to === i - 1) {
      last.to = i;
    } else {
      runs.push({ directive: d, from: i, to: i });
    }
  }
  return runs;
}

/** Option codes per script (PRD Physics §5.2: derived at render time, never stored). */
export const OPTION_KEYS_EN = ['a', 'b', 'c', 'd', 'e', 'f'];
export const OPTION_KEYS_TA = ['அ', 'ஆ', 'இ', 'ஈ', 'உ', 'ஊ'];
