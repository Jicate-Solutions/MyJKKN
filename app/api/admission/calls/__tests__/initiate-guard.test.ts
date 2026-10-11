// @vitest-environment node
// Guard tests for POST /api/admission/calls/initiate.
//
// The route bridges two phones through JKKN's billed Exotel account. It must
// require 'admission.leads.edit' AND an active admission_counselors row, stay
// inside the caller's institutions, ring the admin-set work number
// (admission_counselors.phone; never the self-editable profile phone, never a
// phone from the body) and refuse a lead from another institution. The real withAuth wrapper AND the real
// createApiInstitutionFilter run; only their dependencies (cookies, Supabase
// clients and the RPCs they call, preview session, telephony) are mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const INST_A = '11111111-1111-1111-1111-111111111111';
const INST_B = '22222222-2222-2222-2222-222222222222';
const LEAD_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEAD_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LEAD_MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LEADS_EDIT = 'admission.leads.edit';

const state = {
  isSuperAdmin: false,
  isAdmin: false,
  permissions: [] as string[],
  role: 'staff',
  accessible: [INST_A] as string[],
  // The caller's self-editable profile phone. The route must NEVER ring it.
  profilePhone: '9000000011' as string | null,
  // admission_counselors rows (all users); the route filters by user_id + is_active.
  counselors: [] as Array<{ id?: string; user_id: string; institution_id: string | null; phone: string | null; is_active: boolean }>,
  counselorError: null as null | { message: string; code: string },
  // admission_counselor_institutions rows (extra institutions per counsellor row).
  mappings: [] as Array<{ id: string; counselor_id: string; institution_id: string }>,
  mappingError: null as null | { message: string; code: string },
  counselorFilters: [] as Array<[string, unknown]>,
  leads: [] as Array<{ id: string; institution_id: string }>,
};

const callLogInserts: unknown[] = [];
const initiateCall = vi.fn();

const USER = { id: 'user-1', email: 'u@example.com' };

function profileRow() {
  return {
    id: USER.id,
    email: USER.email,
    role: state.role,
    institution_id: INST_A,
    full_name: 'Test User',
    phone_number: state.profilePhone,
  };
}

// Live admission_counselors columns used here. The service mock answers a
// select of an unknown column the way PostgREST does (42703), so a wrong
// column name fails here instead of in production.
const LIVE_COUNSELOR_COLUMNS = new Set(['id', 'user_id', 'institution_id', 'name', 'email', 'phone', 'is_active']);

// profiles as read by withAuth and by createApiInstitutionFilter (role).
function makeProfilesQuery() {
  const q: any = {
    select: () => q,
    eq: () => q,
    single: () => Promise.resolve({ data: profileRow(), error: null }),
    maybeSingle: () => Promise.resolve({ data: profileRow(), error: null }),
  };
  return q;
}

