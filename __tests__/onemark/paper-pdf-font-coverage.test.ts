/**
 * OneMark — every glyph the paper sets must exist in a face we embed.
 * This is the "is it in the bundle?" question for fonts: a developer Mac lends
 * Chromium any missing glyph from a system face, the deployed function has
 * nothing to lend, and the PDF prints a box. Probed 2026-09-04: the embedded
 * Tinos is a 233-code-point latin subset — no Greek, no superscript digits
 * past ³, no √, no combining overline, no ∴ ⊥ ∠ ∂. Anything of that kind must
 * be routed through KaTeX (notation.ts).
 *
 * THREE audits, because two earlier versions of this file were green and blind:
 *   1. BODY — what notation.ts leaves for Tinos ∪ Noto Sans Tamil, INCLUDING
 *      the Tamil case suffix of a token whose other half went to KaTeX
 *      (`10⁻⁵இல்` → `இல்` is body text). Round-1 finding: the first version
 *      dropped every KaTeX-routed token before auditing.
 *   2. KATEX — the visible characters KaTeX's HTML emits for every routed run,
 *      against the face katex.min.css binds to that leaf's class (`.mathnormal`
 *      is KaTeX_Math and nothing else; a class-less leaf inherits the `.katex`
 *      chain styles.ts sets: KaTeX_Main → Tinos → Noto Sans Tamil).
 *   3. THE WHOLE REPERTOIRE — not just the fixtures. Round-2 finding: the
 *      routing trigger was a typed list, so ∴ ⊥ ⇌ ℃ n̂ v⃗ fell to the body
 *      fonts and the fixture-only audit could not see it. Now every code
 *      point of every notation range is pushed through the pipeline, alone
 *      and glued to a Tamil suffix, and the audit asserts the pipeline's own
 *      report (uncoveredGlyphs) is exactly what the cmaps say would box.
 *
 * The cmaps used here are read from the .woff2 files on disk with fontkit —
 * an INDEPENDENT probe of the same bytes fonts.ts decodes out of the data:
 * URIs, so a divergence between the two would fail the cross-check below.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { join } from 'path';
import {
  NOTATION_REPERTOIRE_RANGES,
  bodyFontText,
  charNeedsKatex,
  itemTextToHtml,
  katexFontText,
  katexLeafRuns,
  paperGlyphGaps,
  segmentItemText,
  uncoveredGlyphs,
} from '@/lib/onemark/pdf/notation';
import {
  bodyFontCovers,
  fontCoverageKnown,
  katexAnyFaceCovers,
  katexFamilies,
  katexFamiliesForClasses,
} from '@/lib/onemark/pdf/fonts';
import { SAMPLE_ENGLISH_PAPER, SAMPLE_PHYSICS_PAPER } from '@/lib/onemark/pdf/samples';
import type { PaperModel } from '@/lib/onemark/pdf/types';

// fontkit is a transitive dependency (@react-pdf/renderer); resolved from the
// repo root so the test does not care which worktree it runs in.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require('fontkit');

const FONT_DIR = join(process.cwd(), 'public', 'fonts', 'pdf');
const KATEX_FONT_DIR = join(process.cwd(), 'node_modules', 'katex', 'dist', 'fonts');

/** Whitespace, controls and the characters Chromium never asks a font for. */
const IGNORABLE = new RegExp(`[\\s${String.fromCodePoint(0xa0)}${String.fromCodePoint(0xad)}${String.fromCodePoint(0x200b)}-${String.fromCodePoint(0x200d)}${String.fromCodePoint(0x2060)}${String.fromCodePoint(0xfeff)}]`);

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
    if (!covered(ch.codePointAt(0)!)) missing.add(`${ch} U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`);
  }
  return Array.from(missing);
}

