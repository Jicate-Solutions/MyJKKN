/**
 * #4328 review (BUG-006276): AttendanceRosterService.getLearnerGenders sends
 * at most 2000 ids per RPC call and gives up after 10 s, returning an empty
 * map (name-order fallback) instead of hanging.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc })
}));
vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { warn: vi.fn(), dev: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
}));

import { AttendanceRosterService } from '@/lib/services/academic/attendance-roster-service';

/** A thenable shaped like PostgrestFilterBuilder, with abortSignal(). */
function builder(result: Promise<any>) {
  const b: any = {
    signal: undefined as AbortSignal | undefined,
    abortSignal(s: AbortSignal) {
      b.signal = s;
      return b;
    },
    then: (res: any, rej: any) => result.then(res, rej)
  };
  return b;
}

describe('AttendanceRosterService.getLearnerGenders', () => {
  beforeEach(() => {
    rpc.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('chunks ids into calls of at most 2000', async () => {
    rpc.mockImplementation((_fn: string, args: any) =>
      builder(
        Promise.resolve({
          data: args.p_learner_ids.map((id: string) => ({ id, gender: 'Male' })),
          error: null
        })
      )
    );
    const ids = Array.from({ length: 4500 }, (_, i) => `l${i}`);
    const out = await AttendanceRosterService.getLearnerGenders('i1', ids);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls.map((c) => c[1].p_learner_ids.length)).toEqual([2000, 2000, 500]);
    expect(out.size).toBe(4500);
  });

  it('times out after 10 s, aborts the call and returns an empty map', async () => {
    vi.useFakeTimers();
    const b = builder(new Promise(() => {}));
    rpc.mockReturnValue(b);
    const pending = AttendanceRosterService.getLearnerGenders('i1', ['a']);
    await vi.advanceTimersByTimeAsync(10_000);
    const out = await pending;
    expect(out.size).toBe(0);
    expect(b.signal?.aborted).toBe(true);
  });

  it('is all-or-nothing when one chunk fails', async () => {
    let n = 0;
    rpc.mockImplementation((_fn: string, args: any) =>
      builder(
        Promise.resolve(
          n++ === 0
            ? { data: args.p_learner_ids.map((id: string) => ({ id, gender: 'Male' })), error: null }
            : { data: null, error: { code: '22023', message: 'too many' } }
        )
      )
    );
    const ids = Array.from({ length: 2001 }, (_, i) => `l${i}`);
    const out = await AttendanceRosterService.getLearnerGenders('i1', ids);
    expect(out.size).toBe(0);
  });
});
