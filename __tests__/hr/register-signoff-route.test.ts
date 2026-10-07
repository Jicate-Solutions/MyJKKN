/**
 * The salary register sign-off route reads the run id from ?runId= (route budget).
 *
 * The route lives at the STATIC path /api/hr/payroll/register/signoff — a
 * [runId] segment would cost 2 against the Vercel route budget. Runs the REAL
 * route and the REAL withAuth against stand-in clients; the sign-off service is
 * stubbed so the test only proves which run id reaches it.
 *
 * Run: npx vitest run __tests__/hr/register-signoff-route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const RUN_ID = '00000000-0000-4000-8000-00000000e001';
const calls: Array<{ fn: string; args: unknown[] }> = [];

const sessionClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: { id: 'user-1', email: 'someone@jkkn.ac.in', role: 'not-consulted', institution_id: 'inst-1', full_name: 'Someone' },
          error: null,
        }),
      }),
    }),
  }),
  rpc: async (fn: string, args?: Record<string, unknown>) => {
    if (fn === 'is_super_admin' || fn === 'is_admin') return { data: false, error: null };
    if (fn === 'user_has_permission') return { data: args?.permission_name === 'hr.payroll.register.view', error: null };
    return { data: null, error: null };
  },
};

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => sessionClient,
  createServiceRoleClient: () => ({}),
}));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));
vi.mock('@/lib/auth/preview-session', () => ({
  getPreviewClaimsFromCookies: async () => null,
  writePreviewAudit: async () => {},
  canUseWriteMode: () => false,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [{ name: 'sb-project-auth-token', value: 'x' }],
    get: () => undefined,
    set: () => {},
  }),
}));
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('@/lib/services/hr/payroll/register-signoff-service', () => ({
  RegisterSignoffError: class extends Error { status = 400; },
  RegisterSignoffService: {
    getStatus: async (...args: unknown[]) => { calls.push({ fn: 'getStatus', args }); return { steps: [] }; },
    sign: async (...args: unknown[]) => { calls.push({ fn: 'sign', args }); return { ok: true }; },
    revoke: async (...args: unknown[]) => { calls.push({ fn: 'revoke', args }); return { ok: true }; },
  },
}));

import { GET, POST, DELETE } from '@/app/api/hr/payroll/register/signoff/route';

const url = (q = '') => `http://localhost/api/hr/payroll/register/signoff${q}`;
const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => { calls.length = 0; });

describe('Salary register sign-off route: run id from the query string', () => {
  it('GET without runId answers 400 and never reaches the service', async () => {
    const res = await GET(new NextRequest(url()), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('GET ?runId= passes that run to the service', async () => {
    const res = await GET(new NextRequest(url(`?runId=${RUN_ID}`)), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(calls[0]).toMatchObject({ fn: 'getStatus', args: [sessionClient, RUN_ID] });
  });

  it('POST ?runId= signs that run; without runId it answers 400', async () => {
    const ok = await POST(new NextRequest(url(`?runId=${RUN_ID}`), json({ stage: 'college_check' })), { params: Promise.resolve({}) });
    expect(ok.status).toBe(200);
    expect(calls[0]).toMatchObject({ fn: 'sign', args: [sessionClient, RUN_ID, 'college_check', null] });

    const bad = await POST(new NextRequest(url(), json({ stage: 'college_check' })), { params: Promise.resolve({}) });
    expect(bad.status).toBe(400);
    expect(calls).toHaveLength(1);
  });

  it('DELETE without runId answers 400', async () => {
    const res = await DELETE(
      new NextRequest(url(), { method: 'DELETE', body: JSON.stringify({ signoffId: 'sig-1', reason: 'signed the wrong run' }) }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
