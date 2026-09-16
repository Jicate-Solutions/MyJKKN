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
