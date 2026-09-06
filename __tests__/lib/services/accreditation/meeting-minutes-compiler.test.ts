// __tests__/lib/services/accreditation/meeting-minutes-compiler.test.ts
// ============================================================================
// The one rule these tests exist to hold: compiling members' own accounts of a
// sitting must never silently destroy minutes that are already recorded.
//
// They test the real exported functions the dialog calls — not a re-statement
// of the SQL, and not a re-implementation of the merge inside the test.
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  compileMemberNotes,
  hasExistingMinutes,
  mergeMinutes,
} from '@/lib/services/accreditation/meeting-minutes-compiler';

const NAMES: Record<string, string> = {
  'u-chair': 'Chair Person',
  'u-coord': 'Coordinator One',
  'u-member': 'Ordinary Member',
};
const nameFor = (id: string) => NAMES[id] ?? 'Committee member';

describe('compileMemberNotes', () => {
  it('attributes every account and keeps the given order', () => {
    const out = compileMemberNotes(
      [
        { author_user_id: 'u-chair', note_text: 'Chair account.' },
        { author_user_id: 'u-member', note_text: 'Member account.' },
      ],
      nameFor,
      7,
    );
    expect(out).toContain('meeting #7');
    expect(out).toContain('Chair Person:\nChair account.');
    expect(out).toContain('Ordinary Member:\nMember account.');
    expect(out.indexOf('Chair Person')).toBeLessThan(
      out.indexOf('Ordinary Member'),
    );
  });

  it('counts only the accounts that were actually written', () => {
    const out = compileMemberNotes(
      [
        { author_user_id: 'u-chair', note_text: 'Written.' },
        { author_user_id: 'u-coord', note_text: '   ' },
        { author_user_id: 'u-member', note_text: '' },
      ],
      nameFor,
      2,
    );
    expect(out).toContain('(1 account)');
    expect(out).not.toContain('Coordinator One');
    expect(out).not.toContain('Ordinary Member');
  });

  it('returns empty string when nobody has written yet, so there is nothing to save', () => {
    expect(compileMemberNotes([], nameFor, 1)).toBe('');
    expect(
      compileMemberNotes(
        [{ author_user_id: 'u-member', note_text: '\n  \n' }],
        nameFor,
        1,
      ),
    ).toBe('');
  });

  it('falls back to a neutral label rather than leaking an unresolved id', () => {
    const out = compileMemberNotes(
      [{ author_user_id: 'u-unknown', note_text: 'Something.' }],
      nameFor,
      3,
    );
    expect(out).toContain('Committee member:');
    expect(out).not.toContain('u-unknown');
  });
});

describe('hasExistingMinutes', () => {
  it('treats null, undefined and whitespace as nothing to lose', () => {
    expect(hasExistingMinutes(null)).toBe(false);
    expect(hasExistingMinutes(undefined)).toBe(false);
    expect(hasExistingMinutes('   \n\t ')).toBe(false);
  });

  it('treats any real text as something a replace would destroy', () => {
    expect(hasExistingMinutes('Loop Review — meeting #2')).toBe(true);
  });
});

describe('mergeMinutes', () => {
  const existing = 'Loop Review — meeting #2. Reviewed 3 prior resolutions.';
  const compiled = 'Member accounts — meeting #2 (1 account)\n\nChair Person:\nOk.';

  it('append keeps every character of the existing minutes', () => {
    const out = mergeMinutes(existing, compiled, 'append');
    expect(out).toContain(existing);
    expect(out).toContain(compiled);
    expect(out.indexOf(existing)).toBeLessThan(out.indexOf(compiled));
  });

  it('append on an empty minute is just the compiled block, with no leading blank lines', () => {
    expect(mergeMinutes(null, compiled, 'append')).toBe(compiled);
    expect(mergeMinutes('   ', compiled, 'append')).toBe(compiled);
  });

  it('append never drops the existing text when there is nothing new to add', () => {
    expect(mergeMinutes(existing, '', 'append')).toBe(existing);
  });

  it('replace discards the existing minutes — which is why it is gated in the UI', () => {
    const out = mergeMinutes(existing, compiled, 'replace');
    expect(out).toBe(compiled);
    expect(out).not.toContain('Reviewed 3 prior resolutions');
  });

  it('with no minutes recorded yet, both modes agree — so the dialog default is lossless either way', () => {
    expect(mergeMinutes('', compiled, 'replace')).toBe(
      mergeMinutes('', compiled, 'append'),
    );
  });
});
