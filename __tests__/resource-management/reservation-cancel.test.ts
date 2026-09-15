import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * BUG-004002: cancel / approve / reject reported failure after succeeding.
 *
 * Each of the three operations calls a SECURITY DEFINER RPC that bypasses RLS
 * to perform the write, and then immediately re-read the row with an ordinary
 * `.select(...).single()` that IS subject to RLS. There is no policy on
 * `resource_reservations` matching "I am the booker", so a requester whose
 * `profiles.institution_id` differs from the resource's institution cannot read
 * the row back. The write committed; the read returned zero rows (PGRST116);
 * the user saw "Cancellation Failed".
 *
 * The RPCs already `RETURNS public.resource_reservations` (see
 * 20260518130000_reservation_approval_rpc.sql and
 * 20260603000001_add_cancel_reservation_rpc.sql), so the authoritative updated
 * row is right there in the RPC response. These tests pin the requirement that
 * the operation RESOLVES with that row even when the follow-up RLS-bound read
 * is blocked -- the re-read is a best-effort enrichment for the embedded
 * `resource` / `user` joins, never a failure path.
 */

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

vi.mock('@/lib/services/reservation/reservation-notification-service', () => ({
  notifyBookingSubmitted: vi.fn(async () => undefined),
  notifyApproversPendingBooking: vi.fn(async () => undefined),
  notifyBookingApproved: vi.fn(async () => undefined),
  notifyBookingRejected: vi.fn(async () => undefined)
}));

import { ReservationService } from '@/lib/services/reservation/reservation-service';

const RESERVATION_ID = '11111111-1111-4111-8111-111111111111';

/** The row the SECURITY DEFINER RPC returns via RETURNING * (no embeds). */
function rpcRow(status: string) {
  return {
    id: RESERVATION_ID,
    resource_id: '22222222-2222-4222-8222-222222222222',
    user_id: '33333333-3333-4333-8333-333333333333',
    institution_id: '44444444-4444-4444-8444-444444444444',
    status,
    start_time: '2026-09-12T09:00:00Z',
    end_time: '2026-09-12T10:00:00Z'
  };
}

/** PostgREST's error when an RLS-filtered `.single()` matches zero rows. */
const PGRST116 = {
  code: 'PGRST116',
  message: 'JSON object requested, multiple (or no) rows returned',
  details: 'The result contains 0 rows',
  hint: null
};

/**
 * Supabase client where the RPC succeeds but every follow-up single-row select
 * on resource_reservations is blocked by RLS -- the exact production shape.
 */
function makeClient(rpcData: Record<string, any>) {
  const rpc = vi.fn(async () => ({ data: rpcData, error: null }));
  const single = vi.fn(async () => ({ data: null, error: PGRST116 }));

  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single
  };

  return {
    rpc,
    single,
    from: vi.fn(() => builder)
  };
}

describe('BUG-004002 - reservation writes must not report failure after succeeding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancelReservation resolves when the post-write re-read is blocked by RLS', async () => {
    const client = makeClient(rpcRow('cancelled'));
    (globalThis as any).__reservationClient = client;

    const result = await ReservationService.cancelReservation(
      { reservation_id: RESERVATION_ID, cancellation_reason: 'No longer needed' } as any,
      '33333333-3333-4333-8333-333333333333'
    );

    expect(client.rpc).toHaveBeenCalledWith(
      'cancel_reservation',
      expect.objectContaining({ p_reservation_id: RESERVATION_ID })
    );
    expect(result).toBeTruthy();
    expect(result.id).toBe(RESERVATION_ID);
    expect(result.status).toBe('cancelled');
  });

  it('approveReservation resolves when the post-write re-read is blocked by RLS', async () => {
    const client = makeClient(rpcRow('approved'));
    (globalThis as any).__reservationClient = client;

    const result = await ReservationService.approveReservation(
      { reservation_id: RESERVATION_ID, notes: 'ok' } as any,
      '55555555-5555-4555-8555-555555555555'
    );

    expect(client.rpc).toHaveBeenCalledWith(
      'approve_reservation',
      expect.objectContaining({ p_reservation_id: RESERVATION_ID })
    );
    expect(result.id).toBe(RESERVATION_ID);
    expect(result.status).toBe('approved');
  });

  it('rejectReservation resolves when the post-write re-read is blocked by RLS', async () => {
    const client = makeClient(rpcRow('rejected'));
    (globalThis as any).__reservationClient = client;

    const result = await ReservationService.rejectReservation(
      { reservation_id: RESERVATION_ID, rejection_reason: 'Clash' } as any,
      '55555555-5555-4555-8555-555555555555'
    );

    expect(client.rpc).toHaveBeenCalledWith(
      'reject_reservation',
      expect.objectContaining({ p_reservation_id: RESERVATION_ID })
    );
    expect(result.id).toBe(RESERVATION_ID);
    expect(result.status).toBe('rejected');
  });

  it('still prefers the joined row when the re-read succeeds', async () => {
    const client = makeClient(rpcRow('cancelled'));
    const joined = {
      ...rpcRow('cancelled'),
      resource: { id: '22222222-2222-4222-8222-222222222222', name: 'Vibrant Arangam' },
      user: { id: '33333333-3333-4333-8333-333333333333', full_name: 'A B', email: 'a@b.c' }
    };
    client.single.mockResolvedValue({ data: joined, error: null } as any);
    (globalThis as any).__reservationClient = client;

    const result = await ReservationService.cancelReservation(
      { reservation_id: RESERVATION_ID, cancellation_reason: 'No longer needed' } as any,
      '33333333-3333-4333-8333-333333333333'
    );

    expect((result as any).resource?.name).toBe('Vibrant Arangam');
  });

  it('still rejects when the RPC itself fails', async () => {
    const client = makeClient(rpcRow('cancelled'));
    client.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'You are not authorised to cancel this reservation' }
    } as any);
    (globalThis as any).__reservationClient = client;

    await expect(
      ReservationService.cancelReservation(
        { reservation_id: RESERVATION_ID, cancellation_reason: 'x' } as any,
        '33333333-3333-4333-8333-333333333333'
      )
    ).rejects.toMatchObject({ code: '42501' });
  });
});
