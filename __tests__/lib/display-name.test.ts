// __tests__/lib/display-name.test.ts
//
// The first two cases are the shapes from the two real reports (BUG-002481,
// BUG-002482) with stand-in names — a single repeated initial, and a two-letter
// initial repeated in a different punctuation style. The rest are the shapes
// that must NOT change, because this runs over every name the app shows a human.
import { describe, it, expect } from 'vitest';
import {
  dedupeTrailingInitials,
  composeDisplayName
} from '@/lib/utils/display-name';

describe('dedupeTrailingInitials', () => {
  it('collapses the two reported greeting shapes', () => {
    // BUG-002481 — a single trailing initial, repeated.
    expect(dedupeTrailingInitials('KAVI PRIYA M M')).toBe('KAVI PRIYA M');
    // BUG-002482 — a two-letter initial repeated with different dots/spacing.
    expect(dedupeTrailingInitials('ARUN KUMAR RAJ T.R T. R')).toBe(
      'ARUN KUMAR RAJ T.R'
    );
  });

  it('collapses the other live shapes found in profiles.full_name', () => {
    expect(dedupeTrailingInitials('MEENA DHARSHINI S S')).toBe(
      'MEENA DHARSHINI S'
    );
    expect(dedupeTrailingInitials('ANBU SELVAM RAJ J J')).toBe(
      'ANBU SELVAM RAJ J'
    );
    // Stored with a run of internal whitespace.
    expect(dedupeTrailingInitials('KAVI  M M')).toBe('KAVI M');
  });

  it('leaves a name with a single trailing initial alone', () => {
    expect(dedupeTrailingInitials('KAVI PRIYA E')).toBe('KAVI PRIYA E');
    expect(dedupeTrailingInitials('KAVI PRIYA.M')).toBe('KAVI PRIYA.M');
  });

  it('leaves two different initials alone', () => {
    expect(dedupeTrailingInitials('KAVI A B')).toBe('KAVI A B');
    expect(dedupeTrailingInitials('KAVI K.S T.R')).toBe('KAVI K.S T.R');
  });

  it('never collapses repeated words, only repeated initials', () => {
    expect(dedupeTrailingInitials('LEE LEE')).toBe('LEE LEE');
    expect(dedupeTrailingInitials('MARY JO JO')).toBe('MARY JO JO');
    expect(dedupeTrailingInitials('SINGH SINGH')).toBe('SINGH SINGH');
  });

  it('handles single-token, empty and missing names', () => {
    expect(dedupeTrailingInitials('KAVIPRIYA')).toBe('KAVIPRIYA');
    expect(dedupeTrailingInitials('  PADDED  ')).toBe('PADDED');
    expect(dedupeTrailingInitials('')).toBe('');
    expect(dedupeTrailingInitials(null)).toBe('');
    expect(dedupeTrailingInitials(undefined)).toBe('');
  });

  it('is idempotent — running it twice changes nothing more', () => {
    const once = dedupeTrailingInitials('KAVI PRIYA M M');
    expect(dedupeTrailingInitials(once)).toBe(once);
  });
});

describe('composeDisplayName', () => {
  it('does not repeat an initial the first name already carries', () => {
    expect(composeDisplayName('Kavi S', 'S')).toBe('Kavi S');
    expect(composeDisplayName('KAVI PRIYA M', 'M')).toBe('KAVI PRIYA M');
    // Case and padding differences still count as the same initial.
    expect(composeDisplayName('Kavi s', ' S ')).toBe('Kavi s');
  });

  it('joins an ordinary first and last name', () => {
    expect(composeDisplayName('Kavi', 'S')).toBe('Kavi S');
    expect(composeDisplayName('KAVI PRIYA', 'A')).toBe('KAVI PRIYA A');
    expect(composeDisplayName('Anita', 'Kumari')).toBe('Anita Kumari');
  });

  it('copes with a missing or empty last name', () => {
    expect(composeDisplayName('Kavi', null)).toBe('Kavi');
    expect(composeDisplayName('Kavi', '')).toBe('Kavi');
    expect(composeDisplayName('Kavi', undefined)).toBe('Kavi');
    expect(composeDisplayName(null, 'Kumari')).toBe('Kumari');
    expect(composeDisplayName(null, null)).toBe('');
  });
});
