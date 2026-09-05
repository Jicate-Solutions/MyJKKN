/**
 * OneMark — board-format paper renderer invariants (Lane P).
 *
 * What these hold on to, in order of how much damage a regression does:
 *   1. A question-paper render never carries an answer or explanation.
 *   2. Series are deterministic (same seed → same paper) and the answer key
 *      follows the re-lettering, so a printed key never disagrees with its sheet.
 *   3. The English board shape survives a series shuffle: Q1–3 stay synonyms,
 *      Q4–6 stay antonyms, and the grouped directive prints exactly once per run.
 *   4. Notation never reaches the body fonts as raw Unicode the embedded Tinos
 *      subset lacks — it goes through KaTeX.
 *   5. Option layout is data-driven (PRD Physics §4.3 / English §4.5).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  arrangeForSeries,
  classifyOptionLayout,
  directiveRuns,
  optionsArePinned,
  printedAnswerKey,
  visibleWidthChars,
  OPTION_KEYS_EN,
  OPTION_KEYS_TA,
  STACKED_THRESHOLD,
  TWO_BY_TWO_THRESHOLD,
  seriesSeed,
} from '@/lib/onemark/pdf/layout';
import {
  bodyFontText,
  hasNotationTrigger,
  charNeedsKatex,
  itemTextToHtml,
  katexFontText,
  splitTexRuns,
  uncoveredGlyphs,
  unicodeNotationToTex,
} from '@/lib/onemark/pdf/notation';
import { fontCoverageKnown, tamilRunWidthChars } from '@/lib/onemark/pdf/fonts';
import { answerKeyHtml, questionPaperHtml, showSeriesBox } from '@/lib/onemark/pdf/document';
import { SAMPLE_ENGLISH_PAPER, SAMPLE_PHYSICS_PAPER, withoutAnswers } from '@/lib/onemark/pdf/samples';
import {
  applyOverride,
  directiveForTags,
  normaliseAnswer,
  normaliseOptions,
  normaliseTamilOptions,
} from '@/lib/onemark/pdf/load-paper';
import type { PaperItem, PaperModel } from '@/lib/onemark/pdf/types';

const visibleText = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');

describe('notation → TeX', () => {
  it('promotes board-paper Unicode forms to TeX', () => {
    expect(unicodeNotationToTex('Am⁻¹')).toBe('\\mathrm{Am}^{-1}');
    expect(unicodeNotationToTex('10⁻⁵')).toBe('10^{-5}');
    expect(unicodeNotationToTex('2×10⁵')).toBe('2\\times 10^{5}');
    expect(unicodeNotationToTex('µ₀ε₀')).toBe('\\mu _{0}\\varepsilon _{0}');
    expect(unicodeNotationToTex('N₀')).toBe('N_{0}');
    expect(unicodeNotationToTex('⁷₃Li')).toBe('{}^{7}_{3}\\mathrm{Li}');
    expect(unicodeNotationToTex('A̅')).toBe('\\overline{A}');
    expect(unicodeNotationToTex('A̅B̅')).toBe('\\overline{A}\\overline{B}');
    expect(unicodeNotationToTex('N₀/√2')).toBe('\\dfrac{N_{0}}{\\sqrt{2}}');
    expect(unicodeNotationToTex('r_A/r_B')).toBe('\\dfrac{r_{A}}{r_{B}}');
    expect(hasNotationTrigger('r_A/r_B')).toBe(true);
    expect(hasNotationTrigger('snake_case_word')).toBe(false);
    expect(unicodeNotationToTex('√(R_B/R_A)')).toBe('\\sqrt{R_{B}/R_{A}}');
    expect(unicodeNotationToTex('[L²T⁻²]')).toBe('[\\mathrm{L}^{2}\\mathrm{T}^{-2}]');
  });

  it('only triggers on glyphs the embedded body fonts lack', () => {
    expect(hasNotationTrigger('500')).toBe(false);
    expect(hasNotationTrigger('30°')).toBe(false); // ° is in Tinos latin
    expect(hasNotationTrigger('Å')).toBe(false);
    expect(hasNotationTrigger('Am⁻¹')).toBe(true);
    expect(hasNotationTrigger('χ')).toBe(true);
    expect(hasNotationTrigger('⇒')).toBe(true);
  });

  it('renders notation through KaTeX and leaves plain words in the body font', () => {
    const html = itemTextToHtml('field of 2×10⁵ NC⁻¹ at 30°.');
    expect(html).toContain('class="katex"');
    expect(html).toContain('field of ');
    expect(html).toContain(' at 30°.');
    expect(bodyFontText('field of 2×10⁵ NC⁻¹ at 30°.')).toBe('field of at 30°.');
  });

  it('keeps a balancing bracket inside the notation and the full stop outside it', () => {
    const html = itemTextToHtml('so r = √(R_B/R_A).');
    expect(html).toContain('class="katex"');
    expect(html).toMatch(/<\/span>\.$/);
    expect(html).not.toContain(')<');
    expect(html).not.toContain(')\\.');
    const two = itemTextToHtml('(2×10⁵) V');
    expect(two.startsWith('(')).toBe(true);
    expect(two).toContain(') V');
  });

  it('honours the inline markup contract: $…$, <u>, ___', () => {
    const html = itemTextToHtml('Say <u>artless</u> and $\\tfrac{1}{2}T_{1/2}$ then _________ ?');
    expect(html).toContain('<u class="target">artless</u>');
    expect(html).toContain('class="katex"');
    expect(html).toContain('<span class="blank"></span>');
    expect(html).not.toContain('_________');
  });

  it('escapes everything that is not the contract', () => {
    const html = itemTextToHtml('<script>alert(1)</script> & <b>bold</b>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<b>');
  });

  it('keeps the elision dots as text and does not turn them into a blank', () => {
    const html = itemTextToHtml('....... he was sitting');
    expect(html).toContain('....... he was sitting');
    expect(html).not.toContain('class="blank"');
  });
});

describe('notation → script boundaries and the $…$ guard (reviewer-B findings)', () => {
  it('a Tamil case suffix glued to a unit or exponent stays in the body font', () => {
    for (const [glued, suffix] of [
      ['10⁻⁵இல்', 'இல்'],
      ['Am⁻¹ஆக', 'ஆக'],
      ['ε₀ஐ', 'ஐ'],
      ['ms⁻¹ஆகும்.', 'ஆகும்.'],
    ] as const) {
      const html = itemTextToHtml(glued);
      expect(html).toContain('class="katex"');
      // The suffix is one text node after the KaTeX span, never a \text{} group per code point.
      expect(html).toMatch(new RegExp(`</span>${suffix}$`));
      expect(html).not.toContain('brahmic');
      expect(bodyFontText(glued)).toBe(suffix);
      expect(katexFontText(glued)).not.toMatch(/[஀-௿]/);
    }
  });

  it('a notation token in parentheses with a glued suffix keeps its punctuation as text', () => {
    const html = itemTextToHtml('(ε₀ஐ)');
    expect(html.startsWith('(')).toBe(true);
    expect(html.endsWith('ஐ)')).toBe(true);
    expect(bodyFontText('(ε₀ஐ)')).toBe('(ஐ)');
  });

  it('bodyFontText keeps the sentence text of a mixed stem, katexFontText the notation glyphs', () => {
    const stem = 'ஒளியின் வேகம் 3×10⁸ ms⁻¹ஆகும். மதிப்பு 10⁻⁵இல் எவ்வளவு?';
    expect(bodyFontText(stem)).toBe('ஒளியின் வேகம் ஆகும். மதிப்பு இல் எவ்வளவு?');
    expect(katexFontText(stem)).toContain('ms');
    expect(katexFontText(stem)).not.toMatch(/[஀-௿]/);
  });

  it('two currency amounts are prose, not a TeX run (Pandoc delimiter rule)', () => {
    const html = itemTextToHtml('The book costs $5 and the pen $10.');
    expect(html).not.toContain('class="katex"');
    expect(visibleText(html)).toBe('The book costs $5 and the pen $10.');
    expect(splitTexRuns('The book costs $5 and the pen $10.')).toEqual([
      { tex: false, value: 'The book costs $5 and the pen $10.' },
    ]);
  });

  it('prose with $ signs that the old digit heuristic let through stays prose', () => {
    // Round-1 guard only refused a body that STARTED with a digit; these did not.
    for (const s of [
      'the $ sign and the $ symbol',
      'Rs $x and $y are both wrong',
      'He paid $ 5 and she paid $ 7.',
      'costs $five and $ten',
    ]) {
      const html = itemTextToHtml(s);
      expect(html, s).not.toContain('class="katex"');
      expect(visibleText(html), s).toBe(s);
    }
  });

  it('\\$ is always a literal dollar sign', () => {
    const html = itemTextToHtml('It costs \\$5 and $x$ is unknown.');
    expect(visibleText(html)).toContain('It costs $5 and ');
    expect((html.match(/class="katex"/g) ?? []).length).toBe(1);
  });

  it('real TeX runs still open and close', () => {
    for (const body of ['x', 'a + b', 'N_0', '2\\times10^{-5}', 't = \\tfrac{1}{2}T_{1/2}', 'r_A : r_B']) {
      expect(splitTexRuns(`before $${body}$ after`)).toEqual([
        { tex: false, value: 'before ' },
        { tex: true, value: body },
        { tex: false, value: ' after' },
      ]);
    }
    expect(splitTexRuns('$x$')).toEqual([{ tex: true, value: 'x' }]);
  });

  it('a lone $ is text', () => {
    const html = itemTextToHtml('It costs $5.');
    expect(html).not.toContain('class="katex"');
    expect(visibleText(html)).toBe('It costs $5.');
  });
});

describe('notation routing is decided by the embedded cmap, not a typed list (round-2 finding)', () => {
  it('the cmap is readable in this environment (otherwise every assertion below is vacuous)', () => {
    expect(fontCoverageKnown()).toBe(true);
  });

  it("routes every glyph of the reviewer's probe stem through KaTeX and leaves nothing uncovered", () => {
    const stem = '∴ the resultant is ⊥ to B and the reaction is ⇌ at 25℃, with ∠AOB = 60° and ∂v/∂t ⋅ n̂ ≃ 0.';
    const html = itemTextToHtml(stem);
    expect(html).toContain('class="katex"');
    const body = bodyFontText(stem);
    for (const ch of ['∴', '⊥', '⇌', '℃', '∠', '∂', '⋅', '̂', '≃']) expect(body, ch).not.toContain(ch);
    const katexText = katexFontText(stem);
    for (const ch of ['∴', '⊥', '⇌', '∠', '∂', '⋅', '≃']) expect(katexText, ch).toContain(ch);
    expect(katexText).toContain('C'); // ℃ rewritten as ^{\circ}\mathrm{C}, which KaTeX can set
    expect(uncoveredGlyphs(stem)).toEqual([]);
  });

  it('the 22 code points the reviewer probed are all routed and all printable', () => {
    const probes = ['∴', '⊥', '∠', '∂', '∇', '⇌', '∈', '⊂', '∪', '∩', '≪', '≫', '↔', '⇀', '∮', '⊙', '⋅', '≃', '℃', 'n̂', 'v⃗'];
    for (const p of probes) {
      expect(hasNotationTrigger(p), p).toBe(true);
      expect(uncoveredGlyphs(`x ${p} y`), p).toEqual([]);
    }
  });

  it('combining hat and vector arrow become \\hat / \\vec on the letter', () => {
    expect(unicodeNotationToTex('n̂')).toBe('\\hat{n}');
    expect(unicodeNotationToTex('v⃗')).toBe('\\vec{v}');
    expect(unicodeNotationToTex('A̅')).toBe('\\overline{A}');
    expect(itemTextToHtml('unit vector n̂')).toContain('katex-accent');
  });

  it('charNeedsKatex is the cmap: true exactly when no body face has the glyph (accents aside)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fontkit = require('fontkit');
    const { readdirSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    const dir = join(process.cwd(), 'public', 'fonts', 'pdf');
    const faces = readdirSync(dir).filter((f) => f.endsWith('.woff2')).map((f) => fontkit.openSync(join(dir, f)));
    const covered = (cp: number) => faces.some((f: any) => f.hasGlyphForCodePoint(cp));
    let checked = 0;
    for (const [a, b] of [[0x20, 0x7e], [0xa0, 0x24f], [0x370, 0x3ff], [0x2070, 0x209f], [0x2100, 0x214f], [0x2190, 0x21ff], [0x2200, 0x22ff]]) {
      for (let cp = a; cp <= b; cp++) {
        const ch = String.fromCodePoint(cp);
        expect(charNeedsKatex(ch), `U+${cp.toString(16)}`).toBe(!covered(cp));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(900);
    // The accents are the documented exception: notation whatever the cmap says.
    expect(charNeedsKatex('̄')).toBe(true); // macron — Tinos has it, still \overline
  });

  it('a glyph NO embedded face carries is reported, not silently boxed', () => {
    // U+2030 PER MILLE: absent from Tinos, Noto Sans Tamil and every KaTeX face.
    expect(uncoveredGlyphs('a rate of 5‰ per year')).toEqual(['‰ U+2030']);
    // Devanagari is outside the notation repertoire and outside every body face.
    expect(uncoveredGlyphs('क')).toEqual(['क U+0915']);
  });
});

describe('option layout classifier', () => {
  const o = (...t: string[]) => t.map((text, i) => ({ key: 'abcd'[i], text }));
  it('respects a declared layout', () => {
    expect(classifyOptionLayout('stacked', o('a', 'b', 'c', 'd'), [])).toBe('stacked');
    expect(classifyOptionLayout('inline_4', o('a long option well past forty characters wide', 'b', 'c', 'd'), [])).toBe('inline_4');
  });
  it('auto: short → inline_4, medium → inline_2x2, long or assertion_set → stacked', () => {
    expect(classifyOptionLayout('auto', o('likely', 'certain', 'eager', 'unlikely'), [])).toBe('inline_4');
    expect(classifyOptionLayout('auto', o('in reference to', 'with reference to', 'on behalf of', 'in lieu of'), [])).toBe('inline_2x2');
    expect(classifyOptionLayout('auto', o('to think carefully about something before doing it', 'b', 'c', 'd'), [])).toBe('stacked');
    expect(classifyOptionLayout('auto', o('0.2', '0.8', '0.7', '0.5'), ['assertion_set'])).toBe('stacked');
    expect(classifyOptionLayout(null, o('0.2', '0.8', '0.7', '0.5'), [])).toBe('inline_4');
  });
  it('measures visible length, not TeX source length', () => {
    expect(classifyOptionLayout('auto', o('$\\frac{N_0}{\\sqrt{2}}$', 'N₀/2', 'N₀/4', '√2 N₀'), [])).toBe('inline_4');
  });

  it('measures the Tamil options too — Q11: short English, wide Tamil (round-2 finding)', () => {
    const en = o('a straight line', 'a parabola', 'a hyperbola', 'a circle');
    const ta = o('நேர்க்கோடு', 'பரவளையம்', 'அதிபரவளையம்', 'வட்டம்');
    expect(classifyOptionLayout('auto', en, [])).toBe('inline_4'); // English alone fits four across
    expect(classifyOptionLayout('auto', en, [], ta)).toBe('inline_2x2'); // அதிபரவளையம் does not
    // The Tamil width comes from the embedded Noto Sans Tamil, in Tinos-lowercase units.
    const w = tamilRunWidthChars('அதிபரவளையம்')!;
    expect(w).toBeGreaterThan(TWO_BY_TWO_THRESHOLD);
    expect(w).toBeLessThan(STACKED_THRESHOLD);
    expect(visibleWidthChars('a hyperbola')).toBe(11);
    expect(visibleWidthChars('அதிபரவளையம்')).toBeCloseTo(w, 5);
    // The fixture's own Q11 now prints 2×2 in every series.
    const q11 = SAMPLE_PHYSICS_PAPER.items.find((i) => i.optionsEn[2].text === 'a hyperbola')!;
    for (const s of ['A', 'B'] as const) {
      expect(arrangeForSeries(SAMPLE_PHYSICS_PAPER, s).items.find((a) => a.item.id === q11.id)!.layout).toBe('inline_2x2');
    }
  });

  it('a long Tamil option alone pushes the item to stacked', () => {
    const en = o('yes', 'no', 'maybe', 'never');
    const ta = o('ஆம்', 'இல்லை', 'இரு புள்ளிகளுக்கு இடையே மின்னூட்டம் கொண்ட மின்துகளை நகர்த்த', 'ஒருபோதும்');
    expect(classifyOptionLayout('auto', en, [], ta)).toBe('stacked');
  });
});

describe('series arrangement', () => {
  it('series A is the Senior Learner\'s own order and lettering', () => {
    const a = arrangeForSeries(SAMPLE_PHYSICS_PAPER, 'A');
    expect(a.items.map((i) => i.item.position)).toEqual(SAMPLE_PHYSICS_PAPER.items.map((i) => i.position));
    expect(a.items.every((i) => i.optionOrder.every((v, idx) => v === idx))).toBe(true);
  });

  it('series B is deterministic and a real permutation', () => {
    const b1 = arrangeForSeries(SAMPLE_PHYSICS_PAPER, 'B');
    const b2 = arrangeForSeries(SAMPLE_PHYSICS_PAPER, 'B');
    expect(b1.items.map((i) => i.item.id)).toEqual(b2.items.map((i) => i.item.id));
    expect(b1.items.map((i) => i.optionOrder)).toEqual(b2.items.map((i) => i.optionOrder));
    expect(new Set(b1.items.map((i) => i.item.id)).size).toBe(SAMPLE_PHYSICS_PAPER.items.length);
    const a = arrangeForSeries(SAMPLE_PHYSICS_PAPER, 'A');
    expect(b1.items.map((i) => i.item.id)).not.toEqual(a.items.map((i) => i.item.id));
    expect(seriesSeed('x', 'B')).not.toBe(seriesSeed('x', 'C'));
    expect(seriesSeed('x', 'B')).toBe(seriesSeed('x', 'B'));
  });

  it('never re-letters an item whose options name their siblings', () => {
    const equipotential = SAMPLE_PHYSICS_PAPER.items.find((i) => i.tags.includes('assertion_set'))!;
    expect(optionsArePinned(equipotential)).toBe(true);
    for (const s of ['B', 'C', 'D'] as const) {
      const arr = arrangeForSeries(SAMPLE_PHYSICS_PAPER, s).items.find((i) => i.item.id === equipotential.id)!;
      expect(arr.optionOrder).toEqual([0, 1, 2, 3]);
    }
  });

  it('the printed key follows the re-lettering in every series', () => {
    for (const s of ['A', 'B', 'C', 'D'] as const) {
      const arranged = arrangeForSeries(SAMPLE_PHYSICS_PAPER, s);
      for (const arr of arranged.items) {
        const keyEn = printedAnswerKey(arr, OPTION_KEYS_EN)!;
        const printedIndex = OPTION_KEYS_EN.indexOf(keyEn);
        const canonicalIndex = arr.optionOrder[printedIndex];
        expect(arr.item.optionsEn[canonicalIndex].key).toBe(arr.item.answerKey);
        expect(OPTION_KEYS_TA.indexOf(printedAnswerKey(arr, OPTION_KEYS_TA)!)).toBe(printedIndex);
      }
    }
  });

  it('two items on one position order the same way for the paper and, separately, its key', () => {
    const tied: PaperModel = {
      ...SAMPLE_PHYSICS_PAPER,
      items: SAMPLE_PHYSICS_PAPER.items.map((i) => ({ ...i, position: 1 })),
    };
    const shuffledInput: PaperModel = { ...tied, items: tied.items.slice().reverse() };
    for (const s of ['A', 'B', 'C', 'D'] as const) {
      const a = arrangeForSeries(tied, s).items.map((i) => i.item.id);
      const b = arrangeForSeries(shuffledInput, s).items.map((i) => i.item.id);
      expect(b, s).toEqual(a);
    }
    expect(arrangeForSeries(tied, 'A').items.map((i) => i.item.id)).toEqual(
      tied.items.map((i) => i.id).sort(),
    );
  });

  it('keeps the English board shape: synonyms stay Q1–3, antonyms Q4–6, in every series', () => {
    for (const s of ['A', 'B', 'C', 'D'] as const) {
      const arranged = arrangeForSeries(SAMPLE_ENGLISH_PAPER, s);
      expect(arranged.items.slice(0, 3).every((i) => i.item.tags.includes('synonyms'))).toBe(true);
      expect(arranged.items.slice(3, 6).every((i) => i.item.tags.includes('antonyms'))).toBe(true);
      const runs = directiveRuns(arranged.items);
      expect(runs.map((r) => [r.from, r.to])).toEqual([[0, 2], [3, 5]]);
    }
  });
});

describe('documents', () => {
  it('a question-paper render carries no answer and no explanation', () => {
    const model = withoutAnswers(SAMPLE_PHYSICS_PAPER);
    const html = questionPaperHtml(arrangeForSeries(model, 'A'));
    for (const item of SAMPLE_PHYSICS_PAPER.items) {
      if (item.explanationEn) expect(html).not.toContain(item.explanationEn.slice(0, 24));
    }
    expect(html).not.toContain('ANSWER KEY');
    expect(html).not.toContain('answerKey');
  });

  it('bilingual items print the Tamil block, numbered once, then the English block', () => {
    const html = questionPaperHtml(arrangeForSeries(withoutAnswers(SAMPLE_PHYSICS_PAPER), 'A'));
    expect(html).toContain('காந்த ஏற்புத்திறன்');
    expect(html).toContain('(அ)');
    expect(html).toContain('(a)');
    const taIdx = html.indexOf('காந்த ஏற்புத்திறன்');
    const enIdx = html.indexOf('susceptibility of the material');
    expect(taIdx).toBeGreaterThan(0);
    expect(enIdx).toBeGreaterThan(taIdx);
    expect((html.match(/<div class="num">2\.<\/div>/g) ?? []).length).toBe(1);
  });

  it('the English paper prints each grouped directive exactly once and no Tamil', () => {
    const html = questionPaperHtml(arrangeForSeries(withoutAnswers(SAMPLE_ENGLISH_PAPER), 'A'));
    expect((html.match(/most appropriate synonyms/g) ?? []).length).toBe(1);
    expect((html.match(/most appropriate antonyms/g) ?? []).length).toBe(1);
    expect(html).not.toContain('(அ)');
    expect(html).toContain('<u class="target">artless</u>');
    expect(html).toContain('- o 0 o -');
  });

  it('English hides the series box unless variants were asked for; Physics always shows it', () => {
    expect(showSeriesBox(arrangeForSeries(SAMPLE_ENGLISH_PAPER, 'A'))).toBe(false);
    expect(showSeriesBox(arrangeForSeries(SAMPLE_ENGLISH_PAPER, 'B'))).toBe(true);
    expect(showSeriesBox(arrangeForSeries(SAMPLE_PHYSICS_PAPER, 'A'))).toBe(true);
  });

  it('the answer key is a separate document with both scripts, explanations and a JABT mix — no Easy/Medium/Hard', () => {
    const html = answerKeyHtml(arrangeForSeries(SAMPLE_PHYSICS_PAPER, 'B'));
    expect(html).toContain('ANSWER KEY');
    expect(html).toContain('Series :</b> B');
    expect(html).toContain('De Morgan reduction');
    expect(html).toMatch(/\([a-d]\) \/ \(<span class="ta">[அஆஇஈ]<\/span>\)/);
    expect(html).toContain('JABT level mix');
    expect(html).toMatch(/K[1-6] \d/);
    expect(html).not.toMatch(/\b(Easy|Medium|Hard)\b/);
    expect(html).toContain('Senior Learner :');
  });
});

describe('load-paper contracts', () => {
  it('normalises the fp_items option and answer shapes', () => {
    expect(normaliseOptions([{ key: 'a', text: 'x' }, { key: 'b', text: 'y' }])).toEqual([
      { key: 'a', text: 'x' },
      { key: 'b', text: 'y' },
    ]);
    expect(normaliseOptions(['x', 'y'])).toEqual([
      { key: 'a', text: 'x' },
      { key: 'b', text: 'y' },
    ]);
    expect(normaliseAnswer('B')).toBe('b');
    expect(normaliseAnswer({ correct: 'c' })).toBe('c');
    expect(normaliseAnswer(['d'])).toBe('d');
    expect(normaliseAnswer(null)).toBeNull();
  });

  it('reads the {index} answer shape every production item carries (live finding, round 2)', () => {
    // 48/48 fp_items on tn_hsc_physics + tn_hsc_english store answer as {"index": N}
    // over a bare string array; the key printed "—" for all of them.
    const bare = normaliseOptions(['newton', 'coulomb', 'farad', 'volt']);
    expect(normaliseAnswer({ index: 1 }, bare)).toBe('b');
    expect(normaliseAnswer({ index: 0 }, bare)).toBe('a');
    expect(normaliseAnswer({ index: '3' }, bare)).toBe('d');
    expect(normaliseAnswer({ index: 9 }, bare)).toBe('j'); // out of range: lettered, resolved to null downstream
    expect(normaliseAnswer({ index: -1 }, bare)).toBeNull();
    expect(normaliseAnswer({ index: 'x' }, bare)).toBeNull();
    expect(normaliseAnswer({ key: 'C' })).toBe('c');
    expect(normaliseAnswer(2, bare)).toBe('c');
    // Keyed options: the index maps to that option's own key.
    const keyed = normaliseOptions([{ key: 'p', text: 'x' }, { key: 'q', text: 'y' }]);
    expect(normaliseAnswer({ index: 1 }, keyed)).toBe('q');
  });

  it('a half-translated options_ta never prints against the English option order', () => {
    const en = normaliseOptions(['w', 'x', 'y', 'z']);
    expect(normaliseTamilOptions(null, en)).toBeNull();
    expect(normaliseTamilOptions([], en)).toBeNull();
    expect(normaliseTamilOptions(['அ', 'ஆ', 'இ'], en, 'item-1')).toBeNull(); // fewer → hole under (ஈ)
    expect(normaliseTamilOptions(['அ', 'ஆ', 'இ', 'ஈ', 'உ'], en, 'item-1')).toBeNull(); // more → extras dropped
    expect(normaliseTamilOptions(['அ', 'ஆ', 'இ', 'ஈ'], en)).toHaveLength(4);
  });

  it('an empty-string option key falls back to its letter, and a keyless item prints no answer text', () => {
    expect(normaliseOptions([{ key: '', text: 'x' }, { key: 'b', text: 'y' }])).toEqual([
      { key: 'a', text: 'x' },
      { key: 'b', text: 'y' },
    ]);
    // Belt to that brace: even with an empty key on the item, no answerKey → "—" and NO answer text.
    const keyless: PaperModel = {
      ...SAMPLE_PHYSICS_PAPER,
      items: SAMPLE_PHYSICS_PAPER.items.slice(0, 1).map((i) => ({
        ...i,
        answerKey: null,
        optionsEn: i.optionsEn.map((o, idx) => (idx === 0 ? { ...o, key: '' } : o)),
      })),
    };
    const html = answerKeyHtml(arrangeForSeries(keyless, 'A'));
    expect(html).toContain('<td class="code">—</td>');
    expect(html).toContain('<td class="ans"><div></div></td>');
  });

  describe('decision-14 overrides apply per language and keep the key honest', () => {
    const base = (): PaperItem => ({
      ...SAMPLE_PHYSICS_PAPER.items[1], // the susceptibility item: 4 En + 4 Ta options, answer d
    });

    it('an English-only edit leaves the Tamil block untouched, and vice versa', () => {
      const en = applyOverride(base(), { options: ['0.1', '0.9', '0.6', '0.5'] }, true);
      expect(en.optionsEn.map((o) => o.text)).toEqual(['0.1', '0.9', '0.6', '0.5']);
      expect(en.optionsTa).toEqual(base().optionsTa);
      expect(en.answerKey).toBe('d'); // the rewritten list still carries key d
      const ta = applyOverride(base(), { options_ta: ['௦.௨', '௦.௮', '௦.௭', '௦.௫'] }, true);
      expect(ta.optionsEn).toEqual(base().optionsEn);
      expect(ta.optionsTa!.map((o) => o.text)).toEqual(['௦.௨', '௦.௮', '௦.௭', '௦.௫']);
      const stem = applyOverride(base(), { stem_ta: 'புதிய வினா' }, true);
      expect(stem.stemTa).toBe('புதிய வினா');
      expect(stem.stemEn).toBe(base().stemEn);
      expect(stem.optionsTa).toEqual(base().optionsTa);
    });

    it('an English rewrite that changes the option count drops the Tamil list with a warning, never a hole', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const it5 = applyOverride(base(), { options: ['a', 'b', 'c', 'd', 'e'] }, true);
      expect(it5.optionsEn).toHaveLength(5);
      expect(it5.optionsTa).toBeNull();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('an override that rewrites the options can carry the answer; without a matching key the key is nulled', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const withAnswer = applyOverride(base(), { options: [{ key: 'p', text: 'x' }, { key: 'q', text: 'y' }], answer: 'q' }, true);
      expect(withAnswer.answerKey).toBe('q');
      const noMatch = applyOverride(base(), { options: [{ key: 'p', text: 'x' }, { key: 'q', text: 'y' }] }, true);
      expect(noMatch.answerKey).toBeNull();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('on a paper render (answers stripped) an override answer is ignored', () => {
      const stripped = { ...base(), answerKey: null };
      expect(applyOverride(stripped, { answer: 'a' }, false).answerKey).toBeNull();
      expect(applyOverride(stripped, { options: ['1', '2', '3', '4'], answer: 'a' }, false).answerKey).toBeNull();
    });
  });

  it('derives the grouped directive from the tag for English only', () => {
    expect(directiveForTags('tn_hsc_english', ['synonyms'])).toMatch(/synonyms/);
    expect(directiveForTags('tn_hsc_english', ['idioms'])).toBeNull();
    expect(directiveForTags('tn_hsc_physics', ['synonyms'])).toBeNull();
  });
});