describe('embedded font coverage', () => {
  const bodyFonts = readdirSync(FONT_DIR)
    .filter((f) => f.endsWith('.woff2'))
    .map((f) => fontkit.openSync(join(FONT_DIR, f)));
  const bodyCovered = (cp: number) => bodyFonts.some((f: any) => f.hasGlyphForCodePoint(cp));

  const katexFonts = new Map<string, any[]>();
  for (const f of readdirSync(KATEX_FONT_DIR).filter((f) => f.endsWith('.woff2'))) {
    const family = f.replace(/-[A-Za-z]+\.woff2$/, '');
    katexFonts.set(family, [...(katexFonts.get(family) ?? []), fontkit.openSync(join(KATEX_FONT_DIR, f))]);
  }
  const katexAnyCovered = (cp: number) => Array.from(katexFonts.values()).some((fs) => fs.some((f) => f.hasGlyphForCodePoint(cp)));
  const katexFamilyCovered = (family: string, cp: number) => (katexFonts.get(family) ?? []).some((f) => f.hasGlyphForCodePoint(cp));

  it('the probes themselves see the known gaps (so a green run means something)', () => {
    expect(bodyFonts.length).toBe(6);
    expect(bodyCovered('⁻'.codePointAt(0)!)).toBe(false);
    expect(bodyCovered('ε'.codePointAt(0)!)).toBe(false);
    expect(bodyCovered('√'.codePointAt(0)!)).toBe(false);
    expect(bodyCovered('∴'.codePointAt(0)!)).toBe(false);
    expect(bodyCovered('க'.codePointAt(0)!)).toBe(true);
    expect(bodyCovered('°'.codePointAt(0)!)).toBe(true);
    expect(katexFonts.size).toBeGreaterThanOrEqual(10);
    expect(katexAnyCovered('இ'.codePointAt(0)!)).toBe(false); // no KaTeX face has Tamil
    expect(katexAnyCovered('ε'.codePointAt(0)!)).toBe(true);
    expect(katexFamilyCovered('KaTeX_AMS', '∴'.codePointAt(0)!)).toBe(true);
    expect(katexFamilyCovered('KaTeX_Math', '∴'.codePointAt(0)!)).toBe(false); // class-bound face matters
  });

  it('fonts.ts decodes the SAME cmaps out of the data: URIs the paper embeds', () => {
    expect(fontCoverageKnown()).toBe(true);
    expect(katexFamilies().sort()).toEqual(Array.from(katexFonts.keys()).sort());
    let checked = 0;
    for (const [a, b] of NOTATION_REPERTOIRE_RANGES) {
      for (let cp = a; cp <= b; cp++) {
        expect(bodyFontCovers(cp), `body U+${cp.toString(16)}`).toBe(bodyCovered(cp));
        expect(katexAnyFaceCovers(cp), `katex U+${cp.toString(16)}`).toBe(katexAnyCovered(cp));
        checked += 1;
      }
    }
    for (let cp = 0x0b80; cp <= 0x0bff; cp++) {
      expect(bodyFontCovers(cp), `tamil U+${cp.toString(16)}`).toBe(bodyCovered(cp));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(1500);
  });

  it('the body pass reaches the risk: a glued Tamil suffix is audited, not deleted', () => {
    expect(bodyFontText('10⁻⁵இல்')).toBe('இல்');
    expect(bodyFontText('Am⁻¹ஆக')).toBe('ஆக');
    expect(bodyFontText('ε₀ஐ')).toBe('ஐ');
    expect(missingFrom(bodyFontText('10⁻⁵இல்'), bodyCovered)).toEqual([]);
    // And the KaTeX pass would have caught the pre-fix routing.
    expect(missingFrom('இல்', katexAnyCovered)).not.toEqual([]);
  });

  it("the trigger is the cmap: the reviewer's probe stem reaches KaTeX and prints from embedded faces only", () => {
    const stem = '∴ the resultant is ⊥ to B and the reaction is ⇌ at 25℃, with ∠AOB = 60° and ∂v/∂t ⋅ n̂ ≃ 0.';
    // Round-2 receipt: katexFontText() was '' and bodyFontText() was the whole stem.
    expect(katexFontText(stem)).not.toBe('');
    expect(missingFrom(bodyFontText(stem), bodyCovered)).toEqual([]);
    // Every KaTeX leaf, checked against the face its CLASS binds it to.
    for (const seg of segmentItemText(stem)) {
      if (seg.kind !== 'tex') continue;
      for (const run of katexLeafRuns(itemTextToHtml(`$${seg.value}$`))) {
        const { katex, thenBody } = katexFamiliesForClasses(run.classes.slice().reverse());
        for (const ch of run.text) {
          if (IGNORABLE.test(ch)) continue;
          const cp = ch.codePointAt(0)!;
          const ok = katex.some((fam) => katexFamilyCovered(fam, cp)) || (thenBody && bodyCovered(cp));
          expect(ok, `${ch} U+${cp.toString(16)} in ${run.classes.join('.')}`).toBe(true);
        }
      }
    }
    expect(uncoveredGlyphs(stem)).toEqual([]);
  });

  it('every code point of every notation range: the pipeline report equals what the cmaps say would box', () => {
    // For each code point, alone and glued to a Tamil suffix (the round-1
    // shape), place it the way the renderer will and check the placement
    // against the on-disk cmaps. uncoveredGlyphs() must name EXACTLY the
    // characters that fail — nothing more (a false alarm blocks a paper) and
    // nothing less (a miss prints a box).
    let audited = 0;
    const falseAlarms: string[] = [];
    const misses: string[] = [];
    for (const [a, b] of NOTATION_REPERTOIRE_RANGES) {
      for (let cp = a; cp <= b; cp++) {
        const ch = String.fromCodePoint(cp);
        if (IGNORABLE.test(ch) || /[\x00-\x1f\x7f]/.test(ch)) continue;
        for (const text of [ch, `10⁻⁵${ch}இல்`, `x ${ch}y`]) {
          const truth = new Set<string>();
          for (const seg of segmentItemText(text)) {
            if (seg.kind === 'text') {
              for (const c of seg.value) if (!IGNORABLE.test(c) && !bodyCovered(c.codePointAt(0)!)) truth.add(c);
            } else if (seg.kind === 'tex') {
              const html = itemTextToHtml(`$${seg.value}$`);
              if (html.startsWith('<span class="tex-error">')) {
                for (const c of seg.value) if (!IGNORABLE.test(c) && !bodyCovered(c.codePointAt(0)!)) truth.add(c);
                continue;
              }
              for (const run of katexLeafRuns(html)) {
                const { katex, thenBody } = katexFamiliesForClasses(run.classes.slice().reverse());
                for (const c of run.text) {
                  if (IGNORABLE.test(c)) continue;
                  const k = c.codePointAt(0)!;
                  if (!(katex.some((fam) => katexFamilyCovered(fam, k)) || (thenBody && bodyCovered(k)))) truth.add(c);
                }
              }
            }
          }
          const reported = new Set(uncoveredGlyphs(text).map((g) => g.slice(0, g.indexOf(' '))));
          for (const c of reported) if (!truth.has(c)) falseAlarms.push(`${text} → ${c}`);
          for (const c of truth) if (!reported.has(c)) misses.push(`${text} → ${c}`);
          audited += 1;
        }
      }
    }
    expect(audited).toBeGreaterThan(3000);
    expect(misses).toEqual([]);
    expect(falseAlarms).toEqual([]);
  });

  it('the notation the PRD §4.1 / §5.2 / A.3 inventory and the review probes name is never uncovered', () => {
    const inventory = [
      'A̅ + B̅ + C̅', '⁷₃Li', 'N₀/√2', '½T½', 'Am⁻¹', 'NC⁻¹', '1.0 × 10⁻⁵', '1.0×10⁻⁵', 'µ₀ε₀', '8 Nm', '500 nm', '600 Å', '5.6 MeV',
      '30°', '√3', 'R_A', 'T½', 'χ = 0.5', 'λ', 'θ', 'π', 'Ω', 'ω', '∆', '∑', '∫', '≈', '≠', '≤', '≥', '→', '±', '⇒', '∝', '≡',
      '∴', '⊥', '∠', '∂', '∇', '⇌', '∈', '⊂', '∪', '∩', '≪', '≫', '↔', '⇀', '∮', '⊙', '⋅', '≃', '℃', 'n̂', 'v⃗', 'ẋ',
      '10⁻⁵இல்', 'Am⁻¹ஆக', 'ε₀ஐ', '3×10⁸ ms⁻¹ஆகும்.',
    ];
    for (const s of inventory) expect(uncoveredGlyphs(s), s).toEqual([]);
    // What the trigger says about each, derived from the cmap — a Greek letter
    // and a per-mille sign both trigger; only the second has nowhere to go.
    expect(charNeedsKatex('λ')).toBe(true);
    expect(charNeedsKatex('‰')).toBe(true);
    expect(bodyCovered('‰'.codePointAt(0)!)).toBe(false);
    expect(katexAnyCovered('‰'.codePointAt(0)!)).toBe(false);
    expect(uncoveredGlyphs('5‰')).toEqual(['‰ U+2030']);
  });

  it('paperGlyphGaps names the item, and the fixtures have none', () => {
    expect(paperGlyphGaps(SAMPLE_PHYSICS_PAPER)).toEqual([]);
    expect(paperGlyphGaps(SAMPLE_ENGLISH_PAPER)).toEqual([]);
    const broken: PaperModel = {
      ...SAMPLE_PHYSICS_PAPER,
      items: SAMPLE_PHYSICS_PAPER.items.map((i, idx) => (idx === 2 ? { ...i, stemEn: `${i.stemEn} 5‰` } : i)),
    };
    expect(paperGlyphGaps(broken)).toEqual([{ itemId: SAMPLE_PHYSICS_PAPER.items[2].id, glyphs: ['‰ U+2030'] }]);
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
        for (const m of missingFrom(katexFontText(s), (cp) => katexAnyCovered(cp) || bodyCovered(cp))) missing.add(m);
      }
      expect(Array.from(missing)).toEqual([]);
    });
  }
});
