/**
 * OneMark — a character the embedded fonts cannot draw must never fail a PDF.
 *
 * Found in the Wave 3 try-out (2026-09-11, PR #3431): a finalised Physics
 * test's question paper printed, but its ANSWER KEY answered 422, because two
 * live items (c20d867f, f0d484aa) write the relative permittivity as `ε₀εᵣ` in
 * their explanations. ᵣ (U+1D63) sat outside the notation repertoire, fell to
 * the body fonts as text, no embedded face has it, and render.ts refused the
 * whole document.
 *
 * What this file holds:
 *   1. The exact live strings now print with nothing uncovered: ᵣ is a KaTeX
 *      subscript r, the same as ₀ next to it.
 *   2. Every modifier / subscript letter of that kind is notation too.
 *   3. A character NO embedded face carries prints as a visible "[?]" — in body
 *      text, in an auto-promoted notation run and in an explicit $…$ run — and
 *      the question paper and the answer key apply the same rule.
 *   4. renderAnswerKeyPdf / renderQuestionPaperPdf RESOLVE for such a paper
 *      (Chromium mocked: this is about the refusal, not the rasteriser) and
 *      log the item id and code point.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const printed: string[] = [];

vi.mock('puppeteer', () => ({
  default: {
    launch: async () => ({
      version: async () => 'mock',
      close: async () => {},
      newPage: async () => ({
        setContent: async (html: string) => {
          printed.push(html);
        },
        evaluate: async () => undefined,
        pdf: async () => new TextEncoder().encode('%PDF-1.7 mock'),
        close: async () => {},
      }),
    }),
  },
}));
vi.mock('puppeteer-core', () => ({ default: { launch: async () => { throw new Error('serverless path not expected in tests'); } } }));
vi.mock('@sparticuz/chromium', () => ({ default: { args: [], executablePath: async () => '' } }));

import {
  MISSING_GLYPH_HTML,
  bodyFontText,
  itemTextToHtml,
  katexFontText,
  paperGlyphGaps,
  segmentItemText,
  uncoveredGlyphs,
  unicodeNotationToTex,
} from '@/lib/onemark/pdf/notation';
import { fontCoverageKnown } from '@/lib/onemark/pdf/fonts';
import { answerKeyHtml, questionPaperHtml } from '@/lib/onemark/pdf/document';
import { arrangeForSeries } from '@/lib/onemark/pdf/layout';
import { renderAnswerKeyPdf, renderQuestionPaperPdf } from '@/lib/onemark/pdf/render';
import { SAMPLE_PHYSICS_PAPER, withoutAnswers } from '@/lib/onemark/pdf/samples';
import type { PaperModel } from '@/lib/onemark/pdf/types';

// Verbatim from production fp_items, read 2026-09-12 (explanation / explanation_ta).
const LIVE_C20D867F_EN =
  "Coulomb's law in a medium states F = q₁q₂ / (4πεr²), where ε = ε₀εᵣ is the absolute permittivity of the medium.";
const LIVE_C20D867F_TA =
  'ஒரு ஊடகத்தில் கூலோம் விதி F = q₁q₂ / (4πεr²) என்று கூறுகிறது; இங்கு ε = ε₀εᵣ என்பது ஊடகத்தின் முழு மின்தளத்திறன் (absolute permittivity) ஆகும்.';
const LIVE_F0D484AA_EN =
  'For a parallel-plate capacitor, C = εA/d = ε₀εᵣA/d. Capacitance increases with plate area and permittivity, and decreases with separation.';
const LIVE_F0D484AA_TA =
  'இணைத்தகடு மின்தேக்கிக்கு C = εA/d = ε₀εᵣA/d. மின்தேக்குதிறன் தகட்டு பரப்பு மற்றும் மின்தளத்திறனுடன் அதிகரிக்கும்; தகடு இடைவெளியுடன் குறையும்.';
const LIVE_STRINGS = [LIVE_C20D867F_EN, LIVE_C20D867F_TA, LIVE_F0D484AA_EN, LIVE_F0D484AA_TA];

const R_SUB = 'ᵣ'; // U+1D63 LATIN SUBSCRIPT SMALL LETTER R
const PER_MILLE = '‰'; // U+2030 — in no embedded face at all
const DEVANAGARI_KA = 'क'; // U+0915 — outside every body face

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The Physics fixture with the two live explanations on items 1 and 2 and an
 *  unprintable character in item 3's stem and options. */
