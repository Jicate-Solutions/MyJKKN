import { describe, it, expect } from 'vitest';
import {
  summariseClusterSpan,
  institutionLabel,
} from '@/app/(routes)/accreditation/cac/_lib/cluster-scope';

// ---------------------------------------------------------------------------
// A cluster council's roster is a plain uuid[]. Two things can make a screen
// lie about it: RLS returning fewer institutions than the roster names, and the
// array itself carrying a duplicate. Both end the same way — a count that does
// not match the list beside it.
//
// Shape mirrors the live institutions table (14 rows; exactly 8 carry an
// iqac_code — the colleges. Main Office and both schools carry none, and a
// cluster council spans those too).
// ---------------------------------------------------------------------------
const inst = (id: string, name: string, iqac_code: string | null = null) => ({
  id,
  name,
  iqac_code,
});

const PHARMACY = inst('i1', 'JKKN College of Pharmacy', 'PHAR');
const ENGINEERING = inst('i2', 'JKKN College of Engineering and Technology', 'ENGG');
const SCHOOL = inst('i3', 'Nattraja Vidhyalya CBSE');
const MAIN_OFFICE = inst('i4', 'JKKN Main Office');

const ALL = [PHARMACY, ENGINEERING, SCHOOL, MAIN_OFFICE];

describe('institutionLabel', () => {
  it('prefixes the iqac code when the institution has one', () => {
    expect(institutionLabel(PHARMACY)).toBe('[PHAR] JKKN College of Pharmacy');
  });

  it('omits the bracket entirely when there is no code', () => {
    // Main Office and the schools have no iqac_code — an empty '[] ' prefix
    // would read as a missing value rather than a deliberate absence.
    expect(institutionLabel(MAIN_OFFICE)).toBe('JKKN Main Office');
  });
});

describe('summariseClusterSpan', () => {
  it('counts the roster and labels every institution it resolves', () => {
    const span = summariseClusterSpan(['i1', 'i2'], ALL);
    expect(span.total).toBe(2);
    expect(span.hiddenCount).toBe(0);
    expect(span.labels).toEqual([
      '[ENGG] JKKN College of Engineering and Technology',
      '[PHAR] JKKN College of Pharmacy',
    ]);
  });

  it('spans colleges and schools together — that is the point of a cluster', () => {
    const span = summariseClusterSpan(['i1', 'i3'], ALL);
    expect(span.total).toBe(2);
    expect(span.labels).toContain('Nattraja Vidhyalya CBSE');
  });

  it('reports institutions the viewer cannot see instead of shrinking the count', () => {
    // Roster names 3; RLS returned 1. The count must stay 3 and the gap must be
    // stated, otherwise the page silently narrows the council's scope.
    const span = summariseClusterSpan(['i1', 'i2', 'i3'], [PHARMACY]);
    expect(span.total).toBe(3);
    expect(span.labels).toHaveLength(1);
    expect(span.hiddenCount).toBe(2);
  });

  it('counts a duplicated roster entry once', () => {
    const span = summariseClusterSpan(['i1', 'i1', 'i2'], ALL);
    expect(span.total).toBe(2);
    expect(span.labels).toHaveLength(2);
    expect(span.hiddenCount).toBe(0);
  });

  it('ignores institutions that are not on the roster', () => {
    // The caller passes the whole institution list, not a pre-filtered one.
    const span = summariseClusterSpan(['i1'], ALL);
    expect(span.labels).toEqual(['[PHAR] JKKN College of Pharmacy']);
    expect(span.hiddenCount).toBe(0);
  });

  it('never returns a negative hidden count', () => {
    // Defensive: a caller handing the same institution twice must not push the
    // matched tally past the roster size.
    const span = summariseClusterSpan(['i1'], [PHARMACY, PHARMACY]);
    expect(span.hiddenCount).toBe(0);
    expect(span.labels).toEqual(['[PHAR] JKKN College of Pharmacy']);
  });

  it('treats a null roster as empty rather than throwing', () => {
    // member_institution_ids is nullable on the table.
    const span = summariseClusterSpan(null, ALL);
    expect(span).toEqual({ total: 0, labels: [], hiddenCount: 0 });
  });

  it('handles an empty roster', () => {
    expect(summariseClusterSpan([], ALL).total).toBe(0);
  });

  it('resolves nothing when the institution list has not loaded yet', () => {
    const span = summariseClusterSpan(['i1', 'i2'], []);
    expect(span.total).toBe(2);
    expect(span.labels).toEqual([]);
    expect(span.hiddenCount).toBe(2);
  });
});
