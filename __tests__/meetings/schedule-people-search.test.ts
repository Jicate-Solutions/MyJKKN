// __tests__/meetings/schedule-people-search.test.ts
//
// Institution scoping for the Schedule-a-Meeting people picker.
//
// Why this file exists: `profiles_select_policy` is
// `FOR SELECT USING (auth.uid() IS NOT NULL)` — every signed-in user can read
// ALL ~6,400 active profiles across all 14 institutions. RLS scopes nothing
// here, so the institution filter in searchPeople is the ONLY thing preventing
// cross-tenant enumeration of names, emails and designations. If someone
// removes it, these tests are what notices.
//
// Second guarantee: the search must not build a PostgREST `.or()` filter from
// user input. `.or()` takes a filter GRAMMAR, so `,` `(` `)` `.` in the term
// become operators; escaping only `%`/`_` leaves the grammar attacker-shaped.
// Parameterised `.ilike()` is the fix, and it is asserted here.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const serviceDb = { from: vi.fn() };

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
  createServiceRoleClient: () => serviceDb,
}));

// actions.ts imports the scheduling service for scheduleMeeting; that pulls in
// the Resend-backed mailer, which constructs a client at module load and throws
// without RESEND_API_KEY. searchPeople touches none of it — stub it out so this
// file tests the picker and nothing else.
vi.mock('@/lib/services/meetings/host-scheduling-service', () => ({
  HostSchedulingService: { scheduleDirect: vi.fn() },
}));

import { searchPeople } from '@/app/(routes)/meetings/schedule/actions';

const CALLER = 'user-1';
const OWN_INSTITUTION = 'inst-own';

/** Records every filter the query builder was asked for. */
function makeDb(opts: {
  isSuperAdmin?: boolean;
  scopes?: string[];
  rows?: Array<Record<string, unknown>>;
}) {
  const calls: { eq: Record<string, unknown>; ilike: Record<string, string>; or: string[] } = {
    eq: {},
    ilike: {},
    or: [],
  };
  const rows = opts.rows ?? [
    { id: 'p1', full_name: 'Anitha R', email: 'anitha@jkkn.ac.in', designation: 'HOD' },
  ];

  serviceDb.from.mockImplementation((table: string) => {
    if (table === 'profiles') {
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          // The profile lookup for the caller also uses .eq('id', ...).
          if (col === 'id') {
            builder.__isProfileLookup = true;
            return builder;
          }
          calls.eq[col] = val;
          return builder;
        },
        not: () => builder,
        or: (s: string) => {
          calls.or.push(s);
          return builder;
        },
        ilike: (col: string, pattern: string) => {
          calls.ilike[col] = pattern;
          return builder;
        },
        limit: async () => ({ data: rows, error: null }),
        maybeSingle: async () => ({
          data: {
            institution_id: OWN_INSTITUTION,
            is_super_admin: opts.isSuperAdmin === true,
          },
        }),
      };
      return builder;
    }
    // user_roles
    return {
      select: () => ({
        eq: async () => ({
          data: (opts.scopes ?? ['own']).map((s) => ({
            custom_roles: { institution_scope: s, is_active: true },
          })),
          error: null,
        }),
      }),
    };
  });

  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: CALLER } }, error: null });
});

describe('searchPeople — institution scoping (cross-tenant guard)', () => {
  it('an ordinary caller is CONFINED to their own institution', async () => {
    const calls = makeDb({ scopes: ['own'] });
    const res = await searchPeople('ani');

    expect(res.success).toBe(true);
    expect(calls.eq.institution_id).toBe(OWN_INSTITUTION);
  });

  it('a super admin is NOT confined', async () => {
    const calls = makeDb({ isSuperAdmin: true });
    await searchPeople('ani');
    expect(calls.eq.institution_id).toBeUndefined();
  });

  it("a role carrying institution_scope 'all' is NOT confined", async () => {
    const calls = makeDb({ scopes: ['own', 'all'] });
    await searchPeople('ani');
    expect(calls.eq.institution_id).toBeUndefined();
  });

  it('FAILS CLOSED — no institution and no cross-institution role returns nothing', async () => {
    serviceDb.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        const b: any = {
          select: () => b,
          eq: () => b,
          maybeSingle: async () => ({ data: { institution_id: null, is_super_admin: false } }),
        };
        return b;
      }
      return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
    });

    const res = await searchPeople('ani');
    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
  });

  it('only active accounts with an email are searched', async () => {
    const calls = makeDb({ scopes: ['own'] });
    await searchPeople('ani');
    expect(calls.eq.is_active).toBe(true);
  });
});

describe('searchPeople — filter injection', () => {
  it('NEVER builds an interpolated PostgREST .or() filter from user input', async () => {
    const calls = makeDb({ scopes: ['own'] });
    await searchPeople('a,b(c).d');
    expect(calls.or).toEqual([]);
  });

  it('passes the term as a parameterised ilike value on both columns', async () => {
    const calls = makeDb({ scopes: ['own'] });
    await searchPeople('a,b(c).d');
    // Reserved PostgREST grammar characters survive verbatim as DATA, which is
    // exactly the point — they are no longer part of a filter expression.
    expect(calls.ilike.full_name).toBe('%a,b(c).d%');
    expect(calls.ilike.email).toBe('%a,b(c).d%');
  });

  it('escapes LIKE wildcards so a typed % cannot widen the match', async () => {
    const calls = makeDb({ scopes: ['own'] });
    await searchPeople('%a');
    // The user's % is escaped to a literal; only our own surrounding % are wild.
    expect(calls.ilike.full_name).toBe('%\\%a%');
  });

  it('a term under 2 characters searches nothing at all', async () => {
    const calls = makeDb({ scopes: ['own'] });
    const res = await searchPeople('a');
    expect(res.data).toEqual([]);
    expect(calls.ilike.full_name).toBeUndefined();
  });

  it('deduplicates a person matched by BOTH name and email', async () => {
    makeDb({
      scopes: ['own'],
      rows: [{ id: 'p1', full_name: 'Anitha R', email: 'anitha@jkkn.ac.in', designation: 'HOD' }],
    });
    const res = await searchPeople('anitha');
    expect(res.data).toHaveLength(1);
  });
});
