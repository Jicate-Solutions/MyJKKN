// __tests__/meetings/booking-crm-bridge.test.ts
//
// Guards the booking → CRM bridge (Wave 3). Properties under test:
//   • email match → matched = true, correct ActivityService input shape
//   • no lead match → matched = false, no activity created
//   • ActivityService failure → matched = false (never throws)
//   • 'meeting' is the activity_type used (valid ActivityType member)

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mock ActivityService so we never touch the DB ────────────────────────────
// `vi.mock` is hoisted above every top-level statement, so a plain
// `const createActivity = vi.fn()` is still in its temporal dead zone when the
// factory runs — the whole file then dies at import with "Cannot access
// 'createActivity' before initialization" and every test in it silently stops
// existing. `vi.hoisted` is the supported way to build a mock value that the
// factory can legally reach.
const { createActivity } = vi.hoisted(() => ({ createActivity: vi.fn() }));
vi.mock('@/lib/services/admission/activity-service', () => ({
  ActivityService: { createActivity },
}));

// ── Mock phone utils ──────────────────────────────────────────────────────────
vi.mock('@/lib/utils/phone', () => ({
  normalizePhone: (p: string) => (p ? `+91${p.slice(-10)}` : ''),
  phoneLastDigits: (p: string) => p.slice(-10),
}));

import { BookingCrmBridge } from '@/lib/services/meetings/booking-crm-bridge-service';

// ─── Supabase stub helpers ────────────────────────────────────────────────────

/** Build a minimal supabase stub that returns `leadRow` for any .from() query. */
function makeSupabase(leadRow: { id: string } | null) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.ilike = () => builder;
  builder.eq = () => builder;
  builder.like = () => builder;
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.maybeSingle = () => Promise.resolve({ data: leadRow });
  return { from: () => builder } as never;
}

const BASE_INPUT = {
  uid: 'booking-uid-1',
  attendeeEmail: 'priya@gmail.com',
  attendeePhone: '9876543210',
  institutionId: 'inst-123',
  meetingTitle: 'Counseling Call',
  startIso: '2026-06-25T10:00:00.000Z',
  hostName: 'Dr. Ramesh Kumar',
};

beforeEach(() => {
  createActivity.mockReset();
  createActivity.mockResolvedValue({ id: 'act-1' });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BookingCrmBridge.recordBookingActivity', () => {
  it('returns matched=true and calls createActivity with correct shape when lead found', async () => {
    const supabase = makeSupabase({ id: 'lead-abc' });

    const result = await BookingCrmBridge.recordBookingActivity(supabase, BASE_INPUT);

    expect(result).toEqual({ matched: true, leadId: 'lead-abc' });
    expect(createActivity).toHaveBeenCalledOnce();

    const callArg = createActivity.mock.calls[0][0];
    // activity_type must be 'meeting' — a valid ActivityType member
    expect(callArg.activity_type).toBe('meeting');
    expect(callArg.lead_id).toBe('lead-abc');
    // subject contains the meeting title
    expect(callArg.title).toContain('Counseling Call');
    // scheduled_at is the booking start time
    expect(callArg.scheduled_at).toBe(BASE_INPUT.startIso);
  });

  it('returns matched=false when no lead is found and does NOT call createActivity', async () => {
    const supabase = makeSupabase(null);

    const result = await BookingCrmBridge.recordBookingActivity(supabase, BASE_INPUT);

    expect(result).toEqual({ matched: false });
    expect(createActivity).not.toHaveBeenCalled();
  });

  it('returns matched=false and does NOT throw when ActivityService throws', async () => {
    const supabase = makeSupabase({ id: 'lead-xyz' });
    createActivity.mockRejectedValue(new Error('DB connection refused'));

    // Must not throw — booking must not be affected by CRM failure
    await expect(
      BookingCrmBridge.recordBookingActivity(supabase, BASE_INPUT),
    ).resolves.toEqual({ matched: false });
  });

  it('still works when institutionId is null (cross-institution fallback)', async () => {
    const supabase = makeSupabase({ id: 'lead-global' });
    const result = await BookingCrmBridge.recordBookingActivity(supabase, {
      ...BASE_INPUT,
      institutionId: null,
    });

    expect(result.matched).toBe(true);
    expect(result.leadId).toBe('lead-global');
  });

  it('description includes host name and meeting title', async () => {
    const supabase = makeSupabase({ id: 'lead-desc' });
    await BookingCrmBridge.recordBookingActivity(supabase, BASE_INPUT);

    const desc: string = createActivity.mock.calls[0][0].description;
    expect(desc).toContain('Dr. Ramesh Kumar');
    expect(desc).toContain('JKKN meet page');
  });
});
