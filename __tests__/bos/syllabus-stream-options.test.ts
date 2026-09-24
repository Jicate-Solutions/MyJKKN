import { describe, it, expect } from 'vitest';
import { STREAMS } from '@/app/(routes)/bos/syllabus/_components/syllabus-filters';

// Production (24 Sep 2026): ~630 syllabi are saved with a Science stream
// (Science/SCIENCE/science), incl. 22 of the Zoology papers behind
// BUG-005789/005787/005779/005774/005798/005542 — but the Stream filter
// offered no Science choice, so they could never be listed by stream.
describe('BOS Stream filter options', () => {
  it('offers Science alongside Arts', () => {
    expect(STREAMS).toContain('Arts');
    expect(STREAMS).toContain('Science');
  });
});
