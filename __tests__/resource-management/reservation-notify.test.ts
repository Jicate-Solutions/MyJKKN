import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * BUG-004009: booking notifications were silently denied.
 *
 * In-app notifications for the reservation lifecycle were created by inserting
 * into `notifications` FROM THE BROWSER under the signed-in user's own
 * permissions. The table's INSERT policy (`notifications_insert_admins`) admits
 * only super admins and admins, so every booking made by ordinary staff or a
 * learner raised 42501 — and the callers' `.catch(console.error)` hid it.
 * Approvers never saw "Approval Required"; requesters never saw the outcome.
 *
 * The fix moves the write server-side: the client POSTs the lifecycle event to
 * /api/resource-management/reservations/notify, which authenticates the caller,
 * checks they are entitled to raise that event for that reservation, and then
 * creates the notifications with the service-role client.
 *
 * These tests pin:
 *   (a) the service posts the right event + reservation id for create, approve,
 *       reject and cancel;
 *   (b) a failed post is logged with logger.warn and does NOT reject the op;
 *   (c) the route answers 401 without a session, 403 for a caller who is
 *       neither requester nor approver, and creates notifications through the
 *       service-role client on success.
 */

// ---------------------------------------------------------------------------
// Shared mocks (hoisted by vitest — declared before any SUT import)
// ---------------------------------------------------------------------------

vi.mock('@/lib/utils/enhanced-logger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/enhanced-logger')>(
    '@/lib/utils/enhanced-logger'
  );
  return {
    ...actual,
    logger: { ...actual.logger, error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
  };
});

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: vi.fn(() => (globalThis as any).__reservationClient)
}));

vi.mock('@/lib/utils/activity-logger-client', () => ({
  logActivityForCurrentUser: vi.fn(async () => undefined),
  ResourceManagementActivityTemplates: {
    reservationCreated: (name: string) => ({
      actionType: 'create',
      resourceType: 'reservation',
      description: `Created ${name}`,
      sub_type: 'reservation_created'
    }),
    reservationCancelled: (name: string) => ({
      actionType: 'update',
      resourceType: 'reservation',
      description: `Cancelled ${name}`,
      sub_type: 'reservation_cancelled'
    }),
    reservationApproved: (name: string) => ({
      actionType: 'update',
      resourceType: 'reservation',
      description: `Approved ${name}`,
      sub_type: 'reservation_approved'
    }),
    reservationRejected: (name: string, reason: string) => ({
      actionType: 'update',
      resourceType: 'reservation',
      description: `Rejected ${name}: ${reason}`,
      sub_type: 'reservation_rejected'
    })
  }
}));

// Route-side mocks ----------------------------------------------------------

let sessionUser: { id: string } | null;
let isSuperAdmin: boolean;
/** Rows the service-role client answers for `resource_approvals`. */
let approvalRows: Array<{ approver_user_id: string; status: string }>;
/** Row the service-role client answers for `resource_reservations`. */
let reservationRow: Record<string, any> | null;

const SERVICE_CLIENT_SENTINEL = { __serviceRole: true } as any;

function serviceBuilder(table: string) {
  const b: any = {};
  const chain = () => b;
  const resolve = () => {
    if (table === 'resource_reservations') {
      return reservationRow
        ? { data: reservationRow, error: null }
        : { data: null, error: { code: 'PGRST116', message: '0 rows' } };
    }
    if (table === 'resource_approvals') return { data: approvalRows, error: null };
    return { data: null, error: null };
  };
  Object.assign(b, {
    select: chain,
    eq: chain,
    in: chain,
    limit: chain,
    order: chain,
    single: () => Promise.resolve(resolve()),
    maybeSingle: () => Promise.resolve(resolve()),
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(ok, err)
  });
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      auth: {
        getUser: () =>
          Promise.resolve(
            sessionUser
              ? { data: { user: sessionUser }, error: null }
              : { data: { user: null }, error: { message: 'no session' } }
          )
      },
      rpc: (fn: string) =>
        Promise.resolve(
          fn === 'is_super_admin' ? { data: isSuperAdmin, error: null } : { data: null, error: null }
        )
    }),
  createServiceRoleClient: () => {
    SERVICE_CLIENT_SENTINEL.from = (table: string) => serviceBuilder(table);
    return SERVICE_CLIENT_SENTINEL;
  }
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

const createNotificationMock = vi.fn(async (dto: any) => ({ id: `notif-${dto.user_id}` }));
vi.mock('@/lib/services/notification/notification-service', () => ({
  createNotification: (...args: any[]) => createNotificationMock(...(args as [any]))
}));

