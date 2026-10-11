// @vitest-environment jsdom
/**
 * #4328 review (BUG-006276): the gender lookup behind the "Boys, then girls"
 * order resets when the roster changes, makes no call when every id is
 * already known, and reports 'unavailable' on failure/timeout/empty so the
 * page falls back to name order with a notice.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useLearnerGenders } from '@/app/(routes)/academic/attendance/mark/_hooks/use-learner-genders';

type Props = { enabled: boolean; inst: string; ids: string[] };

const setup = (fetcher: any, initial: Props) =>
  renderHook((p: Props) => useLearnerGenders(p.enabled, p.inst, p.ids, fetcher), {
    initialProps: initial
  });

const genders = (entries: [string, string | null][]) => new Map(entries);

describe('useLearnerGenders', () => {
  it('makes no call while the order is not boys_then_girls', () => {
    const fetcher = vi.fn();
    const { result } = setup(fetcher, { enabled: false, inst: 'i1', ids: ['a'] });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('loads, then is ready', async () => {
    const fetcher = vi.fn().mockResolvedValue(genders([['a', 'Male'], ['b', 'Female']]));
    const { result } = setup(fetcher, { enabled: true, inst: 'i1', ids: ['a', 'b'] });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.genders.get('b')).toBe('Female');
  });

  it('resets the map when the roster changes (old-roster ids dropped at once)', async () => {
    let resolveSecond: (m: Map<string, string | null>) => void = () => {};
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(genders([['a', 'Male'], ['b', 'Female']]))
      .mockImplementationOnce(() => new Promise((r) => (resolveSecond = r)));
    const { result, rerender } = setup(fetcher, { enabled: true, inst: 'i1', ids: ['a', 'b'] });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ enabled: true, inst: 'i1', ids: ['c', 'd'] });
    expect(result.current.genders.size).toBe(0);
    expect(result.current.status).toBe('loading');
    expect(fetcher).toHaveBeenLastCalledWith('i1', ['c', 'd']);

    resolveSecond(genders([['c', 'Female'], ['d', 'Male']]));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect([...result.current.genders.keys()].sort()).toEqual(['c', 'd']);
  });

  it('resets on institution change even for the same ids', async () => {
    const fetcher = vi.fn().mockResolvedValue(genders([['a', 'Male']]));
    const { result, rerender } = setup(fetcher, { enabled: true, inst: 'i1', ids: ['a'] });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ enabled: true, inst: 'i2', ids: ['a'] });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenLastCalledWith('i2', ['a']);
  });

  it('skips the call when every id is already known', async () => {
    const fetcher = vi.fn().mockResolvedValue(genders([['a', 'Male'], ['b', 'Female']]));
    const { result, rerender } = setup(fetcher, { enabled: true, inst: 'i1', ids: ['a', 'b'] });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // Same ids in a new array (re-created roster array): no call.
    rerender({ enabled: true, inst: 'i1', ids: ['a', 'b'] });
    // Narrowed to a subset (practical batch): no call, stale id dropped.
    rerender({ enabled: true, inst: 'i1', ids: ['b'] });
    // Order switched away and back: no call.
    rerender({ enabled: false, inst: 'i1', ids: ['b'] });
    rerender({ enabled: true, inst: 'i1', ids: ['b'] });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('ready');
    expect([...result.current.genders.keys()]).toEqual(['b']);
  });

  it('fetches only the missing ids when the roster grows', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(genders([['a', 'Male']]))
      .mockResolvedValueOnce(genders([['b', 'Female']]));
    const { result, rerender } = setup(fetcher, { enabled: true, inst: 'i1', ids: ['a'] });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ enabled: true, inst: 'i1', ids: ['a', 'b'] });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenLastCalledWith('i1', ['b']);
    await waitFor(() => expect(result.current.genders.get('b')).toBe('Female'));
    expect(result.current.genders.get('a')).toBe('Male');
  });

  it('is unavailable when the lookup returns nothing (failure / timeout)', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Map());
    const { result } = setup(fetcher, { enabled: true, inst: 'i1', ids: ['a'] });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.genders.size).toBe(0);
  });

  it('is unavailable when the lookup rejects', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = setup(fetcher, { enabled: true, inst: 'i1', ids: ['a'] });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });
});
