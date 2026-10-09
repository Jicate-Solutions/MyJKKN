/**
 * PATCH /api/social/instagram/accounts/[id] — name who runs an account.
 *
 * Director's ruling 2026-10-07: every active Instagram account has ONE named
 * team member who runs it (posts a learner's work, invites the learner as
 * collaborator). Stored in ig_accounts.connected_by.
 *
 * Pins:
 *   - no sign-in                                  -> 401
 *   - no social.instagram.manage                  -> 403, and nothing written
 *   - the permission check itself failed          -> 500, not "not allowed"
 *   - account outside the caller's institutions   -> 404, same answer as unknown
 *   - a path id that is not a uuid                -> 404, no database read
 *   - a person-access lookup that failed          -> 500, not a refusal
 *   - unknown person / a learner / inactive /
 *     wrong institution / not a uuid              -> 400, nothing written
 *   - a team member of the institution            -> 200, connected_by set
 *   - a team member with a cross-institution grant-> 200
 *   - null                                        -> 200, connected_by cleared
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const INSTITUTION_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_INSTITUTION_ID = '33333333-3333-4333-8333-333333333333';
const PERSON_ID = '44444444-4444-4444-8444-444444444444';

type Row = Record<string, unknown>;

let currentUser: { id: string } | null = { id: 'caller' };
let rpcResults: Record<string, { data: unknown; error: unknown }> = {};
let accountRow: Row | null = null;
let personRow: Row | null = null;
let scopeAllRoleRows: Row[] = [];
let legacyScopeAllRows: Row[] = [];
let grantRows: Row[] = [];
let grantError: unknown = null;
let accountReads = 0;
const updates: Array<{ table: string; values: Row; eqId: unknown }> = [];

/** Chainable service-role stand-in that answers per table. */
function svcClient() {
  return {
    from(table: string) {
      const state: { values?: Row; eqs: Array<[string, unknown]> } = { eqs: [] };
      const b: any = {
        select: () => b,
        eq: (col: string, val: unknown) => {
          state.eqs.push([col, val]);
          return b;
        },
        update: (values: Row) => {
          state.values = values;
          return b;
        },
        limit: () => {
          if (table === 'user_roles') return Promise.resolve({ data: scopeAllRoleRows, error: null });
          if (table === 'custom_roles') return Promise.resolve({ data: legacyScopeAllRows, error: null });
          if (table === 'user_institution_access') return Promise.resolve({ data: grantRows, error: grantError });
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle: () => {
          if (table === 'ig_accounts' && state.values) {
            const eqId = state.eqs.find(([c]) => c === 'id')?.[1];
            updates.push({ table, values: state.values, eqId });
            return Promise.resolve({
              data: accountRow ? { id: accountRow.id, connected_by: state.values.connected_by } : null,
              error: null,
            });
          }
          if (table === 'ig_accounts') {
            accountReads += 1;
            return Promise.resolve({ data: accountRow, error: null });
          }
          if (table === 'profiles') return Promise.resolve({ data: personRow, error: null });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return b;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser }, error: null }) },
      rpc: (fn: string) => Promise.resolve(rpcResults[fn] ?? { data: null, error: null }),
    }),
  createServiceRoleClient: () => svcClient(),
}));

