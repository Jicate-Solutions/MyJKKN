/**
 * Foundation — /api/foundation/practice/facilitate must refuse, not just return empty.
 *
 * Verified live on production 2026-08-04: a signed-in account WITHOUT
 * foundation.practice.take received `200 {"cohorts":[]}` from this route while
 * the page correctly refused it. That was never a leak — the cohort query is
 * scoped to resource_person_id = the caller — but it meant the permission lived
 * in exactly one layer, and in the layer a refactor is most likely to touch.
 *
 * The distinction these tests hold on to: "you are allowed, and you run no
 * groups" (200, empty) is a different answer from "you are not allowed" (403).
 * A caller cannot tell those apart from an empty array, and neither can a
 * future reader of the code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let currentUser: { id: string } | null = { id: 'user-1' };
let permissionResult: boolean | null = true;
let cohortRows: Array<Record<string, unknown>> = [];

/** Every rpc the handler calls, so a test can assert the gate actually ran. */
let rpcCalls: Array<{ name: string; args: any }> = [];
/** True if the handler touched a table — proves refusal happens BEFORE the query. */
let touchedTables: string[] = [];

function sessionBuilder(table: string) {
  touchedTables.push(table);
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    in: vi.fn(() => b),
    is: vi.fn(() => b),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: (resolve: any) =>
      resolve({ data: table === 'fp_cohorts' ? cohortRows : [], error: null }),
  };
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) },
      from: (t: string) => sessionBuilder(t),
      rpc: (name: string, args: any) => {
        rpcCalls.push({ name, args });
        if (name === 'user_has_permission') {
          return Promise.resolve({ data: permissionResult, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    }),
  createServiceRoleClient: () => ({
    from: () => ({
      select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ count: 0 })) })),
    }),
    rpc: () => Promise.resolve({ data: 10, error: null }),
  }),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

import { GET } from '@/app/api/foundation/practice/facilitate/route';

beforeEach(() => {
  currentUser = { id: 'user-1' };
  permissionResult = true;
  cohortRows = [];
  rpcCalls = [];
  touchedTables = [];
});

describe('GET /api/foundation/practice/facilitate — the gate', () => {
  it('refuses an unauthenticated caller with 401', async () => {
    currentUser = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('refuses 403 when the caller lacks foundation.practice.take', async () => {
    permissionResult = false;
    const res = await GET();
    expect(res.status).toBe(403);
    // The regression this file exists for: 200 with an empty list.
    expect(res.status).not.toBe(200);
  });

  it('checks the SAME key the page checks', async () => {
    permissionResult = false;
    await GET();
    const call = rpcCalls.find((c) => c.name === 'user_has_permission');
    expect(call).toBeDefined();
    expect(call!.args.permission_name).toBe('foundation.practice.take');
  });

  it('uses the auth.uid()-resolving overload — no caller-supplied user id', async () => {
    await GET();
    const call = rpcCalls.find((c) => c.name === 'user_has_permission');
    // A `user_id` argument here would be the IDOR shape this repo has been bitten by.
    expect(call!.args).not.toHaveProperty('user_id');
    expect(Object.keys(call!.args)).toEqual(['permission_name']);
  });

  it('refuses BEFORE querying any table', async () => {
    permissionResult = false;
    await GET();
    expect(touchedTables).toEqual([]);
  });

  it('treats a null/undefined permission result as refusal, not permission', async () => {
    permissionResult = null;
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('still answers 200 for a holder who simply runs no groups', async () => {
    permissionResult = true;
    cohortRows = [];
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cohorts: [] });
  });
});
