// ============================================================================
// GET /api/bos/compositions/[id] — the detail page must open every composition
// the list page shows (BUG-005317, BUG-005355: "Composition not found.")
// ============================================================================
// Drives the REAL exported route handler. Two Supabase clients are faked:
//   - the user-context client behaves like production RLS for a caller who
//     lacks academic.bos-compositions.view — a .single() on bos_compositions
//     comes back PGRST116 (zero rows), exactly what the bos_compositions_select
//     policy does to a board member or creator without that grant, and to a
//     read-all observer who is not a member;
//   - the service-role client returns the row.
// The list route (GET /api/bos/compositions) already reads with service-role
// and admits read-all observers, so both callers below see the row in the list.
// ============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const COMP_ID = 'comp-it';
const COMP_ROW = {
  id: COMP_ID,
  institutions_id: 'inst-cet',
  board_id: 'board-it',
  created_by: 'someone-else',
  members: [{ id: 'm1', staff_id: 's1' }],
};

type Scope = {
  isSuperAdmin: boolean;
  isPrincipal: boolean;
  institutionsId: string | null;
  allInstitutionIds: string[];
  memberOf: Set<string>;
};
let scope: Scope;
let grants: Set<string>;

function builder(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order']) b[m] = () => b;
  b.single = async () => result;
  b.maybeSingle = async () => result;
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    // RLS hides the row from this caller.
    from: () => builder({ data: null, error: { code: 'PGRST116', message: '0 rows' } }),
  })),
  createServiceRoleClient: vi.fn(() => ({
    from: (table: string) =>
      table === 'bos_compositions'
        ? builder({ data: structuredClone(COMP_ROW), error: null })
        : builder({ data: [], error: null }),
  })),
}));

vi.mock('@/lib/utils/bos/bos-access', () => ({
  resolveBosBoardScope: vi.fn(async () => scope),
  hasBosPermission: vi.fn(async (_u: string, key: string) => grants.has(key)),
  isBosReadAllObserver: (s: Scope, hasView: boolean) => (s.isSuperAdmin ? false : hasView),
  guardCompositionChairman: vi.fn(),
}));

vi.mock('@/lib/utils/bos/coe-boards', () => ({
  fetchCoeBoardMaps: vi.fn(async () => new Map()),
  fetchCoeBoardMap: vi.fn(async () => new Map()),
}));

async function get() {
  const { GET } = await import('@/app/api/bos/compositions/[id]/route');
  const res = await GET({} as NextRequest, { params: Promise.resolve({ id: COMP_ID }) });
  return { status: res.status, body: await res.json() };
}

const baseScope = (): Scope => ({
  isSuperAdmin: false,
  isPrincipal: false,
  institutionsId: 'inst-cet',
  allInstitutionIds: ['inst-cet'],
  memberOf: new Set(),
});

describe('GET /api/bos/compositions/[id] visibility', () => {
  beforeEach(() => {
    scope = baseScope();
    grants = new Set();
  });

  it('opens for a board member of the composition who lacks the compositions.view grant', async () => {
    scope.memberOf = new Set([COMP_ID]);
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.id).toBe(COMP_ID);
    expect(body.members).toHaveLength(1);
  });

  it('opens for a read-all observer (compositions.view) who sits on no board — the list shows them every composition', async () => {
    grants = new Set(['academic.bos-compositions.view']);
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.id).toBe(COMP_ID);
    // No academic.bos-members.view → the roster is not widened.
    expect(body.members).toEqual([]);
  });

  it('keeps the roster for an observer who also holds members.view', async () => {
    grants = new Set(['academic.bos-compositions.view', 'academic.bos-members.view']);
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.members).toHaveLength(1);
  });

  it('still refuses a caller who is neither member, creator, principal nor observer', async () => {
    const { status, body } = await get();
    expect(status).toBe(404);
    expect(body.error).toBe('Composition not found');
  });
});
