import { describe, expect, it } from 'vitest';
import {
  charsPerLine,
  countWrappedLines,
  fitText,
  looksUppercase
} from '@/lib/id-cards/text-fit';

describe('looksUppercase', () => {
  it('treats card-style caps as uppercase and mixed case as not', () => {
    expect(looksUppercase('DEEPAKKUMAR A')).toBe(true);
    expect(looksUppercase('M.E. Computer Science and Engineering')).toBe(false);
    expect(looksUppercase('12345')).toBe(false);
  });
});

describe('countWrappedLines', () => {
  it('counts greedy word wraps', () => {
    expect(countWrappedLines('one two three', 20)).toBe(1);
    expect(countWrappedLines('one two three', 7)).toBe(2); // "one two" / "three"
    expect(countWrappedLines('one two three', 5)).toBe(3);
  });
  it('hard-breaks a single word longer than the line', () => {
    expect(countWrappedLines('ABCDEFGHIJ', 4)).toBe(3);
  });
});

const WORST_ADDRESS =
  'NO 2/124, KOOTHADIYUR, A.SEMPULICHAMPALAYAM, BHAVANITALUK, VTC: BHAVANI, ' +
  'PO: SEMBULICHAMPALAYAM, DISTRICT: ERODE, STATE: TAMIL NADU, 108126636 ' +
  'PIN CODE: 608501 MOBILE: 9345864573, BHAVANI, ERODE, TAMIL NADU, 638501';

describe('fitText', () => {
  it('keeps a short value at the preferred size', () => {
    const r = fitText('23ECE001', { maxWidth: 340, maxFontSize: 26, minFontSize: 17 });
    expect(r.fontSize).toBe(26);
    expect(r.lines).toBe(1);
    expect(r.elided).toBe(false);
    expect(r.text).toBe('23ECE001');
  });

  it('shrinks a long single-line value only as far as needed', () => {
    const value = 'B.Sc. Computer Science';
    const r = fitText(value, { maxWidth: 300, maxFontSize: 30, minFontSize: 17, bold: true });
    expect(r.fontSize).toBeLessThan(30);
    expect(r.fontSize).toBeGreaterThanOrEqual(17);
    expect(r.text).toBe(value);
    expect(r.elided).toBe(false);
    // One size larger must NOT fit — proves "largest that fits".
    const perLineUp = charsPerLine(300, r.fontSize + 1, 0.56 + 0.03);
    expect(countWrappedLines(value, perLineUp)).toBeGreaterThan(1);
  });

  it('elides at the floor when a single line cannot hold the value', () => {
    const course = 'M.E. Computer Science and Engineering';
    const r = fitText(course, { maxWidth: 360, maxFontSize: 26, minFontSize: 17, bold: true });
    expect(r.fontSize).toBe(17);
    expect(r.elided).toBe(true);
    expect(r.text.endsWith('…')).toBe(true);
  });

  it('prefers wrapping over shrinking when the box has height', () => {
    const course = 'M.E. Computer Science and Engineering';
    const r = fitText(course, {
      maxWidth: 360,
      maxHeight: 44,
      maxFontSize: 26,
      minFontSize: 17,
      maxLines: 2,
      lineHeight: 1.15,
      bold: true
    });
    expect(r.lines).toBe(2);
    expect(r.fontSize * 1.15 * 2).toBeLessThanOrEqual(44);
    expect(r.text).toBe(course);
  });

  it('shows the 214-char worst-case address in FULL inside the live 556x150 box', () => {
    const r = fitText(WORST_ADDRESS, {
      maxWidth: 556,
      maxHeight: 150,
      maxFontSize: 24,
      minFontSize: 16,
      maxLines: 8,
      lineHeight: 1.15,
      preserveTail: true
    });
    expect(r.elided).toBe(false);
    expect(r.text).toBe(WORST_ADDRESS);
    expect(r.fontSize).toBeGreaterThanOrEqual(16);
    expect(r.fontSize * 1.15 * r.lines).toBeLessThanOrEqual(150);
  });

  it('never goes below the readability floor — elides instead, keeping the address tail', () => {
    const r = fitText(WORST_ADDRESS, {
      maxWidth: 300,
      maxHeight: 60,
      maxFontSize: 24,
      minFontSize: 16,
      maxLines: 8,
      lineHeight: 1.15,
      preserveTail: true
    });
    expect(r.fontSize).toBe(16);
    expect(r.elided).toBe(true);
    expect(r.text).toContain('638501');
    expect(r.text).toContain('…');
    expect(r.text.length).toBeLessThan(WORST_ADDRESS.length);
  });

  it('a typical long address fits fully by wrapping in the live 556px box', () => {
    const typical =
      '4/271 NORTH STREET, THOTTIPALAYAM PIRIVU, KUMARAPALAYAM, NAMAKKAL, TAMIL NADU, 638183';
    const r = fitText(typical, {
      maxWidth: 556,
      maxHeight: 150,
      maxFontSize: 24,
      minFontSize: 16,
      maxLines: 8,
      lineHeight: 1.15,
      bold: true,
      preserveTail: true
    });
    expect(r.elided).toBe(false);
    expect(r.text).toBe(typical);
    expect(r.fontSize).toBeGreaterThan(18); // bigger than the old fixed 18
    expect(r.lines).toBeGreaterThanOrEqual(2);
  });

  it('handles empty input', () => {
    const r = fitText('', { maxWidth: 100, maxFontSize: 20, minFontSize: 10 });
    expect(r.text).toBe('');
    expect(r.fontSize).toBe(20);
  });
});
