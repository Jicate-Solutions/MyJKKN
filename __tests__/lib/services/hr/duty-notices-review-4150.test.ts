import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Follow-up to the deep review and the risk review of PR #4150 (7 Oct 2026).
// One block per finding; each test fails with that finding's fix reverted.
// The client is a stub that records every query, so the tests can say which
// institution a recipient lookup was scoped to and what the ledger was told.

const dispatchSpy = vi.fn();
vi.mock('@/lib/services/staff/notification-service', () => ({
  StaffNotificationService: new Proxy(
    {},
    { get: (_t, name) => (...args: unknown[]) => dispatchSpy(String(name), ...args) },
  ),
}));

let routeClient: SupabaseClient | null = null;
const serviceClientSpy = vi.fn(() => routeClient);
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => serviceClientSpy(),
}));

import {
  notifyOnboardingStepTurn,
  notifyRegularizationEvent,
  runOnboardingSweep,
  REGULARIZATION_PAGE_SIZE,
} from '@/lib/services/hr/duty-notices/dispatch';
import { GET as dutyNoticesCron } from '@/app/api/cron/hr/duty-notices/route';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// The stub
// ---------------------------------------------------------------------------

type Q = { table: string; op: string; calls: Array<{ name: string; args: unknown[] }> };
type Res = { data: unknown; error: { message: string } | null };

const METHODS = [
  'select', 'eq', 'in', 'not', 'is', 'gte', 'lte', 'lt', 'gt', 'limit', 'order', 'range',
  'upsert', 'update', 'delete', 'insert',
];

function has(q: Q, name: string, ...args: unknown[]) {
  return q.calls.some((c) => c.name === name && args.every((a, i) => c.args[i] === a));
}
function argOf(q: Q, name: string, i = 0): unknown {
  return q.calls.find((c) => c.name === name)?.args[i];
}

function stub(
  handle: (q: Q) => Res,
  rpc: (fn: string, args: Record<string, unknown>) => string[] = () => [],
) {
  const queries: Q[] = [];
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: rpc(fn, args), error: null };
    }),
    from(table: string) {
      const q: Q = { table, op: 'select', calls: [] };
      queries.push(q);
      const b: Record<string, unknown> = {};
      for (const m of METHODS) {
        b[m] = (...args: unknown[]) => {
          if (['upsert', 'update', 'delete', 'insert'].includes(m)) q.op = m;
          q.calls.push({ name: m, args });
          return b;
        };
      }
      b.maybeSingle = async () => handle(q);
      b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(handle(q)).then(res, rej);
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient, queries, rpcCalls };
}

const ok = (data: unknown): Res => ({ data, error: null });
const NOW = new Date('2026-10-10T05:00:00Z'); // Saturday 10:30 IST
const GO_LIVE = '2026-10-01T00:00:00+00:00';
const emp = { first_name: 'Ravi', last_name: 'K', profile_id: 'u-ravi', institution_id: 'inst-1' };
const reg = (id: string, status: string, created_at: string, approved_at: string | null, extra = {}) => ({
  id, status, for_date: '2026-10-03', created_at, approved_at,
  rejection_reason: null, reason_text: null, reason: { label: 'Forgot to punch' }, employee: emp, ...extra,
});
const ledgerRow = (subject_id: string, reminder_kind: string, over: Record<string, unknown> = {}) => ({
  id: `L-${subject_id}-${reminder_kind}`, subject_id, subject_key: '', reminder_kind,
  notified_count: 1, pending_user_ids: [], recipient_user_ids: ['u-a'],
  updated_at: '2026-10-09T05:00:00.000000+00:00', ...over,
});