function paperWithUnprintables(): PaperModel {
  return {
    ...SAMPLE_PHYSICS_PAPER,
    items: SAMPLE_PHYSICS_PAPER.items.map((it, idx) => {
      if (idx === 0) return { ...it, explanationEn: LIVE_C20D867F_EN, explanationTa: LIVE_C20D867F_TA };
      if (idx === 1) return { ...it, explanationEn: LIVE_F0D484AA_EN, explanationTa: LIVE_F0D484AA_TA };
      if (idx === 2) {
        return {
          ...it,
          stemEn: `${it.stemEn} (a rate of 5${PER_MILLE})`,
          explanationEn: `Written as ${DEVANAGARI_KA} in the source.`,
        };
      }
      return it;
    }),
  };
}

describe('the live strings that took the answer key down', () => {
  it('the cmap is readable here (otherwise every assertion below is vacuous)', () => {
    expect(fontCoverageKnown()).toBe(true);
  });

  it('before the fix each of them reported ᵣ; now none of them has an uncovered glyph', () => {
    for (const s of LIVE_STRINGS) expect(uncoveredGlyphs(s), s).toEqual([]);
  });

  it('ε₀εᵣ is one TeX run with ᵣ as a subscript r, like the ₀ beside it', () => {
    expect(unicodeNotationToTex('ε₀εᵣ')).toBe('\\varepsilon _{0}\\varepsilon _{r}');
    expect(unicodeNotationToTex('ε₀εᵣA/d')).toBe('\\dfrac{\\varepsilon _{0}\\varepsilon _{r}A}{d}');
    const tex = segmentItemText(LIVE_C20D867F_EN).filter((s) => s.kind === 'tex').map((s: any) => s.value);
    expect(tex).toContain('\\varepsilon _{0}\\varepsilon _{r}');
  });

  it('ᵣ never reaches the body fonts, not even glued to Tamil, and the HTML carries no raw ᵣ and no placeholder', () => {
    for (const s of LIVE_STRINGS) {
      expect(bodyFontText(s), s).not.toContain(R_SUB);
      const html = itemTextToHtml(s);
      expect(html).not.toContain(R_SUB);
      expect(html).not.toContain(MISSING_GLYPH_HTML);
      expect(html).toContain('class="katex"');
    }
    // The subscript letter is set by KaTeX as an ordinary r.
    expect(katexFontText('ε₀εᵣ')).toContain('r');
  });

  it('every modifier / subscript letter of that kind is notation with nothing uncovered, alone, after a letter and glued to Tamil', () => {
    const letters = [
      'ᵢ', 'ᵣ', 'ᵤ', 'ᵥ', 'ⱼ', 'ᵦ', 'ᵧ', 'ᵨ', 'ᵩ', 'ᵪ',
      'ᵃ', 'ᵇ', 'ᶜ', 'ᵈ', 'ᵉ', 'ᶠ', 'ᵍ', 'ʰ', 'ʲ', 'ᵏ', 'ˡ', 'ᵐ', 'ᵒ', 'ᵖ', 'ʳ', 'ˢ', 'ᵗ', 'ᵘ', 'ᵛ', 'ʷ', 'ˣ', 'ʸ', 'ᶻ',
      'ᴬ', 'ᴮ', 'ᴰ', 'ᴱ', 'ᴳ', 'ᴴ', 'ᴵ', 'ᴶ', 'ᴷ', 'ᴸ', 'ᴹ', 'ᴺ', 'ᴼ', 'ᴾ', 'ᴿ', 'ᵀ', 'ᵁ', 'ⱽ', 'ᵂ',
      'ᵅ', 'ᵝ', 'ᵞ', 'ᵟ', 'ᶿ', 'ᵠ', 'ᵡ',
    ];
    for (const ch of letters) {
      for (const text of [ch, `x${ch}`, `ε${ch}`, `ε₀${ch}ஆக`, `x${ch}${ch}`]) {
        expect(uncoveredGlyphs(text), `${text} U+${ch.codePointAt(0)!.toString(16)}`).toEqual([]);
        const html = itemTextToHtml(text);
        expect(html, text).not.toContain(ch);
        expect(html, text).not.toContain('tex-error');
      }
    }
    // A Greek script letter cannot fuse with the next letter's macro name.
    expect(unicodeNotationToTex('xᵦₓ')).toBe('x_{\\beta x}');
  });
});

