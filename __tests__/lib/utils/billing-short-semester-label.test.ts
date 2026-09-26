import { describe, expect, it } from 'vitest';
import { shortSemesterLabel } from '@/lib/utils/billing/collection-mode-pdf';

describe('shortSemesterLabel', () => {
  it('reduces semester and year names to roman numerals', () => {
    expect(shortSemesterLabel('Semester 1')).toBe('I');
    expect(shortSemesterLabel('Semester II')).toBe('II');
    expect(shortSemesterLabel('Sem-3')).toBe('III');
    expect(shortSemesterLabel('4th Semester')).toBe('IV');
    expect(shortSemesterLabel('Year 2')).toBe('II');
    expect(shortSemesterLabel('III Year')).toBe('III');
    expect(shortSemesterLabel('First Year')).toBe('I');
    expect(shortSemesterLabel('semester 10')).toBe('X');
  });
  it('leaves unknown names and blanks alone', () => {
    expect(shortSemesterLabel('')).toBe('');
    expect(shortSemesterLabel(null)).toBe('');
    expect(shortSemesterLabel('Foundation')).toBe('Foundation');
  });
});