/** A cron-shaped world: policies, leave, regularisations and the ledger. */
function world(opts: {
  pending?: unknown[];
  decided?: unknown[];
  ledger?: Array<ReturnType<typeof ledgerRow>>;
  leaveError?: boolean;
  leaveEmployees?: string[];
  staffProfiles?: Record<string, string>;
  claimTaken?: boolean;
  deleteError?: boolean;
  recordError?: boolean;
  pageFill?: boolean;
  approvers?: string[];
}) {
  const ledger = opts.ledger ?? [];
  return stub(
    (q) => {
      switch (q.table) {
        case 'platform_policies':
          return ok([{ policy_key: 'hr.duty_notices.go_live_at', value: GO_LIVE }]);
        case 'hr_leave_applications':
          if (opts.leaveError) return { data: null, error: { message: 'leave table unavailable' } };
          return ok((opts.leaveEmployees ?? []).map((employee_id) => ({ employee_id })));
        case 'staff':
          return ok(Object.entries(opts.staffProfiles ?? {}).map(([, profile_id]) => ({ profile_id })));
        case 'hr_attendance_regularizations': {
          const isPending = has(q, 'eq', 'status', 'pending');
          const rows = (isPending ? opts.pending : opts.decided) ?? [];
          if (opts.pageFill && isPending) {
            // First page full, second page has the real rows.
            return ok(argOf(q, 'range', 0) === 0 ? Array.from({ length: REGULARIZATION_PAGE_SIZE }, (_, i) =>
              reg(`fill-${i}`, 'pending', '2026-10-09T04:00:00Z', null)) : rows);
          }
          return ok(rows);
        }
        case 'hr_duty_notices': {
          if (q.op === 'upsert') return ok(opts.claimTaken === false ? [] : [{ id: 'claim-new' }]);
          if (q.op === 'delete') return opts.deleteError ? { data: null, error: { message: 'delete refused' } } : ok(null);
          if (q.op === 'update') {
            const payload = argOf(q, 'update') as Record<string, unknown>;
            if ('notified_count' in payload && opts.recordError) return { data: null, error: { message: 'update refused' } };
            // Re-take of an orphaned claim: only when the row is older than the cutoff.
            if (has(q, 'eq', 'notified_count', 0) && q.calls.some((c) => c.name === 'lt')) {
              const before = String(argOf(q, 'lt', 1));
              const row = ledger.find((r) => has(q, 'eq', 'id', r.id));
              return ok(row && Date.parse(row.updated_at) < Date.parse(before) ? [{ id: row.id }] : []);
            }
            // Optimistic take of pending recipients.
            if ('pending_user_ids' in payload && q.calls.some((c) => c.name === 'eq' && c.args[0] === 'updated_at')) {
              const row = ledger.find((r) => has(q, 'eq', 'id', r.id) && has(q, 'eq', 'updated_at', r.updated_at));
              return ok(row ? [{ id: row.id }] : []);
            }
            return ok(null);
          }
          // select: the single-row read of one notice (maybeSingle), or
          // loadSentKeys' read of every row for the subjects.
          const eqArg = (col: string) => q.calls.find((c) => c.name === 'eq' && c.args[0] === col)?.args[1];
          if (eqArg('reminder_kind') !== undefined) {
            return ok(ledger.find((r) =>
              r.reminder_kind === eqArg('reminder_kind')
              && r.subject_id === eqArg('subject_id')
              && r.subject_key === eqArg('subject_key')) ?? null);
          }
          return ok(ledger);
        }
        default:
          return ok([]);
      }
    },
    (fn, args) => {
      if (fn === 'fn_hr_permission_holder_ids') return opts.approvers ?? ['u-a'];
      if (fn === 'fn_hr_role_holder_ids') return ['u-head'];
      return [];
    },
  );
}

async function runCron(client: SupabaseClient) {
  routeClient = client;
  process.env.CRON_SECRET = 'test-secret';
  const res = await dutyNoticesCron(
    new NextRequest('http://localhost/api/cron/hr/duty-notices', {
      headers: { authorization: 'Bearer test-secret' },
    }),
  );
  return {
    status: res.status,
    body: (await res.json()) as {
      ok: boolean;
      skipped?: string;
      errors: string[];
      regularization: { skipped_leave_unknown: number; errors: string[] } | null;
    },
  };
}

const sentKinds = () => dispatchSpy.mock.calls.map((c) => c[0] as string).sort();
const upserts = (queries: Q[]) =>
  queries.filter((q) => q.table === 'hr_duty_notices' && q.op === 'upsert').map((q) => argOf(q, 'upsert') as Record<string, unknown>);