describe('a character no embedded face carries prints "[?]" and never fails the paper', () => {
  it('in body text, in an auto-promoted notation run and in an explicit $…$ run', () => {
    // Still REPORTED — the audit is unchanged — but printed as the marker.
    expect(uncoveredGlyphs(`a rate of 5${PER_MILLE} per year`)).toEqual(['‰ U+2030']);
    expect(uncoveredGlyphs(DEVANAGARI_KA)).toEqual(['क U+0915']);
    for (const text of [`a rate of 5${PER_MILLE} per year`, `$x ${PER_MILLE}$`, `the letter ${DEVANAGARI_KA} here`]) {
      const html = itemTextToHtml(text);
      expect(countOf(html, MISSING_GLYPH_HTML), text).toBe(1);
      expect(html, text).not.toContain(PER_MILLE);
      expect(html, text).not.toContain(DEVANAGARI_KA);
    }
    // Everything printable around the marker is untouched.
    expect(itemTextToHtml(`a rate of 5${PER_MILLE} per year`)).toMatch(/^a rate of <span class="katex">/);
    expect(itemTextToHtml(`the letter ${DEVANAGARI_KA} here`)).toBe(`the letter ${MISSING_GLYPH_HTML} here`);
  });

  it('text with nothing unprintable renders exactly as before (no marker, same escaping)', () => {
    expect(itemTextToHtml('R & C < 5 "ohm"')).toBe('R &amp; C &lt; 5 &quot;ohm&quot;');
    expect(itemTextToHtml('கூலோம் விதி')).toBe('கூலோம் விதி');
  });

  it('the question paper and the answer key use the same rule', () => {
    const model = paperWithUnprintables();
    const paperHtml = questionPaperHtml(arrangeForSeries(withoutAnswers(model), 'A'));
    const keyHtml = answerKeyHtml(arrangeForSeries(model, 'A'));
    // ‰ is in item 3's stem, which only the paper prints; the key prints its explanation (क).
    expect(countOf(paperHtml, MISSING_GLYPH_HTML)).toBe(1);
    expect(countOf(keyHtml, MISSING_GLYPH_HTML)).toBe(1);
    for (const html of [paperHtml, keyHtml]) {
      expect(html).not.toContain(PER_MILLE);
      expect(html).not.toContain(DEVANAGARI_KA);
      expect(html).not.toContain(R_SUB);
      expect(html).toContain('.glyph-missing');
    }
  });

  it('printed names and topic labels follow the rule too', () => {
    const model: PaperModel = {
      ...SAMPLE_PHYSICS_PAPER,
      facilitatorName: `Senior ${DEVANAGARI_KA}`,
      studioName: `Studio ${PER_MILLE}`,
      items: SAMPLE_PHYSICS_PAPER.items.map((it, idx) => (idx === 0 ? { ...it, topicLabel: `Unit 1: Electrostatics ${DEVANAGARI_KA}` } : it)),
    };
    const keyHtml = answerKeyHtml(arrangeForSeries(model, 'A'));
    expect(keyHtml).toContain(`Senior ${MISSING_GLYPH_HTML}`);
    expect(keyHtml).toContain(`Studio ${MISSING_GLYPH_HTML}`);
    expect(keyHtml).toContain(`Electrostatics ${MISSING_GLYPH_HTML}`);
    expect(keyHtml).not.toContain(DEVANAGARI_KA);
    expect(keyHtml).not.toContain(PER_MILLE);
  });
});

describe('render.ts resolves instead of refusing', () => {
  beforeEach(() => {
    printed.length = 0;
  });

  it('the answer key generates for a paper holding the live ᵣ explanations and an unprintable character', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const model = paperWithUnprintables();
    const key = await renderAnswerKeyPdf(model, 'A');
    expect(Buffer.from(key.buffer).toString()).toContain('%PDF');
    expect(key.filename).toMatch(/-answer-key\.pdf$/);
    const html = printed.join('');
    expect(html).toContain('ANSWER KEY');
    expect(html).toContain(MISSING_GLYPH_HTML);
    expect(html).not.toContain(R_SUB);
    expect(html).not.toContain(DEVANAGARI_KA);
    // Logged by item id and code point, never by item text.
    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    const item3 = model.items[2].id;
    expect(logged).toContain(item3);
    expect(logged).toContain('U+0915');
    expect(logged).not.toContain(model.items[0].id); // the ᵣ items are no longer gaps
    expect(logged).not.toContain('Written as');
    warn.mockRestore();
  });

  it('the question paper generates too, and neither document reports the ᵣ items as gaps', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const model = paperWithUnprintables();
    const paper = await renderQuestionPaperPdf(withoutAnswers(model), 'B');
    expect(paper.filename).not.toMatch(/answer-key/);
    expect(printed.join('')).toContain(MISSING_GLYPH_HTML);
    expect(paperGlyphGaps(model).map((g) => g.itemId)).toEqual([model.items[2].id]);
    warn.mockRestore();
  });
});
