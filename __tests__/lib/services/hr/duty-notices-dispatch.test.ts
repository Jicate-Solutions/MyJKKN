import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// The ledger contract of lib/services/hr/duty-notices/dispatch.ts, exercised
// through the real exported functions with a stub client: claim BEFORE send,
// a refused claim sends nothing, a send that reached nobody releases the claim.

const dispatchSpy = vi.fn();
vi.mock('@/lib/services/staff/notification-service', () => ({
  StaffNotificationService: new Proxy(
    {},
    { get: (_t, name) => (...args: unknown[]) => dispatchSpy(String(name), ...args) },
  ),
}));

import {
  notifyOnboardingStepTurn,
  notifyRegularizationEvent,
} from '@/lib/services/hr/duty-notices/dispatch';

type Call = { table: string; op: string; args: unknown[] };

/** A chainable, awaitable fake of the PostgREST builder. */
function fakeClient(opts: {
  rows: Record<string, unknown>;
  claimReturns: Array<{ id: string }>;
  rpc: Record<string, string[]>;
}) {
  const calls: Call[] = [];
  const client = {
    rpc: vi.fn(async (fn: string) => ({ data: opts.rpc[fn] ?? [], error: null })),
    from(table: string) {
      let op = 'select';
      const b: Record<string, unknown> = {};
      const chain = (name: string) =>
        (...args: unknown[]) => {
          if (['upsert', 'update', 'delete', 'insert'].includes(name)) op = name;
          calls.push({ table, op: name, args });
          return b;
        };
      for (const m of ['select', 'eq', 'in', 'not', 'is', 'gte', 'lte', 'limit', 'upsert', 'update', 'delete', 'insert']) {
        b[m] = chain(m);
      }
      const result = () => {
        if (table === 'hr_duty_notices' && op === 'upsert') return { data: opts.claimReturns, error: null };
        if (op !== 'select') return { data: null, error: null };
        return { data: opts.rows[table] ?? null, error: null };
      };
      b.maybeSingle = async () => result();
      b.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const candidate = {
  id: 'c1',
  name: 'Asha',
  role_title: 'Office Assistant',
  status: 'approved',
  institution_id: 'inst-1',
  expected_joining_date: '2026-10-12',
  actual_joining_date: null,
  role_specific_details: {
    onboarding_steps: [
      { index: 0, step: 'Offer signed', completed: true, completed_at: '2026-10-01T05:00:00Z' },
      { index: 1, step: 'Create email', completed: false, completed_at: null, assigned_role: 'it_admin' },
    ],
  },
};

beforeEach(() => dispatchSpy.mockReset());

describe('notifyOnboardingStepTurn', () => {
  it('claims the ledger row, then tells the step role holders', async () => {
    dispatchSpy.mockResolvedValue(2);
    const { client, calls } = fakeClient({
      rows: { hr_recruitment_candidates: candidate },
      claimReturns: [{ id: 'n1' }],
      rpc: { fn_hr_role_holder_ids: ['u-it-1', 'u-it-2'] },
    });

    const outcome = await notifyOnboardingStepTurn(client, 'c1', 1, 0);

    expect(outcome).toBe('sent');
    const claimAt = calls.findIndex((c) => c.table === 'hr_duty_notices' && c.op === 'upsert');
    expect(claimAt).toBeGreaterThan(-1);
    expect(calls[claimAt].args[0]).toMatchObject({
      duty_code: 'R9', subject_id: 'c1', subject_key: '1', reminder_kind: 'step_turn',
      recipient_user_ids: ['u-it-1', 'u-it-2'],
    });
    expect(dispatchSpy).toHaveBeenCalledWith(
      'notifyOnboardingStepTurn', client, 'c1', ['u-it-1', 'u-it-2'],
      expect.objectContaining({ stepName: 'Create email', stepNumber: 2, stepCount: 2, previousStepName: 'Offer signed' }),
    );
    expect(calls.some((c) => c.table === 'hr_duty_notices' && c.op === 'update')).toBe(true);
  });

  it('sends nothing when the claim is refused (already sent)', async () => {
    const { client } = fakeClient({
      rows: { hr_recruitment_candidates: candidate },
      claimReturns: [],
      rpc: { fn_hr_role_holder_ids: ['u-it-1'] },
    });
    expect(await notifyOnboardingStepTurn(client, 'c1', 1, 0)).toBe('already_sent');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('releases the claim when the dispatch reached nobody', async () => {
    dispatchSpy.mockResolvedValue(0);
    const { client, calls } = fakeClient({
      rows: { hr_recruitment_candidates: candidate },
      claimReturns: [{ id: 'n1' }],
      rpc: { fn_hr_role_holder_ids: ['u-it-1'] },
    });
    expect(await notifyOnboardingStepTurn(client, 'c1', 1, 0)).toBe('failed');
    expect(calls.some((c) => c.table === 'hr_duty_notices' && c.op === 'delete')).toBe(true);
  });

  it('does not claim anything when nobody owns the step', async () => {
    const { client, calls } = fakeClient({
      rows: { hr_recruitment_candidates: candidate },
      claimReturns: [{ id: 'n1' }],
      rpc: { fn_hr_role_holder_ids: [] },
    });
    expect(await notifyOnboardingStepTurn(client, 'c1', 1, 0)).toBe('no_recipients');
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
  });
});

describe('notifyRegularizationEvent', () => {
  const base = {
    id: 'r1', for_date: '2026-10-03', created_at: '2026-10-05T04:00:00Z',
    rejection_reason: null, reason_text: null, reason: { label: 'Forgot to punch' },
    employee: { first_name: 'Ravi', last_name: 'K', profile_id: 'u-ravi', institution_id: 'inst-1' },
  };

  it('pending → approvers, never the requester', async () => {
    dispatchSpy.mockResolvedValue(1);
    const { client } = fakeClient({
      rows: { hr_attendance_regularizations: { ...base, status: 'pending', approved_at: null } },
      claimReturns: [{ id: 'n1' }],
      rpc: { fn_hr_permission_holder_ids: ['u-hr', 'u-ravi'] },
    });
    const res = await notifyRegularizationEvent(client, 'r1', new Date('2026-10-05T05:00:00Z'));
    expect(res).toEqual({ kind: 'submitted', outcome: 'sent' });
    expect(dispatchSpy).toHaveBeenCalledWith(
      'notifyRegularizationSubmitted', client, 'r1', ['u-hr'],
      expect.objectContaining({ staffName: 'Ravi K', forDate: '2026-10-03', reason: 'Forgot to punch' }),
    );
  });

  it('rejected → the requester, with the reason', async () => {
    dispatchSpy.mockResolvedValue(1);
    const { client } = fakeClient({
      rows: {
        hr_attendance_regularizations: {
          ...base, status: 'rejected', approved_at: '2026-10-06T04:00:00Z', rejection_reason: 'No gate log',
        },
      },
      claimReturns: [{ id: 'n1' }],
      rpc: {},
    });
    const res = await notifyRegularizationEvent(client, 'r1');
    expect(res).toEqual({ kind: 'decided', outcome: 'sent' });
    expect(dispatchSpy).toHaveBeenCalledWith(
      'notifyRegularizationDecided', client, 'r1', 'u-ravi',
      { forDate: '2026-10-03', approved: false, rejectionReason: 'No gate log' },
    );
  });

  it("a HR Head's direct correction (created and approved in one go) is not announced", async () => {
    const { client } = fakeClient({
      rows: {
        hr_attendance_regularizations: {
          ...base, status: 'approved', approved_at: base.created_at,
        },
      },
      claimReturns: [{ id: 'n1' }],
      rpc: {},
    });
    expect(await notifyRegularizationEvent(client, 'r1')).toEqual({ kind: null, outcome: 'nothing_due' });
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
