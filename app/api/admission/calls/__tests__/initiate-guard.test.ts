// @vitest-environment node
// Guard tests for POST /api/admission/calls/initiate.
//
// The route bridges two phones through JKKN's billed Exotel account. It must
// require the admission calls permission, stay inside the caller's
// institutions, ring the caller's OWN profile phone (never a phone from the
// body) and refuse a lead from another institution. The real withAuth wrapper
// runs; only its dependencies (cookies, Supabase clients, preview session,
// institution helper, telephony) are mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const INST_A = '11111111-1111-1111-1111-111111111111';
const INST_B = '22222222-2222-2222-2222-222222222222';

const state = {
  isSuperAdmin: false,
  isAdmin: false,
  hasPermission: false,
  accessible: [INST_A] as string[],
  profilePhone: '9876543210' as string | null,
  leads: [] as Array<{ id: string; institution_id: string }>,
};

const callLogInserts: unknown[] = [];
const initiateCall = vi.fn();

const USER = { id: 'user-1', email: 'u@example.com' };

function makeProfilesQuery() {
  const q: any = {
    select: () => q,
    eq: () => q,
    single: () =>
      Promise.resolve({
        data: {
          id: USER.id,
          email: USER.email,
          role: 'staff',
          institution_id: INST_A,
          full_name: 'Test User',
          phone: state.profilePhone,
        },
        error: null,
      }),
  };
  return q;
}

function makeLeadsQuery() {
  let rows = state.leads.slice();
  const q: any = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      rows = rows.filter((r) => (r as any)[col] === val);
      return q;
    },
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
  };
  return q;
}

// admission_call_logs: count queries (rate limit / duplicate) resolve to 0;
// any insert is recorded so tests can prove no log row was written.
function makeCallLogsQuery() {
  const q: any = {
    select: () => q,
    eq: () => q,
    gte: () => Promise.resolve({ count: 0, error: null }),
    insert: (row: unknown) => {
      callLogInserts.push(row);
      return q;
    },
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
    if (table === 'profiles') return makeProfilesQuery();
    if (table === 'admission_leads') return makeLeadsQuery();
    if (table === 'admission_call_logs') return makeCallLogsQuery();
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

// Mirrors the real helper's contract for a specific institution.
vi.mock('@/lib/auth/api-institution-filter', () => ({
  createApiInstitutionFilter: async (
    _req: unknown,
    opts: { allowSpecificInstitution?: string } = {}
  ) => {
    if (state.isSuperAdmin) {
      return { isAllowed: true, institutionIds: [], isSuperAdmin: true };
    }
    if (opts.allowSpecificInstitution) {
      return state.accessible.includes(opts.allowSpecificInstitution)
        ? { isAllowed: true, institutionIds: [opts.allowSpecificInstitution], isSuperAdmin: false }
        : { isAllowed: false, institutionIds: [], isSuperAdmin: false };
    }
    return { isAllowed: state.accessible.length > 0, institutionIds: state.accessible, isSuperAdmin: false };
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

import { POST } from '../initiate/route';

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/admission/calls/initiate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const baseBody = {
  institution_id: INST_A,
  counselor_phone: '9876543210',
  prospect_phone: '9123456780',
};

beforeEach(() => {
  state.isSuperAdmin = false;
  state.isAdmin = false;
  state.hasPermission = false;
  state.accessible = [INST_A];
  state.profilePhone = '9876543210';
  state.leads = [
    { id: 'lead-a', institution_id: INST_A },
    { id: 'lead-b', institution_id: INST_B },
  ];
  callLogInserts.length = 0;
  initiateCall.mockReset();
  initiateCall.mockResolvedValue({ success: true, call_sid: 'sid-1', call_log_id: 'log-1' });
});

describe('POST /api/admission/calls/initiate', () => {
  it('refuses a signed-in user without the calls permission: no call placed', async () => {
    const res = await POST(postReq(baseBody));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(initiateCall).not.toHaveBeenCalled();
    expect(callLogInserts).toHaveLength(0);
  });

  it('refuses an institution outside the caller\'s scope: no call, no log row', async () => {
    state.hasPermission = true;
    const res = await POST(postReq({ ...baseBody, institution_id: INST_B }));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(initiateCall).not.toHaveBeenCalled();
    expect(callLogInserts).toHaveLength(0);
  });

  it('rings the caller\'s own profile phone, never a counselor_phone from the body', async () => {
    state.hasPermission = true;
    const res = await POST(postReq({ ...baseBody, counselor_phone: '9000000099' }));
    expect(res.status).toBe(200);
    expect(initiateCall).toHaveBeenCalledTimes(1);
    expect(initiateCall.mock.calls[0][0].counselor_phone).toBe('+919876543210');
  });

  it('ignores a caller_id from the body (the service resolves the displayed number)', async () => {
    state.hasPermission = true;
    const res = await POST(postReq({ ...baseBody, caller_id: '09999999999' }));
    expect(res.status).toBe(200);
    expect(initiateCall.mock.calls[0][0].caller_id).toBeUndefined();
  });

  it('asks the caller to add a phone when the profile has none', async () => {
    state.hasPermission = true;
    state.profilePhone = null;
    const res = await POST(postReq(baseBody));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Add your mobile number to your profile to place calls');
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('refuses a lead from another institution', async () => {
    state.hasPermission = true;
    const res = await POST(postReq({ ...baseBody, lead_id: 'lead-b' }));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('refuses a lead that does not exist', async () => {
    state.hasPermission = true;
    const res = await POST(postReq({ ...baseBody, lead_id: 'lead-missing' }));
    expect(res.status).toBe(403);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('happy path: in-scope institution and lead, call placed', async () => {
    state.hasPermission = true;
    const res = await POST(postReq({ ...baseBody, lead_id: 'lead-a' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.call_log_id).toBe('log-1');
    expect(initiateCall.mock.calls[0][0]).toMatchObject({
      institution_id: INST_A,
      counselor_id: USER.id,
      counselor_phone: '+919876543210',
      prospect_phone: '+919123456780',
      lead_id: 'lead-a',
    });
  });

  it('super admin may call for any institution', async () => {
    state.isSuperAdmin = true;
    state.accessible = [];
    const res = await POST(postReq({ ...baseBody, institution_id: INST_B }));
    expect(res.status).toBe(200);
    expect(initiateCall).toHaveBeenCalledTimes(1);
  });
});
