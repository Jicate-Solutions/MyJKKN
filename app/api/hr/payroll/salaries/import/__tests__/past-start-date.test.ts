/**
 * The salary import may use a past start date ONLY for someone on the Director
 * list.
 *
 * Director's rulings: "the DATABASE must refuse any salary change starting in
 * the past" (2026-09-29), and on 2026-09-30: "The past-date exception may be
 * used ONLY by names on the Director list, nobody else from any screen or
 * tool." The database does the refusing and files old rows as history
 * (20270521090000_hr_salary_no_backdating.sql). This route's jobs:
 *   - ask for the exception (p_allow_past = true) only for a Director, and only
 *     for a row that starts before today in India;
 *   - for anybody else, say in the PREVIEW which rows will be refused, and in
 *     the real run refuse exactly those rows by employee code while the rest
 *     still import.
 *
 * Supabase, the sheet parser and the validator are faked; the clock is fixed at
 * 30 Sep 2026, 11:30 in India.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

type RpcCall = { fn: string; args: Record<string, unknown> | undefined };

let rpcCalls: RpcCall[] = [];
let directorAnswer: { data: unknown; error: unknown } = { data: false, error: null };
let superAdminAnswer: { data: unknown; error: unknown } = { data: false, error: null };
let canManageAnswer = true;

const STAFF = [
  { code: 'NOT100', uuid: 's-100', date: '2026-09-01' as string | null }, // before today
  { code: 'NOT200', uuid: 's-200', date: '2026-10-01' as string | null }, // after today
  { code: 'NOT300', uuid: 's-300', date: null as string | null },         // uses the form's date
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
        if (fn === 'fn_is_the_director') return Promise.resolve(directorAnswer);
        if (fn === 'is_super_admin') return Promise.resolve(superAdminAnswer);
        if (fn === 'fn_hr_set_staff_salary') {
          // The fake database: a past start without the exception is refused.
          const date = String(args?.p_effective_from ?? '');
          if (date < '2026-09-30' && args?.p_allow_past !== true) {
            return Promise.resolve({
              data: null,
              error: { code: '22023', message: 'A salary change cannot start in the past.' },
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

function request(opts: { dryRun?: boolean; effectiveFrom?: string } = {}): NextRequest {
  const fd = new FormData();
  fd.set('file', new File([new Uint8Array([1, 2, 3])], 'salaries.xlsx'));
  fd.set('dryRun', String(opts.dryRun ?? false));
  fd.set('effectiveFrom', opts.effectiveFrom ?? '2026-10-01');
  return { formData: async () => fd } as unknown as NextRequest;
}

function writes(): RpcCall[] {
  return rpcCalls.filter((c) => c.fn === 'fn_hr_set_staff_salary');
}
function writeFor(uuid: string): RpcCall | undefined {
  return writes().find((c) => c.args?.p_staff_id === uuid);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-30T06:00:00Z'));
  rpcCalls = [];
  directorAnswer = { data: false, error: null };
  superAdminAnswer = { data: false, error: null };
  canManageAnswer = true;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('salary import — past start dates', () => {
  it('a Director: the past row asks for the exception, the future rows do not, all import', async () => {
    directorAnswer = { data: true, error: null };
    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(writes()).toHaveLength(3);
    expect(writeFor('s-100')?.args?.p_allow_past).toBe(true);
    expect(writeFor('s-200')?.args?.p_allow_past).toBe(false);
    expect(writeFor('s-300')?.args?.p_allow_past).toBe(false);
    expect(body.written).toBe(3);
    expect(body.failures).toEqual([]);
    expect(body.past_date_refusals).toEqual([]);
  });

  it('a Director: the form date in the past asks for the exception for rows without their own date', async () => {
    directorAnswer = { data: true, error: null };
    await POST(request({ effectiveFrom: '2026-04-01' }));
    expect(writeFor('s-300')?.args?.p_effective_from).toBe('2026-04-01');
    expect(writeFor('s-300')?.args?.p_allow_past).toBe(true);
  });

  it('an HR head: the PREVIEW already says the past row will be refused, and writes nothing', async () => {
    const res = await POST(request({ dryRun: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(writes()).toHaveLength(0);
    expect(body.past_date_refusals).toHaveLength(1);
    expect(body.past_date_refusals[0].employee_code).toBe('NOT100');
    expect(body.past_date_refusals[0].effective_from).toBe('2026-09-01');
    expect(body.past_date_refusals[0].message).toMatch(/Only the Director/);
    expect(body.message).toBe('2 of 3 row(s) ready to import. 1 will be refused: they start before today.');
  });

  it('an HR head: the real run refuses that row by name, never asks for the exception, the rest import', async () => {
    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(writes()).toHaveLength(2);
    expect(writeFor('s-100')).toBeUndefined();
    expect(writes().every((c) => c.args?.p_allow_past === false)).toBe(true);
    expect(body.written).toBe(2);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].employee_code).toBe('NOT100');
    expect(body.failures[0].message).toMatch(/before today/);
    expect(body.message).toBe('2 imported, 1 failed.');
  });

  it('a super admin NOT on the Director list is treated like an HR head', async () => {
    superAdminAnswer = { data: true, error: null };
    const res = await POST(request());
    const body = await res.json();

    expect(writes().every((c) => c.args?.p_allow_past === false)).toBe(true);
    expect(body.failures.map((f: { employee_code: string }) => f.employee_code)).toEqual(['NOT100']);
    expect(rpcCalls.some((c) => c.fn === 'fn_is_the_director')).toBe(true);
  });

  it('keeps the door shut when the Director check errors, answers null, or answers a non-boolean', async () => {
    for (const answer of [
      { data: null, error: { message: 'function fn_is_the_director() does not exist' } },
      { data: null, error: null },
      { data: 'true', error: null },
    ]) {
      rpcCalls = [];
      directorAnswer = answer;
      const body = await (await POST(request())).json();
      expect(writes().every((c) => c.args?.p_allow_past === false)).toBe(true);
      expect(body.failures.map((f: { employee_code: string }) => f.employee_code)).toEqual(['NOT100']);
    }
  });

  it('just after midnight in India, yesterday-in-India counts as past even though UTC is still that day', async () => {
    vi.setSystemTime(new Date('2026-09-30T19:00:00Z')); // 1 Oct 00:30 in India
    const body = await (await POST(request({ dryRun: true, effectiveFrom: '2026-09-30' }))).json();
    expect(body.past_date_refusals.map((r: { employee_code: string }) => r.employee_code)).toEqual([
      'NOT100',
      'NOT300',
    ]);
  });

  it('still refuses a caller with neither admin nor Manage Employee Salary before any write', async () => {
    canManageAnswer = false;
    const res = await POST(request());
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });
});
