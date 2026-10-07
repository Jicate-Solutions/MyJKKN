/**
 * The salary register export and the sign-off switch (20271007161107).
 *
 * Runs the REAL export route and the REAL withAuth against stand-in clients.
 * The switch hr.harness.proof.register_signoff_required ships false; only a
 * literal JSON true makes an unsigned run refuse to export (409). The workbook
 * builder and the register read are stubbed so no data is needed.
 *
 * Run: npx vitest run __tests__/hr/register-signoff-export-gate.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const RUN_ID = '00000000-0000-4000-8000-00000000e001';

/** The platform_policies row the service-role client returns (undefined = no row). */
let policyRow: { value: unknown; is_active?: boolean } | undefined;
/** Whether the run carries an active accounts sign-off. */
let signed = false;
let workbookBuilt = false;
/** When true the caller's own read of the run fails (a run of a college they cannot see). */
let runHidden = false;
const serviceTablesRead: string[] = [];

/** A chainable query stub: every filter returns itself; the terminal calls answer. */
function query(table: string) {
  const filters: Record<string, unknown> = {};
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (col: string, val: unknown) => { filters[col] = val; return q; },
    is: (col: string, val: unknown) => { filters[col] = val; return q; },
    limit: async () => {
      if (table === 'hr_salary_register_signoffs') {
        const ok = filters.run_id === RUN_ID && filters.stage === 'accounts_sign' && filters.revoked_at === null;
        return { data: ok && signed ? [{ id: 'sig-1' }] : [], error: null };
      }
      return { data: [], error: null };
    },
    maybeSingle: async () => {
      if (table === 'platform_policies') {
        const ok = filters.policy_key === 'hr.harness.proof.register_signoff_required'
          && filters.scope_type === 'global' && filters.scope_id === null;
        return { data: ok ? policyRow ?? null : null, error: null };
      }
      return { data: null, error: null };
    },
  };
  return q;
}

const serviceClient = {
  from: (table: string) => { serviceTablesRead.push(table); return query(table); },
};

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
  createServiceRoleClient: () => serviceClient,
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
vi.mock('@/lib/services/hr/payroll/salary-register-service', () => ({
  SalaryRegisterService: {
    getRunDetail: async () => {
      if (runHidden) throw new Error('Register run not found');
      return {
      run: { id: RUN_ID, period_year: 2027, period_month: 9 },
      lines: [],
      organisation_name: 'JKKN College',
      };
    },
  },
}));
vi.mock('@/lib/services/hr/payroll/salary-register-workbook', () => ({
  buildSalaryRegisterWorkbook: async () => { workbookBuilt = true; return Buffer.from('xlsx'); },
  salaryRegisterFilename: () => 'register.xlsx',
}));

import { GET } from '@/app/api/hr/payroll/register/[runId]/export/route';

const exportRun = () =>
  GET(new NextRequest(`http://localhost/api/hr/payroll/register/${RUN_ID}/export`), {
    params: Promise.resolve({ runId: RUN_ID }),
  });

beforeEach(() => {
  policyRow = undefined;
  signed = false;
  workbookBuilt = false;
  runHidden = false;
  serviceTablesRead.length = 0;
});

describe('Salary register export: the sign-off switch', () => {
  it('with no policy row, an unsigned run exports as before', async () => {
    const res = await exportRun();
    expect(res.status).toBe(200);
    expect(workbookBuilt).toBe(true);
  });

  it('with the policy false, an unsigned run exports', async () => {
    policyRow = { value: false, is_active: true };
    const res = await exportRun();
    expect(res.status).toBe(200);
    expect(workbookBuilt).toBe(true);
    expect(serviceTablesRead).toContain('platform_policies');
  });

  it('with the policy "true" as a string, an unsigned run still exports (only a literal true enforces)', async () => {
    policyRow = { value: 'true', is_active: true };
    const res = await exportRun();
    expect(res.status).toBe(200);
    expect(workbookBuilt).toBe(true);
  });

  it('with the policy true, an unsigned run is refused with 409 and the reason', async () => {
    policyRow = { value: true, is_active: true };
    const res = await exportRun();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      error: 'This register is not signed yet. The college check and the accounts sign-off are needed before export.',
    });
    expect(workbookBuilt).toBe(false);
  });

  it('with the policy true, a signed run exports', async () => {
    policyRow = { value: true, is_active: true };
    signed = true;
    const res = await exportRun();
    expect(res.status).toBe(200);
    expect(workbookBuilt).toBe(true);
  });

  it('with the policy true but switched inactive, an unsigned run exports', async () => {
    policyRow = { value: true, is_active: false };
    const res = await exportRun();
    expect(res.status).toBe(200);
  });

  it('a caller who cannot read the run learns nothing about its sign-off (no 409, no service-role read)', async () => {
    policyRow = { value: true, is_active: true };
    runHidden = true;
    const res = await exportRun();
    expect(res.status).toBe(500);
    expect(serviceTablesRead).toEqual([]);
    expect(workbookBuilt).toBe(false);
  });
});
