/**
 * The payslip routes answer a refusal with the right status (review of #4123):
 *
 *   POST  /api/hr/payroll/periods/[id]/payslips            — a missing
 *         permission (PayrollPermissionError, e.g. hr.payroll.salary.view)
 *         is 403 with the message as written, not 500.
 *   PATCH /api/hr/payroll/periods/[id]/payslips/[slipId]   — a refused
 *         override (PayslipOverrideRefusal) is 400; blank fields reach the
 *         generator as blank, not as 0.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generate, overrideDeductions, PayrollPermissionError, PayslipOverrideRefusal } = vi.hoisted(() => {
  class PayrollPermissionError extends Error {
    readonly status = 403;
    constructor(
      readonly missingPermission: string,
      message: string,
    ) {
      super(message);
    }
  }
  class PayslipOverrideRefusal extends Error {
    readonly status = 400;
  }
  return {
    generate: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({})),
    overrideDeductions: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ newSlipId: 'n' })),
    PayrollPermissionError,
    PayslipOverrideRefusal,
  };
});

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: vi.fn(async () => undefined) };
});

vi.mock('@/lib/auth/with-auth', () => ({
  withAuth:
    (handler: (req: unknown, auth: unknown, ctx: unknown) => unknown) =>
    (req: unknown, ctx: unknown) =>
      handler(req, { supabase: {} }, ctx),
}));

vi.mock('@/lib/services/hr/payroll/payslip-generator', () => ({
  PayslipGenerator: { generate, overrideDeductions },
  PayrollPermissionError,
  PayslipOverrideRefusal,
}));

const { POST } = await import('@/app/api/hr/payroll/periods/[id]/payslips/route');
const { PATCH } = await import('@/app/api/hr/payroll/periods/[id]/payslips/[slipId]/route');

const ctx = { params: Promise.resolve({ id: 'period-1', slipId: 'slip-1' }) };
const post = () => (POST as unknown as (req: unknown, ctx: unknown) => Promise<Response>)({}, ctx);
const patch = (body: unknown) =>
  (PATCH as unknown as (req: unknown, ctx: unknown) => Promise<Response>)(
    { json: async () => body },
    ctx,
  );

describe('generate payslips — status codes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a missing salary permission is 403 with the message as written', async () => {
    generate.mockRejectedValueOnce(
      new PayrollPermissionError('hr.payroll.salary.view', 'Cannot read salaries: this account is missing hr.payroll.salary.view.'),
    );
    const res = await post();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('hr.payroll.salary.view');
  });

  it('a real fault is still 500', async () => {
    generate.mockRejectedValueOnce(new Error('Failed to insert payslips: boom'));
    const res = await post();
    expect(res.status).toBe(500);
  });

  it('a good run returns its warnings and the people left off', async () => {
    generate.mockResolvedValueOnce({
      generated: 1,
      skipped: 1,
      errors: [{ staff_id: 's2', name: 'Nila S', reason: 'No current salary recorded' }],
      totals: { gross: 1, deductions: 0, net: 1 },
      warnings: ['1 person(s) have a salary that starts after this month'],
      lopDays: 0,
    });
    const res = await post();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.warnings).toHaveLength(1);
    expect(json.data.errors[0].name).toBe('Nila S');
  });
});

describe('override deductions — status codes and blanks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a refused override is 400', async () => {
    overrideDeductions.mockRejectedValueOnce(new PayslipOverrideRefusal('PF must be an amount of 0 or more.'));
    const res = await patch({ pf: -5, reason: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('PF must be an amount of 0 or more.');
  });

  it('fields left out reach the generator as blank, not as 0', async () => {
    const res = await patch({ pf: 2500, reason: 'PF corrected' });
    expect(res.status).toBe(200);
    const [, , overrides] = overrideDeductions.mock.calls[0] as [unknown, unknown, Record<string, unknown>];
    expect(overrides).toEqual({ pf: 2500, esi: undefined, tds: undefined, pt: undefined });
  });
});
