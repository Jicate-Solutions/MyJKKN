/**
 * HrDecisionEmailService.flush (2026-09-11): claims due rows, sends each through
 * Resend with the row id as the idempotency key, and records the outcome —
 * sent, retry with backoff, or failed for good after the last attempt.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.hoisted(() => vi.fn());
vi.mock('@/lib/resend', () => ({ resend: { emails: { send } } }));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => {
    throw new Error('tests pass their own client');
  },
}));

import { HrDecisionEmailService } from '@/lib/services/hr/decision-email-service';

type Row = {
  id: string;
  leave_application_id: string | null;
  comp_off_credit_id: string | null;
  employee_id: string;
  decision: string;
  to_email: string | null;
  attempts: number;
};

const TABLES: Record<string, unknown> = {
  hr_leave_applications: {
    id: 'app-1', leave_type_id: 'lt-cl', start_date: '2026-09-14', end_date: '2026-09-15',
    start_time: null, end_time: null, duration_type: 'full', duration_minutes: null,
    total_days: 2, rejection_reason: 'Exam week', final_approver_id: 'prof-principal',
  },
  hr_leave_types: { leave_type_name: 'Casual Leave', request_category: 'leave' },
  hr_comp_off_credits: {
    worked_date: '2026-09-06', expires_on: '2026-10-06', credit_days: 1,
    work_location: 'outside_campus', work_place: 'Chennai', rejection_reason: null, approved_by: null,
  },
  staff: { first_name: 'Anita', last_name: 'K' },
  profiles: { full_name: 'Dr S. Principal' },
};

function fakeSupabase(rows: Row[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const rpc = vi.fn(async () => ({ data: rows, error: null }));
  const from = (table: string) => {
    let patch: Record<string, unknown> | null = null;
    const q = {
      select: () => q,
      update: (p: Record<string, unknown>) => { patch = p; return q; },
      eq: (_col: string, value: string) => {
        if (patch) {
          updates.push({ id: value, patch });
          return Promise.resolve({ error: null });
        }
        return q;
      },
      single: async () => ({ data: TABLES[table], error: null }),
      maybeSingle: async () => ({ data: TABLES[table], error: null }),
    };
    return q;
  };
  return { client: { rpc, from } as never, updates, rpc };
}

const leaveRow = (p: Partial<Row> = {}): Row => ({
  id: 'mail-1', leave_application_id: 'app-1', comp_off_credit_id: null, employee_id: 'staff-1',
  decision: 'rejected', to_email: 'anita@jkkn.ac.in', attempts: 1, ...p,
});

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@jkkn.ai');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://my.jkkn.ac.in/');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  send.mockReset();
});

describe('HrDecisionEmailService.flush', () => {
  it('claims only the request it was asked about', async () => {
    const fake = fakeSupabase([]);
    await HrDecisionEmailService.flush({ leaveApplicationId: 'app-1' }, fake.client);
    expect(fake.rpc).toHaveBeenCalledWith('fn_hr_decision_emails_claim', { p_leave_application_id: 'app-1' });
  });

  it('sends a leave rejection and records it as sent', async () => {
    send.mockResolvedValue({ data: { id: 're_123' }, error: null });
    const fake = fakeSupabase([leaveRow()]);

    const result = await HrDecisionEmailService.flush({ leaveApplicationId: 'app-1' }, fake.client);

    expect(result).toEqual({ claimed: 1, sent: 1, retrying: 0, failed: 0 });
    const [payload, options] = send.mock.calls[0];
    expect(payload).toMatchObject({
      from: 'JKKN HR <noreply@jkkn.ai>',
      to: 'anita@jkkn.ac.in',
      subject: 'Rejected: Casual Leave, 14–15 Sep 2026',
    });
    expect(payload.text).toContain('Reason: Exam week');
    expect(payload.text).toContain('Decided by: Dr S. Principal');
    expect(payload.html).toContain('https://my.jkkn.ac.in/hr/leave/app-1');
    expect(options).toEqual({ idempotencyKey: 'hr-decision-email/mail-1' });
    expect(fake.updates).toEqual([
      { id: 'mail-1', patch: expect.objectContaining({ status: 'sent', resend_id: 're_123', last_error: null }) },
    ]);
  });

  it('sends a comp-off approval with the credit expiry', async () => {
    send.mockResolvedValue({ data: { id: 're_9' }, error: null });
    const fake = fakeSupabase([
      leaveRow({ id: 'mail-2', leave_application_id: null, comp_off_credit_id: 'credit-1', decision: 'approved' }),
    ]);
    await HrDecisionEmailService.flush({ compOffCreditId: 'credit-1' }, fake.client);
    const [payload] = send.mock.calls[0];
    expect(payload.subject).toBe('Approved: Comp-off claim for 6 Sep 2026');
    expect(payload.text).toContain('Location: Outside campus — Chennai');
    expect(payload.text).toContain('usable until 6 Oct 2026');
  });

  it('a failed send is retried later, with the error recorded', async () => {
    send.mockResolvedValue({ data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests' } });
    const fake = fakeSupabase([leaveRow({ attempts: 1 })]);
    const before = Date.now();

    const result = await HrDecisionEmailService.flush({}, fake.client);

    expect(result.retrying).toBe(1);
    const { patch } = fake.updates[0];
    expect(patch.status).toBeUndefined();
    expect(patch.last_error).toBe('Too many requests');
    const next = Date.parse(patch.next_attempt_at as string);
    expect(next - before).toBeGreaterThanOrEqual(5 * 60_000 - 1000);
    expect(next - before).toBeLessThan(6 * 60_000);
  });

  it('the fifth failure is final', async () => {
    send.mockRejectedValue(new Error('socket hang up'));
    const fake = fakeSupabase([leaveRow({ attempts: 5 })]);
    const result = await HrDecisionEmailService.flush({}, fake.client);
    expect(result.failed).toBe(1);
    expect(fake.updates[0].patch).toEqual({ status: 'failed', last_error: 'socket hang up' });
  });

  it('without a Resend key it claims nothing, so no attempt is used up', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const fake = fakeSupabase([leaveRow()]);
    const result = await HrDecisionEmailService.flush({}, fake.client);
    expect(result).toEqual({ claimed: 0, sent: 0, retrying: 0, failed: 0 });
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