// SUTs imported AFTER the mocks.
import { ReservationService } from '@/lib/services/reservation/reservation-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { POST } from '@/app/api/resource-management/reservations/notify/route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RESERVATION_ID = '11111111-1111-4111-8111-111111111111';
const RESOURCE_ID = '22222222-2222-4222-8222-222222222222';
const REQUESTER_ID = '33333333-3333-4333-8333-333333333333';
const APPROVER_ID = '55555555-5555-4555-8555-555555555555';
const STRANGER_ID = '99999999-9999-4999-8999-999999999999';

const NOTIFY_URL = '/api/resource-management/reservations/notify';

function rpcRow(status: string) {
  return {
    id: RESERVATION_ID,
    resource_id: RESOURCE_ID,
    user_id: REQUESTER_ID,
    institution_id: '44444444-4444-4444-8444-444444444444',
    status,
    start_time: '2026-09-12T09:00:00Z',
    end_time: '2026-09-12T10:00:00Z'
  };
}

/**
 * Browser-side Supabase client for the service tests. RPCs succeed; the
 * joined re-read succeeds; `resources` answers an approval-required config;
 * `resource_reservations.insert` answers the created row.
 */
function makeClient(row: Record<string, any>, approvalEnabled = true) {
  const rpc = vi.fn(async () => ({ data: row, error: null }));
  const from = vi.fn((table: string) => {
    const b: any = {};
    const chain = () => b;
    const answer = () => {
      if (table === 'resources') {
        return {
          data: {
            approval_config: { enabled: approvalEnabled, approvers: [{ user_id: APPROVER_ID, level: 1 }] },
            booking_config: null
          },
          error: null
        };
      }
      if (table === 'resource_reservations') {
        return {
          data: { ...row, resource: { id: RESOURCE_ID, name: 'Seminar Hall' }, user: { id: REQUESTER_ID, full_name: 'A B' } },
          error: null
        };
      }
      return { data: null, error: null };
    };
    Object.assign(b, {
      select: chain,
      insert: chain,
      eq: chain,
      single: () => Promise.resolve(answer()),
      then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
        Promise.resolve(answer()).then(ok, err)
    });
    return b;
  });
  return { rpc, from };
}

/** Body of the POST the service sent to the notify route (first match). */
function postedBody(fetchMock: ReturnType<typeof vi.fn>, url: string) {
  const call = fetchMock.mock.calls.find((c) => c[0] === url);
  if (!call) return null;
  return JSON.parse((call[1] as RequestInit).body as string);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// (a) + (b): the client-side service posts the lifecycle event
// ---------------------------------------------------------------------------

describe('BUG-004009 - ReservationService posts lifecycle events to the notify route', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, sent: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createReservation posts "submitted" when approval is required', async () => {
    (globalThis as any).__reservationClient = makeClient(rpcRow('pending'), true);
    vi.spyOn(ReservationService, 'checkAvailability').mockResolvedValue({ is_available: true } as any);

    await ReservationService.createReservation(
      {
        resource_id: RESOURCE_ID,
        purpose: 'Seminar',
        start_time: '2026-09-12T09:00:00Z',
        end_time: '2026-09-12T10:00:00Z'
      } as any,
      REQUESTER_ID
    );

    expect(postedBody(fetchMock, NOTIFY_URL)).toMatchObject({
      event: 'submitted',
      reservation_id: RESERVATION_ID
    });
  });

  it('createReservation posts "approved" when the booking is auto-approved', async () => {
    (globalThis as any).__reservationClient = makeClient(rpcRow('approved'), false);
    vi.spyOn(ReservationService, 'checkAvailability').mockResolvedValue({ is_available: true } as any);

    await ReservationService.createReservation(
      {
        resource_id: RESOURCE_ID,
        purpose: 'Seminar',
        start_time: '2026-09-12T09:00:00Z',
        end_time: '2026-09-12T10:00:00Z'
      } as any,
      REQUESTER_ID
    );

    expect(postedBody(fetchMock, NOTIFY_URL)).toMatchObject({
      event: 'approved',
      reservation_id: RESERVATION_ID
    });
  });

  it('approveReservation posts "approved"', async () => {
    (globalThis as any).__reservationClient = makeClient(rpcRow('approved'));

    await ReservationService.approveReservation(
      { reservation_id: RESERVATION_ID, notes: 'ok' } as any,
      APPROVER_ID
    );

    expect(postedBody(fetchMock, NOTIFY_URL)).toMatchObject({
      event: 'approved',
      reservation_id: RESERVATION_ID
    });
  });

  it('rejectReservation posts "rejected" with the reason', async () => {
    (globalThis as any).__reservationClient = makeClient(rpcRow('rejected'));

    await ReservationService.rejectReservation(
      { reservation_id: RESERVATION_ID, rejection_reason: 'Clash' } as any,
      APPROVER_ID
    );

    expect(postedBody(fetchMock, NOTIFY_URL)).toMatchObject({
      event: 'rejected',
      reservation_id: RESERVATION_ID,
      reason: 'Clash'
    });
  });

  it('cancelReservation posts "cancelled" after the RPC succeeds', async () => {
    (globalThis as any).__reservationClient = makeClient(rpcRow('cancelled'));

    await ReservationService.cancelReservation(
      { reservation_id: RESERVATION_ID, cancellation_reason: 'No longer needed' } as any,
      REQUESTER_ID
    );

    expect(postedBody(fetchMock, NOTIFY_URL)).toMatchObject({
      event: 'cancelled',
      reservation_id: RESERVATION_ID
    });
  });

  it('a non-2xx response is logged with logger.warn and does not reject the operation', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }));
    (globalThis as any).__reservationClient = makeClient(rpcRow('cancelled'));

    const result = await ReservationService.cancelReservation(
      { reservation_id: RESERVATION_ID, cancellation_reason: 'x' } as any,
      REQUESTER_ID
    );
    await flush();

    expect(result.status).toBe('cancelled');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('reservation'),
      expect.any(String),
      expect.objectContaining({ event: 'cancelled', reservationId: RESERVATION_ID, status: 403 })
    );
  });

  it('a network failure is logged with logger.warn and does not reject the operation', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    (globalThis as any).__reservationClient = makeClient(rpcRow('approved'));

    const result = await ReservationService.approveReservation(
      { reservation_id: RESERVATION_ID } as any,
      APPROVER_ID
    );
    await flush();

    expect(result.status).toBe('approved');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('reservation'),
      expect.any(String),
      expect.objectContaining({ event: 'approved', reservationId: RESERVATION_ID, error: 'Failed to fetch' })
    );
  });
});

