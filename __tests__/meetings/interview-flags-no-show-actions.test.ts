/**
 * Marking an interview as a no-show, and taking it back (#10).
 *
 * RLS answers a refused UPDATE with zero rows and no error, exactly as it
 * answers an update whose row moved on. These tests pin that the two reach the
 * host as two different messages — "you don't have access" is something they
 * can act on by contacting HR; "already updated" means refresh — and that a
 * no-show cannot be recorded against an interview that has not happened.
 * Supabase is faked; the rules under test are the action's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const PAST = '2026-09-16T05:00:00.000Z';
const FUTURE = '2999-01-01T05:00:00.000Z';

let row: Record<string, unknown> | null;
let perms: { user_has_permission: boolean; is_super_admin: boolean; is_admin: boolean };
let updatedRows: Array<{ id: string }> | null;
let updateError: { code?: string; message: string } | null;
let updates: Array<{ payload: Record<string, unknown>; filters: Array<[string, unknown]> }>;
let flagsImpl: () => Promise<unknown>;

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

vi.mock('@/lib/services/hr/interview-booking-service', () => ({
  getInterviewFlagsForBooking: () => flagsImpl(),
}));

function fakeClient() {
  return {
    rpc: async (name: keyof typeof perms) => ({ data: perms[name], error: null }),
    from() {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
        }),
        update: (payload: Record<string, unknown>) => {
          const entry = { payload, filters: [] as Array<[string, unknown]> };
          updates.push(entry);
          const chain = {
            eq(col: string, val: unknown) {
              entry.filters.push([col, val]);
              return chain;
            },
            select: async () => ({ data: updatedRows, error: updateError }),
          };
          return chain;
        },
      };
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => fakeClient(),
  createServiceRoleClient: () => fakeClient(),
}));

import {
  markInterviewNoShow,
  undoInterviewNoShow,
} from '@/app/(routes)/meetings/[uid]/interview-no-show-actions';
import { loadInterviewFlags } from '@/app/(routes)/meetings/[uid]/interview-flags-data';

const NO_ACCESS = "You don't have access to change this interview — contact HR.";
const ALREADY = 'This interview has already been updated — refresh the page.';

beforeEach(() => {
  row = { id: 'int-1', status: 'scheduled', scheduled_at: PAST };
  perms = { user_has_permission: true, is_super_admin: false, is_admin: false };
  updatedRows = [{ id: 'int-1' }];
  updateError = null;
  updates = [];
  flagsImpl = async () => null;
});

describe('markInterviewNoShow', () => {
  it('marks a past scheduled interview, guarded on its status', async () => {
    const res = await markInterviewNoShow('int-1');
    expect(res).toEqual({ success: true });
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual({ status: 'no_show' });
    expect(updates[0].filters).toContainEqual(['status', 'scheduled']);
  });

  it('refuses an interview that has not happened yet', async () => {
    row = { id: 'int-1', status: 'scheduled', scheduled_at: FUTURE };
    const res = await markInterviewNoShow('int-1');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not started yet/);
    expect(updates).toHaveLength(0);
  });

  it('refuses without hr.recruitment.edit, saying so', async () => {
    perms = { user_has_permission: false, is_super_admin: false, is_admin: false };
    const res = await markInterviewNoShow('int-1');
    expect(res).toEqual({ success: false, error: NO_ACCESS });
    expect(updates).toHaveLength(0);
  });

  it('lets an admin or super admin through without the permission key', async () => {
    perms = { user_has_permission: false, is_super_admin: false, is_admin: true };
    expect((await markInterviewNoShow('int-1')).success).toBe(true);
    perms = { user_has_permission: false, is_super_admin: true, is_admin: false };
    expect((await markInterviewNoShow('int-1')).success).toBe(true);
  });

  it('treats an unreadable row as no access', async () => {
    row = null;
    const res = await markInterviewNoShow('int-1');
    expect(res).toEqual({ success: false, error: NO_ACCESS });
  });

  it('maps a 0-row update on a readable row to "already updated"', async () => {
    updatedRows = [];
    const res = await markInterviewNoShow('int-1');
    expect(res).toEqual({ success: false, error: ALREADY });
  });

  it('says "already updated" when the row is no longer scheduled', async () => {
    row = { id: 'int-1', status: 'completed', scheduled_at: PAST };
    const res = await markInterviewNoShow('int-1');
    expect(res).toEqual({ success: false, error: ALREADY });
    expect(updates).toHaveLength(0);
  });

  it('maps an RLS refusal (42501) to no access', async () => {
    updateError = { code: '42501', message: 'denied' };
    const res = await markInterviewNoShow('int-1');
    expect(res).toEqual({ success: false, error: NO_ACCESS });
  });
});

describe('undoInterviewNoShow', () => {
  it('puts a no-show back to scheduled, guarded on no_show', async () => {
    row = { id: 'int-1', status: 'no_show', scheduled_at: PAST };
    const res = await undoInterviewNoShow('int-1');
    expect(res).toEqual({ success: true });
    expect(updates[0].payload).toEqual({ status: 'scheduled' });
    expect(updates[0].filters).toContainEqual(['status', 'no_show']);
  });

  it('only undoes from no_show', async () => {
    row = { id: 'int-1', status: 'scheduled', scheduled_at: PAST };
    const res = await undoInterviewNoShow('int-1');
    expect(res).toEqual({ success: false, error: ALREADY });
    expect(updates).toHaveLength(0);
  });

  it('refuses without permission', async () => {
    row = { id: 'int-1', status: 'no_show', scheduled_at: PAST };
    perms = { user_has_permission: false, is_super_admin: false, is_admin: false };
    expect(await undoInterviewNoShow('int-1')).toEqual({ success: false, error: NO_ACCESS });
  });
});

describe('loadInterviewFlags', () => {
  it('returns null rather than breaking the page when the read throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    flagsImpl = async () => {
      throw new Error('boom');
    };
    expect(await loadInterviewFlags(fakeClient() as never, 'bk-1')).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('passes the flags through with the viewer edit right', async () => {
    flagsImpl = async () => ({ interviewId: 'int-1' });
    perms = { user_has_permission: false, is_super_admin: false, is_admin: false };
    expect(await loadInterviewFlags(fakeClient() as never, 'bk-1')).toEqual({
      flags: { interviewId: 'int-1' },
      canEdit: false,
    });
  });
});
