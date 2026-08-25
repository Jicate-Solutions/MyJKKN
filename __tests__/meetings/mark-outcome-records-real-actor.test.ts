// __tests__/meetings/mark-outcome-records-real-actor.test.ts
//
// Who closed the meeting?
//
// Until 20260926010000, meeting_bookings could only record an actor KIND:
//
//   CHECK (outcome_marked_by IS NULL
//          OR outcome_marked_by = ANY (ARRAY['host'::text, 'system'::text]))
//
// Both values are kinds, neither is a person. So the moment anyone other than
// the booking's own host closed a meeting, the only thing the record could say
// was 'host' — which the detail page rendered as "Recorded by the host". A
// super admin closing one of the Director's meetings therefore NAMED THE
// DIRECTOR. Nothing lied; there was nowhere to put the real name.
//
// WHAT THESE TESTS PIN, and why each one discriminates:
//
//   1. The action never sends the actor to the database. If the caller could
//      pass an actor, the caller could claim to be someone else — the identity
//      has to come from auth.uid() inside the function or it is worthless. A
//      test that only checked "an id gets recorded" would pass on that bug.
//   2. The action ECHOES the kind the database wrote rather than inventing it.
//      The obvious "simplification" here is `markedBy: 'host'` — which is
//      exactly the original bug, re-introduced one layer up. These tests fail
//      on it.
//   3. Nothing is claimed on a failure path. Reporting who closed a meeting
//      that was not closed is the same class of untruth.
//
// The SQL half is proven separately against a PostgreSQL fixture (see the PR
// body); the migration-contract tests at the bottom guard the two lines in that
// file which a later edit could silently revert.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// --- import-time stubs -------------------------------------------------------
// actions.ts pulls in NativeSchedulingService, whose import chain constructs
// Resend and a browser Supabase client at module load and throws without their
// env. None of that participates in marking an outcome; these only get the
// module loaded.
vi.mock('@/lib/services/email/meeting-booking-email-service', () => ({
  MeetingBookingEmailService: {
    sendBookingConfirmedEmails: vi.fn(),
    sendBookingRescheduledEmails: vi.fn(),
    sendBookingCancelledEmails: vi.fn(),
  },
}));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn(() => ({})) }));
vi.mock('@/lib/services/integrations/google-calendar-service', () => ({
  GoogleCalendarService: { busyForHost: vi.fn(async () => ({ status: 'ok', busy: [] })) },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const rpc = vi.fn();
const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}));

import { markMeetingOutcome } from '@/app/(routes)/meetings/[uid]/actions';

/** Gowrisankar M.N — a super admin, NOT the host of the booking below. */
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';
/** The Director — the booking's host. */
const HOST_ID = '11111111-1111-1111-1111-111111111111';

