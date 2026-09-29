/**
 * The salary import may use a past start date ONLY for a super admin.
 *
 * Director's ruling (2026-09-29): "the DATABASE must refuse any salary change
 * starting in the past, except the super admin's Excel import of old history."
 * The database does the refusing (20270521090000_hr_salary_no_backdating.sql).
 * This route's one job is to ask for the exception — p_allow_past = true — for a
 * super admin and for nobody else, and to report a per-row refusal against that
 * row's employee code without losing the rest of the file.
 *
 * Supabase, the sheet parser and the validator are faked; only the route's
 * decision about p_allow_past and its handling of a refused row are under test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

type RpcCall = { fn: string; args: Record<string, unknown> | undefined };

let rpcCalls: RpcCall[] = [];
let superAdminAnswer: { data: unknown; error: unknown } = { data: false, error: null };
let canManageAnswer = true;
/** Employee codes whose write the fake database refuses as "starts in the past". */
let refusePast = new Set<string>();

const STAFF = [
  { code: 'NOT100', uuid: 's-100', date: '2026-09-01' },
  { code: 'NOT200', uuid: 's-200', date: '2026-10-01' },
];

function chain(rows: unknown[]) {
  const q: any = {};
  for (const m of ['select', 'limit', 'is', 'eq', 'in']) q[m] = () => q;
  q.then = (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej);
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } }, error: null }) },
      rpc: (fn: string, args?: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        if (fn === 'is_admin') return Promise.resolve({ data: false, error: null });
        if (fn === 'user_has_permission') return Promise.resolve({ data: canManageAnswer, error: null });
        if (fn === 'is_super_admin') return Promise.resolve(superAdminAnswer);
        if (fn === 'fn_hr_set_staff_salary') {
          const staff = STAFF.find((s) => s.uuid === args?.p_staff_id);
          if (staff && refusePast.has(staff.code) && args?.p_allow_past !== true) {
            return Promise.resolve({
              data: null,
              error: {
                code: '22023',
                message: 'A salary change cannot start in the past. 01 Sep 2026 is before today (30 Sep 2026).',
              },
            });
          }
          return Promise.resolve({ data: 'new-id', error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    }),
  createServiceRoleClient: () => ({ from: () => chain([]) }),
}));

vi.mock('@/lib/hr/payroll/parse-salary-sheet', () => ({
  parseSalarySheet: () => ({
    sheet_name: 'Sheet1',
    warnings: [],
    rows: STAFF.map((s, i) => ({
      row_number: i + 2,
      employee_code: s.code,
      effective_from: s.date,
      salary_structure: 'Monthly',
      overtime_level: 'No overtime',
      overtime_amount: 0,
      eligible_for_pf: false,
      exempt_edli: false,
      eligible_for_insurance: false,
      eligible_for_gratuity: false,
      eligible_for_etf: false,
      epf_amount: 0,
      eligible_for_esi: false,
      esi_amount: 0,
      allowance_amount: 0,
      allowance_label: null,
    })),
  }),
}));

vi.mock('@/lib/hr/payroll/validate-salary-upload', () => ({
  validateSalaryUpload: () => ({
    can_import: true,
    requires_acknowledgement: false,
    counts: { total: STAFF.length, importable: STAFF.length },
    rows: STAFF.map((s, i) => ({
      row_number: i + 2,
      employee_code: s.code,
      importable: true,
      staff_uuid: s.uuid,
      hr_organization_id: 'org-1',
      monthly_gross: 7000,
    })),
  }),
}));

import { POST } from '@/app/api/hr/payroll/salaries/import/route';

function request(): NextRequest {
  const fd = new FormData();
  fd.set('file', new File([new Uint8Array([1, 2, 3])], 'salaries.xlsx'));
  fd.set('dryRun', 'false');
  fd.set('effectiveFrom', '2026-10-01');
  return { formData: async () => fd } as unknown as NextRequest;
}

function writes(): RpcCall[] {
  return rpcCalls.filter((c) => c.fn === 'fn_hr_set_staff_salary');
}

beforeEach(() => {
  rpcCalls = [];
  superAdminAnswer = { data: false, error: null };
  canManageAnswer = true;
  refusePast = new Set(['NOT100']);
});

describe('salary import — past start dates', () => {
  it('asks for the past-date exception for a super admin, and the history imports', async () => {
    superAdminAnswer = { data: true, error: null };
    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(writes()).toHaveLength(2);
    expect(writes().every((c) => c.args?.p_allow_past === true)).toBe(true);
    expect(body.written).toBe(2);
    expect(body.failures).toEqual([]);
  });

  it('never asks for it for an HR head; the past row is refused by name and the rest still imports', async () => {
    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(writes().every((c) => c.args?.p_allow_past === false)).toBe(true);
    expect(body.written).toBe(1);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].employee_code).toBe('NOT100');
    expect(body.failures[0].message).toMatch(/cannot start in the past/);
    expect(body.message).toBe('1 imported, 1 failed.');
  });

  it('keeps the door shut when the super-admin check errors or answers null', async () => {
    superAdminAnswer = { data: null, error: { message: 'boom' } };
    await POST(request());
    expect(writes().every((c) => c.args?.p_allow_past === false)).toBe(true);

    rpcCalls = [];
    superAdminAnswer = { data: 'true', error: null };
    await POST(request());
    expect(writes().every((c) => c.args?.p_allow_past === false)).toBe(true);
  });

  it('still refuses a caller with neither admin nor Manage Employee Salary before any write', async () => {
    canManageAnswer = false;
    const res = await POST(request());
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });
});
