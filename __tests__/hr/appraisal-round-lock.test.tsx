// @vitest-environment jsdom
// =====================================================================
// HR appraisals — a round cannot be locked while appraisals wait for
// their head of department
// =====================================================================
// Round-5 review. A locked round is the committee's phase: the head of
// department's rule requires an OPEN round, so locking while appraisals were
// still self_submitted stranded them. The fix is at the lock step:
//   - the lock is refused while any appraisal waits for its head, with the
//     count (and departments, where cheap) in the message;
//   - drafts do not block, but the admin confirms on the page that those
//     people are left out.
// Enforced in three places: this service method, a database trigger (run
// on the throwaway-Postgres rehearsal), and the page, which says so first.
// =====================================================================

import '@/__tests__/setup-jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  PerformanceReviewService,
  lockBlockedMessage,
} from '@/lib/services/hr/performance-review-service';
import { LockRoundControl } from '@/features/hr/appraisal/lock-round-control';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

type Row = { staff_id: string; status: string };

/**
 * The real columns of the tables the lock check reads. The stand-in refuses
 * any other column the way PostgREST does (an error, no rows), so a query
 * that names a column the table does not have fails here as it would live.
 * An earlier stand-in answered any column, which hid a read of
 * departments.name (the column is department_name).
 */
const COLUMNS: Record<string, readonly string[]> = {
  hr_performance_reviews: ['id', 'cycle_id', 'staff_id', 'status'],
  staff: ['id', 'first_name', 'last_name', 'department_id', 'institution_id', 'profile_id'],
  departments: ['id', 'institution_id', 'degree_id', 'department_code', 'department_name', 'display_name'],
};

/** Stand-in database: one round, its appraisals, people and departments. */
function fakeDb(opts: {
  roundStatus: string;
  reviews?: Row[];
  personDept?: Record<string, string | null>;
  deptNames?: Record<string, string>;
  deptLookupFails?: boolean;
}) {
  const updates: Array<Record<string, unknown>> = [];
  const selects: Array<{ table: string; cols: string }> = [];
  const round = { id: 'cyc-1', status: opts.roundStatus, cycle_year: 2027 };
  const from = (table: string) => {
    const eqs: Array<[string, unknown]> = [];
    let ids: string[] = [];
    let cols = '*';
    let patch: Record<string, unknown> | null = null;
    const project = (rows: Array<Record<string, unknown>>) => {
      if (cols === '*') return { data: rows, error: null };
      const wanted = cols.split(',').map((c) => c.trim());
      const known = COLUMNS[table];
      const unknown = known ? wanted.filter((c) => !known.includes(c)) : [];
      if (unknown.length > 0) {
        return {
          data: null,
          error: { code: '42703', message: `column ${table}.${unknown[0]} does not exist` },
        };
      }
      return {
        data: rows.map((r) => Object.fromEntries(wanted.map((c) => [c, r[c] ?? null]))),
        error: null,
      };
    };
    const result = () => {
      if (table === 'hr_performance_reviews') {
        const status = eqs.find(([k]) => k === 'status')?.[1];
        return project((opts.reviews ?? []).filter((r) => r.status === status));
      }
      if (table === 'staff') {
        if (opts.deptLookupFails) throw new Error('no access');
        return project(ids.map((id) => ({ id, department_id: opts.personDept?.[id] ?? null })));
      }
      if (table === 'departments') {
        return project(ids.map((id) => ({ id, department_name: opts.deptNames?.[id] ?? null })));
      }
      return { data: null, error: null };
    };
    const b: Record<string, unknown> = {
      select: (c?: string) => { cols = c ?? '*'; selects.push({ table, cols }); return b; },
      eq: (k: string, v: unknown) => { eqs.push([k, v]); return b; },
      in: (_k: string, v: string[]) => { ids = v; return b; },
      update: (p: Record<string, unknown>) => { patch = p; updates.push(p); return b; },
      maybeSingle: async () => ({ data: round, error: null }),
      single: async () => ({ data: { ...round, ...(patch ?? {}) }, error: null }),
      then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
        Promise.resolve().then(result).then(ok, bad),
    };
    return b;
  };
  return { client: { from } as never, updates, selects };
}

const PEOPLE = {
  p1: 'd-phy', p2: 'd-phy', p3: 'd-chem',
};
const DEPTS = { 'd-phy': 'Physics', 'd-chem': 'Chemistry' };

