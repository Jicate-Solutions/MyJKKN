/**
 * OneMark — every glyph the fixture papers set must exist in a face we embed.
 * This is the "is it in the bundle?" question for fonts: a developer Mac lends
 * Chromium any missing glyph from a system face, the deployed function has
 * nothing to lend, and the PDF prints a box. Probed 2026-09-04: the embedded
 * Tinos is a 235-glyph latin subset — no Greek, no superscript digits past ³,
 * no √, no combining overline. Anything of that kind must be routed through
 * KaTeX (notation.ts).
 *
 * TWO passes, because the text is set by two font families:
 *   1. BODY — what notation.ts leaves for Tinos ∪ Noto Sans Tamil, INCLUDING
 *      the Tamil case suffix of a token whose other half went to KaTeX
 *      (`10⁻⁵இல்` → `இல்` is body text). Reviewer-B finding: the first version
 *      of this test dropped every KaTeX-routed token before auditing, so the
 *      one string class that actually tofus was invisible to it.
 *   2. KATEX — the visible characters KaTeX's HTML emits for every routed run,
 *      against the KaTeX faces (katex.min.css resets the family to KaTeX_*,
 *      Times New Roman, serif — none of which has a Tamil glyph).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { join } from 'path';
import { bodyFontText, katexFontText } from '@/lib/onemark/pdf/notation';
import { SAMPLE_ENGLISH_PAPER, SAMPLE_PHYSICS_PAPER } from '@/lib/onemark/pdf/samples';
import type { PaperModel } from '@/lib/onemark/pdf/types';

// fontkit is a transitive dependency (@react-pdf/renderer); resolved from the
// repo root so the test does not care which worktree it runs in.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require('fontkit');

const FONT_DIR = join(process.cwd(), 'public', 'fonts', 'pdf');
const FACES = ['tinos-latin-400-normal.woff2', 'tinos-latin-700-normal.woff2', 'noto-sans-tamil-tamil-400-normal.woff2'];
const KATEX_FONT_DIR = join(process.cwd(), 'node_modules', 'katex', 'dist', 'fonts');

/** Whitespace, controls and the characters Chromium never asks a font for. */
const IGNORABLE = /[\s​‌‍﻿]/;

function itemStrings(model: PaperModel): string[] {
  const out: string[] = [];
  for (const it of model.items) {
    out.push(it.stemEn, it.stemTa ?? '', it.explanationEn ?? '', it.explanationTa ?? '', it.directive ?? '', it.topicLabel ?? '');
    for (const o of it.optionsEn) out.push(o.text);
    for (const o of it.optionsTa ?? []) out.push(o.text);
  }
  out.push(model.title, model.facilitatorName ?? '', model.studioName ?? '');
  return out;
}

function missingFrom(text: string, covered: (cp: number) => boolean): string[] {
  const missing = new Set<string>();
  for (const ch of text) {
    if (IGNORABLE.test(ch)) continue;
    if (!covered(ch.codePointAt(0)!)) missing.add(`${ch} U+${ch.codePointAt(0)!.toString(16).toUpperCase()}`);
  }
  return Array.from(missing);
}

describe('embedded font coverage of the fixture papers', () => {
  const bodyFonts = FACES.map((f) => fontkit.openSync(join(FONT_DIR, f)));
  const bodyCovered = (cp: number) => bodyFonts.some((f: any) => f.hasGlyphForCodePoint(cp));

  const katexFonts = readdirSync(KATEX_FONT_DIR)
    .filter((f) => f.endsWith('.woff2'))
    .map((f) => fontkit.openSync(join(KATEX_FONT_DIR, f)));
  const katexCovered = (cp: number) => katexFonts.some((f: any) => f.hasGlyphForCodePoint(cp));

  it('the probes themselves see the known gaps (so a green run means something)', () => {
    expect(bodyCovered('⁻'.codePointAt(0)!)).toBe(false);
    expect(bodyCovered('ε'.codePointAt(0)!)).toBe(false);
    expect(bodyCovered('√'.codePointAt(0)!)).toBe(false);
    expect(bodyCovered('க'.codePointAt(0)!)).toBe(true);
    expect(bodyCovered('°'.codePointAt(0)!)).toBe(true);
    expect(katexFonts.length).toBeGreaterThanOrEqual(20);
    expect(katexCovered('இ'.codePointAt(0)!)).toBe(false); // no KaTeX face has Tamil
    expect(katexCovered('ε'.codePointAt(0)!)).toBe(true);
  });

  it('the body pass reaches the risk: a glued Tamil suffix is audited, not deleted', () => {
    expect(bodyFontText('10⁻⁵இல்')).toBe('இல்');
    expect(bodyFontText('Am⁻¹ஆக')).toBe('ஆக');
    expect(bodyFontText('ε₀ஐ')).toBe('ஐ');
    expect(missingFrom(bodyFontText('10⁻⁵இல்'), bodyCovered)).toEqual([]);
    // And the KaTeX pass would have caught the pre-fix routing.
    expect(missingFrom('இல்', katexCovered)).not.toEqual([]);
  });

  for (const model of [SAMPLE_PHYSICS_PAPER, SAMPLE_ENGLISH_PAPER]) {
    it(`${model.subject}: nothing left for the body fonts to miss`, () => {
      const missing = new Set<string>();
      for (const s of itemStrings(model)) {
        for (const m of missingFrom(bodyFontText(s), bodyCovered)) missing.add(m);
      }
      expect(Array.from(missing)).toEqual([]);
    });

    it(`${model.subject}: nothing handed to KaTeX that its faces cannot set`, () => {
      const missing = new Set<string>();
      for (const s of itemStrings(model)) {
        for (const m of missingFrom(katexFontText(s), katexCovered)) missing.add(m);
      }
      expect(Array.from(missing)).toEqual([]);
    });
  }
});
