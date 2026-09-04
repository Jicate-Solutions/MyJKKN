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
import { describe, it, expect } from 'vitest';
import {
  arrangeForSeries,
  classifyOptionLayout,
  directiveRuns,
  optionsArePinned,
  printedAnswerKey,
  OPTION_KEYS_EN,
  OPTION_KEYS_TA,
  seriesSeed,
} from '@/lib/onemark/pdf/layout';
import {
  bodyFontText,
  hasNotationTrigger,
  itemTextToHtml,
  unicodeNotationToTex,
} from '@/lib/onemark/pdf/notation';
import { answerKeyHtml, questionPaperHtml, showSeriesBox } from '@/lib/onemark/pdf/document';
import { SAMPLE_ENGLISH_PAPER, SAMPLE_PHYSICS_PAPER, withoutAnswers } from '@/lib/onemark/pdf/samples';
import { directiveForTags, normaliseAnswer, normaliseOptions } from '@/lib/onemark/pdf/load-paper';

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

  it('derives the grouped directive from the tag for English only', () => {
    expect(directiveForTags('tn_hsc_english', ['synonyms'])).toMatch(/synonyms/);
    expect(directiveForTags('tn_hsc_english', ['idioms'])).toBeNull();
    expect(directiveForTags('tn_hsc_physics', ['synonyms'])).toBeNull();
  });
});
