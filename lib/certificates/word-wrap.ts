// lib/certificates/word-wrap.ts
// ============================================================================
// Word-style greedy line breaking for certificate paragraphs.
//
// Why not let react-pdf wrap? Its Knuth–Plass breaker is allowed to SHRINK
// inter-word spaces by up to 50% (hard-coded shrinkWhitespaceFactor in
// @react-pdf/layout), so a line that is slightly over-full gets crammed while
// its neighbours are stretched — visibly uneven on a certificate. Word breaks
// greedily and only ever widens spaces. This module reproduces that: it is
// pure (measurement is injected) and unit-tested; the renderer lays each line
// out as a flex row with `space-between` so only the gaps grow.
// ============================================================================

import type { RenderedParagraph } from './wording';

export interface WrapSegment {
  text: string;
  bold?: boolean;
}

/** One word = one or more styled segments with no whitespace inside. */
export type WrapWord = WrapSegment[];

export interface WrapLine {
  words: WrapWord[];
  /** Last line of the paragraph — left-aligned, never stretched (Word behaviour). */
  last: boolean;
}

export type MeasureFn = (text: string, bold: boolean) => number;

/**
 * Split runs into words, keeping bold/plain segments intact within a word.
 * Punctuation glued to a word ("(C24JPGCHE006)," ) stays with it even when the
 * bold run ends mid-word.
 */
export function tokenizeRuns(runs: RenderedParagraph['runs']): WrapWord[] {
  const words: WrapWord[] = [];
  let current: WrapWord = [];
  const flush = () => {
    if (current.length) words.push(current);
    current = [];
  };
  for (const run of runs) {
    const parts = run.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        flush();
        continue;
      }
      const prev = current[current.length - 1];
      if (prev && Boolean(prev.bold) === Boolean(run.bold)) prev.text += part;
      else current.push({ text: part, bold: Boolean(run.bold) });
    }
  }
  flush();
  return words;
}

export function wordWidth(word: WrapWord, measure: MeasureFn): number {
  return word.reduce((w, seg) => w + measure(seg.text, Boolean(seg.bold)), 0);
}

/**
 * Greedy first-fit wrap. `availableWidth` is the full text-block width; the
 * first line is narrowed by `firstLineIndent`. Spaces are measured at their
 * natural width — a line is full when adding the next word would exceed the
 * width, exactly like Word.
 */
export function wrapParagraph(
  runs: RenderedParagraph['runs'],
  opts: { availableWidth: number; firstLineIndent: number; measure: MeasureFn; spaceWidth: number }
): WrapLine[] {
  const words = tokenizeRuns(runs);
  const lines: WrapLine[] = [];
  let line: WrapWord[] = [];
  let lineWidth = 0;

  for (const word of words) {
    const w = wordWidth(word, opts.measure);
    const limit = opts.availableWidth - (lines.length === 0 ? opts.firstLineIndent : 0);
    const candidate = line.length === 0 ? w : lineWidth + opts.spaceWidth + w;
    if (line.length > 0 && candidate > limit) {
      lines.push({ words: line, last: false });
      line = [word];
      lineWidth = w;
    } else {
      line.push(word);
      lineWidth = candidate;
    }
  }
  if (line.length) lines.push({ words: line, last: true });
  if (lines.length) lines[lines.length - 1].last = true;
  return lines;
}
