/**
 * GET /api/hr/payroll/periods/[id]/lop-preview — the college check.
 *
 * The check must REFUSE when the period carries no institution, not skip
 * itself. A check that waves a missing value through stops working the day
 * the schema lets that value be missing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { previewLop, PayrollPermissionError } = vi.hoisted(() => {
  class PayrollPermissionError extends Error {
    readonly status = 403;
    constructor(
      readonly missingPermission: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    previewLop: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ rows: [] })),
    PayrollPermissionError,
  };
});

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: vi.fn(async () => undefined) };
});

// withAuth reduced to a pass-through that hands the handler a stub client.
let currentAuth: { supabase: unknown } = { supabase: null };
vi.mock('@/lib/auth/with-auth', () => ({
  withAuth:
    (handler: (req: unknown, auth: unknown, ctx: unknown) => unknown) =>
    (req: unknown, ctx: unknown) =>
      handler(req, currentAuth, ctx),
}));

vi.mock('@/lib/services/hr/payroll/payslip-generator', () => ({
  PayslipGenerator: { previewLop },
  PayrollPermissionError,
}));

const { GET } = await import('@/app/api/hr/payroll/periods/[id]/lop-preview/route');

function clientWith(
  period: Record<string, unknown> | null,
  hasAccess: boolean,
  superAdmin: { data: unknown; error: unknown } = { data: true, error: null },
) {
  const rpc = vi.fn(async (name: string) =>
    name === 'is_super_admin' ? superAdmin : { data: hasAccess, error: null },
  );
  const from = vi.fn();
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.maybeSingle = async () => ({ data: period, error: null });
  from.mockImplementation(() => builder);
  return { client: { from, rpc }, rpc, from };
}

/** The institution calls only — the super-admin gate is asserted separately. */
const institutionCalls = (rpc: ReturnType<typeof vi.fn>) =>
  rpc.mock.calls.filter(([name]) => name === 'role_has_institution_access');

const ctx = { params: Promise.resolve({ id: 'period-1' }) };
const call = () =>
  (GET as unknown as (req: unknown, ctx: unknown) => Promise<Response>)({}, ctx);

describe('lop-preview route — college check', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses a period with an EMPTY institution instead of skipping the check', async () => {
    const { client, rpc } = clientWith({ id: 'period-1', institution_id: '' }, true);
    currentAuth = { supabase: client };

    const res = await call();

    expect(res.status).toBe(403);
    expect(institutionCalls(rpc)).toHaveLength(0);
    expect(previewLop).not.toHaveBeenCalled();
  });

  it('refuses when the operator has no access to the college', async () => {
    const { client } = clientWith({ id: 'period-1', institution_id: 'inst-1' }, false);
    currentAuth = { supabase: client };

    const res = await call();

    expect(res.status).toBe(403);
    expect(previewLop).not.toHaveBeenCalled();
  });

  it('hands the row it already read to the preview, so the period is not fetched twice', async () => {
    const period = { id: 'period-1', institution_id: 'inst-1', hr_organization_id: 'org-1' };
    const { client } = clientWith(period, true);
    currentAuth = { supabase: client };

    const res = await call();

    expect(res.status).toBe(200);
    expect(previewLop).toHaveBeenCalledWith(client, period);
  });
});

describe('lop-preview route — the same people as the page', () => {
  beforeEach(() => vi.clearAllMocks());

  const period = { id: 'period-1', institution_id: 'inst-1', hr_organization_id: 'org-1' };

  it('refuses anyone who is not a super admin, before reading the period', async () => {
    // hr.payroll.view alone would admit an admin or an HR role; the page does not.
    const { client, from } = clientWith(period, true, { data: false, error: null });
    currentAuth = { supabase: client };

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/platform administrators/);
    expect(from).not.toHaveBeenCalled();
    expect(previewLop).not.toHaveBeenCalled();
  });

  it('fails closed when the super-admin check itself errors', async () => {
    const { client } = clientWith(period, true, { data: null, error: { message: 'boom' } });
    currentAuth = { supabase: client };

    const res = await call();

    expect(res.status).toBe(403);
    expect(previewLop).not.toHaveBeenCalled();
  });
});

describe('lop-preview route — a refusal is 403, a fault is 500', () => {
  beforeEach(() => vi.clearAllMocks());

  const period = { id: 'period-1', institution_id: 'inst-1', hr_organization_id: 'org-1' };

  it('answers 403 with the plain reason when the account lacks a permission', async () => {
    const { client } = clientWith(period, true);
    currentAuth = { supabase: client };
    previewLop.mockRejectedValueOnce(
      new PayrollPermissionError(
        'hr.attendance.period.view',
        'Cannot read the closed month’s day counts: this account is missing hr.attendance.period.view.',
      ),
    );

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toContain('missing hr.attendance.period.view');
  });

  it('keeps 500 for a real fault', async () => {
    const { client } = clientWith(period, true);
    currentAuth = { supabase: client };
    previewLop.mockRejectedValueOnce(new Error('Failed to load the frozen day counts: timeout'));

    const res = await call();

    expect(res.status).toBe(500);
  });

  it('does not treat a fault that merely MENTIONS a permission as a refusal', async () => {
    const { client } = clientWith(period, true);
    currentAuth = { supabase: client };
    previewLop.mockRejectedValueOnce(new Error('permission denied for table hr_payslips'));

    const res = await call();

    expect(res.status).toBe(500);
  });
});
