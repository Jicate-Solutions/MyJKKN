/**
 * Notifications — GET /api/notifications/pulse.
 *
 * One poll replacing two: the route runs get_unacknowledged_notifications and,
 * only when the tab asks (`?pending=1`), get_pending_actions in parallel and
 * merges both into one body. Unchanged data answers 304 with no body, keyed on
 * a weak ETag over the payload minus generated_at, hashed over id-sorted rows
 * so RPC row order cannot change it.
 *
 * The load-bearing assertions: the ETag is STABLE across calls with identical
 * data (otherwise the browser never gets a 304 and origin transfer is
 * unchanged), and DIFFERENT once the data changes (otherwise a new mandatory
 * notification would be hidden behind a stale cached body).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before the handler is imported (vitest hoists vi.mock).
// ---------------------------------------------------------------------------

let currentUser: { id: string } | null = { id: 'user-1' };
let unacknowledgedRows: Array<Record<string, unknown>> = [];
let pendingRows: Array<Record<string, unknown>> = [];
let ackRpcError: { message: string } | null = null;

const userRpc = vi.fn((fn: string) => {
  if (fn === 'get_unacknowledged_notifications') {
    return Promise.resolve({ data: unacknowledgedRows, error: ackRpcError });
  }
  return Promise.resolve({ data: null, error: null });
});

const serviceRpc = vi.fn((fn: string) => {
  if (fn === 'get_pending_actions') {
    return Promise.resolve({ data: pendingRows, error: null });
  }
  return Promise.resolve({ data: null, error: null });
});

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: currentUser }, error: null })
      },
      rpc: userRpc
    }),
  createServiceRoleClient: () => ({ rpc: serviceRpc })
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

// SUT imported AFTER the mocks.
import { GET } from '@/app/api/notifications/pulse/route';
import { NextRequest } from 'next/server';

function pulseRequest(headers: Record<string, string> = {}, withPending = true) {
  const url = `https://jkkn.ai/api/notifications/pulse${withPending ? '?pending=1' : ''}`;
  return new NextRequest(url, { headers });
}

// Well in the past so the 4-hour deadline is unambiguously over on any run date.
const SENT_AT = '2026-01-01T01:00:00.000Z';

function ackRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'un-1',
    notification_id: 'n-1',
    title: 'Fee circular',
    body: 'Read me',
    priority: 'high',
    category: 'finance',
    url: null,
    created_by_name: null,
    sent_at: SENT_AT,
    created_at: SENT_AT,
    acknowledgment_deadline_hours: 4,
    metadata: null,
    ...overrides
  };
}

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pa-1',
    notification_id: 'n-2',
    title: 'Upload the roster',
    body: 'Before Friday',
    priority: 'normal',
    category: 'academic',
    action_type: 'tracked',
    action_config: { type: 'file' },
    acknowledgment_deadline_hours: 48,
    sent_at: SENT_AT,
    created_by_name: 'Registrar',
    deadline_at: '2026-09-15T01:00:00.000Z',
    is_overdue: false,
    has_responded: false,
    ...overrides
  };
}

beforeEach(() => {
  currentUser = { id: 'user-1' };
  unacknowledgedRows = [];
  pendingRows = [];
  ackRpcError = null;
  userRpc.mockClear();
  serviceRpc.mockClear();
});

describe('GET /api/notifications/pulse', () => {
  it('answers 401 without a signed-in user and calls no RPC', async () => {
    currentUser = null;
    const res = await GET(pulseRequest());
    expect(res.status).toBe(401);
    expect(userRpc).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it('without ?pending=1 runs only the acknowledgment RPC and returns pending: null', async () => {
    unacknowledgedRows = [ackRow()];
    pendingRows = [pendingRow()];

    const res = await GET(pulseRequest({}, false));
    expect(res.status).toBe(200);
    expect(userRpc).toHaveBeenCalledWith('get_unacknowledged_notifications', { p_user_id: 'user-1' });
    expect(serviceRpc).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.unacknowledged).toHaveLength(1);
    expect(body.pending).toBeNull();
    expect(res.headers.get('etag')).toMatch(/^W\/"[0-9a-f]{40}"$/);
  });

  it('with ?pending=1 merges both RPC results into one body with the original mappings', async () => {
    unacknowledgedRows = [ackRow()];
    pendingRows = [
      pendingRow(),
      pendingRow({ id: 'pa-2', action_type: 'urgent' }),
      pendingRow({ id: 'pa-3', action_type: 'urgent' })
    ];

    const res = await GET(pulseRequest());
    expect(res.status).toBe(200);

    // Both RPCs ran, each against the client the original routes used.
    expect(userRpc).toHaveBeenCalledWith('get_unacknowledged_notifications', { p_user_id: 'user-1' });
    expect(serviceRpc).toHaveBeenCalledWith('get_pending_actions', { p_user_id: 'user-1' });

    const body = await res.json();
    expect(body.unacknowledged).toHaveLength(1);
    // Same derived fields as acknowledge/route.ts GET.
    expect(body.unacknowledged[0]).toMatchObject({
      id: 'un-1',
      notification_id: 'n-1',
      created_by_name: 'System',
      sent_at: SENT_AT,
      deadline_at: '2026-01-01T05:00:00.000Z',
      is_overdue: true
    });
    // Same counts as pending-actions/route.ts.
    expect(body.pending.actions).toHaveLength(3);
    expect(body.pending.urgent_count).toBe(2);
    expect(body.pending.tracked_count).toBe(1);
    expect(typeof body.generated_at).toBe('string');

    // Per-user payload: never cacheable by a shared cache, always revalidated.
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
    expect(res.headers.get('etag')).toMatch(/^W\/"[0-9a-f]{40}"$/);
  });

  it('answers 304 with an empty body when If-None-Match carries the current ETag', async () => {
    unacknowledgedRows = [ackRow()];
    pendingRows = [pendingRow()];

    const first = await GET(pulseRequest());
    const etag = first.headers.get('etag')!;

    const second = await GET(pulseRequest({ 'if-none-match': etag }));
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
    // The 304 still carries the validator + cache policy for the next round.
    expect(second.headers.get('etag')).toBe(etag);
    expect(second.headers.get('cache-control')).toBe('private, no-cache');
  });

  it('keeps the ETag stable for identical data and changes it when data changes', async () => {
    unacknowledgedRows = [ackRow()];
    pendingRows = [pendingRow()];

    const a = await GET(pulseRequest());
    const b = await GET(pulseRequest());
    expect(a.headers.get('etag')).toBe(b.headers.get('etag'));
    // generated_at differs per call but must NOT be part of the ETag.
    expect((await a.json()).generated_at).toBeDefined();

    unacknowledgedRows = [ackRow(), ackRow({ id: 'un-2', notification_id: 'n-9', title: 'New circular' })];
    const c = await GET(pulseRequest());
    expect(c.status).toBe(200);
    expect(c.headers.get('etag')).not.toBe(a.headers.get('etag'));

    // A stale validator no longer matches → full body, not 304.
    const d = await GET(pulseRequest({ 'if-none-match': a.headers.get('etag')! }));
    expect(d.status).toBe(200);
    expect((await d.json()).unacknowledged).toHaveLength(2);
  });

  it('gives the same ETag for the same rows in a different order (hash is order-independent)', async () => {
    const un1 = ackRow();
    const un2 = ackRow({ id: 'un-2', notification_id: 'n-2', title: 'Second' });
    const pa1 = pendingRow();
    const pa2 = pendingRow({ id: 'pa-2', action_type: 'urgent' });

    unacknowledgedRows = [un1, un2];
    pendingRows = [pa1, pa2];
    const a = await GET(pulseRequest());

    unacknowledgedRows = [un2, un1];
    pendingRows = [pa2, pa1];
    const b = await GET(pulseRequest());

    expect(a.headers.get('etag')).toBe(b.headers.get('etag'));
    // The response body keeps the RPC's order for display; only the hash is canonical.
    expect((await b.json()).unacknowledged.map((u: { id: string }) => u.id)).toEqual(['un-2', 'un-1']);

    // And a client holding the first ETag gets a 304 from the reordered rows.
    const c = await GET(pulseRequest({ 'if-none-match': a.headers.get('etag')! }));
    expect(c.status).toBe(304);
  });

  it('gives different ETags with and without pending (hash covers the actual shape)', async () => {
    unacknowledgedRows = [ackRow()];
    pendingRows = [];
    const withPending = await GET(pulseRequest({}, true));
    const withoutPending = await GET(pulseRequest({}, false));
    expect(withPending.headers.get('etag')).not.toBe(withoutPending.headers.get('etag'));
  });

  it('answers 500, never a 304, when an RPC fails', async () => {
    ackRpcError = { message: 'boom' };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(pulseRequest({ 'if-none-match': 'W/"anything"' }));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
