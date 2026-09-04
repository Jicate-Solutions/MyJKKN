/**
 * OneMark — every glyph the fixture papers set in the BODY fonts must exist in
 * the faces we embed. This is the "is it in the bundle?" question for fonts:
 * a developer Mac lends Chromium any missing glyph from Times New Roman, the
 * deployed function has nothing to lend, and the PDF prints a box. Probed
 * 2026-09-04: the embedded Tinos is a 235-glyph latin subset — no Greek, no
 * superscript digits past ³, no √, no combining overline. Anything of that
 * kind must be routed through KaTeX (notation.ts), and this test proves the
 * fixtures leave nothing behind for the body fonts to miss.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { bodyFontText } from '@/lib/onemark/pdf/notation';
import { SAMPLE_ENGLISH_PAPER, SAMPLE_PHYSICS_PAPER } from '@/lib/onemark/pdf/samples';
import type { PaperModel } from '@/lib/onemark/pdf/types';

// fontkit is a transitive dependency (@react-pdf/renderer); resolved from the
// repo root so the test does not care which worktree it runs in.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require('fontkit');

const FONT_DIR = join(process.cwd(), 'public', 'fonts', 'pdf');
const FACES = ['tinos-latin-400-normal.woff2', 'tinos-latin-700-normal.woff2', 'noto-sans-tamil-tamil-400-normal.woff2'];

/** Whitespace, controls and the characters Chromium never asks a font for. */
const IGNORABLE = /[\s​‌‍﻿]/;

function bodyStrings(model: PaperModel): string[] {
  const out: string[] = [];
  for (const it of model.items) {
    out.push(it.stemEn, it.stemTa ?? '', it.explanationEn ?? '', it.explanationTa ?? '', it.directive ?? '', it.topicLabel ?? '');
    for (const o of it.optionsEn) out.push(o.text);
    for (const o of it.optionsTa ?? []) out.push(o.text);
  }
  out.push(model.title, model.facilitatorName ?? '', model.studioName ?? '');
  return out;
}

describe('embedded font coverage of the fixture papers', () => {
  const fonts = FACES.map((f) => fontkit.openSync(join(FONT_DIR, f)));
  const covered = (cp: number) => fonts.some((f: any) => f.hasGlyphForCodePoint(cp));

  it('the probe itself sees the known gaps (so a green run means something)', () => {
    expect(covered('⁻'.codePointAt(0)!)).toBe(false);
    expect(covered('ε'.codePointAt(0)!)).toBe(false);
    expect(covered('√'.codePointAt(0)!)).toBe(false);
    expect(covered('க'.codePointAt(0)!)).toBe(true);
    expect(covered('°'.codePointAt(0)!)).toBe(true);
  });

  for (const model of [SAMPLE_PHYSICS_PAPER, SAMPLE_ENGLISH_PAPER]) {
    it(`${model.subject}: nothing left for the body fonts to miss`, () => {
      const missing = new Set<string>();
      for (const s of bodyStrings(model)) {
        for (const ch of bodyFontText(s)) {
          if (IGNORABLE.test(ch)) continue;
          if (!covered(ch.codePointAt(0)!)) missing.add(`${ch} U+${ch.codePointAt(0)!.toString(16).toUpperCase()}`);
        }
      }
      expect(Array.from(missing)).toEqual([]);
    });
  }
});
