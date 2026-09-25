// __tests__/events/committee-designations.test.ts — BUG-004626.
import { describe, it, expect } from 'vitest';
import {
  buildDesignations,
  readDesignations,
  withoutDesignation,
} from '@/lib/utils/events/committee-designations';

describe('readDesignations', () => {
  it('returns {} for null / arrays / junk', () => {
    expect(readDesignations(null)).toEqual({});
    expect(readDesignations([])).toEqual({});
    expect(readDesignations('x')).toEqual({});
  });

  it('keeps only non-blank string values', () => {
    expect(readDesignations({ A: 'Main Coordinator', B: '  ', C: 3 })).toEqual({
      A: 'Main Coordinator',
    });
  });
});

describe('buildDesignations', () => {
  it('saves trimmed designations for people on the roster', () => {
    expect(buildDesignations(['POOMIGA G', 'SNEKA S'], { 'POOMIGA G': ' Main Coordinator ' })).toEqual({
      'POOMIGA G': 'Main Coordinator',
    });
  });

  it('drops blanks and people no longer on the committee', () => {
    expect(
      buildDesignations(['SNEKA S'], { 'SNEKA S': '', 'OLD MEMBER': 'Coordinator' })
    ).toEqual({});
  });
});

describe('withoutDesignation', () => {
  it("removes the departing member's designation only", () => {
    expect(
      withoutDesignation({ A: 'Main Coordinator', B: 'Member' }, 'A')
    ).toEqual({ B: 'Member' });
  });
});
