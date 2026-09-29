/**
 * Leave approve / reject routes — a database refusal reaches the approver in
 * the database's own words (PR #3993, BUG-006101 / BUG-006140).
 *
 * LeaveService.approveApplication and rejectApplication end with
 * `if (error) throw error` on a plain `.update()` (no `.throwOnError()`).
 * postgrest-js only wraps a failure in PostgrestError (which extends Error)
 * when throwOnError is set; otherwise `error` is the parsed JSON body — a PLAIN
 * OBJECT. The routes used to answer `err instanceof Error ? err.message :
 * 'Unknown error'`, so the biometric gate's sentence ("HR uploads it from …")
 * never left the server and the Principal read "Unknown error".
 *
 * The refusal below is produced by the REAL postgrest-js against a faked HTTP
 * 400, so the thrown value has exactly the shape production throws.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PostgrestClient } from '@supabase/postgrest-js';

const GATE_MESSAGE =
  'Biometric attendance for Sep 2026 has not been uploaded yet, so approving this would not reach the attendance report. HR uploads it from HR Setup › Admin Dashboard › Import Biometric Punches; you can approve once it is in. First missing day: 01 Sep 2026.';

/** The update LeaveService runs, answered by PostgREST with a trigger's RAISE. */
async function updateRefusedByTrigger(message: string, code = 'P0001') {
  const client = new PostgrestClient('http://postgrest.test/rest/v1', {
    fetch: async () =>
      new Response(JSON.stringify({ code, message, details: null, hint: null }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
  });
  const { error } = await client
    .from('hr_leave_applications')
    .update({ status: 'approved' })
    .eq('id', 'app-1')
    .select()
    .single();
  return error;
}

const approveApplication = vi.fn();
const rejectApplication = vi.fn();

vi.mock('@/lib/services/hr/leave-service', () => ({
  LeaveService: {
    approveApplication: (...a: unknown[]) => approveApplication(...a),
    rejectApplication: (...a: unknown[]) => rejectApplication(...a),
  },
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'approver-1' } }, error: null }) },
  }),
}));

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined, set: () => {} }),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve(), after: () => {} };
});

vi.mock('@/lib/hr/attendance/recompute-day', () => ({ recomputeForShortTimeOff: vi.fn() }));
vi.mock('@/lib/services/staff/notification-service', () => ({ StaffNotificationService: {} }));
vi.mock('@/lib/services/hr/decision-email-service', () => ({ HrDecisionEmailService: {} }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: vi.fn() }));
vi.mock('@/lib/usage/record', () => ({
  recordFeatureUse: vi.fn(),
  FEATURE_KEYS: { HR_LEAVE_DECIDE: 'hr.leave.decide' },
}));

// SUT imported AFTER the mocks.
import { POST as approvePOST } from '@/app/api/hr/leave/applications/[id]/approve/route';
import { POST as rejectPOST } from '@/app/api/hr/leave/applications/[id]/reject/route';

const params = { params: Promise.resolve({ id: 'app-1' }) };
const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost/api/hr/leave/applications/app-1/${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  approveApplication.mockReset();
  rejectApplication.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('leave decision routes — database refusal text', () => {
  it('postgrest-js hands back a plain object, not an Error (the premise of the bug)', async () => {
    const error = await updateRefusedByTrigger(GATE_MESSAGE);
    expect(error).not.toBeInstanceOf(Error);
    expect(error?.message).toBe(GATE_MESSAGE);
  });

  it('approve: the biometric gate refusal reaches the approver verbatim, naming HR', async () => {
    approveApplication.mockImplementation(async () => {
      const error = await updateRefusedByTrigger(GATE_MESSAGE);
      if (error) throw error; // exactly what LeaveService.approveApplication does
    });

    const res = await approvePOST(post('approve', { comment: 'ok' }), params);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe(GATE_MESSAGE);
    expect(json.error).not.toBe('Unknown error');
  });

  it('reject: a database refusal reaches the approver verbatim', async () => {
    const refusal = 'That month is already closed (locked 30 Sep 2026).';
    rejectApplication.mockImplementation(async () => {
      const error = await updateRefusedByTrigger(refusal);
      if (error) throw error; // exactly what LeaveService.rejectApplication does
    });

    const res = await rejectPOST(post('reject', { rejection_reason: 'not eligible' }), params);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(refusal);
  });

  it('a thrown Error still passes its own message through', async () => {
    approveApplication.mockRejectedValue(new Error('Application not found'));
    const res = await approvePOST(post('approve', {}), params);
    expect((await res.json()).error).toBe('Application not found');
  });
});
