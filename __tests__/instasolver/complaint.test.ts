// __tests__/instasolver/complaint.test.ts
//
// The three rules in lib/instasolver/complaint.ts that decide whether a
// complaint reaches the right desk, is recorded against the right persona, and
// never quietly lands back with the person it is about.

import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  SUBJECT_MAX_LENGTH,
  mapRoleToRaisedByType,
  mintAnonymousToken,
  readComplaintCategories,
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

  it('records a Senior Learner under their own persona, not as a learner', () => {
    // The Learners Council board's own mapping answers 'learner' here, which is
    // the gap this lane's mapping closes.
    expect(mapRoleToRaisedByType('faculty')).toBe('faculty');
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
    expect(mapRoleToRaisedByType('  Faculty ')).toBe('faculty');
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

    const { categories, anonymousColumnPresent } = await readComplaintCategories(client, 'inst-1');

    expect(anonymousColumnPresent).toBe(false);
    expect(categories).toEqual([{ id: 'c1', name: 'Hostel', allow_anonymous: false }]);
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

    const { categories, anonymousColumnPresent } = await readComplaintCategories(client, 'inst-1');

    expect(anonymousColumnPresent).toBe(true);
    expect(categories.map((c) => c.allow_anonymous)).toEqual([true, false, false]);
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
