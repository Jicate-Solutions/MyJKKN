/**
 * POST /api/ai-query/actions/[id]/confirm and /cancel — the route half.
 *
 * The database half (claim runs once, re-checks, owner-only) is proved on a
 * real PostgreSQL in ai-action-proposals-sql.test.ts. What must hold here:
 *   - no user → 401 and no RPC, nothing sent;
 *   - a refused claim (already confirmed, permission gone, expired, someone
 *     else's) sends NOTHING and returns the refusal;
 *   - a successful claim executes exactly once and records the outcome;
 *   - an email goes one-per-recipient, from MyJKKN, reply-to the owner, and no
 *     message carries another person's address;
 *   - cancel goes through the owner-only RPC.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let currentUser: { id: string } | null = { id: 'owner-1' };
let claimResult: { data: any; error: any } = { data: null, error: null };
let cancelResult: { data: any; error: any } = { data: { success: true, status: 'cancelled' }, error: null };

const rpc = vi.fn((name: string) =>
  Promise.resolve(name === 'fn_ai_claim_action_proposal' ? claimResult : cancelResult)
);
const userClient = {
  auth: { getUser: () => Promise.resolve({ data: { user: currentUser }, error: null }) },
  rpc,
};

// A tiny chainable stand-in for the service-role client.
const updates: Array<{ table: string; values: any; filters: any[] }> = [];
const profilesRows = [
  { id: 'owner-1', full_name: 'Owner Person', email: 'owner@jkkn.ac.in' },
  { id: 'p-1', email: 'one@jkkn.ac.in' },
  { id: 'p-2', email: 'two@jkkn.ac.in' },
];
function serviceFrom(table: string) {
  const filters: any[] = [];
  let pendingUpdate: any = null;
  const q: any = {
    select: () => q,
    eq: (...a: any[]) => (filters.push(['eq', ...a]), q),
    in: (...a: any[]) => (filters.push(['in', ...a]), q),
    not: (...a: any[]) => (filters.push(['not', ...a]), q),
    order: () => q,
    limit: () => q,
    update: (values: any) => ((pendingUpdate = values), q),
    maybeSingle: () => {
      const id = filters.find((f) => f[0] === 'eq' && f[1] === 'id')?.[2];
      return Promise.resolve({ data: profilesRows.find((r) => r.id === id) ?? null, error: null });
    },
    then: (resolve: any) => {
      if (pendingUpdate) {
        updates.push({ table, values: pendingUpdate, filters });
        return resolve({ data: null, error: null });
      }
      const ids = filters.find((f) => f[0] === 'in')?.[2] ?? [];
      return resolve({ data: profilesRows.filter((r) => ids.includes(r.id)), error: null });
    },
  };
  return q;
}
const service = { from: vi.fn(serviceFrom) };

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve(userClient),
  createServiceRoleClient: () => service,
}));
vi.mock('@/lib/utils/enhanced-logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), dev: vi.fn() } }));
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

const { fanoutNotification, batchSend, createTask, assign } = vi.hoisted(() => ({
  fanoutNotification: vi.fn((..._a: any[]): Promise<any> => Promise.resolve({ notified: 2, notificationId: 'n-1' })),
  batchSend: vi.fn((..._a: any[]): Promise<any> => Promise.resolve({ data: { data: [] }, error: null })),
  createTask: vi.fn((..._a: any[]): Promise<any> => Promise.resolve({ id: 't-1', project_id: 'proj-1' })),
  assign: vi.fn((..._a: any[]): Promise<any> => Promise.resolve({})),
}));
vi.mock('@/lib/services/_shared/notifications/notify', () => ({ fanoutNotification }));
vi.mock('@/lib/resend', () => ({ resend: { batch: { send: batchSend } } }));
vi.mock('@/lib/services/projects/task-service', () => ({ TaskService: { createTask, assign } }));

import { POST as confirmPOST } from '@/app/api/ai-query/actions/[id]/confirm/route';
import { POST as cancelPOST } from '@/app/api/ai-query/actions/[id]/cancel/route';
import { NextRequest } from 'next/server';

const ID = '11111111-1111-4111-8111-111111111111';
const params = Promise.resolve({ id: ID });
const req = () => new NextRequest(`https://jkkn.ai/api/ai-query/actions/${ID}/confirm`, { method: 'POST' });

function claimed(kind: string, extra: Record<string, unknown> = {}) {
  return {
    data: {
      success: true,
      proposal: {
        id: ID,
        kind,
        title: 'Lab closed',
        body: 'The lab is closed tomorrow.',
        task: null,
        recipient_ids: ['p-1', 'p-2'],
        recipient_count: 2,
        ...extra,
      },
    },
    error: null,
  };
}

beforeEach(() => {
  currentUser = { id: 'owner-1' };
  claimResult = claimed('in_app_message');
  cancelResult = { data: { success: true, status: 'cancelled' }, error: null };
  updates.length = 0;
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-key';
  process.env.RESEND_FROM_EMAIL = 'MyJKKN <noreply@jkkn.ai>';
});

describe('POST /api/ai-query/actions/[id]/confirm', () => {
  it('401 without a user: no claim, nothing sent', async () => {
    currentUser = null;
    const res = await confirmPOST(req(), { params });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(fanoutNotification).not.toHaveBeenCalled();
  });

  it('claims first, as the owner, then sends the in-app message exactly once and records it', async () => {
    const res = await confirmPOST(req(), { params });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('fn_ai_claim_action_proposal', { p_proposal_id: ID });
    expect(fanoutNotification).toHaveBeenCalledTimes(1);
    const [, opts] = (fanoutNotification.mock.calls[0] as unknown) as [unknown, any];
    expect(opts.userIds).toEqual(['p-1', 'p-2']);
    expect(opts.createdBy).toBe('owner-1');
    expect(opts.idempotencyKey).toBe(`ai-action:${ID}`);
    expect(updates).toHaveLength(1);
    expect(updates[0].values.status).toBe('sent');
    expect(updates[0].filters).toContainEqual(['eq', 'status', 'pending']);
    expect(updates[0].filters).toContainEqual(['eq', 'requested_by', 'owner-1']);
    expect(await res.json()).toMatchObject({ ok: true, status: 'sent', result: { delivered: 2, total: 2 } });
  });

  it.each([
    ['ALREADY_CONFIRMED', 409],
    ['PERMISSION_DENIED', 403],
    ['EXPIRED', 409],
    ['NOT_PENDING', 409],
    ['NOT_FOUND', 404],
    ['RECIPIENTS_CHANGED', 409],
    ['DAILY_LIMIT', 429],
  ])('a refused claim (%s) sends nothing and records nothing', async (code, status) => {
    claimResult = { data: { success: false, code, message: 'refused' }, error: null };
    const res = await confirmPOST(req(), { params });
    expect(res.status).toBe(status);
    expect(fanoutNotification).not.toHaveBeenCalled();
    expect(batchSend).not.toHaveBeenCalled();
    expect(createTask).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('a double click: the second claim is refused, so the message goes out once', async () => {
    await confirmPOST(req(), { params });
    claimResult = { data: { success: false, code: 'ALREADY_CONFIRMED', message: 'already' }, error: null };
    const second = await confirmPOST(req(), { params: Promise.resolve({ id: ID }) });
    expect(second.status).toBe(409);
    expect(fanoutNotification).toHaveBeenCalledTimes(1);
  });

  it('email: one message per person, from MyJKKN, on behalf of the owner, reply-to the owner', async () => {
    claimResult = claimed('email');
    const res = await confirmPOST(req(), { params });
    expect(res.status).toBe(200);
    expect(batchSend).toHaveBeenCalledTimes(1);
    const [payload, options] = (batchSend.mock.calls[0] as unknown) as [any[], any];
    expect(payload).toHaveLength(2);
    for (const m of payload) {
      expect(typeof m.to).toBe('string');
      expect(m.from).toBe('MyJKKN <noreply@jkkn.ai>');
      expect(m.replyTo).toBe('owner@jkkn.ac.in');
      expect(m.subject).toBe('Lab closed');
      expect(m.text).toContain('Sent on behalf of Owner Person through MyJKKN');
      expect(m.html).toBeUndefined();
    }
    expect(payload.map((m) => m.to).sort()).toEqual(['one@jkkn.ac.in', 'two@jkkn.ac.in']);
    // No message carries the other recipient's address.
    expect(payload[0].text).not.toContain(payload[1].to);
    expect(options.idempotencyKey).toBe(`ai-action-${ID}-0`);
  });

  it('task: created AS the owner (session client) and given to the staff member', async () => {
    claimResult = claimed('create_task', {
      recipient_ids: ['p-1'],
      recipient_count: 1,
      task: { project_id: 'proj-1', project_title: 'Library', due_date: '2026-10-01' },
    });
    // staff lookup resolves through maybeSingle on profile_id; return a staff row.
    service.from.mockImplementationOnce(serviceFrom).mockImplementationOnce(() => {
      const q: any = {
        select: () => q, eq: () => q, order: () => q, limit: () => q,
        maybeSingle: () => Promise.resolve({ data: { id: 'staff-1' }, error: null }),
      };
      return q;
    });
    const res = await confirmPOST(req(), { params });
    expect(res.status).toBe(200);
    expect(createTask).toHaveBeenCalledTimes(1);
    const [client, input] = (createTask.mock.calls[0] as unknown) as [unknown, any];
    expect(client).toBe(userClient);
    expect(input).toMatchObject({ project_id: 'proj-1', owner_staff_id: 'staff-1', title: 'Lab closed', due_date: '2026-10-01' });
    expect(assign).toHaveBeenCalledWith(userClient, 't-1', 'staff-1', 'responsible', 'owner-1');
  });

  it('a send that fails is recorded as failed', async () => {
    fanoutNotification.mockRejectedValueOnce(new Error('db down'));
    const res = await confirmPOST(req(), { params });
    expect(res.status).toBe(502);
    expect(updates[0].values).toMatchObject({ status: 'failed', error: 'db down' });
  });
});

describe('POST /api/ai-query/actions/[id]/cancel', () => {
  it('cancels through the owner-only RPC', async () => {
    const res = await cancelPOST(req(), { params });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('fn_ai_cancel_action_proposal', { p_proposal_id: ID });
  });

  it('refuses a card that was already confirmed', async () => {
    cancelResult = { data: { success: false, code: 'NOT_PENDING', message: 'no' }, error: null };
    const res = await cancelPOST(req(), { params });
    expect(res.status).toBe(409);
  });

  it('401 without a user', async () => {
    currentUser = null;
    const res = await cancelPOST(req(), { params });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});
