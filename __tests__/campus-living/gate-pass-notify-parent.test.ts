/**
 * Campus Living — POST /api/campus-living/gate-passes/notify-parent.
 *
 * NEGATIVE CONTROL. Before this suite's fix the route answered
 * `{ ok: true, notified: 0, reason: 'no_parent_linked' }` for a learner nobody
 * could be told about. Every `expect(body.ok).toBe(false)` below therefore FAILS
 * against that old behaviour — that is the point of the suite. What it pins:
 *
 *   1. a structural gap is reported as NOT delivered, never as success;
 *   2. the reason distinguishes "no parent exists" from "a Parent Portal
 *      account exists but the gate directory cannot reach it" — the state
 *      production is actually in;
 *   3. fail-soft survives: every one of those answers is still HTTP 200 and
 *      never flags `parent_notified`, so a gate movement already written to the
 *      database is never blocked or falsely marked;
 *   4. the happy path still reports success.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before the handler is imported (vitest hoists vi.mock).
// ---------------------------------------------------------------------------

const PASS_ID = '11111111-2222-4333-8444-555555555555';
/** hostel_gate_passes.learner_id is a profiles.id. */
const LEARNER_PROFILE_ID = 'aaaaaaaa-2222-4333-8444-555555555555';
/** profiles.learner_id -> learners_profiles.id, the Parent Portal's ID space. */
const LEARNERS_PROFILES_ID = 'bbbbbbbb-2222-4333-8444-555555555555';

interface Fixtures {
  parentLinks: Array<{ parent_id: string | null }>;
  parentProfiles: Array<{ user_id: string | null }>;
  /** profiles.learner_id for the portal hop; null = learner has no learner row. */
  learnerIdOnProfile: string | null;
  /** A pp_parent_accounts row for that learners_profiles.id, or null. */
  portalAccount: { id: string } | null;
}

let fixtures: Fixtures;
let permissionGranted: boolean;
let notifyThrows: boolean;
/** Every write the handler attempted, so we can prove it did NOT flag. */
let updates: Array<{ table: string; payload: Record<string, unknown> }>;
let notifyCalls: number;

function resolveRead(table: string, columns: string): { data: unknown; error: null } {
  if (table === 'hostel_gate_passes') {
    return {
      data: {
        id: PASS_ID,
        learner_id: LEARNER_PROFILE_ID,
        destination: 'Home',
        expected_return: '2026-08-14T16:30:00.000Z',
        actual_return: null,
        pass_number: 'GP-0001',
      },
      error: null,
    };
  }
  if (table === 'profiles') {
    // The route reads this table twice with different columns.
    if (columns.includes('full_name')) return { data: { full_name: 'Meena R' }, error: null };
    return { data: { learner_id: fixtures.learnerIdOnProfile }, error: null };
  }
  if (table === 'parent_learner_links') return { data: fixtures.parentLinks, error: null };
  if (table === 'parent_profiles') return { data: fixtures.parentProfiles, error: null };
  if (table === 'pp_parent_accounts') return { data: fixtures.portalAccount, error: null };
  return { data: null, error: null };
}

function builder(table: string) {
  const state = { columns: '' };
  const b: Record<string, unknown> = {};
  const chain = () => b;
  Object.assign(b, {
    select: (cols?: string) => {
      state.columns = cols ?? '';
      return chain();
    },
    update: (payload: Record<string, unknown>) => {
      updates.push({ table, payload });
      return chain();
    },
    eq: chain,
    in: chain,
    limit: chain,
    maybeSingle: () => Promise.resolve(resolveRead(table, state.columns)),
    single: () => Promise.resolve(resolveRead(table, state.columns)),
    // parent_learner_links / parent_profiles and the .update() are awaited
    // directly, with no .maybeSingle() terminator.
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(resolveRead(table, state.columns)).then(ok, err),
  });
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'guard-1' } }, error: null }) },
      rpc: (fn: string) =>
        Promise.resolve(
          fn === 'is_super_admin'
            ? { data: false, error: null }
            : { data: permissionGranted, error: null }
        ),
    }),
  createServiceRoleClient: () => ({ from: (table: string) => builder(table) }),
}));

