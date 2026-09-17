// __tests__/instasolver/complaint.test.ts
//
// The three rules in lib/instasolver/complaint.ts that decide whether a
// complaint reaches the right desk, is recorded against the right persona, and
// never quietly lands back with the person it is about.

import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  SUBJECT_MAX_LENGTH,
  confirmProfileExists,
  mapRoleToRaisedByType,
  mintAnonymousToken,
  readComplaintCategories,
  resolveAnonymousChoice,
  resolveSuperiorRouteProfileId,
  validateSubject,
} from '@/lib/instasolver/complaint';

/** A `from()` chain that resolves to whatever the test hands it. */
function queryClient(responses: Array<{ data?: unknown; error?: unknown }>) {
  let call = 0;
  const chain: Record<string, unknown> = {};
  const step = () => chain;
  chain.select = step;
  chain.eq = step;
  chain.order = () => Promise.resolve(responses[call++] ?? { data: [], error: null });
  return {
    from: () => chain as never,
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('raised_by_type mapping', () => {
  it('records a parent as a parent', () => {
    expect(mapRoleToRaisedByType('parent')).toBe('parent');
  });

  it('never writes a value outside the column’s own union', () => {
    // RaisedByType is learner | parent | staff | alumni and no row has ever
    // carried anything else. A Senior Learner is therefore recorded as a team
    // member — NOT as 'faculty', which would be a value this platform has never
    // written and which a live CHECK constraint cannot be ruled out for.
    const allowed = new Set(['learner', 'parent', 'staff', 'alumni']);
    for (const role of [
      'faculty', 'teacher', 'professor', 'instructor', 'student', 'staff',
      'administrator', 'super_admin', 'accounts', 'driver', 'guest', 'test',
      'parent', 'alumni', 'nonsense', '', null, undefined,
    ]) {
      expect(allowed.has(mapRoleToRaisedByType(role))).toBe(true);
    }
  });

  it('records a Senior Learner as a team member, not as a learner', () => {
    // The Learners Council board's own mapping answers 'learner' here, which is
    // the gap this lane's mapping closes.
    for (const role of ['faculty', 'teacher', 'professor', 'instructor']) {
      expect(mapRoleToRaisedByType(role)).toBe('staff');
    }
  });

  it('records every team-member role as one persona', () => {
    for (const role of ['staff', 'administrator', 'super_admin', 'accounts', 'driver']) {
      expect(mapRoleToRaisedByType(role)).toBe('staff');
    }
  });

  it('records a learner, and falls back to learner for anything unknown', () => {
    expect(mapRoleToRaisedByType('student')).toBe('learner');
    expect(mapRoleToRaisedByType('guest')).toBe('learner');
    expect(mapRoleToRaisedByType(null)).toBe('learner');
    expect(mapRoleToRaisedByType('')).toBe('learner');
  });

  it('is not confused by case or stray spacing', () => {
    expect(mapRoleToRaisedByType(`  ${'faculty'.toUpperCase()} `)).toBe('staff');
  });
});

describe('the private tracking code', () => {
  it('satisfies the shape fn_track_issue_by_token insists on', () => {
    const token = mintAnonymousToken();
    // The function refuses anything not matching `anon\_%` and shorter than 20.
    expect(token.startsWith('anon_')).toBe(true);
    expect(token.length).toBeGreaterThanOrEqual(20);
    expect(token).toMatch(/^anon_[A-Za-z0-9_-]{32}$/);
  });

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 200 }, () => mintAnonymousToken()));
    expect(codes.size).toBe(200);
  });
});

