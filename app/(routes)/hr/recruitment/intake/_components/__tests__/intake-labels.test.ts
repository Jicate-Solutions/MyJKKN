import { describe, expect, it } from 'vitest';
import type { IntakeRow } from '@/types/hr-intake';
import { duplicateText, summarise } from '../intake-labels';

const row = (id: string, action: IntakeRow['proposal']['action'] | null, filed = false): IntakeRow =>
  ({
    id,
    duplicate: { kind: 'none', ref_id: null, note: null },
    proposal: { action: 'file_under_job', confidence: 'medium', reasons: [], job_id: null, job_title: null, institution_id: null, rule_id: null, rule_author_name: null },
    decision: action ? { action, job_id: null, decided_by: 'u', decided_by_name: 'HR', decided_at: '2026-10-01T00:00:00Z', corrected: false } : null,
    applied: filed ? { application_id: `app-${id}`, applied_at: '2026-10-01T00:00:00Z', error: null } : null,
  }) as unknown as IntakeRow;

describe('summarise', () => {
  it('"File decided candidates" sends only cards decided "file under job" and not yet filed', () => {
    const s = summarise([
      row('a', 'file_under_job'),
      row('b', 'skip'),
      row('c', 'merge_existing'),
      row('d', 'needs_new_job'),
      row('e', 'file_under_job', true),
      row('f', null),
    ]);
    expect(s.toApply).toEqual(['a']);
  });
});

describe('duplicateText', () => {
  const withDup = (duplicate: IntakeRow['duplicate']) => ({ ...row('x', null), duplicate }) as IntakeRow;
  it('says an earlier record once, in the server\u2019s words', () => {
    expect(duplicateText(withDup({ kind: 'existing_application', ref_id: 'a', note: 'Already applied in MyJKKN (same email)' }), new Map()))
      .toBe('Already applied in MyJKKN (same email)');
  });
  it('a same-upload duplicate names the card and what matched, as "possibly"', () => {
    const d = withDup({ kind: 'same_file', ref_id: 'r1', note: 'Same person as row 1 in this file (same phone number)' });
    expect(duplicateText(d, new Map([['r1', 1]]))).toBe('Possibly the same person as card 1 in this upload (same phone number)');
  });
});

