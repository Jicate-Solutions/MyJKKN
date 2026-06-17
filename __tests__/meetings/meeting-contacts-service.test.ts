import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MeetingContactsService } from '@/lib/services/meetings/meeting-contacts-service';

// ---------------------------------------------------------------------------
// Minimal Supabase client doubles. The service is a thin DB wrapper, so we
// test the mapping / normalisation logic, not Postgres.
// ---------------------------------------------------------------------------

function rpcClient(rows: unknown[] | null, error: { message: string } | null = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rows, error }),
  } as unknown as SupabaseClient;
}

function upsertClient() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const client = {
    from: vi.fn().mockReturnValue({ upsert }),
  } as unknown as SupabaseClient;
  return { client, upsert };
}

function handleClient(row: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('MeetingContactsService.listContacts', () => {
  it('maps RPC rows and coerces bigint strings to numbers', async () => {
    const client = rpcClient([
      {
        email: 'alice@example.com',
        display_name: 'Alice A',
        phone: '+919999999999',
        total_bookings: '3', // bigint arrives as string
        confirmed_bookings: '2',
        cancelled_bookings: '1',
        first_booked_at: '2026-01-01T10:00:00Z',
        last_booked_at: '2026-06-01T10:00:00Z',
        notes: 'VIP parent',
        has_notes: true,
      },
    ]);

    const result = await MeetingContactsService.listContacts(client);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      email: 'alice@example.com',
      displayName: 'Alice A',
      totalBookings: 3,
      confirmedBookings: 2,
      cancelledBookings: 1,
      hasNotes: true,
    });
    // numbers, not strings
    expect(typeof result[0].totalBookings).toBe('number');
  });

  it('returns [] on RPC error (fails closed, no throw)', async () => {
    const client = rpcClient(null, { message: 'boom' });
    const result = await MeetingContactsService.listContacts(client);
    expect(result).toEqual([]);
  });

  it('returns [] when RPC yields null data', async () => {
    const client = rpcClient(null);
    expect(await MeetingContactsService.listContacts(client)).toEqual([]);
  });
});

describe('MeetingContactsService.upsertContactNotes', () => {
  it('lowercases the email and normalises empty strings to null', async () => {
    const { client, upsert } = upsertClient();
    const res = await MeetingContactsService.upsertContactNotes(client, 'host-123', {
      email: '  Bob@Example.COM ',
      notes: '   ', // whitespace-only → null
      name: 'Bob B',
      phone: '',
    });
    expect(res.success).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        host_profile_id: 'host-123',
        email: 'bob@example.com',
        notes: null,
        name: 'Bob B',
        phone: null,
      }),
      { onConflict: 'host_profile_id,email' },
    );
  });

  it('rejects an empty email without touching the DB', async () => {
    const { client, upsert } = upsertClient();
    const res = await MeetingContactsService.upsertContactNotes(client, 'host-123', {
      email: '   ',
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('INVALID_EMAIL');
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('MeetingContactsService.getHostHandle', () => {
  it('returns the handle when the page is public', async () => {
    const client = handleClient({ handle: 'jane-doe', is_public: true });
    expect(await MeetingContactsService.getHostHandle(client, 'host-1')).toBe('jane-doe');
  });

  it('returns null when the page exists but is not public', async () => {
    const client = handleClient({ handle: 'jane-doe', is_public: false });
    expect(await MeetingContactsService.getHostHandle(client, 'host-1')).toBeNull();
  });

  it('returns null when there is no host page', async () => {
    const client = handleClient(null);
    expect(await MeetingContactsService.getHostHandle(client, 'host-1')).toBeNull();
  });
});

describe('MeetingContactsService.getContactDetail', () => {
  it('returns null when the email never booked the host', async () => {
    const client = rpcClient([
      {
        email: 'someone-else@example.com',
        display_name: 'Other',
        phone: null,
        total_bookings: '1',
        confirmed_bookings: '1',
        cancelled_bookings: '0',
        first_booked_at: null,
        last_booked_at: null,
        notes: null,
        has_notes: false,
      },
    ]);
    const detail = await MeetingContactsService.getContactDetail(client, 'nobody@example.com');
    expect(detail).toBeNull();
  });

  it('returns null for a blank email without querying', async () => {
    const client = rpcClient([]);
    expect(await MeetingContactsService.getContactDetail(client, '   ')).toBeNull();
  });
});