describe('the service refuses to lock a round while appraisals wait for their head', () => {
  it('refuses, with the count and the departments, and changes nothing', async () => {
    const { client, updates } = fakeDb({
      roundStatus: 'open',
      reviews: [
        { staff_id: 'p1', status: 'self_submitted' },
        { staff_id: 'p2', status: 'self_submitted' },
        { staff_id: 'p3', status: 'self_submitted' },
        { staff_id: 'p4', status: 'draft' },
      ],
      personDept: PEOPLE,
      deptNames: DEPTS,
    });
    await expect(
      PerformanceReviewService.updateCycle(client, 'cyc-1', { status: 'locked' }),
    ).rejects.toThrow(
      '3 appraisals are still waiting for their head of department (Chemistry, Physics). ' +
        'Lock the round once they are passed on or sent back.',
    );
    expect(updates).toEqual([]);
  });

  it('reads the department name from department_name, the column departments has', async () => {
    const { client, selects } = fakeDb({
      roundStatus: 'open',
      reviews: [{ staff_id: 'p1', status: 'self_submitted' }],
      personDept: PEOPLE,
      deptNames: DEPTS,
    });
    await expect(
      PerformanceReviewService.updateCycle(client, 'cyc-1', { status: 'locked' }),
    ).rejects.toThrow('(Physics)');
    expect(selects.find((q) => q.table === 'departments')).toEqual({
      table: 'departments',
      cols: 'department_name',
    });
  });

  it('the stand-in refuses a column the table does not have, as the database does', async () => {
    const { client } = fakeDb({ roundStatus: 'open' });
    const res = await (client as unknown as {
      from: (t: string) => { select: (c: string) => { in: (k: string, v: string[]) => PromiseLike<unknown> } };
    })
      .from('departments')
      .select('name')
      .in('id', ['d-phy']);
    expect(res).toEqual({
      data: null,
      error: { code: '42703', message: 'column departments.name does not exist' },
    });
  });

  it('says "1 appraisal is" for one', async () => {
    const { client } = fakeDb({
      roundStatus: 'open',
      reviews: [{ staff_id: 'p1', status: 'self_submitted' }],
      personDept: PEOPLE,
      deptNames: DEPTS,
    });
    await expect(
      PerformanceReviewService.updateCycle(client, 'cyc-1', { status: 'locked' }),
    ).rejects.toThrow(/^1 appraisal is still waiting for their head of department \(Physics\)\./);
  });

  it('still refuses when the departments cannot be read, just without the list', async () => {
    const { client, updates } = fakeDb({
      roundStatus: 'open',
      reviews: [{ staff_id: 'p1', status: 'self_submitted' }, { staff_id: 'p2', status: 'self_submitted' }],
      deptLookupFails: true,
    });
    await expect(
      PerformanceReviewService.updateCycle(client, 'cyc-1', { status: 'locked' }),
    ).rejects.toThrow(/^2 appraisals are still waiting for their head of department\. Lock/);
    expect(updates).toEqual([]);
  });

  it('locks when only drafts and later steps remain', async () => {
    const { client, updates } = fakeDb({
      roundStatus: 'open',
      reviews: [
        { staff_id: 'p1', status: 'draft' },
        { staff_id: 'p2', status: 'supervisor_reviewed' },
        { staff_id: 'p3', status: 'sedc_reviewed' },
        { staff_id: 'p4', status: 'final_approved' },
      ],
    });
    const out = await PerformanceReviewService.updateCycle(client, 'cyc-1', { status: 'locked' });
    expect(updates).toEqual([{ status: 'locked' }]);
    expect(out.status).toBe('locked');
  });

  it('locks a round with no appraisals at all', async () => {
    const { client, updates } = fakeDb({ roundStatus: 'open', reviews: [] });
    await PerformanceReviewService.updateCycle(client, 'cyc-1', { status: 'locked' });
    expect(updates).toEqual([{ status: 'locked' }]);
  });

  it('does not apply to other changes, such as closing a locked round', async () => {
    const { client, updates } = fakeDb({
      roundStatus: 'locked',
      reviews: [{ staff_id: 'p1', status: 'self_submitted' }],
    });
    await PerformanceReviewService.updateCycle(client, 'cyc-1', { status: 'closed' });
    expect(updates).toEqual([{ status: 'closed' }]);
  });
});

