import { describe, expect, it } from 'vitest';
import { findSameFileDuplicates } from '@/lib/hr/intake/dedupe';

const c = (first: string, email: string | null, phone: string | null) => ({
  first_name: first,
  last_name: 'Demo',
  email,
  phone,
});

describe('findSameFileDuplicates', () => {
  it('one person on three rows with two emails all point at the earliest row', () => {
    const dup = findSameFileDuplicates([
      { row_index: 1, candidate: c('Arun', 'arun@example.test', '9840011122') },
      { row_index: 2, candidate: c('Arun', 'arun@example.test', '9840011122') },
      { row_index: 3, candidate: c('Arun', 'karun@example.test', '9840011122') },
      { row_index: 4, candidate: c('Devika', 'devika@example.test', '9443322110') },
    ]);
    expect(dup.has(1)).toBe(false);
    expect(dup.get(2)).toMatchObject({ ref_row_index: 1, shared: 'same email and phone number' });
    expect(dup.get(3)).toMatchObject({ ref_row_index: 1, shared: 'same phone number' });
    expect(dup.get(3)?.note).toBe('Same person as row 1 in this file (same phone number)');
    expect(dup.has(4)).toBe(false);
  });

  it('chains links: email to one row, phone to another, still the earliest', () => {
    const dup = findSameFileDuplicates([
      { row_index: 1, candidate: c('A', 'one@example.test', '9000000001') },
      { row_index: 2, candidate: c('A', 'two@example.test', '9000000001') },
      { row_index: 3, candidate: c('A', 'two@example.test', null) },
    ]);
    expect(dup.get(2)?.ref_row_index).toBe(1);
    expect(dup.get(3)?.ref_row_index).toBe(1);
    expect(dup.get(3)?.shared).toBe('linked through another row');
  });

  it('matches email without case, and never on a missing email or phone', () => {
    const dup = findSameFileDuplicates([
      { row_index: 1, candidate: c('A', 'Same@Example.test', null) },
      { row_index: 2, candidate: c('B', 'same@example.test', null) },
      { row_index: 3, candidate: c('C', null, null) },
      { row_index: 4, candidate: c('D', null, null) },
    ]);
    expect(dup.get(2)?.ref_row_index).toBe(1);
    expect(dup.has(3)).toBe(false);
    expect(dup.has(4)).toBe(false);
  });

  it('works whatever order the rows arrive in', () => {
    const dup = findSameFileDuplicates([
      { row_index: 5, candidate: c('A', null, '9000000002') },
      { row_index: 2, candidate: c('A', null, '9000000002') },
    ]);
    expect(dup.get(5)?.ref_row_index).toBe(2);
    expect(dup.has(2)).toBe(false);
  });
});
