// __tests__/grievance/filer-bell-wiring.test.ts
//
// Repair round, 1 Oct 2026. filer-updates.test.ts pins WHAT the filer is told;
// this file pins that the two status writers actually CALL it — so deleting a
// notifyFilerOfChange call site, or letting a missing service-role key fail a
// write that already committed, turns a test red.
//
//   1. lib/grievance/actions.ts → updateGrievanceStatusAction (handler pages)
//   2. app/api/learners-council/issues/[id]/route.ts → PATCH (RLS branch and
//      the elevated council-executive branch)
//
// The real notifyFilerOfChange runs; only the Supabase clients and the bell
// insert are replaced.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const FILER = '11111111-1111-4111-8111-111111111111';
const HANDLER = '22222222-2222-4222-8222-222222222222';
const CALLER = '33333333-3333-4333-8333-333333333333';
const TICKET = '44444444-4444-4444-8444-444444444444';
const INST = '55555555-5555-4555-8555-555555555555';

type Call = { table: string; op: 'select' | 'update'; columns: string; patch?: unknown };
type Answer = { data: unknown; error: unknown };

/** A chainable Supabase stand-in: every query ends in maybeSingle(), answered by `resolve`. */
function fakeClient(resolve: (c: Call) => Answer, extra: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const client = {
    calls,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: CALLER } }, error: null })) },
    rpc: vi.fn(async () => ({ data: false, error: null })),
    from: vi.fn((table: string) => {
      const call: Call = { table, op: 'select', columns: '' };
      const b: Record<string, unknown> = {};
      b.select = (cols: string) => {
        call.columns = String(cols ?? '');
        return b;
      };
      b.update = (patch: unknown) => {
        call.op = 'update';
        call.patch = patch;
        return b;
      };
      b.eq = () => b;
      b.maybeSingle = async () => {
        calls.push(call);
        return resolve(call);
      };
      return b;
    }),
    ...extra,
  };
  return client;
}

const afterRow = (over: Record<string, unknown> = {}) => ({
  id: TICKET,
  ticket_number: 'GRV-20261001-0001',
  status: 'resolved',
  assigned_to: HANDLER,
  is_anonymous: false,
  raised_by_id: FILER,
  resolution: 'Fan replaced.',
  ...over,
});

// ── module mocks ─────────────────────────────────────────────────────────────
const state: {
  session: ReturnType<typeof fakeClient> | null;
  service: ReturnType<typeof fakeClient> | null;
  serviceThrows: boolean;
} = { session: null, service: null, serviceThrows: false };

const createServiceRoleClient = vi.fn(() => {
  if (state.serviceThrows) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return state.service;
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => state.session),
  createServerSupabaseClient: vi.fn(async () => state.session),
  createServiceRoleClient: () => createServiceRoleClient(),
}));

const bell = vi.fn(async (..._args: unknown[]) => 'notif-1');
vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: (...args: unknown[]) => bell(...args),
}));

import { updateGrievanceStatusAction } from '@/lib/grievance/actions';
import { PATCH } from '@/app/api/learners-council/issues/[id]/route';

/** The service-role client: answers the handler-name read (and whatever `more` adds). */
function serviceClient(more: (c: Call) => Answer | undefined = () => undefined) {
  return fakeClient((c) => {
    const m = more(c);
    if (m) return m;
    if (c.table === 'profiles' && c.columns.includes('full_name')) {
      return { data: { full_name: 'Priya R' }, error: null };
    }
    return { data: null, error: null };
  });
}

function bellOpts() {
  return (bell.mock.calls[0] as unknown[])[1] as { recipientIds: string[]; body: string };
}

beforeEach(() => {
  bell.mockClear();
  createServiceRoleClient.mockClear();
  state.serviceThrows = false;
  state.service = serviceClient();
});

