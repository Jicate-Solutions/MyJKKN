// @vitest-environment node
// Guard tests for /api/admission/calls/bulk-callback.
//
// The route lists admission_callback_queue rows (caller phone numbers of
// parents and prospective learners) and places billed outbound calls. GET
// must require 'admission.leads.view', POST 'admission.leads.edit', and both
// must stay inside the caller's institutions.
//
// The REAL withAuth wrapper and the REAL createApiInstitutionFilter run here.
// Only their dependencies are mocked: cookies, the Supabase clients (the
// filter's @supabase/ssr client answers profiles + get_user_accessible_
// institutions from test state), preview session, telephony and the logger.
// One describe block overrides the filter's result to pin the route's own
// reading of an ambiguous { isAllowed:true, institutionIds:[] } answer.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const INST_A = '11111111-1111-1111-1111-111111111111';
const INST_B = '22222222-2222-2222-2222-222222222222';
const CB_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const CB_B = 'bbbbbbbb-0000-4000-8000-00000000000b';

// ── Test-controlled state ─────────────────────────────────────
const state = {
  isSuperAdmin: false,
  isAdmin: false,
  grantedPermissions: [] as string[],
  accessible: [INST_A] as string[],
  profileRole: 'staff',
  queueRows: [] as Array<Record<string, unknown>>,
  filterOverride: null as null | Record<string, unknown>,
};

const queueFromCalls: string[] = [];
const queueUpdates: Array<Record<string, unknown>> = [];
const queueFilters: Array<[string, string, unknown]> = [];
const permissionChecks: string[] = [];
const initiateCall = vi.fn();

const USER = { id: 'user-1', email: 'u@example.com' };

// Every key either version of the route asks for. Tests that pin scope or
// input validation grant all of them, so a refusal can only come from the
// check under test, never from the permission gate.
const ALL_KEYS = ['admission.leads.view', 'admission.leads.edit', 'admission.counselors.view'];

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
  rpc: (name: string, args?: Record<string, unknown>) => {
    if (name === 'is_super_admin') return Promise.resolve({ data: state.isSuperAdmin, error: null });
    if (name === 'is_admin') return Promise.resolve({ data: state.isAdmin, error: null });
    if (name === 'user_has_permission') {
      const key = String(args?.permission_name);
      permissionChecks.push(key);
      return Promise.resolve({ data: state.grantedPermissions.includes(key), error: null });
    }
    if (name === 'get_user_accessible_institutions') {
      return Promise.resolve({
        data: state.accessible.map((institution_id) => ({ institution_id })),
        error: null,
      });
    }
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

// The real createApiInstitutionFilter builds its client with @supabase/ssr.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => userClient,
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

// Real filter by default; state.filterOverride pins a specific answer.
vi.mock('@/lib/auth/api-institution-filter', async (importOriginal) => {
  const real = await importOriginal<any>();
  return {
    ...real,
    createApiInstitutionFilter: (...args: unknown[]) =>
      state.filterOverride
        ? Promise.resolve(state.filterOverride)
        : real.createApiInstitutionFilter(...args),
  };
});

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

const rowA = { id: CB_A, institution_id: INST_A, caller_number: '9000000001', lead_id: null, status: 'pending' };
const rowB = { id: CB_B, institution_id: INST_B, caller_number: '9000000002', lead_id: null, status: 'pending' };

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
  state.grantedPermissions = [];
  state.accessible = [INST_A];
  state.profileRole = 'staff';
  state.queueRows = [rowA, rowB];
  state.filterOverride = null;
  queueFromCalls.length = 0;
  queueUpdates.length = 0;
  queueFilters.length = 0;
  permissionChecks.length = 0;
  initiateCall.mockReset();
  initiateCall.mockResolvedValue({ success: true, call_log_id: 'log-1' });
});

