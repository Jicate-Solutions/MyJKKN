/**
 * HR leave routes (other than approve / reject, fixed in PR #3993) — a database
 * refusal reaches the user in the database's own words, not "Unknown error".
 *
 * Every LeaveService method these routes call ends with `if (error) throw error`
 * on a query built without `.throwOnError()`. postgrest-js then hands back the
 * parsed JSON body — a PLAIN OBJECT, not an Error — so the routes' old catch
 * `err instanceof Error ? err.message : 'Unknown error'` threw the message away.
 *
 * The refusal below is produced by the REAL postgrest-js against a faked HTTP
 * 400, so the thrown value has exactly the shape production throws.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PostgrestClient } from '@supabase/postgrest-js';

/** A query LeaveService runs, answered by PostgREST with a trigger/RPC RAISE. */
async function refusedByDatabase(message: string, code = 'P0001') {
  const client = new PostgrestClient('http://postgrest.test/rest/v1', {
    fetch: async () =>
      new Response(JSON.stringify({ code, message, details: null, hint: null }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
  });
  const { error } = await client
    .from('hr_leave_applications')
    .update({ status: 'rejected' })
    .eq('id', 'app-1')
    .select()
    .single();
  return error;
}

const svc = {
  revokeApplication: vi.fn(),
  cancelApplication: vi.fn(),
  withdrawApplication: vi.fn(),
  listComments: vi.fn(),
  addComment: vi.fn(),
  getApplication: vi.fn(),
  listApplications: vi.fn(),
  applyLeave: vi.fn(),
  getCalendar: vi.fn(),
  getBalance: vi.fn(),
  listEncashments: vi.fn(),
  requestEncashment: vi.fn(),
};

vi.mock('@/lib/services/hr/leave-service', () => ({
  LeaveService: new Proxy(
    {},
    { get: (_t, name: string) => (...a: unknown[]) => (svc as Record<string, (...x: unknown[]) => unknown>)[name](...a) }
  ),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
    // balance route: the caller reads their own balance, so no permission check.
    rpc: () => Promise.resolve({ data: ['emp-1'], error: null }),
  }),
}));

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined, set: () => {} }),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve(), after: () => {} };
});

vi.mock('@/lib/hr/attendance/recompute-day', () => ({
  recomputeForShortTimeOff: vi.fn(),
  recomputeForRevokedLeave: vi.fn(),
}));
vi.mock('@/lib/services/staff/notification-service', () => ({ StaffNotificationService: {} }));
vi.mock('@/lib/services/hr/decision-email-service', () => ({ HrDecisionEmailService: {} }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: vi.fn() }));
vi.mock('@/lib/usage/record', () => ({ recordFeatureUse: vi.fn(), FEATURE_KEYS: {} }));

// SUT imported AFTER the mocks.
import { POST as revokePOST } from '@/app/api/hr/leave/applications/[id]/revoke/route';
import { POST as cancelPOST } from '@/app/api/hr/leave/applications/[id]/cancel/route';
import { POST as withdrawPOST } from '@/app/api/hr/leave/applications/[id]/withdraw/route';
import {
  GET as commentsGET,
  POST as commentsPOST,
} from '@/app/api/hr/leave/applications/[id]/comments/route';
import { GET as applicationGET } from '@/app/api/hr/leave/applications/[id]/route';
import {
  GET as applicationsGET,
  POST as applicationsPOST,
} from '@/app/api/hr/leave/applications/route';
import { GET as calendarGET } from '@/app/api/hr/leave/calendar/route';
import { GET as balanceGET } from '@/app/api/hr/leave/balance/route';
import {
  GET as encashmentGET,
  POST as encashmentPOST,
} from '@/app/api/hr/leave/encashment/route';