beforeEach(() => {
  dispatchSpy.mockReset();
  dispatchSpy.mockResolvedValue(1);
  serviceClientSpy.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Item 1 — recipients stay in the subject's college
// ---------------------------------------------------------------------------

describe('item 1: no cross-college recipients', () => {
  const candidate = {
    id: 'c1', name: 'Asha', role_title: 'Office Assistant', status: 'approved', institution_id: 'inst-1',
    expected_joining_date: '2026-10-20', actual_joining_date: null,
    role_specific_details: {
      onboarding_started_at: '2026-10-05T04:00:00Z',
      onboarding_steps: [
        { index: 0, step: 'Offer signed', completed: true, completed_at: '2026-10-06T05:00:00Z' },
        { index: 1, step: 'Create email', completed: false, completed_at: null, assigned_role: 'it_admin' },
      ],
    },
  };

  it('a step role nobody holds in the college goes to that college\'s HR, never to other colleges\' holders', async () => {
    const { client, rpcCalls } = stub(
      (q) => (q.table === 'hr_recruitment_candidates' ? ok(candidate) : q.op === 'upsert' ? ok([{ id: 'n1' }]) : ok(null)),
      (fn, args) => {
        const keys = args.p_role_keys as string[];
        if (keys.includes('it_admin')) return args.p_institution_id === null ? ['u-it-other-college'] : [];
        if (keys.includes('hr_officer')) return args.p_institution_id === 'inst-1' ? ['u-hr-inst-1'] : ['u-hr-everywhere'];
        return [];
      },
    );
    expect(await notifyOnboardingStepTurn(client, 'c1', 1, 0)).toBe('sent');
    expect(dispatchSpy).toHaveBeenCalledWith('notifyOnboardingStepTurn', client, 'c1', ['u-hr-inst-1'], expect.anything());
    expect(rpcCalls.length).toBeGreaterThan(0);
    expect(rpcCalls.every((c) => c.args.p_institution_id === 'inst-1')).toBe(true);
  });

  it('regularisation approvers are looked up inside the team member\'s college', async () => {
    const { client, rpcCalls } = stub(
      (q) => (q.table === 'hr_attendance_regularizations'
        ? ok(reg('r1', 'pending', '2026-10-09T04:00:00Z', null))
        : q.op === 'upsert' ? ok([{ id: 'n1' }]) : ok(null)),
      () => ['u-a'],
    );
    await notifyRegularizationEvent(client, 'r1', NOW);
    const call = rpcCalls.find((c) => c.fn === 'fn_hr_permission_holder_ids');
    expect(call?.args).toEqual({
      p_keys: ['hr.attendance.regularize_approve', 'hr.attendance.approve_team'],
      p_institution_id: 'inst-1',
    });
  });

  it('the HR-head chase is scoped to the team member\'s college', async () => {
    const { client, rpcCalls } = world({
      pending: [reg('r-old', 'pending', '2026-10-04T04:00:00Z', null)],
      ledger: [ledgerRow('r-old', 'submitted'), ledgerRow('r-old', 'reminder')],
    });
    await runCron(client);
    expect(sentKinds()).toEqual(['notifyRegularizationHrHead']);
    const heads = rpcCalls.filter((c) => c.fn === 'fn_hr_role_holder_ids');
    expect(heads.map((c) => c.args)).toEqual([{ p_role_keys: ['hr_head'], p_institution_id: 'inst-1' }]);
  });
});

// ---------------------------------------------------------------------------
// Item 2 — claim before send
// ---------------------------------------------------------------------------

describe('item 2: an orphaned claim is not "sent"', () => {
  it('a claim left at notified_count 0 is planned again and re-taken once stale', async () => {
    // r-orphan waited 3 days; its "submitted" claim was never recorded as sent.
    const { client, queries } = world({
      pending: [reg('r-orphan', 'pending', '2026-10-07T04:00:00Z', null)],
      ledger: [ledgerRow('r-orphan', 'submitted', { notified_count: 0, updated_at: '2026-10-07T04:00:05.000000+00:00' })],
      claimTaken: false,
    });
    await runCron(client);
    // Not a reminder (that needs a delivered "submitted"): the missed notice itself.
    expect(sentKinds()).toEqual(['notifyRegularizationSubmitted']);
    const retake = queries.find((q) => q.table === 'hr_duty_notices' && q.op === 'update' && has(q, 'eq', 'notified_count', 0));
    expect(retake).toBeDefined();
  });

  it('a fresh claim at 0 is another run\'s send in flight: left alone', async () => {
    const fresh = new Date(NOW.getTime() - 60 * 1000).toISOString();
    const { client } = stub(
      (q) => {
        if (q.table === 'hr_attendance_regularizations') return ok(reg('r1', 'pending', '2026-10-09T04:00:00Z', null));
        if (q.op === 'upsert') return ok([]);
        if (q.op === 'update') return ok([]); // the WHERE (updated_at < stale cutoff) matches nothing
        return ok({ id: 'L1', notified_count: 0, recipient_user_ids: ['u-a'], pending_user_ids: [], updated_at: fresh });
      },
      () => ['u-a'],
    );
    expect(await notifyRegularizationEvent(client, 'r1', NOW)).toEqual({ kind: 'submitted', outcome: 'already_sent' });
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('a failed release of the claim is reported, not swallowed', async () => {
    dispatchSpy.mockResolvedValue(0);
    const { client } = world({
      pending: [reg('r-new', 'pending', '2026-10-10T04:00:00Z', null)],
      deleteError: true,
    });
    const { body } = await runCron(client);
    expect(body.errors.join('\n')).toMatch(/release after a failed send did not go through \(delete refused\)/);
  });

  it('a failed "sent" record is reported, not swallowed', async () => {
    const { client } = world({
      pending: [reg('r-new', 'pending', '2026-10-10T04:00:00Z', null)],
      recordError: true,
    });
    const { body } = await runCron(client);
    expect(body.errors.join('\n')).toMatch(/recording failed \(update refused\)/);
  });
});

// ---------------------------------------------------------------------------
// Item 3 — on-leave recipients are reached later, not dropped
// ---------------------------------------------------------------------------

describe('item 3: a recipient on leave gets the chase when back', () => {
  it('first run: sends to who is in, keeps the one on leave as pending', async () => {
    const { client, queries } = world({
      pending: [reg('r-old', 'pending', '2026-10-07T04:00:00Z', null)],
      ledger: [ledgerRow('r-old', 'submitted')],
      approvers: ['u-a', 'u-b'],
      leaveEmployees: ['s-b'],
      staffProfiles: { 's-b': 'u-b' },
    });
    await runCron(client);
    expect(dispatchSpy).toHaveBeenCalledWith('notifyRegularizationReminder', client, 'r-old', ['u-a'], expect.anything());
    expect(upserts(queries)).toEqual([
      expect.objectContaining({ reminder_kind: 'reminder', recipient_user_ids: ['u-a'], pending_user_ids: ['u-b'] }),
    ]);
  });

  it('a later run, with them back: the same reminder goes to them only', async () => {
    const reminderRow = ledgerRow('r-old', 'reminder', { pending_user_ids: ['u-b'], recipient_user_ids: ['u-a'] });
    const { client, queries } = world({
      pending: [reg('r-old', 'pending', '2026-10-07T04:00:00Z', null)],
      ledger: [ledgerRow('r-old', 'submitted'), reminderRow],
      approvers: ['u-a', 'u-b'],
      claimTaken: false,
    });
    await runCron(client);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith('notifyRegularizationReminder', client, 'r-old', ['u-b'], expect.anything());
    const recorded = queries
      .filter((q) => q.table === 'hr_duty_notices' && q.op === 'update')
      .map((q) => argOf(q, 'update') as Record<string, unknown>)
      .find((p) => 'notified_count' in p);
    expect(recorded).toMatchObject({ notified_count: 2, recipient_user_ids: ['u-a', 'u-b'] });
  });
});

// ---------------------------------------------------------------------------
// Item 4 — the decision is part of the key
// ---------------------------------------------------------------------------

describe('item 4: decided key carries the decision', () => {
  it('a rejection is claimed under "rejected", so an earlier "approved" does not block it', async () => {
    const { client, queries } = stub(
      (q) => (q.table === 'hr_attendance_regularizations'
        ? ok(reg('r1', 'rejected', '2026-10-05T04:00:00Z', '2026-10-09T04:00:00Z', { rejection_reason: 'No gate log' }))
        : q.op === 'upsert' ? ok([{ id: 'n1' }]) : ok(null)),
    );
    expect(await notifyRegularizationEvent(client, 'r1', NOW)).toEqual({ kind: 'decided', outcome: 'sent' });
    expect(upserts(queries)).toEqual([expect.objectContaining({ reminder_kind: 'decided', subject_key: 'rejected' })]);
  });
});

// ---------------------------------------------------------------------------
// Item 6 — no chase at night or on Sunday, whoever triggers the run
// ---------------------------------------------------------------------------

describe('item 6: the cron route keeps to daytime', () => {
  it('a Sunday trigger sends nothing and does not even open a database client', async () => {
    vi.setSystemTime(new Date('2026-10-11T05:00:00Z')); // Sunday 10:30 IST
    const { client } = world({ pending: [reg('r-new', 'pending', '2026-10-10T04:00:00Z', null)] });
    const { status, body } = await runCron(client);
    expect(status).toBe(200);
    expect(body.skipped).toBe('outside_daytime');
    expect(serviceClientSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('a 23:00 IST trigger on a weekday is skipped too', async () => {
    vi.setSystemTime(new Date('2026-10-09T17:30:00Z')); // Friday 23:00 IST
    const { client } = world({ pending: [reg('r-new', 'pending', '2026-10-09T04:00:00Z', null)] });
    const { body } = await runCron(client);
    expect(body.skipped).toBe('outside_daytime');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Item 9 — a failed leave read skips the chases only
// ---------------------------------------------------------------------------

describe('item 9: leave read failure', () => {
  it('still sends the missed submitted and decided notices; skips the chases; reports it', async () => {
    const { client } = world({
      leaveError: true,
      pending: [
        reg('r-old', 'pending', '2026-10-04T04:00:00Z', null),
        reg('r-new', 'pending', '2026-10-10T04:00:00Z', null),
      ],
      decided: [reg('r-done', 'approved', '2026-10-05T04:00:00Z', '2026-10-08T04:00:00Z')],
      ledger: [ledgerRow('r-old', 'submitted'), ledgerRow('r-done', 'submitted')],
    });
    const { status, body } = await runCron(client);
    expect(sentKinds()).toEqual(['notifyRegularizationDecided', 'notifyRegularizationSubmitted']);
    expect(body.regularization?.skipped_leave_unknown).toBe(2);
    expect(body.errors.join('\n')).toMatch(/leave lookup: leave lookup failed: leave table unavailable/);
    expect(status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Item 10 / risk 2 — ordered paging; risk 3 — one snapshot per request
// ---------------------------------------------------------------------------

describe('item 10: the pending read is ordered and paged', () => {
  it('orders by created_at and asks for the next page when one comes back full', async () => {
    const { client, queries } = world({
      pending: [reg('r-late', 'pending', '2026-10-10T04:00:00Z', null)],
      pageFill: true,
    });
    await runCron(client);
    const pendingReads = queries.filter((q) => q.table === 'hr_attendance_regularizations' && has(q, 'eq', 'status', 'pending'));
    expect(pendingReads.map((q) => argOf(q, 'range', 0))).toEqual([0, REGULARIZATION_PAGE_SIZE]);
    expect(pendingReads.every((q) => has(q, 'order', 'created_at'))).toBe(true);
    // The row on the second page is reached.
    expect(dispatchSpy.mock.calls.some((c) => c[2] === 'r-late')).toBe(true);
  });
});

describe('risk 3: a request decided between the two reads', () => {
  it('is handled once, as decided — no "awaiting approval" chase about it', async () => {
    const { client } = world({
      pending: [reg('r-flip', 'pending', '2026-10-05T04:00:00Z', null)],
      decided: [reg('r-flip', 'approved', '2026-10-05T04:00:00Z', '2026-10-10T04:59:00Z')],
      ledger: [ledgerRow('r-flip', 'submitted')],
    });
    await runCron(client);
    expect(sentKinds()).toEqual(['notifyRegularizationDecided']);
  });
});

// ---------------------------------------------------------------------------
// Risk 4 / item 5 — joining soon: one notice per joiner
// ---------------------------------------------------------------------------

describe('risk 4: joining soon is one notice, not one per open step', () => {
  it('three open steps owned by the same HR team: one notice, recipients de-duplicated', async () => {
    const candidate = {
      id: 'c9', name: 'Meena', role_title: 'Lab Assistant', status: 'approved', institution_id: 'inst-1',
      expected_joining_date: '2026-10-12', actual_joining_date: null,
      role_specific_details: {
        onboarding_started_at: '2026-10-09T04:00:00Z',
        onboarding_steps: [
          { index: 0, step: 'Offer signed', completed: false, completed_at: null },
          { index: 1, step: 'Create email', completed: false, completed_at: null },
          { index: 2, step: 'ID card', completed: false, completed_at: null },
        ],
      },
    };
    const { client } = stub(
      (q) => (q.table === 'hr_recruitment_candidates' ? ok([candidate]) : q.op === 'upsert' ? ok([{ id: 'n1' }]) : ok([])),
      () => ['u-hr'],
    );
    const counts = await runOnboardingSweep(client, NOW, { reminderAfterWorkingDays: 2, joiningSoonDays: 3 }, new Set(), new Date(GO_LIVE));
    expect(sentKinds()).toEqual(['notifyOnboardingJoiningSoon']);
    expect(dispatchSpy).toHaveBeenCalledWith(
      'notifyOnboardingJoiningSoon', client, 'c9', ['u-hr'],
      expect.objectContaining({ openSteps: ['Offer signed', 'Create email', 'ID card'] }),
    );
    expect(counts.sent).toBe(1);
  });
});
