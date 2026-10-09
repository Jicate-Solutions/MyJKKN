/**
 * LeaveService.cancelApplication — taking back an APPROVED leave must give the
 * balance back (2026-10-09).
 *
 * It used to INSERT a copy already marked 'cancelled' and then try to link the
 * original to it. The balance trigger fires on UPDATE of status only, so the
 * insert restored nothing; and the link UPDATE left the row 'approved', which
 * hla_update's WITH CHECK refuses for the owner. The original stayed approved and
 * deducted, and every retry left another stray row.
 *
 * The balance itself is restored by hr_trig_update_leave_balance, which the
 * database owns. What belongs here is that the service asks for exactly the
 * UPDATE that fires it, and nothing else.
 */

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { LeaveService } from '@/lib/services/hr/leave-service';

const APP_ID = 'app-1';
const OWNER = 'emp-1';

type Row = { id: string; employee_id: string; status: string };

function fakeSupabase(opts: {
  app: Row | null;
  myStaffIds?: string[];
  updateReturns?: Row | null;
}) {
  const writes: { kind: 'insert' | 'update'; payload: unknown; filters: Record<string, unknown> }[] = [];

  const client = {
    rpc: (name: string) => {
      if (name !== 'fn_my_staff_ids') throw new Error(`unexpected rpc ${name}`);
      return Promise.resolve({ data: opts.myStaffIds ?? [OWNER], error: null });
    },
    from: () => ({
      // getApplication: select('*').eq('id', id).maybeSingle()
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.app, error: null }) }),
      }),
      insert: (payload: unknown) => {
        writes.push({ kind: 'insert', payload, filters: {} });
        return Promise.resolve({ data: null, error: null });
      },
      update: (payload: unknown) => {
        const filters: Record<string, unknown> = {};
        writes.push({ kind: 'update', payload, filters });
        const chain = {
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return chain;
          },
          select: () => chain,
          maybeSingle: () =>
            Promise.resolve({
              data: opts.updateReturns === undefined ? { ...opts.app, status: 'cancelled' } : opts.updateReturns,
              error: null,
            }),
        };
        return chain;
      },
    }),
  } as unknown as SupabaseClient;

  return { client, writes };
}

const approved: Row = { id: APP_ID, employee_id: OWNER, status: 'approved' };

describe('LeaveService.cancelApplication', () => {
  it('flips the ORIGINAL row to cancelled with one update and inserts nothing', async () => {
    const { client, writes } = fakeSupabase({ app: approved });

    const result = await LeaveService.cancelApplication(client, APP_ID, 'user-1');

    expect(writes.filter((w) => w.kind === 'insert')).toHaveLength(0);
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toEqual({ status: 'cancelled' });
    // Filtered to status='approved' so a race with a concurrent decision updates 0 rows
    // instead of cancelling something that is no longer approved.
    expect(writes[0].filters).toEqual({ id: APP_ID, status: 'approved' });
    expect(result.status).toBe('cancelled');
  });

  it('refuses a leave that is not approved, writing nothing', async () => {
    const { client, writes } = fakeSupabase({ app: { ...approved, status: 'pending' } });

    await expect(LeaveService.cancelApplication(client, APP_ID, 'user-1')).rejects.toThrow(
      /Only approved applications can be cancelled/
    );
    expect(writes).toHaveLength(0);
  });

  it('refuses anyone but the person the leave belongs to, writing nothing', async () => {
    const { client, writes } = fakeSupabase({ app: approved, myStaffIds: ['someone-else'] });

    await expect(LeaveService.cancelApplication(client, APP_ID, 'user-2')).rejects.toThrow(
      /Only the person this leave belongs to can cancel it/
    );
    expect(writes).toHaveLength(0);
  });

  it('says so when the leave stopped being approved between the read and the update', async () => {
    const { client } = fakeSupabase({ app: approved, updateReturns: null });

    await expect(LeaveService.cancelApplication(client, APP_ID, 'user-1')).rejects.toThrow(
      /no longer approved/
    );
  });

  it('reports a missing application', async () => {
    const { client, writes } = fakeSupabase({ app: null });

    await expect(LeaveService.cancelApplication(client, APP_ID, 'user-1')).rejects.toThrow(
      /Application not found/
    );
    expect(writes).toHaveLength(0);
  });
});
