/**
 * GET /api/hr/payroll/periods/[id]/lop-preview — the college check.
 *
 * The check must REFUSE when the period carries no institution, not skip
 * itself. A check that waves a missing value through stops working the day
 * the schema lets that value be missing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const previewLop = vi.fn(async () => ({ rows: [] }));

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
}));

const { GET } = await import('@/app/api/hr/payroll/periods/[id]/lop-preview/route');

function clientWith(period: Record<string, unknown> | null, hasAccess: boolean) {
  const rpc = vi.fn(async () => ({ data: hasAccess, error: null }));
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.maybeSingle = async () => ({ data: period, error: null });
  return { client: { from: () => builder, rpc }, rpc };
}

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
    expect(rpc).not.toHaveBeenCalled();
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