// ---------------------------------------------------------------------------
// (c): the server route
// ---------------------------------------------------------------------------

function request(body: unknown) {
  return new Request('https://jkkn.ai' + NOTIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as never;
}

async function call(body: unknown) {
  const res = await POST(request(body));
  return { status: res.status, body: await res.json() };
}

describe('BUG-004009 - POST /api/resource-management/reservations/notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUser = { id: REQUESTER_ID };
    isSuperAdmin = false;
    approvalRows = [{ approver_user_id: APPROVER_ID, status: 'pending' }];
    reservationRow = {
      id: RESERVATION_ID,
      user_id: REQUESTER_ID,
      resource_id: RESOURCE_ID,
      status: 'pending',
      start_time: '2026-09-12T09:00:00Z',
      end_time: '2026-09-12T10:00:00Z',
      resource: { id: RESOURCE_ID, name: 'Seminar Hall' },
      booker: { id: REQUESTER_ID, full_name: 'A B' }
    };
  });

  it('returns 401 without a session', async () => {
    sessionUser = null;
    const { status } = await call({ event: 'submitted', reservation_id: RESERVATION_ID });
    expect(status).toBe(401);
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown event', async () => {
    const { status } = await call({ event: 'exploded', reservation_id: RESERVATION_ID });
    expect(status).toBe(400);
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the reservation does not exist', async () => {
    reservationRow = null;
    const { status } = await call({ event: 'submitted', reservation_id: RESERVATION_ID });
    expect(status).toBe(404);
  });

  it('returns 403 for "submitted" when the caller is not the requester', async () => {
    sessionUser = { id: STRANGER_ID };
    const { status } = await call({ event: 'submitted', reservation_id: RESERVATION_ID });
    expect(status).toBe(403);
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('returns 403 for "approved" when the caller is neither an approver nor a super admin', async () => {
    sessionUser = { id: STRANGER_ID };
    reservationRow!.status = 'approved';
    const { status } = await call({ event: 'approved', reservation_id: RESERVATION_ID });
    expect(status).toBe(403);
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('returns 403 for "rejected" when the caller is the requester (not an approver)', async () => {
    reservationRow!.status = 'rejected';
    const { status } = await call({ event: 'rejected', reservation_id: RESERVATION_ID, reason: 'x' });
    expect(status).toBe(403);
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('"submitted" by the requester notifies the requester and every pending approver via the service-role client', async () => {
    const { status, body } = await call({ event: 'submitted', reservation_id: RESERVATION_ID });

    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, sent: 2 });

    const recipients = createNotificationMock.mock.calls.map((c) => c[0].user_id).sort();
    expect(recipients).toEqual([REQUESTER_ID, APPROVER_ID].sort());

    // Every write goes through the service-role client, never the session client.
    for (const c of createNotificationMock.mock.calls) {
      expect(c[2]).toBe(SERVICE_CLIENT_SENTINEL);
    }
    const approverCall = createNotificationMock.mock.calls.find((c) => c[0].user_id === APPROVER_ID)!;
    expect(approverCall[0].title).toContain('Approval Required');
    expect(approverCall[0].action_url).toBe(`/resource-management/reservations/${RESERVATION_ID}`);
  });

  it('"approved" by an approver notifies the requester', async () => {
    sessionUser = { id: APPROVER_ID };
    reservationRow!.status = 'approved';
    approvalRows = [{ approver_user_id: APPROVER_ID, status: 'approved' }];

    const { status, body } = await call({ event: 'approved', reservation_id: RESERVATION_ID });

    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, sent: 1 });
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    expect(createNotificationMock.mock.calls[0][0]).toMatchObject({ user_id: REQUESTER_ID });
    expect(createNotificationMock.mock.calls[0][0].title).toContain('Booking Confirmed');
    expect(createNotificationMock.mock.calls[0][2]).toBe(SERVICE_CLIENT_SENTINEL);
  });

  it('"approved" by a super admin who is not in the chain is allowed', async () => {
    sessionUser = { id: STRANGER_ID };
    isSuperAdmin = true;
    reservationRow!.status = 'approved';

    const { status, body } = await call({ event: 'approved', reservation_id: RESERVATION_ID });
    expect(status).toBe(200);
    expect(body.sent).toBe(1);
  });

  it('"approved" by the requester is allowed only for an auto-approved booking (no approval chain)', async () => {
    reservationRow!.status = 'approved';
    approvalRows = [];

    const { status, body } = await call({ event: 'approved', reservation_id: RESERVATION_ID });
    expect(status).toBe(200);
    expect(body.sent).toBe(1);
    expect(createNotificationMock.mock.calls[0][0]).toMatchObject({ user_id: REQUESTER_ID });
  });

  it('"rejected" by an approver notifies the requester with the reason', async () => {
    sessionUser = { id: APPROVER_ID };
    reservationRow!.status = 'rejected';

    const { status, body } = await call({ event: 'rejected', reservation_id: RESERVATION_ID, reason: 'Clash' });

    expect(status).toBe(200);
    expect(body.sent).toBe(1);
    const dto = createNotificationMock.mock.calls[0][0];
    expect(dto.user_id).toBe(REQUESTER_ID);
    expect(dto.title).toContain('Booking Declined');
    expect(dto.message).toContain('Clash');
  });

  it('"cancelled" by the requester notifies the requester and, when it had been approved, the approvers', async () => {
    reservationRow!.status = 'cancelled';
    approvalRows = [{ approver_user_id: APPROVER_ID, status: 'approved' }];

    const { status, body } = await call({ event: 'cancelled', reservation_id: RESERVATION_ID });

    expect(status).toBe(200);
    expect(body.sent).toBe(2);
    const recipients = createNotificationMock.mock.calls.map((c) => c[0].user_id).sort();
    expect(recipients).toEqual([REQUESTER_ID, APPROVER_ID].sort());
    for (const c of createNotificationMock.mock.calls) {
      expect(c[0].title).toContain('Cancelled');
      expect(c[2]).toBe(SERVICE_CLIENT_SENTINEL);
    }
  });

  it('"cancelled" of a still-pending booking notifies only the requester', async () => {
    reservationRow!.status = 'cancelled';
    approvalRows = [{ approver_user_id: APPROVER_ID, status: 'pending' }];

    const { status, body } = await call({ event: 'cancelled', reservation_id: RESERVATION_ID });

    expect(status).toBe(200);
    expect(body.sent).toBe(1);
    expect(createNotificationMock.mock.calls[0][0].user_id).toBe(REQUESTER_ID);
  });

  it('"cancelled" by a stranger is refused', async () => {
    sessionUser = { id: STRANGER_ID };
    reservationRow!.status = 'cancelled';

    const { status } = await call({ event: 'cancelled', reservation_id: RESERVATION_ID });
    expect(status).toBe(403);
  });

  it('a notification insert failure is reported, not hidden', async () => {
    createNotificationMock.mockRejectedValueOnce(new Error('insert refused'));

    const { status, body } = await call({ event: 'submitted', reservation_id: RESERVATION_ID });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.sent).toBe(1);
    expect(body.failed).toBe(1);
    expect(logger.error).toHaveBeenCalled();
  });
});