// admission_counselors as read by the route (service client). A thenable
// builder: awaiting it applies the recorded eq filters to state.counselors.
function makeCounselorsQuery() {
  let cols: string[] = [];
  // A row without an explicit id gets 'ctr-<index>'.
  let rows = state.counselors.map((r, i) => ({ id: `ctr-${i}`, ...r }));
  const result = () => {
    if (state.counselorError) return { data: null, error: state.counselorError };
    const unknown = cols.find((c) => !LIVE_COUNSELOR_COLUMNS.has(c));
    if (unknown) {
      return {
        data: null,
        error: { message: `column admission_counselors.${unknown} does not exist`, code: '42703' },
      };
    }
    return { data: rows.map((r: any) => Object.fromEntries(cols.map((c) => [c, r[c]]))), error: null };
  };
  const q: any = {
    select: (s: string) => {
      cols = s.split(',').map((c) => c.trim());
      return q;
    },
    eq: (col: string, val: unknown) => {
      state.counselorFilters.push([col, val]);
      rows = rows.filter((r) => (r as any)[col] === val);
      return q;
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  };
  return q;
}

// admission_counselor_institutions (live columns id, counselor_id,
// institution_id) as read by the route: .select().in('counselor_id', ids).
const LIVE_MAPPING_COLUMNS = new Set(['id', 'counselor_id', 'institution_id']);
function makeMappingQuery() {
  let cols: string[] = [];
  let rows = state.mappings.slice();
  const result = () => {
    if (state.mappingError) return { data: null, error: state.mappingError };
    const unknown = cols.find((c) => !LIVE_MAPPING_COLUMNS.has(c));
    if (unknown) {
      return {
        data: null,
        error: { message: `column admission_counselor_institutions.${unknown} does not exist`, code: '42703' },
      };
    }
    return { data: rows.map((r: any) => Object.fromEntries(cols.map((c) => [c, r[c]]))), error: null };
  };
  const q: any = {
    select: (s: string) => {
      cols = s.split(',').map((c) => c.trim());
      return q;
    },
    eq: (col: string, val: unknown) => {
      rows = rows.filter((r) => (r as any)[col] === val);
      return q;
    },
    in: (col: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes((r as any)[col]));
      return q;
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
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
  rpc: (name: string, args?: any) => {
    if (name === 'is_super_admin') return Promise.resolve({ data: state.isSuperAdmin, error: null });
    if (name === 'is_admin') return Promise.resolve({ data: state.isAdmin, error: null });
    if (name === 'user_has_permission') {
      return Promise.resolve({ data: state.permissions.includes(args?.permission_name), error: null });
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
    if (table === 'admission_counselors') return makeCounselorsQuery();
    if (table === 'admission_counselor_institutions') return makeMappingQuery();
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

// The REAL createApiInstitutionFilter builds its own session client through
// @supabase/ssr; hand it the same mocked user client (profiles + the
// get_user_accessible_institutions RPC). The helper itself is not mocked.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => userClient,
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
  state.permissions = [];
  state.role = 'staff';
  state.accessible = [INST_A];
  state.profilePhone = '9000000011';
  state.counselorError = null;
  state.counselorFilters = [];
  state.mappings = [];
  state.mappingError = null;
  state.counselors = [
    { user_id: USER.id, institution_id: INST_A, phone: '9876543210', is_active: true },
    { user_id: 'other-user', institution_id: INST_A, phone: '9555555555', is_active: true },
  ];
  state.leads = [
    { id: LEAD_A, institution_id: INST_A },
    { id: LEAD_B, institution_id: INST_B },
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

  it('refuses an institution outside the caller\'s scope (real institution filter): no call, no log row', async () => {
    state.permissions = [LEADS_EDIT];
    state.accessible = [INST_A];
    const res = await POST(postReq({ ...baseBody, institution_id: INST_B }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('You do not have access to place calls for this institution');
    expect(initiateCall).not.toHaveBeenCalled();
    expect(callLogInserts).toHaveLength(0);
  });

  it('rings the admin-set work number, never a counselor_phone from the body', async () => {
    state.permissions = [LEADS_EDIT];
    const res = await POST(postReq({ ...baseBody, counselor_phone: '9000000099' }));
    expect(res.status).toBe(200);
    expect(initiateCall).toHaveBeenCalledTimes(1);
    expect(initiateCall.mock.calls[0][0].counselor_phone).toBe('+919876543210');
  });

  it('ignores a caller_id from the body (the service resolves the displayed number)', async () => {
    state.permissions = [LEADS_EDIT];
    const res = await POST(postReq({ ...baseBody, caller_id: '09999999999' }));
    expect(res.status).toBe(200);
    expect(initiateCall.mock.calls[0][0].caller_id).toBeUndefined();
  });

  it('never rings the self-edited profile phone: the admin-set work number is used', async () => {
    state.permissions = [LEADS_EDIT];
    state.profilePhone = '9000000011'; // counsellor edited their own profile
    const res = await POST(postReq(baseBody));
    expect(res.status).toBe(200);
    expect(initiateCall.mock.calls[0][0].counselor_phone).toBe('+919876543210');
    expect(initiateCall.mock.calls[0][0].counselor_phone).not.toBe('+919000000011');
    // The lookup is strictly the signed-in user's ACTIVE row.
    expect(state.counselorFilters).toEqual([
      ['user_id', USER.id],
      ['is_active', true],
    ]);
  });

  it('an active counsellor row with no phone gives 400 "work calling number isn\'t set"', async () => {
    state.permissions = [LEADS_EDIT];
    state.counselors = [{ user_id: USER.id, institution_id: INST_A, phone: null, is_active: true }];
    const res = await POST(postReq(baseBody));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe(
      "Your work calling number isn't set. Ask your admission admin to add it on the Counselors page."
    );
    expect(initiateCall).not.toHaveBeenCalled();
    expect(callLogInserts).toHaveLength(0);
  });

  it('an active counsellor row with an invalid phone gives the same 400', async () => {
    state.permissions = [LEADS_EDIT];
    state.counselors = [{ user_id: USER.id, institution_id: INST_A, phone: '12345', is_active: true }];
    const res = await POST(postReq(baseBody));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/work calling number isn't set/);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('a user holding admission.leads.edit with NO counsellor row is refused 403: no call, no log row', async () => {
    state.permissions = [LEADS_EDIT];
    state.counselors = [{ user_id: 'other-user', institution_id: INST_A, phone: '9555555555', is_active: true }];
    const res = await POST(postReq(baseBody));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Only admission counsellors can place calls.');
    expect(initiateCall).not.toHaveBeenCalled();
    expect(callLogInserts).toHaveLength(0);
  });

  it('an INACTIVE counsellor row counts as no row: refused 403', async () => {
    state.permissions = [LEADS_EDIT];
    state.counselors = [{ user_id: USER.id, institution_id: INST_A, phone: '9876543210', is_active: false }];
    const res = await POST(postReq(baseBody));
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('Only admission counsellors can place calls.');
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('requires the matching institution: with rows for A and B, a call for B rings the B row', async () => {
    state.permissions = [LEADS_EDIT];
    state.accessible = [INST_A, INST_B];
    state.counselors = [
      { user_id: USER.id, institution_id: INST_A, phone: '9876543210', is_active: true },
      { user_id: USER.id, institution_id: INST_B, phone: '9811111111', is_active: true },
    ];
    const res = await POST(postReq({ ...baseBody, institution_id: INST_B }));
    expect(res.status).toBe(200);
    expect(initiateCall.mock.calls[0][0].counselor_phone).toBe('+919811111111');
  });

  it('a counsellor for college A calling for college B is refused 403: no call, no log row', async () => {
    state.permissions = [LEADS_EDIT];
    state.accessible = [INST_A, INST_B];
    state.counselors = [{ user_id: USER.id, institution_id: INST_A, phone: '9876543210', is_active: true }];
    const res = await POST(postReq({ ...baseBody, institution_id: INST_B }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe("You're not an admission counsellor for this institution.");
    expect(initiateCall).not.toHaveBeenCalled();
    expect(callLogInserts).toHaveLength(0);
  });

  it('a mapping for ANOTHER counsellor row does not assign this caller to B', async () => {
    state.permissions = [LEADS_EDIT];
    state.accessible = [INST_A, INST_B];
    state.counselors = [
      { id: 'ctr-mine', user_id: USER.id, institution_id: INST_A, phone: '9876543210', is_active: true },
      { id: 'ctr-other', user_id: 'other-user', institution_id: INST_A, phone: '9555555555', is_active: true },
    ];
    state.mappings = [{ id: 'm-1', counselor_id: 'ctr-other', institution_id: INST_B }];
    const res = await POST(postReq({ ...baseBody, institution_id: INST_B }));
    expect(res.status).toBe(403);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('a counsellor assigned to B through admission_counselor_institutions succeeds with that row\'s phone', async () => {
    state.permissions = [LEADS_EDIT];
    state.accessible = [INST_A, INST_B];
    state.counselors = [
      { id: 'ctr-a', user_id: USER.id, institution_id: INST_A, phone: '9876543210', is_active: true },
      { id: 'ctr-a2', user_id: USER.id, institution_id: INST_A, phone: '9833333333', is_active: true },
    ];
    state.mappings = [{ id: 'm-1', counselor_id: 'ctr-a2', institution_id: INST_B }];
    const res = await POST(postReq({ ...baseBody, institution_id: INST_B }));
    expect(res.status).toBe(200);
    expect(initiateCall.mock.calls[0][0].counselor_phone).toBe('+919833333333');
  });

  it('assigned to B through the mapping but the row has no phone: 400 work-number message', async () => {
    state.permissions = [LEADS_EDIT];
    state.accessible = [INST_A, INST_B];
    state.counselors = [{ id: 'ctr-a', user_id: USER.id, institution_id: INST_A, phone: '', is_active: true }];
    state.mappings = [{ id: 'm-1', counselor_id: 'ctr-a', institution_id: INST_B }];
    const res = await POST(postReq({ ...baseBody, institution_id: INST_B }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/work calling number isn't set/);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('a DB error on the institution-mapping read is a 500', async () => {
    state.permissions = [LEADS_EDIT];
    state.mappingError = { message: 'connection reset', code: '08006' };
    const res = await POST(postReq(baseBody));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).not.toMatch(/isn't set|not an admission counsellor/i);
    expect(initiateCall).not.toHaveBeenCalled();
    expect(callLogInserts).toHaveLength(0);
  });

  it('refuses a lead from another institution', async () => {
    state.permissions = [LEADS_EDIT];
    const res = await POST(postReq({ ...baseBody, lead_id: LEAD_B }));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('refuses a lead that does not exist', async () => {
    state.permissions = [LEADS_EDIT];
    const res = await POST(postReq({ ...baseBody, lead_id: LEAD_MISSING }));
    expect(res.status).toBe(403);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('happy path: in-scope institution and lead, call placed', async () => {
    state.permissions = [LEADS_EDIT];
    const res = await POST(postReq({ ...baseBody, lead_id: LEAD_A }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.call_log_id).toBe('log-1');
    expect(initiateCall.mock.calls[0][0]).toMatchObject({
      institution_id: INST_A,
      counselor_id: USER.id,
      counselor_phone: '+919876543210',
      prospect_phone: '+919123456780',
      lead_id: LEAD_A,
    });
  });

  it('super admin may call for any institution', async () => {
    state.isSuperAdmin = true;
    state.role = 'super_admin';
    state.accessible = [];
    // Still needs to be a counsellor for B (here through the mapping).
    state.mappings = [{ id: 'm-1', counselor_id: 'ctr-0', institution_id: INST_B }];
    const res = await POST(postReq({ ...baseBody, institution_id: INST_B }));
    expect(res.status).toBe(200);
    expect(initiateCall).toHaveBeenCalledTimes(1);
  });

  it('a counsellor holding admission.leads.edit passes', async () => {
    state.permissions = [LEADS_EDIT];
    const res = await POST(postReq(baseBody));
    expect(res.status).toBe(200);
    expect(initiateCall).toHaveBeenCalledTimes(1);
  });

  it('a role with only the read key admission.counselors.view is refused 403', async () => {
    state.permissions = ['admission.counselors.view'];
    const res = await POST(postReq(baseBody));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(initiateCall).not.toHaveBeenCalled();
    expect(callLogInserts).toHaveLength(0);
  });

  it('an ordinary user with no institutions is refused 403 (empty is not "all")', async () => {
    state.permissions = [LEADS_EDIT];
    state.accessible = [];
    const res = await POST(postReq(baseBody));
    expect(res.status).toBe(403);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('the admission-global scope may call for any institution', async () => {
    state.permissions = [LEADS_EDIT];
    state.role = 'admission';
    state.accessible = [];
    state.mappings = [{ id: 'm-1', counselor_id: 'ctr-0', institution_id: INST_B }];
    const res = await POST(postReq({ ...baseBody, institution_id: INST_B }));
    expect(res.status).toBe(200);
    expect(initiateCall).toHaveBeenCalledTimes(1);
  });

  it('a counsellor-lookup DB error is a 500, not "number isn\'t set"', async () => {
    state.permissions = [LEADS_EDIT];
    state.counselorError = { message: 'connection reset', code: '08006' };
    const res = await POST(postReq(baseBody));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).not.toMatch(/isn't set|Only admission counsellors/i);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it.each([
    ['null', 'null'],
    ['an array', '[]'],
    ['a string', '"x"'],
    ['a number', '42'],
    ['malformed JSON', '{"institution_id":'],
    ['an empty body', ''],
  ])('a body that is %s gives 400 "Invalid request body", not 500', async (_label, raw) => {
    state.permissions = [LEADS_EDIT];
    const req = new NextRequest('http://localhost/api/admission/calls/initiate', {
      method: 'POST',
      body: raw,
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Invalid request body');
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid institution_id with 400', async () => {
    state.permissions = [LEADS_EDIT];
    const res = await POST(postReq({ ...baseBody, institution_id: [INST_A] }));
    expect(res.status).toBe(400);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('an empty lead_id means "no lead": the call is placed without lead_id, never with \'\'', async () => {
    state.permissions = [LEADS_EDIT];
    const res = await POST(postReq({ ...baseBody, lead_id: '' }));
    expect(res.status).toBe(200);
    expect(initiateCall).toHaveBeenCalledTimes(1);
    expect(initiateCall.mock.calls[0][0].lead_id).toBeUndefined();
  });

  it('uppercase institution_id and lead_id for an in-scope lead are not refused', async () => {
    // A hex id with letters, so upper and lower case actually differ.
    const INST_HEX = 'abcdef12-3456-4789-8abc-def012345678';
    state.permissions = [LEADS_EDIT];
    state.accessible = [INST_HEX];
    // Stored ids may come back in either case; the comparison lower-cases both.
    state.counselors = [
      { user_id: USER.id, institution_id: INST_HEX.toUpperCase(), phone: '9876543210', is_active: true },
    ];
    state.leads = [{ id: LEAD_A, institution_id: INST_HEX }];
    const res = await POST(
      postReq({ ...baseBody, institution_id: INST_HEX.toUpperCase(), lead_id: LEAD_A.toUpperCase() })
    );
    expect(res.status).toBe(200);
    expect(initiateCall.mock.calls[0][0]).toMatchObject({ institution_id: INST_HEX, lead_id: LEAD_A });
  });

  it('uppercase ids do not bypass the lead check: another institution\'s lead is still refused', async () => {
    state.permissions = [LEADS_EDIT];
    const res = await POST(postReq({ ...baseBody, lead_id: LEAD_B.toUpperCase() }));
    expect(res.status).toBe(403);
    expect(initiateCall).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid lead_id with 400', async () => {
    state.permissions = [LEADS_EDIT];
    const res = await POST(postReq({ ...baseBody, lead_id: { id: LEAD_A } }));
    expect(res.status).toBe(400);
    expect(initiateCall).not.toHaveBeenCalled();
  });
});