function signedInAs(id: string) {
  getUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

beforeEach(() => {
  rpc.mockReset();
  getUser.mockReset();
  signedInAs(HOST_ID);
});

describe('the actor is the database’s to decide, never the caller’s', () => {
  it('sends only the booking and the outcome — no actor argument', async () => {
    signedInAs(ADMIN_ID);
    rpc.mockResolvedValue({ data: { success: true, status: 'completed', marked_by: 'admin' }, error: null });

    await markMeetingOutcome('bk-1', 'completed');

    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('fn_meeting_mark_outcome');
    // The exact key set, not a subset: an extra p_actor / p_profile_id would be
    // a caller-supplied identity, which is precisely what must not exist.
    expect(Object.keys(args).sort()).toEqual(['p_outcome', 'p_uid']);
    expect(args).toEqual({ p_uid: 'bk-1', p_outcome: 'completed' });
  });

  it('never passes the signed-in user’s id, even though it has it', async () => {
    signedInAs(ADMIN_ID);
    rpc.mockResolvedValue({ data: { success: true, marked_by: 'admin' }, error: null });

    await markMeetingOutcome('bk-1', 'completed');

    expect(JSON.stringify(rpc.mock.calls[0][1])).not.toContain(ADMIN_ID);
  });
});

describe('the recorded kind is echoed, not assumed', () => {
  it('reports admin when a super admin closed someone else’s meeting', async () => {
    // THE BUG SCENARIO. Before this change nothing could report anything but
    // the host here, because 'admin' was not a value the column could hold.
    signedInAs(ADMIN_ID);
    rpc.mockResolvedValue({ data: { success: true, status: 'completed', marked_by: 'admin' }, error: null });

    const result = await markMeetingOutcome('bk-1', 'completed');

    expect(result.success).toBe(true);
    expect(result.markedBy).toBe('admin');
    // The regression guard: a hardcoded 'host' passes every other assertion.
    expect(result.markedBy).not.toBe('host');
  });

  it('reports host when the host closed their own meeting', async () => {
    rpc.mockResolvedValue({ data: { success: true, status: 'no_show', marked_by: 'host' }, error: null });

    const result = await markMeetingOutcome('bk-1', 'no_show');

    expect(result).toEqual({ success: true, markedBy: 'host' });
  });

  it('claims no actor when the database named none', async () => {
    // A pre-20260926010000 database still answers this RPC, just without the
    // new field. Inventing 'host' to fill the gap would re-create the bug.
    rpc.mockResolvedValue({ data: { success: true, status: 'completed' }, error: null });

    const result = await markMeetingOutcome('bk-1', 'completed');

    expect(result.success).toBe(true);
    expect(result.markedBy).toBeUndefined();
  });
});

describe('nothing is claimed when nothing was recorded', () => {
  it('names no actor when the booking was not markable', async () => {
    rpc.mockResolvedValue({
      data: { success: false, error_code: 'not_markable', message: 'This booking is already cancelled.' },
      error: null,
    });

    const result = await markMeetingOutcome('bk-1', 'completed');

    expect(result.success).toBe(false);
    expect(result.markedBy).toBeUndefined();
    expect(result.error).toBe('This booking is already cancelled.');
  });

  it('names no actor when the caller is not entitled to this booking', async () => {
    rpc.mockResolvedValue({ data: { success: false, error_code: 'not_found' }, error: null });

    const result = await markMeetingOutcome('bk-1', 'completed');

    expect(result).toEqual({ success: false, error: 'Booking not found.' });
  });

  it('says the migration is unapplied rather than failing vaguely', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });

    const result = await markMeetingOutcome('bk-1', 'completed');

    expect(result.success).toBe(false);
    expect(result.markedBy).toBeUndefined();
    expect(result.error).toMatch(/not switched on yet/i);
  });

  it('refuses a signed-out caller without touching the database', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await markMeetingOutcome('bk-1', 'completed');

    expect(result.success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses an outcome outside the two the status CHECK allows', async () => {
    const result = await markMeetingOutcome('bk-1', 'cancelled' as never);

    expect(result.success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// The migration is FILE ONLY (Director-gated), so these read the file itself.
// They exist because the two lines below are the entire fix, and both are the
// kind a later "tidy-up" removes without any other test noticing.
// -----------------------------------------------------------------------------
describe('the migration keeps the properties the fix depends on', () => {
  const sql = readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20260926010000_meetings_record_real_closer.sql'),
    'utf8',
  );

  it('stamps the identity column from auth.uid()', () => {
    expect(sql).toContain('outcome_marked_by_profile_id = v_actor');
    expect(sql).toContain('v_actor   uuid := auth.uid()');
  });

  it('derives the kind instead of hardcoding host, as the old function did', () => {
    expect(sql).toContain('outcome_marked_by            = v_kind');
    expect(sql).not.toMatch(/outcome_marked_by\s*=\s*'host'/);
  });

  it('widens the kind CHECK without dropping the two that already worked', () => {
    expect(sql).toContain("outcome_marked_by IN ('host', 'admin', 'system')");
  });

  it('keeps a person-marked row from being anonymous', () => {
    expect(sql).toContain('mb_outcome_marked_by_person_chk');
    expect(sql).toContain("outcome_marked_by NOT IN ('host', 'admin')");
  });

  it('re-asserts the anon revoke on the replaced SECURITY DEFINER function', () => {
    // anon is a MEMBER of PUBLIC, so revoking anon alone leaves the PUBLIC
    // grant intact and the function still reachable with the public key.
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.fn_meeting_mark_outcome(text, text) FROM anon, PUBLIC;',
    );
    expect(sql).toContain(
      'GRANT  EXECUTE ON FUNCTION public.fn_meeting_mark_outcome(text, text) TO authenticated;',
    );
  });

  it('carries no BEGIN/COMMIT, so a reviewer’s rollback rehearsal rolls back', () => {
    expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
  });
});
