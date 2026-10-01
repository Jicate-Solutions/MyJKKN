// __tests__/lib/session-questions/unanswered-counts.test.ts
// 2026-09-17 — SessionQuestionService.unansweredCounts, the read behind the waiting-
// question badge on the host session list.
//
// WHY THIS FILE IS UNDER __tests__/lib/: that directory is the one the lib unit suite
// workflow actually names (`npx vitest run __tests__/lib/`). This repo has no blanket
// vitest run, so a test placed beside the induction components in __tests__/events/
// would never execute in CI — it would be dead code that reads like cover.
//
// WHAT IS PINNED HERE is the contract the UI leans on: ONE call for the whole page, a
// host_id -> count map, and "absent means zero" — because the badge renders only when
// the count is > 0, a mapping bug would show as a missing badge, which is
// indistinguishable from the defect this whole change exists to fix.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc }) as never,
}));

import { SessionQuestionService } from '@/lib/services/session-questions/session-question-service';

beforeEach(() => { rpc.mockReset(); });

describe('unansweredCounts', () => {
  it('asks ONCE for every session on the page, not once per session', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await SessionQuestionService.unansweredCounts('induction', ['s1', 's2', 's3']);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_session_question_unanswered_counts', {
      p_host_type: 'induction',
      p_host_ids: ['s1', 's2', 's3'],
    });
  });

  it('keys the result by host_id (the session id the row renders under)', async () => {
    rpc.mockResolvedValue({
      data: [
        { host_id: 's1', board_id: 'b1', status: 'open', unanswered_count: 32 },
        { host_id: 's2', board_id: 'b2', status: 'open', unanswered_count: 1 },
      ],
      error: null,
    });

    await expect(SessionQuestionService.unansweredCounts('induction', ['s1', 's2']))
      .resolves.toEqual({ s1: 32, s2: 1 });
  });

  it('leaves a session with no board absent, so the caller reads it as 0', async () => {
    rpc.mockResolvedValue({
      data: [{ host_id: 's1', board_id: 'b1', status: 'open', unanswered_count: 4 }],
      error: null,
    });

    const counts = await SessionQuestionService.unansweredCounts('induction', ['s1', 's2']);
    expect(counts.s1).toBe(4);
    expect(counts.s2).toBeUndefined();
    expect(counts.s2 ?? 0).toBe(0);
  });

  it('keeps a real zero as zero — an open board with nothing waiting is not a badge', async () => {
    rpc.mockResolvedValue({
      data: [{ host_id: 's1', board_id: 'b1', status: 'open', unanswered_count: 0 }],
      error: null,
    });

    await expect(SessionQuestionService.unansweredCounts('induction', ['s1']))
      .resolves.toEqual({ s1: 0 });
  });

  it('sends each session id once, however many times the caller lists it', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await SessionQuestionService.unansweredCounts('induction', ['s1', 's1', 's2']);

    expect(rpc.mock.calls[0][1].p_host_ids).toEqual(['s1', 's2']);
  });

  it('does not call the RPC at all for an empty page', async () => {
    await expect(SessionQuestionService.unansweredCounts('induction', []))
      .resolves.toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });

  it('throws on an RPC error rather than reporting an all-clear', async () => {
    // A swallowed error here would render every session as "nothing waiting" — the
    // exact false all-clear this change exists to remove. The caller decides what to
    // do with the throw; the service must not decide for it by returning {}.
    rpc.mockResolvedValue({ data: null, error: { message: 'not authorized' } });

    await expect(SessionQuestionService.unansweredCounts('induction', ['s1']))
      .rejects.toMatchObject({ message: 'not authorized' });
  });

  it('survives a null payload from PostgREST', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(SessionQuestionService.unansweredCounts('induction', ['s1']))
      .resolves.toEqual({});
  });
});