describe('every move out of an open round is guarded, not only locking', () => {
  const waiting: Row[] = [{ staff_id: 'p1', status: 'self_submitted' }];

  it.each(['closed', 'draft'] as const)('refuses open -> %s while one waits, and changes nothing', async (to) => {
    const { client, updates } = fakeDb({ roundStatus: 'open', reviews: waiting, personDept: PEOPLE, deptNames: DEPTS });
    await expect(
      PerformanceReviewService.updateCycle(client, 'cyc-1', { status: to }),
    ).rejects.toThrow(
      '1 appraisal is still waiting for their head of department (Physics). ' +
        'Lock the round once they are passed on or sent back.',
    );
    expect(updates).toEqual([]);
  });

  it.each(['closed', 'draft'] as const)('allows open -> %s when none wait', async (to) => {
    const { client, updates } = fakeDb({
      roundStatus: 'open',
      reviews: [{ staff_id: 'p1', status: 'draft' }, { staff_id: 'p2', status: 'sedc_reviewed' }],
    });
    await PerformanceReviewService.updateCycle(client, 'cyc-1', { status: to });
    expect(updates).toEqual([{ status: to }]);
  });

  it('does not check anything when the status is not being changed', async () => {
    const { client, updates } = fakeDb({ roundStatus: 'open', reviews: waiting });
    await PerformanceReviewService.updateCycle(client, 'cyc-1', { description: 'Renamed' });
    expect(updates).toEqual([{ description: 'Renamed' }]);
  });
});

describe('the refusal message', () => {
  it('lists at most five departments, then how many more', () => {
    const names = ['F', 'E', 'D', 'C', 'B', 'A', 'G'];
    expect(lockBlockedMessage(7, names)).toBe(
      '7 appraisals are still waiting for their head of department (A, B, C, D, E, 2 more). ' +
        'Lock the round once they are passed on or sent back.',
    );
  });
});

describe('the page says so before the click', () => {
  it('while appraisals wait: the lock is disabled and the count is shown', () => {
    const onLock = vi.fn();
    render(<LockRoundControl pending={3} drafts={1} busy={false} onLock={onLock} />);
    expect(screen.getByRole('button', { name: 'Move to Locked' })).toBeDisabled();
    expect(
      screen.getByText(/3 appraisals are still waiting for their head of department\./),
    ).toBeInTheDocument();
    expect(onLock).not.toHaveBeenCalled();
  });

  it('with drafts: asks on the page how many are left out, and locks only on confirm', () => {
    const onLock = vi.fn();
    render(<LockRoundControl pending={0} drafts={2} busy={false} onLock={onLock} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move to Locked' }));
    expect(screen.getByText('2 people started an appraisal but never submitted it.')).toBeInTheDocument();
    expect(screen.getByText(/Locking leaves them out of this round\./)).toBeInTheDocument();
    expect(onLock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Lock and leave 2 people out' }));
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('with drafts: Cancel locks nothing', () => {
    const onLock = vi.fn();
    render(<LockRoundControl pending={0} drafts={1} busy={false} onLock={onLock} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move to Locked' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onLock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Move to Locked' })).toBeEnabled();
  });

  it('with nothing outstanding: locks straight away', () => {
    const onLock = vi.fn();
    render(<LockRoundControl pending={0} drafts={0} busy={false} onLock={onLock} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move to Locked' }));
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('the round page uses this control for an open round, fed by its live counts', () => {
    const page = read('app/(routes)/hr/admin/performance-reviews/cycles/[id]/page.tsx');
    expect(page).toContain('<LockRoundControl');
    expect(page).toContain('pending={counters.self_submitted}');
    expect(page).toContain('drafts={counters.draft}');
    expect(page).toContain("onLock={() => transitionStatus('locked')}");
  });

  it('never uses a browser confirm box, which the viewer suppresses', () => {
    for (const f of [
      'features/hr/appraisal/lock-round-control.tsx',
      'app/(routes)/hr/admin/performance-reviews/cycles/[id]/page.tsx',
    ]) {
      expect(read(f)).not.toMatch(/window\.confirm|\bconfirm\(/);
    }
  });
});

describe('the database refuses the same move', () => {
  const sql = read(
    'supabase/migrations/20270501090000_hr_appraisal_cycle_institution_and_writer_policies.sql',
  );
  const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.fn_hr_perf_cycle_lock_guard'));

  it('fires before a status change on a round', () => {
    expect(sql).toContain('BEFORE UPDATE OF status ON public.hr_performance_review_cycles');
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_hr_perf_cycle_lock_guard');
  });

  it('refuses open to locked while any appraisal is self_submitted', () => {
    expect(fn).toContain("OLD.status = 'open' AND NEW.status <> 'open'");
    expect(fn).not.toContain("NEW.status = 'locked'");
    expect(fn).toContain("status = 'self_submitted'");
    expect(fn).toContain("USING ERRCODE = 'check_violation'");
  });

  it('is closed to signed-out callers', () => {
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.fn_hr_perf_cycle_lock_guard() FROM anon, PUBLIC;',
    );
  });
});
