/**
 * "Institution not found" was a lie for one class of reader.
 *
 * The institution detail page answered every empty result with that one
 * sentence, including the empty result a reader gets when row-level security
 * filters the institution out of their view. It exists; they just cannot see it.
 * Told "not found", they read the page as broken and file a bug instead of
 * asking for access — exactly the silent, misleading permission failure
 * CLAUDE.md #27 forbids.
 *
 * These tests pin the classifier that decides which sentence a reader gets, and
 * in particular pin the case it must NOT pretend to resolve: `PGRST116`, which
 * is produced identically by "you may not see this row" and "this row is gone".
 */

import { describe, it, expect } from 'vitest';

import {
  classifyInstitutionLoadError,
  classifyInstitutionLoadFailure,
  readFailureFields,
  INSTITUTION_ABSENT_OR_DENIED_MESSAGE,
  INSTITUTION_DENIED_MESSAGE,
  INSTITUTION_VIEW_PERMISSION
} from '@/app/(routes)/organizations/institutions/_lib/institution-load-failure';

describe('classifyInstitutionLoadFailure — a hard refusal is named as one', () => {
  it('42501 (Postgres insufficient_privilege) is a denial, not a missing row', () => {
    expect(
      classifyInstitutionLoadFailure('42501', 'permission denied for table institutions')
    ).toBe('not_permitted');
  });

  it('PGRST301 (PostgREST rejected the credential) is a denial', () => {
    expect(classifyInstitutionLoadFailure('PGRST301', 'JWT expired')).toBe(
      'not_permitted'
    );
  });

  it('falls back to prose when the driver hands over no code', () => {
    expect(
      classifyInstitutionLoadFailure(null, 'permission denied for table institutions')
    ).toBe('not_permitted');
    expect(
      classifyInstitutionLoadFailure(
        null,
        'new row violates row-level security policy'
      )
    ).toBe('not_permitted');
  });

  it('a denial outranks empty-result prose in the same message', () => {
    // Order matters: "not permitted" is the only verdict we can state with
    // confidence, so it must win over the ambiguous one.
    expect(
      classifyInstitutionLoadFailure('42501', 'permission denied — not found')
    ).toBe('not_permitted');
  });
});

describe('classifyInstitutionLoadFailure — an empty result is NOT called "not found"', () => {
  it('PGRST116 is ambiguous: denied or deleted, and it says so', () => {
    // RLS does not refuse, it filters — 0 rows, and `.single()` turns 0 rows
    // into PGRST116. A deleted row produces exactly the same thing. Telling
    // them apart needs a SECURITY DEFINER RPC (a database change this PR does
    // not make), so the honest verdict is "one of these two".
    expect(
      classifyInstitutionLoadFailure(
        'PGRST116',
        'JSON object requested, multiple (or no) rows returned'
      )
    ).toBe('absent_or_not_permitted');
  });

  it('recognises the newer PostgREST wording for the same condition', () => {
    expect(
      classifyInstitutionLoadFailure('PGRST116', 'The result contains 0 rows')
    ).toBe('absent_or_not_permitted');
  });

  it("the service's own 'Institution not found' sentence lands in the ambiguous bucket", () => {
    expect(classifyInstitutionLoadFailure(null, 'Institution not found')).toBe(
      'absent_or_not_permitted'
    );
  });
});

describe('classifyInstitutionLoadFailure — everything else stays honest too', () => {
  it('an unrelated failure is "unknown" so the real message can be shown', () => {
    expect(classifyInstitutionLoadFailure(null, 'Failed to fetch')).toBe('unknown');
    expect(classifyInstitutionLoadFailure('08006', 'connection failure')).toBe(
      'unknown'
    );
  });

  it('an empty message with no code is "unknown", not a guess', () => {
    expect(classifyInstitutionLoadFailure(null, '')).toBe('unknown');
  });
});

describe('readFailureFields — survives whatever the query rejected with', () => {
  it('reads code and message off an Error carrying a PostgREST code', () => {
    const error = Object.assign(new Error('permission denied'), { code: '42501' });
    expect(readFailureFields(error)).toEqual({
      code: '42501',
      message: 'permission denied'
    });
  });

  it('reads a plain Error with no code', () => {
    expect(readFailureFields(new Error('boom'))).toEqual({
      code: null,
      message: 'boom'
    });
  });

  it('does not throw on null, a string, or a non-string code', () => {
    expect(readFailureFields(null)).toEqual({ code: null, message: '' });
    expect(readFailureFields('plain string')).toEqual({
      code: null,
      message: 'plain string'
    });
    expect(readFailureFields({ code: 42501, message: 'numeric code' })).toEqual({
      code: null,
      message: 'numeric code'
    });
  });
});

describe('classifyInstitutionLoadError — the shape the page actually receives', () => {
  // This is the live shape. `OrganizationService.getInstitution` throws
  // `new Error(institutionError.message)`, which keeps PostgREST's sentence and
  // drops its code — so the page gets a message and no code, and the prose
  // patterns are what actually decide the verdict.
  it('classifies a filtered/deleted row from the message alone (no code)', () => {
    const thrown = new Error(
      'JSON object requested, multiple (or no) rows returned'
    );
    expect(classifyInstitutionLoadError(thrown)).toBe('absent_or_not_permitted');
  });

  it('classifies a hard refusal from the message alone (no code)', () => {
    const thrown = new Error('permission denied for table institutions');
    expect(classifyInstitutionLoadError(thrown)).toBe('not_permitted');
  });

  it('still uses a code when some caller does preserve one', () => {
    const thrown = Object.assign(
      new Error('permission denied for table institutions'),
      { code: '42501' }
    );
    expect(classifyInstitutionLoadError(thrown)).toBe('not_permitted');
  });

  it('PGRST301 without its code degrades to unknown — the documented limit', () => {
    // "JWT expired" matches no pattern here, so the reader is shown that
    // message rather than an access-denied screen. Pinned so the degradation
    // is a known, chosen limit and not a surprise.
    expect(classifyInstitutionLoadError(new Error('JWT expired'))).toBe('unknown');
    // With the code present it is classified correctly.
    expect(
      classifyInstitutionLoadError(
        Object.assign(new Error('JWT expired'), { code: 'PGRST301' })
      )
    ).toBe('not_permitted');
  });
});

describe('the sentences a reader actually sees', () => {
  it('the ambiguous message states BOTH possibilities and points at a person', () => {
    expect(INSTITUTION_ABSENT_OR_DENIED_MESSAGE).toMatch(/may not have access/i);
    expect(INSTITUTION_ABSENT_OR_DENIED_MESSAGE).toMatch(/no longer exists/i);
    expect(INSTITUTION_ABSENT_OR_DENIED_MESSAGE).toMatch(/administrator/i);
  });

  it('neither message asserts the bare "not found" that started this', () => {
    expect(INSTITUTION_ABSENT_OR_DENIED_MESSAGE).not.toMatch(
      /^institution not found$/i
    );
    expect(INSTITUTION_DENIED_MESSAGE).not.toMatch(/not found/i);
  });

  it('the denial names access, and the key named is the one the list already enforces', () => {
    expect(INSTITUTION_DENIED_MESSAGE).toMatch(/do not have access/i);
    // columns.tsx gates the Code cell on canAccess('organizations.institutions', 'view').
    expect(INSTITUTION_VIEW_PERMISSION).toBe('organizations.institutions.view');
  });
});
