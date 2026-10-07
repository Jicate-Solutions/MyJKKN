import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      for (const m of ['select', 'eq', 'in', 'not', 'is', 'gte', 'lte', 'lt', 'limit', 'order', 'range', 'upsert', 'update', 'delete', 'insert']) {
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
      // Keyed on the step itself (stored index + name), not its array position.
      duty_code: 'R9', subject_id: 'c1', subject_key: '#1:Create email', reminder_kind: 'step_turn',
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

// ---------------------------------------------------------------------------
// The separate HR chase ladder (hr-duty-chase) also chases A3. When its switch
// is literally `true` and its A3 duty is enabled, the daily run leaves the
// reminder / hr_head chases to it and still sends submitted + decided. Driven
// through the cron route so the wiring is proved, not just the helper.
// ---------------------------------------------------------------------------

let routeClient: SupabaseClient | null = null;
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => routeClient,
}));

import { GET as dutyNoticesCron } from '@/app/api/cron/hr/duty-notices/route';
import { NextRequest } from 'next/server';

type Built = { table: string; calls: Array<{ name: string; args: unknown[] }>; op: string };

function ladderClient(opts: {
  /** undefined = no switch row at all. */
  switchValue?: unknown;
  /** Go-live cutoff row value; null = no row. Defaults to before every fixture. */
  goLiveAt?: string | null;
  a3Definition?: { enabled: unknown } | null;
  definitionsError?: boolean;
}) {
  const built: Built[] = [];
  const emp = { first_name: 'Ravi', last_name: 'K', profile_id: 'u-ravi', institution_id: 'inst-1' };
  const reg = (id: string, status: string, created_at: string, approved_at: string | null) => ({
    id, status, for_date: '2026-10-03', created_at, approved_at,
    rejection_reason: null, reason_text: null, reason: { label: 'Forgot to punch' }, employee: emp,
  });
  // r-old: pending 6 days, submitted already sent → reminder + hr_head due.
  // r-new: pending 1 hour, nothing sent → submitted due.
  // r-done: approved after waiting, submitted sent → decided due.
  const pending = [
    reg('r-old', 'pending', '2026-10-04T04:00:00Z', null),
    reg('r-new', 'pending', '2026-10-10T04:00:00Z', null),
  ];
  const decided = [reg('r-done', 'approved', '2026-10-05T04:00:00Z', '2026-10-08T04:00:00Z')];
  // Delivered notices: only notified_count > 0 counts as sent.
  const ledger = [
    { subject_id: 'r-old', subject_key: '', reminder_kind: 'submitted', notified_count: 1, pending_user_ids: [] },
    { subject_id: 'r-done', subject_key: '', reminder_kind: 'submitted', notified_count: 1, pending_user_ids: [] },
  ];

  const resolve = (x: Built): { data: unknown; error: { message: string } | null } => {
    const has = (name: string, ...args: unknown[]) =>
      x.calls.some((c) => c.name === name && args.every((a, i) => c.args[i] === a));
    if (x.table === 'hr_duty_notices') {
      if (x.op === 'upsert') return { data: [{ id: `claim-${built.length}` }], error: null };
      if (x.op !== 'select') return { data: null, error: null };
      return { data: ledger, error: null };
    }
    if (x.op !== 'select') return { data: null, error: null };
    switch (x.table) {
      case 'platform_policies': {
        const goLive = opts.goLiveAt === undefined ? '2026-10-01T00:00:00+00:00' : opts.goLiveAt;
        return {
          data: [
            ...(opts.switchValue === undefined ? [] : [{ policy_key: 'hr.harness.chase.enabled', value: opts.switchValue }]),
            ...(goLive === null ? [] : [{ policy_key: 'hr.duty_notices.go_live_at', value: goLive }]),
          ],
          error: null,
        };
      }
      case 'hr_duty_definitions':
        if (opts.definitionsError) return { data: null, error: { message: 'relation does not exist' } };
        return {
          data: has('eq', 'config_key', 'A3') && has('eq', 'is_active', true) ? opts.a3Definition ?? null : null,
          error: null,
        };
      case 'hr_attendance_regularizations':
        return { data: has('eq', 'status', 'pending') ? pending : decided, error: null };
      default:
        return { data: [], error: null };
    }
  };

  const client = {
    rpc: vi.fn(async (fn: string) => ({
      data: fn === 'fn_hr_permission_holder_ids' ? ['u-approver'] : fn === 'fn_hr_role_holder_ids' ? ['u-head'] : [],
      error: null,
    })),
    from(table: string) {
      const x: Built = { table, calls: [], op: 'select' };
      built.push(x);
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'not', 'is', 'gte', 'lte', 'lt', 'limit', 'order', 'range', 'upsert', 'update', 'delete', 'insert']) {
        b[m] = (...args: unknown[]) => {
          if (['upsert', 'update', 'delete', 'insert'].includes(m)) x.op = m;
          x.calls.push({ name: m, args });
          return b;
        };
      }
      b.maybeSingle = async () => resolve(x);
      b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(resolve(x)).then(res, rej);
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient, built };
}