describe('anonymous filing when the per-category rule is missing', () => {
  it('treats every category as name-required when the column is not there yet', async () => {
    const client = queryClient([
      { data: null, error: { code: '42703', message: 'column does not exist' } },
      { data: [{ id: 'c1', name: 'Hostel' }], error: null },
    ]);

    const result = await readComplaintCategories(client, 'inst-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.anonymousColumnPresent).toBe(false);
    expect(result.categories).toEqual([{ id: 'c1', name: 'Hostel', allow_anonymous: false }]);
  });

  it('carries the rule through when the column is there', async () => {
    const client = queryClient([
      {
        data: [
          { id: 'c1', name: 'Hostel', allow_anonymous: true },
          { id: 'c2', name: 'Fees', allow_anonymous: false },
          { id: 'c3', name: 'Transport', allow_anonymous: null },
        ],
        error: null,
      },
    ]);

    const result = await readComplaintCategories(client, 'inst-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.anonymousColumnPresent).toBe(true);
    expect(result.categories.map((c) => c.allow_anonymous)).toEqual([true, false, false]);
  });
});

describe('an empty list and a failed read are different answers', () => {
  it('says empty when the college has set none up', async () => {
    const result = await readComplaintCategories(queryClient([{ data: [], error: null }]), 'inst-1');
    expect(result).toEqual({ ok: false, reason: 'empty' });
  });

  it('says empty, not error, when the column is absent AND the list is bare', async () => {
    const result = await readComplaintCategories(
      queryClient([
        { data: null, error: { code: '42703', message: 'column does not exist' } },
        { data: [], error: null },
      ]),
      'inst-1'
    );
    expect(result).toEqual({ ok: false, reason: 'empty' });
  });

  it('says error when the read fails — never an empty list, which reads as a settled fact', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await readComplaintCategories(
      queryClient([{ data: null, error: { code: '57014', message: 'canceling statement' } }]),
      'inst-1'
    );
    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  it('says error when the fallback read fails too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await readComplaintCategories(
      queryClient([
        { data: null, error: { code: '42703', message: 'column does not exist' } },
        { data: null, error: { code: '42501', message: 'permission denied' } },
      ]),
      'inst-1'
    );
    expect(result).toEqual({ ok: false, reason: 'error' });
  });
});

describe('the no-name promise is never withdrawn in silence', () => {
  const anon = { id: 'c1', name: 'Harassment', allow_anonymous: true };
  const named = { id: 'c2', name: 'Fees', allow_anonymous: false };

  it('honours the tick on a type that permits it', () => {
    expect(
      resolveAnonymousChoice({ anonymousAvailable: true, category: anon, ticked: true })
    ).toEqual({ allowed: true, anonymous: true, retracted: false });
  });

  it('reports the retraction when the new type does not permit it', () => {
    // This is the bug: the tick used to stay true in state while the checkbox
    // unmounted, so the filing went out with the person's name on it and they
    // were never told.
    expect(
      resolveAnonymousChoice({ anonymousAvailable: true, category: named, ticked: true })
    ).toEqual({ allowed: false, anonymous: false, retracted: true });
  });

  it('does not cry retraction when nothing was ticked', () => {
    expect(
      resolveAnonymousChoice({ anonymousAvailable: true, category: named, ticked: false })
    ).toEqual({ allowed: false, anonymous: false, retracted: false });
  });

  it('refuses the option before a type has been chosen', () => {
    expect(
      resolveAnonymousChoice({ anonymousAvailable: true, category: null, ticked: false }).allowed
    ).toBe(false);
  });

  it('refuses the option entirely while the column is absent, even on a permitting type', () => {
    expect(
      resolveAnonymousChoice({ anonymousAvailable: false, category: anon, ticked: true })
    ).toEqual({ allowed: false, anonymous: false, retracted: true });
  });
});

describe('routing a complaint about the filer’s own superior', () => {
  const uuid = '583f39e2-8334-4028-ba72-e4aadfdf7483';

  function policyClient(result: { data?: unknown; error?: unknown }) {
    return {
      from: () => ({}) as never,
      rpc: () => Promise.resolve(result as { data: unknown; error: unknown }),
    };
  }

  it('returns the configured profile id', async () => {
    await expect(resolveSuperiorRouteProfileId(policyClient({ data: uuid, error: null }))).resolves.toBe(
      uuid
    );
  });

  it('accepts the row saved as an object', async () => {
    await expect(
      resolveSuperiorRouteProfileId(policyClient({ data: { profile_id: uuid }, error: null }))
    ).resolves.toBe(uuid);
  });

  it('returns nobody when the policy row is absent — never the head of department', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(resolveSuperiorRouteProfileId(policyClient({ data: null, error: null }))).resolves.toBeNull();
  });

  it('returns nobody when the policy read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      resolveSuperiorRouteProfileId(policyClient({ data: null, error: { message: 'boom' } }))
    ).resolves.toBeNull();
  });

  it('refuses a value that is not a profile id', async () => {
    await expect(
      resolveSuperiorRouteProfileId(policyClient({ data: 'the joint md', error: null }))
    ).resolves.toBeNull();
  });
});

describe('subject bounds', () => {
  it('refuses a title that is too short and accepts one that fits', () => {
    expect(validateSubject('hi')).not.toBeNull();
    expect(validateSubject('Broken fan in room 12')).toBeNull();
  });

  it('refuses a title beyond the maximum', () => {
    expect(validateSubject('a'.repeat(SUBJECT_MAX_LENGTH + 1))).not.toBeNull();
  });
});

describe('a stale I8 policy value must not lose the complaint', () => {
  const uuid = '583f39e2-8334-4028-ba72-e4aadfdf7483';

  /** A `from()` chain that resolves on maybeSingle(). */
  function profileClient(response: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {};
    const step = () => chain;
    chain.select = step;
    chain.eq = step;
    chain.maybeSingle = () => Promise.resolve(response as { data: unknown; error: unknown });
    return {
      from: () => chain as never,
      rpc: () => Promise.resolve({ data: null, error: null }),
    };
  }

  it('confirms a profile that is there', async () => {
    await expect(
      confirmProfileExists(profileClient({ data: { id: uuid }, error: null }), uuid)
    ).resolves.toBe(true);
  });

  it('reports a deleted or cross-institution id as absent', async () => {
    // grievance_tickets.assigned_to has a foreign key to profiles, so writing
    // this id would raise 23503 and fail the whole insert — losing the one
    // complaint this lane most needs to keep.
    await expect(
      confirmProfileExists(profileClient({ data: null, error: null }), uuid)
    ).resolves.toBe(false);
  });

  it('fails closed when the check itself errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      confirmProfileExists(profileClient({ data: null, error: { message: 'boom' } }), uuid)
    ).resolves.toBe(false);
  });

  it('fails closed when the check throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const thrower = {
      from: () => {
        throw new Error('socket closed');
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
    };
    await expect(confirmProfileExists(thrower, uuid)).resolves.toBe(false);
  });
});
