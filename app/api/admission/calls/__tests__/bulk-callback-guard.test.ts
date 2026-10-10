// @vitest-environment node
// Guard tests for /api/admission/calls/bulk-callback.
//
// The route lists admission_callback_queue rows (caller phone numbers of
// parents and prospective learners) and places billed outbound calls. It
// must require the admission calls permission and stay inside the caller's
// institutions. The real withAuth wrapper runs here; only its dependencies
// (cookies, Supabase clients, preview session, institution helper, telephony)
// are mocked, so the permission check itself is exercised.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const INST_A = '11111111-1111-1111-1111-111111111111';
const INST_B = '22222222-2222-2222-2222-222222222222';

// ── Test-controlled state ─────────────────────────────────────
const state = {
  isSuperAdmin: false,
  isAdmin: false,
  hasPermission: false,
  accessible: [INST_A] as string[],
  profileRole: 'staff',
  queueRows: [] as Array<Record<string, unknown>>,
};

const queueFromCalls: string[] = [];
const queueUpdates: Array<Record<string, unknown>> = [];
const queueFilters: Array<[string, string, unknown]> = [];
const initiateCall = vi.fn();

const USER = { id: 'user-1', email: 'u@example.com' };

// Chainable query builder that records filters and resolves to rows.
function makeQueueQuery() {
  let rows = state.queueRows.slice();
  const q: any = {
    select: () => q,
    order: () => q,
    limit: () => q,
    eq: (col: string, val: unknown) => {
      queueFilters.push(['eq', col, val]);
      rows = rows.filter((r) => r[col] === val);
      return q;
    },
    in: (col: string, vals: unknown[]) => {
      queueFilters.push(['in', col, vals]);
      rows = rows.filter((r) => vals.includes(r[col]));
      return q;
    },
    update: (patch: Record<string, unknown>) => {
      queueUpdates.push(patch);
      const u: any = { eq: () => Promise.resolve({ data: null, error: null }) };
      return u;
    },
    single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: any, reject: any) =>
      Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return q;
}

function makeProfilesQuery() {
  const q: any = {
    select: () => q,
    eq: () => q,
    single: () =>
      Promise.resolve({
        data: {
          id: USER.id,
          email: USER.email,
          role: state.profileRole,
          institution_id: INST_A,
          full_name: 'Test User',
          phone: '9876543210',
        },
        error: null,
      }),
  };
  return q;
}

const userClient: any = {
  auth: { getUser: () => Promise.resolve({ data: { user: USER }, error: null }) },
  from: (table: string) => {
    if (table === 'profiles') return makeProfilesQuery();
    throw new Error(`user client should not read ${table}`);
  },
  rpc: (name: string) => {
    if (name === 'is_super_admin') return Promise.resolve({ data: state.isSuperAdmin, error: null });
    if (name === 'is_admin') return Promise.resolve({ data: state.isAdmin, error: null });
    if (name === 'user_has_permission') return Promise.resolve({ data: state.hasPermission, error: null });
    return Promise.resolve({ data: null, error: null });
  },
};

const serviceClient: any = {
  from: (table: string) => {
    if (table === 'admission_callback_queue') {
      queueFromCalls.push(table);
      return makeQueueQuery();
    }
    if (table === 'profiles') return makeProfilesQuery();
    throw new Error(`unexpected service table ${table}`);
  },
};

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [{ name: 'sb-test-auth-token', value: 'x' }],
    get: () => ({ value: 'x' }),
    set: () => {},
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => userClient,
  createServiceRoleClient: () => serviceClient,
  getAuthUser: async () => ({ user: USER, error: null }),
}));

vi.mock('@/lib/auth/preview-session', () => ({
  getPreviewClaimsFromCookies: async () => null,
  writePreviewAudit: async () => {},
  canUseWriteMode: () => false,
}));

vi.mock('@/lib/auth/impersonate', () => ({ createImpersonatedClient: vi.fn() }));

vi.mock('@/lib/services/base-service', () => ({
  BaseService: { runWithClient: (_c: unknown, fn: () => unknown) => fn() },
}));