async function runCron(client: SupabaseClient) {
  routeClient = client;
  process.env.CRON_SECRET = 'test-secret';
  const res = await dutyNoticesCron(
    new NextRequest('http://localhost/api/cron/hr/duty-notices', {
      headers: { authorization: 'Bearer test-secret' },
    }),
  );
  return { status: res.status, body: (await res.json()) as { regularization: { handed_to_ladder: number } } };
}

const sentKinds = () => dispatchSpy.mock.calls.map((c) => c[0] as string).sort();
const ALL_FOUR = [
  'notifyRegularizationDecided',
  'notifyRegularizationHrHead',
  'notifyRegularizationReminder',
  'notifyRegularizationSubmitted',
];

describe('daily run vs the HR chase ladder (A3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T05:00:00Z'));
    dispatchSpy.mockResolvedValue(1);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('switch row missing → reminders sent as today, ladder table never read', async () => {
    const { client, built } = ladderClient({});
    const { status, body } = await runCron(client);
    expect(status).toBe(200);
    expect(sentKinds()).toEqual(ALL_FOUR);
    expect(body.regularization.handed_to_ladder).toBe(0);
    expect(built.some((b) => b.table === 'hr_duty_definitions')).toBe(false);
  });

  it('switch true + A3 enabled → reminder and hr_head left to the ladder; submitted and decided still sent', async () => {
    const { client } = ladderClient({ switchValue: true, a3Definition: { enabled: true } });
    const { status, body } = await runCron(client);
    expect(status).toBe(200);
    expect(sentKinds()).toEqual(['notifyRegularizationDecided', 'notifyRegularizationSubmitted']);
    expect(body.regularization.handed_to_ladder).toBe(2);
  });

  it('switch true + A3 disabled → reminders sent', async () => {
    const { client } = ladderClient({ switchValue: true, a3Definition: { enabled: false } });
    await runCron(client);
    expect(sentKinds()).toEqual(ALL_FOUR);
  });

  it('switch stored as the string "true" → treated as off, reminders sent, ladder table never read', async () => {
    const { client, built } = ladderClient({ switchValue: 'true', a3Definition: { enabled: true } });
    await runCron(client);
    expect(sentKinds()).toEqual(ALL_FOUR);
    expect(built.some((b) => b.table === 'hr_duty_definitions')).toBe(false);
  });

  it('ladder table read fails → warns and sends reminders', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = ladderClient({ switchValue: true, definitionsError: true });
    const { status } = await runCron(client);
    expect(status).toBe(200);
    expect(sentKinds()).toEqual(ALL_FOUR);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[hr/duty-notices]'), 'A3', 'relation does not exist');
  });
});

describe('daily run vs the go-live cutoff (Director, 7 Oct 2026)', () => {
  // Fixtures: r-old filed 4 Oct, r-done filed 5 Oct, r-new filed 10 Oct 04:00.
  // The run is 10 Oct 05:00.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T05:00:00Z'));
    dispatchSpy.mockResolvedValue(1);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('(a)+(b) requests filed before go-live get nothing; the one filed after is announced', async () => {
    const { client } = ladderClient({ goLiveAt: '2026-10-06T00:00:00+00:00' });
    const { status } = await runCron(client);
    expect(status).toBe(200);
    expect(sentKinds()).toEqual(['notifyRegularizationSubmitted']);
  });

  it('(c) cutoff row missing → go-live is the run time, so nothing older is chased', async () => {
    const { client } = ladderClient({ goLiveAt: null });
    const { status } = await runCron(client);
    expect(status).toBe(200);
    expect(sentKinds()).toEqual([]);
  });

  it('(c) cutoff row unreadable → same as missing', async () => {
    const { client } = ladderClient({ goLiveAt: 'soon' });
    await runCron(client);
    expect(sentKinds()).toEqual([]);
  });
});
