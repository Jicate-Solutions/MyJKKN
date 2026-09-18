/**
 * POST /api/bug-reports/feedback/[id]/snooze and POST /api/notifications/answer
 * (blocking feedback gate, 2026-09-16).
 *
 * Both routes are thin: sign-in check, then the SECURITY DEFINER RPC decides.
 * What must hold: no RPC without a user (401), the RPC's refusal becomes a 400
 * with its reason (so the gate can say "no more snoozes"), and success passes
 * the RPC's counters through unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let currentUser: { id: string } | null = { id: 'user-1' };
let rpcResult: { data: any; error: any } = { data: { success: true }, error: null };
const rpc = vi.fn(() => Promise.resolve(rpcResult));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser }, error: null }) },
      rpc
    })
}));
vi.mock('@/lib/utils/enhanced-logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), dev: vi.fn() } }));
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

import { POST as snoozePOST } from '@/app/api/bug-reports/feedback/[id]/snooze/route';
import { POST as answerPOST } from '@/app/api/notifications/answer/route';
import { POST as bugAnswerPOST } from '@/app/api/bug-reports/feedback/[id]/route';
import { NextRequest } from 'next/server';

const params = Promise.resolve({ id: 'req-1' });

beforeEach(() => {
  currentUser = { id: 'user-1' };
  rpcResult = { data: { success: true }, error: null };
  rpc.mockClear();
});

describe('POST /api/bug-reports/feedback/[id]/snooze', () => {
  it('401 without a user, and calls no RPC', async () => {
    currentUser = null;
    const res = await snoozePOST(new NextRequest('https://jkkn.ai/x', { method: 'POST' }), { params });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes the RPC counters through on success', async () => {
    rpcResult = { data: { success: true, snooze_count: 1, snoozed_until: '2026-09-17T10:00:00Z', can_snooze: true }, error: null };
    const res = await snoozePOST(new NextRequest('https://jkkn.ai/x', { method: 'POST' }), { params });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('fn_bug_feedback_snooze', { p_request_id: 'req-1' });
    expect(await res.json()).toEqual({ ok: true, snooze_count: 1, snoozed_until: '2026-09-17T10:00:00Z', can_snooze: true });
  });

  it('turns the RPC refusal into a 400 carrying its reason (the 4th press)', async () => {
    rpcResult = { data: { success: false, error: 'no more snoozes', snooze_count: 3 }, error: null };
    const res = await snoozePOST(new NextRequest('https://jkkn.ai/x', { method: 'POST' }), { params });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no more snoozes', snooze_count: 3 });
  });

  it('500 with a plain message when the RPC itself errors', async () => {
    rpcResult = { data: null, error: { message: 'boom' } };
    const res = await snoozePOST(new NextRequest('https://jkkn.ai/x', { method: 'POST' }), { params });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/notifications/answer', () => {
  const req = (body: unknown) =>
    new NextRequest('https://jkkn.ai/api/notifications/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

  it('401 without a user', async () => {
    currentUser = null;
    const res = await answerPOST(req({ notification_id: 'n-1', answer: 'Yes' }));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('400 when notification_id or answer is missing', async () => {
    const res = await answerPOST(req({ notification_id: 'n-1', answer: '   ' }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('records the pick through fn_notification_answer', async () => {
    rpcResult = { data: { success: true, answer: 'Yes' }, error: null };
    const res = await answerPOST(req({ notification_id: 'n-1', answer: ' Yes ' }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('fn_notification_answer', { p_notification_id: 'n-1', p_answer: 'Yes' });
    expect(await res.json()).toEqual({ ok: true, answer: 'Yes' });
  });

  it('400 with the RPC reason when the pick is not one of the options', async () => {
    rpcResult = { data: { success: false, error: 'answer must be one of the offered options' }, error: null };
    const res = await answerPOST(req({ notification_id: 'n-1', answer: 'Maybe' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/one of the offered options/);
  });
});

/**
 * POST /api/bug-reports/feedback/[id] with action 'answer' — the reopen has to
 * be visible to the caller (blind-critic gap 1, 2026-09-18).
 *
 * The route used to answer a bare `{ ok, answer }`, so nothing outside the
 * database could tell a reopen from a silent no-op, and the screen said "the
 * report is open again" either way. It now passes the RPC's `reopened` count
 * and, more importantly, `bug_status` — read back from bug_reports inside
 * fn_bug_feedback_answer AFTER the reopen, so it cannot be a claim.
 */
describe('POST /api/bug-reports/feedback/[id] — answer', () => {
  const answerReq = (answer: string) =>
    new NextRequest('https://jkkn.ai/api/bug-reports/feedback/req-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'answer', answer })
    });

  it('passes the reopen through: a "not fixed" answer returns the bug back open', async () => {
    rpcResult = {
      data: { success: true, answer: 'not_fixed', reopened: 2, bug_status: 'new', ledger_recorded: true, fixer_notified: true },
      error: null
    };

    const res = await bugAnswerPOST(answerReq('not_fixed'), { params });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('fn_bug_feedback_answer', {
      p_request_id: 'req-1',
      p_answer: 'not_fixed'
    });
    expect(await res.json()).toEqual({
      ok: true,
      answer: 'not_fixed',
      reopened: 2,
      bug_status: 'new',
      fixer_notified: true,
      ledger_recorded: true
    });
  });

  it('passes an unrecorded ledger through instead of hiding it (critic round 1)', async () => {
    rpcResult = {
      data: { success: true, answer: 'fixed', reopened: 0, bug_status: 'resolved', ledger_recorded: false },
      error: null
    };
    const res = await bugAnswerPOST(answerReq('fixed'), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ledger_recorded: false });
  });

  it('does not invent a reopen when the RPC reports the bug still closed', async () => {
    // The shape a rolled-back reopen would produce. The route must report it,
    // not smooth it over — this is the state the critic said could pass silently.
    rpcResult = {
      data: { success: true, answer: 'not_fixed', reopened: 0, bug_status: 'resolved', fixer_notified: false },
      error: null
    };
    const res = await bugAnswerPOST(answerReq('not_fixed'), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reopened: 0, bug_status: 'resolved', fixer_notified: false });
  });

  it('a "fixed" answer reopens nothing', async () => {
    rpcResult = { data: { success: true, answer: 'fixed', reopened: 0, bug_status: 'resolved' }, error: null };
    const res = await bugAnswerPOST(answerReq('fixed'), { params });
    expect(await res.json()).toMatchObject({ ok: true, answer: 'fixed', reopened: 0 });
  });

  it('400 with the RPC reason when the question is not the caller’s', async () => {
    rpcResult = { data: { success: false, error: 'not found' }, error: null };
    const res = await bugAnswerPOST(answerReq('not_fixed'), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('not found');
  });

  it('500 when the reopen itself fails — the answer is re-askable, a closed bug is not', async () => {
    // fn_bug_feedback_answer no longer swallows a failed reopen, so the RPC
    // raises and the route must surface it instead of reporting success.
    rpcResult = { data: null, error: { message: 'deadlock detected', code: '40P01' } };
    const res = await bugAnswerPOST(answerReq('not_fixed'), { params });
    expect(res.status).toBe(500);
  });
});