// Mirrors the real helper's contract: super admin / admission-global users
// get [] (= all); others get their accessible list; a specific institution
// outside that list is refused.
vi.mock('@/lib/auth/api-institution-filter', async (importOriginal) => ({
  // Keep the real query-narrowing helper; only the lookup is stubbed.
  applyInstitutionFilterToQuery: (await importOriginal<any>()).applyInstitutionFilterToQuery,
  createApiInstitutionFilter: async (
    _req: unknown,
    opts: { allowSpecificInstitution?: string } = {}
  ) => {
    if (state.isSuperAdmin) {
      return { isAllowed: true, institutionIds: [], isSuperAdmin: true };
    }
    if (state.accessible.length === 0) {
      return { isAllowed: false, institutionIds: [], isSuperAdmin: false };
    }
    if (opts.allowSpecificInstitution) {
      return state.accessible.includes(opts.allowSpecificInstitution)
        ? { isAllowed: true, institutionIds: [opts.allowSpecificInstitution], isSuperAdmin: false }
        : { isAllowed: false, institutionIds: [], isSuperAdmin: false };
    }
    return { isAllowed: true, institutionIds: state.accessible, isSuperAdmin: false };
  },
}));

vi.mock('@/lib/services/telephony/telephony-service', () => ({
  TelephonyService: {
    initiateCall: (...args: unknown[]) => initiateCall(...args),
    isConfigured: () => true,
  },
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { GET, POST } from '../bulk-callback/route';

const rowA = { id: 'cb-a', institution_id: INST_A, caller_number: '9000000001', lead_id: null, status: 'pending' };
const rowB = { id: 'cb-b', institution_id: INST_B, caller_number: '9000000002', lead_id: null, status: 'pending' };

function getReq(qs = '') {
  return new NextRequest(`http://localhost/api/admission/calls/bulk-callback${qs}`);
}
function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/admission/calls/bulk-callback', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  state.isSuperAdmin = false;
  state.isAdmin = false;
  state.hasPermission = false;
  state.accessible = [INST_A];
  state.profileRole = 'staff';
  state.queueRows = [rowA, rowB];
  queueFromCalls.length = 0;
  queueUpdates.length = 0;
  queueFilters.length = 0;
  initiateCall.mockReset();
  initiateCall.mockResolvedValue({ success: true, call_log_id: 'log-1' });
});

describe('GET /api/admission/calls/bulk-callback', () => {
  it('refuses a signed-in user without the calls permission, before reading the queue', async () => {
    const res = await GET(getReq('?status=pending'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(queueFromCalls).toHaveLength(0);
  });

  it('with the permission, returns only rows from the caller\'s institutions', async () => {
    state.hasPermission = true;
    const res = await GET(getReq('?status=pending'));
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.map((r: any) => r.id)).toEqual(['cb-a']);
  });

  it('refuses an institution_id outside the caller\'s scope', async () => {
    state.hasPermission = true;
    const res = await GET(getReq(`?status=pending&institution_id=${INST_B}`));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(queueFromCalls).toHaveLength(0);
  });

  it('allows an institution_id inside the caller\'s scope', async () => {
    state.hasPermission = true;
    const res = await GET(getReq(`?status=pending&institution_id=${INST_A}`));
    expect(res.status).toBe(200);
    expect((await res.json()).map((r: any) => r.id)).toEqual(['cb-a']);
  });

  it('super admin sees every institution', async () => {
    state.isSuperAdmin = true;
    state.accessible = [];
    const res = await GET(getReq('?status=pending'));
    expect(res.status).toBe(200);
    expect((await res.json()).map((r: any) => r.id).sort()).toEqual(['cb-a', 'cb-b']);
  });
});

describe('POST /api/admission/calls/bulk-callback', () => {
  it('refuses a signed-in user without the calls permission', async () => {
    const res = await POST(postReq({ callbackIds: ['cb-a'] }));
    expect(res.status).toBe(403);
    expect(queueUpdates).toHaveLength(0);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('refuses a foreign-institution callback id: nothing updated, no call placed', async () => {
    state.hasPermission = true;
    const res = await POST(postReq({ callbackIds: ['cb-a', 'cb-b'] }));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(queueUpdates).toHaveLength(0);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('keeps the 20-callback cap', async () => {
    state.hasPermission = true;
    const ids = Array.from({ length: 21 }, (_, i) => `cb-${i}`);
    const res = await POST(postReq({ callbackIds: ids }));
    expect(res.status).toBe(400);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('happy path: own-institution callback is marked in progress and called', async () => {
    state.hasPermission = true;
    const res = await POST(postReq({ callbackIds: ['cb-a'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.initiated).toBe(1);
    expect(initiateCall).toHaveBeenCalledTimes(1);
    expect(initiateCall.mock.calls[0][0]).toMatchObject({
      institution_id: INST_A,
      prospect_phone: '9000000001',
      counselor_id: USER.id,
    });
    expect(queueUpdates[0]).toEqual({ status: 'in_progress' });
  });
});