// ── 1. the handler pages' server action ──────────────────────────────────────
describe('updateGrievanceStatusAction → filer bell', () => {
  it('bells the filer after a successful resolve', async () => {
    state.session = fakeClient((c) =>
      c.op === 'update'
        ? { data: afterRow(), error: null }
        : { data: { status: 'in_progress', assigned_to: HANDLER }, error: null }
    );
    const out = await updateGrievanceStatusAction(TICKET, {
      status: 'resolved',
      resolution: 'Fan replaced.',
    });
    expect(out).toEqual({ success: true });
    expect(bell).toHaveBeenCalledTimes(1);
    expect(bellOpts().recipientIds).toEqual([FILER]);
    expect(bellOpts().body).toContain('was resolved: Fan replaced.');
  });

  it('sends nothing when RLS refuses the write', async () => {
    state.session = fakeClient((c) =>
      c.op === 'update'
        ? { data: null, error: null }
        : { data: { status: 'in_progress', assigned_to: HANDLER }, error: null }
    );
    const out = await updateGrievanceStatusAction(TICKET, { status: 'resolved' });
    expect(out.success).toBe(false);
    expect(bell).not.toHaveBeenCalled();
  });

  it('a missing service-role key does NOT turn a committed resolve into an error', async () => {
    state.serviceThrows = true;
    state.session = fakeClient((c) =>
      c.op === 'update'
        ? { data: afterRow(), error: null }
        : { data: { status: 'in_progress', assigned_to: HANDLER }, error: null }
    );
    const out = await updateGrievanceStatusAction(TICKET, { status: 'resolved' });
    expect(out).toEqual({ success: true });
    expect(createServiceRoleClient).toHaveBeenCalled();
    expect(bell).not.toHaveBeenCalled();
  });
});

// ── 2. the Learners Council board's Move / Assign ────────────────────────────
function patch(body: Record<string, unknown>) {
  return PATCH({ json: async () => body } as never, {
    params: Promise.resolve({ id: TICKET }),
  });
}

describe('Learners Council PATCH → filer bell', () => {
  it('RLS branch: bells the filer after the caller’s own write', async () => {
    state.service = serviceClient((c) =>
      c.table === 'grievance_tickets' && c.columns === 'status, assigned_to'
        ? { data: { status: 'open', assigned_to: null }, error: null }
        : undefined
    );
    state.session = fakeClient((c) =>
      c.op === 'update' ? { data: afterRow({ status: 'in_progress' }), error: null } : { data: null, error: null }
    );
    const res = await patch({ assigneeId: HANDLER });
    expect(res.status).toBe(200);
    expect(bell).toHaveBeenCalledTimes(1);
    expect(bellOpts().recipientIds).toEqual([FILER]);
    expect(bellOpts().body).toContain('is now being handled by Priya R.');
  });

  it('elevated branch (council executive): bells the filer after the elevated write', async () => {
    state.service = serviceClient((c) => {
      if (c.table === 'grievance_tickets' && c.op === 'update') {
        return { data: afterRow({ status: 'closed' }), error: null };
      }
      if (c.table === 'grievance_tickets' && c.columns === 'status, assigned_to') {
        return { data: { status: 'in_progress', assigned_to: HANDLER }, error: null };
      }
      if (c.table === 'grievance_tickets' && c.columns.includes('is_icc_only')) {
        return { data: { id: TICKET, institution_id: INST, is_icc_only: false }, error: null };
      }
      if (c.table === 'profiles' && c.columns === 'institution_id') {
        return { data: { institution_id: INST }, error: null };
      }
      return undefined;
    });
    state.session = fakeClient(() => ({ data: null, error: null }), {
      rpc: vi.fn(async () => ({ data: true, error: null })),
    });
    const res = await patch({ status: 'closed' });
    expect(res.status).toBe(200);
    expect(bell).toHaveBeenCalledTimes(1);
    expect(bellOpts().body).toContain('is now closed.');
  });

  it('a missing service-role key does not stop the RLS write (no 500 before it)', async () => {
    state.serviceThrows = true;
    state.session = fakeClient((c) =>
      c.op === 'update' ? { data: afterRow({ status: 'in_progress' }), error: null } : { data: null, error: null }
    );
    const res = await patch({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(state.session.calls.some((c) => c.op === 'update')).toBe(true);
    expect(bell).not.toHaveBeenCalled();
  });
});
