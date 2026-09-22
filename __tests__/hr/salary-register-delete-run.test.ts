/**
 * SalaryRegisterService.deleteRun — the one path that rewrites payroll history.
 *
 * THE THING WORTH PINNING: a DELETE that RLS refuses comes back with NO error
 * and NO rows — the same shape as "already gone". The service must read zero
 * rows as a refusal (42501) and never report it as success, and must not write
 * an activity-log line for a delete that did not happen.
 *
 * Run: npx vitest run __tests__/hr/salary-register-delete-run.test.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const logActivity = vi.fn(async () => {});
vi.mock('@/lib/utils/activity-logger', () => ({ logActivity }));

import { SalaryRegisterService } from '@/lib/services/hr/payroll/salary-register-service';

const RUN = {
  id: 'run-1',
  hr_organization_id: 'org-1',
  institution_id: 'inst-1',
  period_year: 2026,
  period_month: 8,
  staff_total: 59,
  included_count: 50,
  total_net: '1012392.00',
  generated_at: '2026-09-22T03:24:11Z',
  superseded_at: '2026-09-22T06:19:27Z',
  hr_organizations: { name: 'JKKN College of Pharmacy' },
};

/** A supabase-js lookalike: every builder method chains, the terminal awaits resolve. */
function client(opts: { run: typeof RUN | null; deletedRows: Array<{ id: string }> | null; deleteError?: unknown }) {
  const calls: string[] = [];
  const builder = (kind: 'select' | 'delete') => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = () => { calls.push(`${kind}.select`); return b; };
    b.eq = chain;
    b.maybeSingle = async () => ({ data: opts.run, error: null });
    b.then = (resolve: (v: unknown) => void) =>
      resolve(kind === 'delete'
        ? { data: opts.deletedRows, error: opts.deleteError ?? null }
        : { data: opts.run, error: null });
    return b;
  };
  return {
    calls,
    from: () => ({
      select: () => builder('select'),
      delete: () => { calls.push('delete'); return builder('delete'); },
    }),
  };
}

beforeEach(() => logActivity.mockClear());

describe('SalaryRegisterService.deleteRun', () => {
  it('returns a receipt and logs the delete when a row actually went', async () => {
    const supabase = client({ run: RUN, deletedRows: [{ id: 'run-1' }] });

    const receipt = await SalaryRegisterService.deleteRun(supabase as never, 'run-1', 'actor-1');

    expect(receipt).toMatchObject({
      id: 'run-1',
      organisation_name: 'JKKN College of Pharmacy',
      period_year: 2026,
      period_month: 8,
      included_count: 50,
      total_net: 1012392,
      was_superseded: true,
    });
    expect(logActivity).toHaveBeenCalledTimes(1);
    expect(logActivity.mock.calls[0][0]).toMatchObject({
      userId: 'actor-1',
      actionType: 'delete',
      resourceType: 'hr_salary_register_run',
      resourceId: 'run-1',
      institutionId: 'inst-1',
    });
  });

  it('treats zero rows back as an RLS refusal, not a success', async () => {
    // What a non-super-admin gets: no error, no rows.
    const supabase = client({ run: RUN, deletedRows: [] });

    await expect(
      SalaryRegisterService.deleteRun(supabase as never, 'run-1', 'actor-1'),
    ).rejects.toMatchObject({ code: '42501' });
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('reports a run that no longer exists as not found', async () => {
    const supabase = client({ run: null, deletedRows: [] });

    await expect(
      SalaryRegisterService.deleteRun(supabase as never, 'gone', 'actor-1'),
    ).rejects.toMatchObject({ code: 'P0002' });
    expect(supabase.calls).not.toContain('delete');
  });

  it('surfaces a database error instead of swallowing it', async () => {
    const supabase = client({ run: RUN, deletedRows: null, deleteError: { code: '23503', message: 'fk' } });

    await expect(
      SalaryRegisterService.deleteRun(supabase as never, 'run-1', 'actor-1'),
    ).rejects.toThrow(/Failed to delete the register/);
    expect(logActivity).not.toHaveBeenCalled();
  });
});
