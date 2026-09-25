import { describe, it, expect } from 'vitest';
import { countsWhat, COUNTS_WHAT_LABEL } from '@/lib/adoption/summarise';

describe('adoption — what a feature number counts', () => {
  it('a bridged key counts people who tried it', () => {
    expect(countsWhat({ usage_wired: true, usage_bridged: true })).toBe('tried');
  });

  it('a direct key counts people who did it', () => {
    expect(countsWhat({ usage_wired: true, usage_bridged: false })).toBe('did');
  });

  it('a feature nothing records says nothing — it already reads "not measured"', () => {
    expect(countsWhat({ usage_wired: false, usage_bridged: true })).toBeNull();
    expect(countsWhat({ usage_wired: false, usage_bridged: false })).toBeNull();
  });

  it('labels are plain and say which is which', () => {
    expect(COUNTS_WHAT_LABEL.tried.label).toBe('counts: tried it');
    expect(COUNTS_WHAT_LABEL.did.label).toBe('counts: did it');
  });
});