describe('GET /api/admission/calls/bulk-callback', () => {
  it('checks admission.leads.view and refuses a user without it, before reading the queue', async () => {
    const res = await GET(getReq('?status=pending'));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(permissionChecks).toEqual(['admission.leads.view']);
    expect(queueFromCalls).toHaveLength(0);
  });

  it('a counsellor holding admission.leads.view sees only rows from their institutions', async () => {
    state.grantedPermissions = ['admission.leads.view'];
    const res = await GET(getReq('?status=pending'));
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.map((r: any) => r.id)).toEqual([CB_A]);
  });

  it('the old Call Logs key (admission.counselors.view) alone is not enough', async () => {
    state.grantedPermissions = ['admission.counselors.view'];
    const res = await GET(getReq('?status=pending'));
    expect(res.status).toBe(403);
    expect(queueFromCalls).toHaveLength(0);
  });

  it('refuses an institution_id outside the caller\'s scope', async () => {
    state.grantedPermissions = ['admission.leads.view'];
    const res = await GET(getReq(`?status=pending&institution_id=${INST_B}`));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(queueFromCalls).toHaveLength(0);
  });

  it('allows an institution_id inside the caller\'s scope', async () => {
    state.grantedPermissions = ['admission.leads.view'];
    const res = await GET(getReq(`?status=pending&institution_id=${INST_A}`));
    expect(res.status).toBe(200);
    expect((await res.json()).map((r: any) => r.id)).toEqual([CB_A]);
  });

  it('super admin sees every institution', async () => {
    state.isSuperAdmin = true;
    state.profileRole = 'super_admin';
    state.accessible = [];
    const res = await GET(getReq('?status=pending'));
    expect(res.status).toBe(200);
    expect((await res.json()).map((r: any) => r.id).sort()).toEqual([CB_A, CB_B]);
  });

  it('the admission-global role sees every institution', async () => {
    state.grantedPermissions = ['admission.leads.view'];
    state.profileRole = 'admission';
    state.accessible = [];
    const res = await GET(getReq('?status=pending'));
    expect(res.status).toBe(200);
    expect((await res.json()).map((r: any) => r.id).sort()).toEqual([CB_A, CB_B]);
  });

  it('REAL filter: an ordinary user with no institutions is refused, queue never read', async () => {
    state.grantedPermissions = ['admission.leads.view'];
    state.accessible = [];
    const res = await GET(getReq('?status=pending'));
    expect(res.status).toBe(403);
    expect(queueFromCalls).toHaveLength(0);
  });

  it('never sends a raw DB error to the client', async () => {
    state.grantedPermissions = ALL_KEYS;
    const realFrom = serviceClient.from;
    serviceClient.from = () => {
      const q: any = {
        select: () => q, order: () => q, limit: () => q, eq: () => q, in: () => q,
        then: (res: any, rej: any) =>
          Promise.resolve({ data: null, error: { message: 'relation "secret_table" does not exist' } }).then(res, rej),
      };
      return q;
    };
    try {
      const res = await GET(getReq('?status=pending'));
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain('secret_table');
    } finally {
      serviceClient.from = realFrom;
    }
  });
});

describe('POST /api/admission/calls/bulk-callback', () => {
  it('checks admission.leads.edit and refuses a user without it', async () => {
    state.grantedPermissions = ['admission.leads.view'];
    const res = await POST(postReq({ callbackIds: [CB_A] }));
    expect(res.status).toBe(403);
    expect(permissionChecks).toEqual(['admission.leads.edit']);
    expect(queueUpdates).toHaveLength(0);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('refuses a foreign-institution callback id: nothing updated, no call placed', async () => {
    state.grantedPermissions = ['admission.leads.edit'];
    const res = await POST(postReq({ callbackIds: [CB_A, CB_B] }));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(queueUpdates).toHaveLength(0);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('keeps the 20-callback cap', async () => {
    state.grantedPermissions = ['admission.leads.edit'];
    const ids = Array.from({ length: 21 }, (_, i) =>
      `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`
    );
    const res = await POST(postReq({ callbackIds: ids }));
    expect(res.status).toBe(400);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-uuid string', ['not-a-uuid']],
    ['a number', [42]],
    ['an object', [{ id: CB_A }]],
    ['a uuid plus junk', [CB_A, "x'); drop table--"]],
  ])('rejects %s in callbackIds with 400 before any DB call', async (_label, ids) => {
    state.grantedPermissions = ALL_KEYS;
    const res = await POST(postReq({ callbackIds: ids }));
    expect(res.status).toBe(400);
    expect(queueFromCalls).toHaveLength(0);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('REAL filter: an ordinary user with no institutions gets 403, nothing called', async () => {
    state.grantedPermissions = ['admission.leads.edit'];
    state.accessible = [];
    const res = await POST(postReq({ callbackIds: [CB_A] }));
    expect(res.status).toBe(403);
    expect(queueUpdates).toHaveLength(0);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('happy path: own-institution callback is marked in progress and called', async () => {
    state.grantedPermissions = ['admission.leads.edit'];
    const res = await POST(postReq({ callbackIds: [CB_A] }));
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

  it('the admission-global role can call any institution', async () => {
    state.grantedPermissions = ['admission.leads.edit'];
    state.profileRole = 'admission';
    state.accessible = [];
    const res = await POST(postReq({ callbackIds: [CB_B] }));
    expect(res.status).toBe(200);
    expect(initiateCall).toHaveBeenCalledTimes(1);
  });
});

// An empty institution list means NO institutions unless the filter flags
// super admin or the admission-global role. Pins the route's own reading,
// independent of how the filter happens to answer today.
describe('empty institution list without an explicit "all" flag', () => {
  const ambiguous = { isAllowed: true, institutionIds: [], isSuperAdmin: false, userRole: 'staff' };

  it('GET returns [] and never reads the queue', async () => {
    state.grantedPermissions = ALL_KEYS;
    state.filterOverride = ambiguous;
    const res = await GET(getReq('?status=pending'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(queueFromCalls).toHaveLength(0);
  });

  it('POST is refused with 403: nothing updated, no call placed', async () => {
    state.grantedPermissions = ALL_KEYS;
    state.filterOverride = ambiguous;
    const res = await POST(postReq({ callbackIds: [CB_A, CB_B] }));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(queueUpdates).toHaveLength(0);
    expect(initiateCall).not.toHaveBeenCalled();
  });
});