const params = { params: Promise.resolve({ id: 'app-1' }) };
const req = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  Object.values(svc).forEach((m) => m.mockReset());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/** Make `method` fail exactly the way LeaveService does: `if (error) throw error`. */
function refuse(method: keyof typeof svc, message: string) {
  svc[method].mockImplementation(async () => {
    const error = await refusedByDatabase(message);
    if (error) throw error;
  });
}

describe('HR leave sibling routes — database refusal text', () => {
  it('postgrest-js hands back a plain object, not an Error (the premise of the bug)', async () => {
    const error = await refusedByDatabase('x');
    expect(error).not.toBeInstanceOf(Error);
    expect(error?.message).toBe('x');
  });

  const cases: Array<{
    name: string;
    method: keyof typeof svc;
    call: () => Promise<Response>;
    status: number;
  }> = [
    {
      name: 'revoke',
      method: 'revokeApplication',
      call: () => revokePOST(req('/api/hr/leave/applications/app-1/revoke', { reason: 'wrong dates' }), params),
      status: 400,
    },
    {
      name: 'cancel',
      method: 'cancelApplication',
      call: () => cancelPOST(req('/api/hr/leave/applications/app-1/cancel', {}), params),
      status: 400,
    },
    {
      name: 'withdraw',
      method: 'withdrawApplication',
      call: () => withdrawPOST(req('/api/hr/leave/applications/app-1/withdraw', {}), params),
      status: 400,
    },
    {
      name: 'comments GET',
      method: 'listComments',
      call: () => commentsGET(req('/api/hr/leave/applications/app-1/comments'), params),
      status: 500,
    },
    {
      name: 'comments POST',
      method: 'addComment',
      call: () => commentsPOST(req('/api/hr/leave/applications/app-1/comments', { body: 'hi' }), params),
      status: 400,
    },
    {
      name: 'application GET',
      method: 'getApplication',
      call: () => applicationGET(req('/api/hr/leave/applications/app-1'), params),
      status: 500,
    },
    {
      name: 'applications GET',
      method: 'listApplications',
      call: () => applicationsGET(req('/api/hr/leave/applications')),
      status: 500,
    },
    {
      name: 'applications POST',
      method: 'applyLeave',
      call: () => applicationsPOST(req('/api/hr/leave/applications', { employee_id: 'emp-1' })),
      status: 400,
    },
    {
      name: 'calendar GET',
      method: 'getCalendar',
      call: () =>
        calendarGET(req('/api/hr/leave/calendar?hr_organization_id=o&start_date=2026-09-01&end_date=2026-09-30')),
      status: 500,
    },
    {
      name: 'balance GET',
      method: 'getBalance',
      call: () => balanceGET(req('/api/hr/leave/balance?employee_id=emp-1&hr_academic_year_id=y')),
      status: 500,
    },
    {
      name: 'encashment GET',
      method: 'listEncashments',
      call: () => encashmentGET(req('/api/hr/leave/encashment')),
      status: 500,
    },
    {
      name: 'encashment POST',
      method: 'requestEncashment',
      call: () =>
        encashmentPOST(
          req('/api/hr/leave/encashment', {
            hr_organization_id: 'o',
            employee_id: 'emp-1',
            hr_academic_year_id: 'y',
            leave_type_id: 'lt',
            days_encashed: 1,
            per_diem_rate: 100,
          })
        ),
      status: 400,
    },
  ];

  it.each(cases)('$name: the database refusal reaches the user verbatim, status unchanged', async ({ method, call, status }) => {
    const refusal = `That month is already closed — refused in ${method}.`;
    refuse(method, refusal);

    const res = await call();

    expect(svc[method]).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(status);
    const json = await res.json();
    expect(json.error).toBe(refusal);
    expect(json.error).not.toBe('Unknown error');
  });

  it('revoke: a thrown Error still passes its own message through', async () => {
    svc.revokeApplication.mockRejectedValue(new Error('Application not found'));
    const res = await revokePOST(req('/api/hr/leave/applications/app-1/revoke', { reason: 'x' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Application not found');
  });
});