vi.mock('@/lib/services/social/ig-post-lookup', () => ({
  fetchLatestPostMetrics: vi.fn(),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

import { PATCH } from '@/app/api/social/instagram/accounts/[id]/route';

function patch(body: unknown, id: string = ACCOUNT_ID) {
  const req = new Request(`https://jkkn.ai/api/social/instagram/accounts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
  return PATCH(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  currentUser = { id: 'caller' };
  rpcResults = {
    user_has_permission: { data: true, error: null },
    role_has_institution_access: { data: true, error: null },
  };
  accountRow = { id: ACCOUNT_ID, institution_id: INSTITUTION_ID };
  personRow = {
    id: PERSON_ID,
    full_name: 'Priya Raman',
    email: 'priya@jkkn.ac.in',
    learner_id: null,
    institution_id: INSTITUTION_ID,
    is_active: true,
    is_super_admin: false,
    role: 'faculty',
  };
  scopeAllRoleRows = [];
  legacyScopeAllRows = [];
  grantRows = [];
  grantError = null;
  accountReads = 0;
  updates.length = 0;
});

describe('PATCH /api/social/instagram/accounts/[id] — who runs this account', () => {
  it('refuses a caller who is not signed in with 401', async () => {
    currentUser = null;
    const res = await patch({ connected_by: PERSON_ID });
    expect(res.status).toBe(401);
    expect(updates).toHaveLength(0);
  });

  it('refuses a caller without social.instagram.manage with 403 and writes nothing', async () => {
    rpcResults.user_has_permission = { data: false, error: null };
    const res = await patch({ connected_by: PERSON_ID });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Manage Instagram Accounts/);
    expect(updates).toHaveLength(0);
  });

  it('answers 500 (not a refusal) when the permission check itself fails', async () => {
    rpcResults.user_has_permission = { data: null, error: { message: 'permission denied for function' } };
    const res = await patch({ connected_by: PERSON_ID });
    expect(res.status).toBe(500);
    expect(updates).toHaveLength(0);
  });

  it('answers an account in an institution the caller cannot reach exactly like a missing one', async () => {
    rpcResults.role_has_institution_access = { data: false, error: null };
    const outside = await patch({ connected_by: PERSON_ID });
    const outsideJson = await outside.json();
    accountRow = null;
    const missing = await patch({ connected_by: PERSON_ID });
    const missingJson = await missing.json();
    expect(outside.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(outsideJson).toEqual(missingJson);
    expect(updates).toHaveLength(0);
  });

  it('answers 404 for a path id that is not a uuid, without reading the database', async () => {
    const res = await patch({ connected_by: PERSON_ID }, 'foo');
    expect(res.status).toBe(404);
    expect(accountReads).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it('answers 500 (not a refusal) when a person-access lookup fails', async () => {
    personRow = { ...personRow, institution_id: OTHER_INSTITUTION_ID };
    grantError = { message: 'timeout' };
    const res = await patch({ connected_by: PERSON_ID });
    expect(res.status).toBe(500);
    expect(updates).toHaveLength(0);
  });

  it('rejects a body without connected_by, or a value that is not an id, with 400', async () => {
    expect((await patch({})).status).toBe(400);
    expect((await patch({ connected_by: 'priya' })).status).toBe(400);
    expect((await patch({ connected_by: 42 })).status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it('rejects an unknown person with 400', async () => {
    personRow = null;
    const res = await patch({ connected_by: PERSON_ID });
    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it('rejects a learner profile with 400 and writes nothing', async () => {
    personRow = { ...personRow, learner_id: '55555555-5555-4555-8555-555555555555' };
    const res = await patch({ connected_by: PERSON_ID });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/learner/i);
    expect(updates).toHaveLength(0);
  });

  it('rejects an inactive team member with 400', async () => {
    personRow = { ...personRow, is_active: false };
    const res = await patch({ connected_by: PERSON_ID });
    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it('rejects a team member of another institution with no access to this one', async () => {
    personRow = { ...personRow, institution_id: OTHER_INSTITUTION_ID };
    const res = await patch({ connected_by: PERSON_ID });
    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it('accepts a team member of another institution who holds an access grant to this one', async () => {
    personRow = { ...personRow, institution_id: OTHER_INSTITUTION_ID };
    grantRows = [{ id: 'grant-1' }];
    const res = await patch({ connected_by: PERSON_ID });
    expect(res.status).toBe(200);
    expect(updates[0].values.connected_by).toBe(PERSON_ID);
  });

  it('accepts a team member of another institution whose role covers all institutions', async () => {
    personRow = { ...personRow, institution_id: OTHER_INSTITUTION_ID };
    scopeAllRoleRows = [{ role_id: 'r1' }];
    const res = await patch({ connected_by: PERSON_ID });
    expect(res.status).toBe(200);
  });

  it('sets connected_by for a team member of the account institution (200)', async () => {
    const res = await patch({ connected_by: PERSON_ID });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      data: { id: ACCOUNT_ID, connected_by: PERSON_ID, connected_by_name: 'Priya Raman' },
    });
    expect(updates).toHaveLength(1);
    expect(updates[0].eqId).toBe(ACCOUNT_ID);
    expect(updates[0].values.connected_by).toBe(PERSON_ID);
  });

  it('clears connected_by when given null (200)', async () => {
    const res = await patch({ connected_by: null });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.connected_by).toBeNull();
    expect(updates).toHaveLength(1);
    expect(updates[0].values.connected_by).toBeNull();
  });
});
