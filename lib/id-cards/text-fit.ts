// ============================================================================
// lib/id-cards/text-fit.ts
// Created: 2026-09-05 — responsive text sizing for the ID-card compositor.
//
// satori (next/og) has no measureText, so the card renders at FIXED font sizes
// and long names / courses / addresses used to be cut with an ellipsis while
// short ones left the card half empty. This module picks, per value, the
// LARGEST font size (≤ preferred) at which the text fits its box — wrapping
// onto extra lines where the box has the height — and only elides when even
// the minimum size cannot hold it.
//
// Width is estimated from an average glyph advance (em per character). The
// ratios are deliberately conservative (uppercase Latin, sans-serif, the
// widest common case) so the estimate errs towards a size that still fits.
// Pure and I/O-free — unit-tested in __tests__/lib/id-cards/text-fit.test.ts.
// ============================================================================

import { truncateAddressForCard, truncateForCard } from './render-data';

/** Average advance per character, in em, for the bundled sans-serif. */
export const CHAR_RATIO_MIXED = 0.56;
export const CHAR_RATIO_UPPER = 0.68;
/** Bold glyphs are a touch wider. */
export const BOLD_RATIO_BONUS = 0.03;
/** Wide tracking (letterSpacing) is added on top by the caller via `extraPerChar`. */

export const DEFAULT_LINE_HEIGHT = 1.2;

export interface FitTextOptions {
  /** Box width in canvas px. */
  maxWidth: number;
  /** Largest size to try (the "ideal" size for the field). */
  maxFontSize: number;
  /** Never go below this — readability floor. */
  minFontSize: number;
  /** Hard cap on lines (default 1 = single line). */
  maxLines?: number;
  /** Box height in canvas px; caps lines to what fits vertically. */
  maxHeight?: number;
  /** Override the glyph-advance estimate (em per character). */
  charRatio?: number;
  /** CSS line-height multiplier used when stacking lines. */
  lineHeight?: number;
  /** Bold text — widens the estimate slightly. */
  bold?: boolean;
  /** Extra px per character (letterSpacing). */
  extraPerChar?: number;
  /** Elide the middle keeping the tail (addresses: district/state/PIN survive). */
  preserveTail?: boolean;
}

export interface FitTextResult {
  fontSize: number;
  /** Lines the text is expected to occupy at that size. */
  lines: number;
  /** Text to draw — identical to the input unless elision was unavoidable. */
  text: string;
  /** True when even the minimum size could not hold the full value. */
  elided: boolean;
  /** Characters per line at the chosen size — handy for tests/callers. */
  charsPerLine: number;
}

/** Whether a string is (almost) all uppercase — drives the width estimate. */
export function looksUppercase(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length === 0) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length >= 0.7;
}

function ratioFor(text: string, opts: FitTextOptions): number {
  const base = opts.charRatio ?? (looksUppercase(text) ? CHAR_RATIO_UPPER : CHAR_RATIO_MIXED);
  return base + (opts.bold ? BOLD_RATIO_BONUS : 0);
}

/** Characters that fit on one line of `width` px at `fontSize`. */
export function charsPerLine(
  width: number,
  fontSize: number,
  ratio: number,
  extraPerChar = 0
): number {
  const advance = fontSize * ratio + extraPerChar;
  if (advance <= 0) return 0;
  return Math.max(1, Math.floor(width / advance));
}

/**
 * Greedy word-wrap line count. A word longer than a line is broken across
 * lines (that is what the browser/satori does with overflow-wrap).
 */
export function countWrappedLines(text: string, perLine: number): number {
  if (perLine <= 0) return Number.POSITIVE_INFINITY;
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return 1;
  let lines = 1;
  let used = 0;
  for (const word of words) {
    if (word.length > perLine) {
      // Fill the rest of the current line, then hard-break the remainder.
      const remaining = used === 0 ? perLine : perLine - used - 1;
      const left = word.length - Math.max(0, remaining);
      lines += Math.ceil(left / perLine);
      used = left % perLine === 0 ? perLine : left % perLine;
      continue;
    }
    if (used === 0) {
      used = word.length;
    } else if (used + 1 + word.length <= perLine) {
      used += 1 + word.length;
    } else {
      lines += 1;
      used = word.length;
    }
  }
  return lines;
}

/**
 * Largest font size in [min, max] at which `text` fits the box, wrapping up
 * to the allowed number of lines. Falls back to elision at the minimum size.
 */
export function fitText(text: string, opts: FitTextOptions): FitTextResult {
  const value = (text ?? '').trim();
  const ratio = ratioFor(value, opts);
  const lineHeight = opts.lineHeight ?? DEFAULT_LINE_HEIGHT;
  const hardMaxLines = Math.max(1, opts.maxLines ?? 1);
  const min = Math.max(1, Math.min(opts.minFontSize, opts.maxFontSize));
  const max = Math.max(min, opts.maxFontSize);

  const allowedLinesAt = (size: number): number => {
    if (opts.maxHeight === undefined) return hardMaxLines;
    const byHeight = Math.floor(opts.maxHeight / (size * lineHeight));
    return Math.max(1, Math.min(hardMaxLines, byHeight));
  };

  if (value === '') {
    return { fontSize: max, lines: 1, text: '', elided: false, charsPerLine: 0 };
  }

  for (let size = max; size >= min; size -= 1) {
    const perLine = charsPerLine(opts.maxWidth, size, ratio, opts.extraPerChar);
    const allowed = allowedLinesAt(size);
    // A size whose line-height alone overflows the box is never acceptable.
    if (opts.maxHeight !== undefined && size * lineHeight > opts.maxHeight && size > min) continue;
    const lines = countWrappedLines(value, perLine);
    if (lines <= allowed) {
      return { fontSize: size, lines, text: value, elided: false, charsPerLine: perLine };
    }
  }

  // Minimum size still overflows: elide to the character budget of the box.
  const perLine = charsPerLine(opts.maxWidth, min, ratio, opts.extraPerChar);
  const allowed = allowedLinesAt(min);
  // Wrapping wastes some of each line at the break — keep a small reserve.
  const budget = Math.max(4, Math.floor(perLine * allowed * (allowed > 1 ? 0.92 : 1)));
  const elidedText = opts.preserveTail
    ? truncateAddressForCard(value, budget)
    : truncateForCard(value, budget);
  return {
    fontSize: min,
    lines: Math.min(allowed, countWrappedLines(elidedText, perLine)),
    text: elidedText,
    elided: true,
    charsPerLine: perLine
  };
}
