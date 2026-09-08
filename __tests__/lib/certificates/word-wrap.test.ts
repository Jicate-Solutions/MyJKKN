import { describe, expect, it } from 'vitest';
import { tokenizeRuns, wrapParagraph } from '@/lib/certificates/word-wrap';

// 6pt per character, bold 8pt — deterministic stand-in for Times metrics.
const measure = (text: string, bold: boolean) => text.length * (bold ? 8 : 6);

describe('tokenizeRuns', () => {
  it('keeps punctuation glued to a bold word when the run ends mid-word', () => {
    const words = tokenizeRuns([
      { text: 'that ' },
      { text: 'C. Manijothi (C24)', bold: true },
      { text: ', D/o P. Chandrasekar' },
    ]);
    expect(words.map((w) => w.map((s) => s.text).join(''))).toEqual([
      'that', 'C.', 'Manijothi', '(C24),', 'D/o', 'P.', 'Chandrasekar',
    ]);
    expect(words[3]).toEqual([{ text: '(C24)', bold: true }, { text: ',', bold: false }]);
  });
});

describe('wrapParagraph', () => {
  it('breaks greedily, narrows the first line by the indent, and never over-fills a line', () => {
    const runs = [{ text: 'aaaa bbbb cccc dddd eeee ffff' }]; // each word 24pt, space 6pt
    const lines = wrapParagraph(runs, { availableWidth: 84, firstLineIndent: 30, measure, spaceWidth: 6 });
    // first line: 84-30 = 54 → "aaaa bbbb" (54) fits exactly
    expect(lines[0].words.map((w) => w[0].text)).toEqual(['aaaa', 'bbbb']);
    // next lines: 84 → three words = 24*3 + 12 = 84 fits
    expect(lines[1].words.map((w) => w[0].text)).toEqual(['cccc', 'dddd', 'eeee']);
    expect(lines[2].words.map((w) => w[0].text)).toEqual(['ffff']);
    expect(lines.map((l) => l.last)).toEqual([false, false, true]);
  });

  it('places an over-long single word on its own line instead of dropping it', () => {
    const lines = wrapParagraph([{ text: 'a verylongwordthatexceeds b' }], {
      availableWidth: 60, firstLineIndent: 0, measure, spaceWidth: 6,
    });
    expect(lines.map((l) => l.words.map((w) => w[0].text).join(' '))).toEqual(['a', 'verylongwordthatexceeds', 'b']);
  });
});