vi.mock('@/lib/services/notification/notification-service', () => ({
  createNotification: vi.fn(() => {
    notifyCalls += 1;
    if (notifyThrows) throw new Error('notification insert refused');
    return Promise.resolve({ id: 'notif-1' });
  }),
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { dev: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// SUT imported AFTER the mocks.
import { POST } from '@/app/api/campus-living/gate-passes/notify-parent/route';

function request(body: unknown) {
  return new Request('https://jkkn.ai/api/campus-living/gate-passes/notify-parent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

async function notifyOut() {
  const res = await POST(request({ passId: PASS_ID, event: 'out' }));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  permissionGranted = true;
  notifyThrows = false;
  updates = [];
  notifyCalls = 0;
  fixtures = {
    parentLinks: [],
    parentProfiles: [],
    learnerIdOnProfile: LEARNERS_PROFILES_ID,
    portalAccount: null,
  };
});

describe('notify-parent — a structural gap is never dressed as success', () => {
  it('NO PARENT ANYWHERE: reports not-delivered, not ok:true', async () => {
    const { status, body } = await notifyOut();

    expect(status).toBe(200); // fail-soft: the gate write already happened
    expect(body.ok).toBe(false); // the old route said true here
    expect(body.delivered).toBe(false);
    expect(body.notified).toBe(0);
    expect(body.attempted).toBe(0);
    expect(body.reason).toBe('no_parent_linked');
    expect(body.message).toMatch(/nobody was told/i);
  });

  it('PORTAL ACCOUNT EXISTS but the gate directory is empty: says which gap it is', async () => {
    fixtures.portalAccount = { id: 'pp-account-1' };

    const { status, body } = await notifyOut();

    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.delivered).toBe(false);
    // NOT 'no_parent_linked' — a parent account exists, the gate just cannot
    // reach it. Calling this "no parent linked" would be true about the lookup
    // and false about the world.
    expect(body.reason).toBe('parent_account_not_in_gate_directory');
    expect(body.message).toMatch(/Parent Portal account/i);
  });

  it('LINKED BUT NO LOGIN: reports not-delivered with its own reason', async () => {
    fixtures.parentLinks = [{ parent_id: 'parent-1' }];
    fixtures.parentProfiles = [{ user_id: null }];

    const { status, body } = await notifyOut();

    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.delivered).toBe(false);
    expect(body.reason).toBe('no_parent_account');
  });

  it('EVERY SEND FAILS: reports delivery_failed and how many were attempted', async () => {
    fixtures.parentLinks = [{ parent_id: 'parent-1' }];
    fixtures.parentProfiles = [{ user_id: 'parent-user-1' }];
    notifyThrows = true;

    const { status, body } = await notifyOut();

    expect(status).toBe(200); // a failed notification must not 500 the gate
    expect(body.ok).toBe(false); // the old route said true here too
    expect(body.delivered).toBe(false);
    expect(body.notified).toBe(0);
    expect(body.attempted).toBe(1);
    expect(body.reason).toBe('delivery_failed');
    expect(notifyCalls).toBe(1);
  });
});

describe('notify-parent — the flag and the happy path', () => {
  it('a parent actually reached is reported delivered and flags the pass', async () => {
    fixtures.parentLinks = [{ parent_id: 'parent-1' }];
    fixtures.parentProfiles = [{ user_id: 'parent-user-1' }];

    const { status, body } = await notifyOut();

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.delivered).toBe(true);
    expect(body.notified).toBe(1);
    expect(body.attempted).toBe(1);
    expect(body.reason).toBe('delivered');

    expect(updates).toContainEqual({
      table: 'hostel_gate_passes',
      payload: { parent_notified: true },
    });
  });

  it('parent_notified is NEVER set when nobody was told', async () => {
    fixtures.portalAccount = { id: 'pp-account-1' };

    const { body } = await notifyOut();

    expect(body.delivered).toBe(false);
    // The pass detail screen renders this flag as a Yes/No badge — flagging it
    // on a delivery that never happened would push the lie downstream.
    expect(updates).toHaveLength(0);
  });

  it('a late return that reaches nobody is also reported not-delivered', async () => {
    const res = await POST(request({ passId: PASS_ID, event: 'late_return' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('no_parent_linked');
  });
});

describe('notify-parent — the route is not an open relay', () => {
  it('a caller without the gate write permission is refused', async () => {
    permissionGranted = false;

    const res = await POST(request({ passId: PASS_ID, event: 'out' }));

    expect(res.status).toBe(403);
    expect(notifyCalls).toBe(0);
  });

  it('a request with no passId is rejected before any lookup', async () => {
    const res = await POST(request({ event: 'out' }));

    expect(res.status).toBe(400);
    expect(notifyCalls).toBe(0);
  });
});
