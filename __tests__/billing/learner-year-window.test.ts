import { describe, it, expect, vi } from 'vitest';
import {
  getLearnerHiddenYearIds,
  isBillYearLearnerVisible,
} from '@/lib/utils/billing/learner-visibility';

// Advance-year window: the rule lives in SQL (fn_learner_bill_year_visible);
// these tests pin how the service-role helper consumes it.

const rpcReturning = (visible: Record<string, boolean>) =>
  vi.fn(async (_fn: string, args: Record<string, unknown>) => ({
    data: visible[args.p_academic_year_id as string],
    error: null,
  }));

describe('getLearnerHiddenYearIds', () => {
  it('collects only years the DB says are outside the window', async () => {
    const rpc = rpcReturning({ a: true, b: true, c: false });
    const hidden = await getLearnerHiddenYearIds({ rpc }, ['a', 'b', 'c']);
    expect([...hidden]).toEqual(['c']);
  });

  it('asks once per distinct year and skips null/undefined', async () => {
    const rpc = rpcReturning({ a: false });
    await getLearnerHiddenYearIds({ rpc }, ['a', 'a', null, undefined]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_learner_bill_year_visible', {
      p_academic_year_id: 'a',
    });
  });

  it('fails closed: an RPC error throws instead of hiding nothing', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'boom' } }));
    await expect(getLearnerHiddenYearIds({ rpc }, ['a'])).rejects.toEqual({ message: 'boom' });
  });
});

describe('isBillYearLearnerVisible', () => {
  it('keeps bills with no academic year', () => {
    expect(isBillYearLearnerVisible(null, new Set(['x']))).toBe(true);
  });
  it('drops bills in a hidden year', () => {
    expect(isBillYearLearnerVisible('x', new Set(['x']))).toBe(false);
    expect(isBillYearLearnerVisible('y', new Set(['x']))).toBe(true);
  });
});
