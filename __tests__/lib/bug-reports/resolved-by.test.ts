import { describe, it, expect, vi } from 'vitest';
import {
  isMissingResolvedByColumn,
  withoutResolvedBy,
  updateWithResolvedBy,
  resolvedByForStatus
} from '@/lib/api/bug-reports/resolved-by';

describe('resolvedByForStatus', () => {
  it('credits the acting user only when the bug is being resolved', () => {
    expect(resolvedByForStatus('resolved', 'user-1')).toBe('user-1');
  });

  it('clears the resolver for every other status, so a reopen keeps no stale name', () => {
    for (const status of ['new', 'seen', 'in_progress', 'wont_fix', 'duplicate']) {
      expect(resolvedByForStatus(status, 'user-1')).toBeNull();
    }
  });
});

describe('isMissingResolvedByColumn', () => {
  it('recognises the two shapes a pre-migration database answers with', () => {
    expect(isMissingResolvedByColumn({ code: '42703' })).toBe(true);
    expect(isMissingResolvedByColumn({ code: 'PGRST204' })).toBe(true);
    expect(
      isMissingResolvedByColumn({
        message: "column bug_reports.resolved_by does not exist"
      })
    ).toBe(true);
  });

  it('does not swallow unrelated failures', () => {
    expect(isMissingResolvedByColumn(null)).toBe(false);
    expect(isMissingResolvedByColumn({ code: '23503', message: 'foreign key violation' })).toBe(
      false
    );
    // A real permission error must NOT be retried as if the column were missing.
    expect(isMissingResolvedByColumn({ code: '42501', message: 'permission denied' })).toBe(false);
  });
});

describe('withoutResolvedBy', () => {
  it('drops only resolved_by', () => {
    expect(withoutResolvedBy({ status: 'resolved', resolved_at: 'x', resolved_by: 'u' })).toEqual({
      status: 'resolved',
      resolved_at: 'x'
    });
  });
});

describe('updateWithResolvedBy', () => {
  it('writes the resolver when the column exists', async () => {
    const run = vi.fn().mockResolvedValue({ data: { id: 'b1' }, error: null });
    const result = await updateWithResolvedBy({ status: 'resolved', resolved_by: 'u1' }, run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ status: 'resolved', resolved_by: 'u1' });
    expect(result.error).toBeNull();
  });

  it('retries without the column on a pre-migration database', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '42703' } })
      .mockResolvedValueOnce({ data: { id: 'b1' }, error: null });

    const result = await updateWithResolvedBy({ status: 'resolved', resolved_by: 'u1' }, run);

    expect(run).toHaveBeenNthCalledWith(2, { status: 'resolved' });
    expect(result.data).toEqual({ id: 'b1' });
    expect(result.error).toBeNull();
  });

  it('surfaces any other error instead of retrying', async () => {
    const run = vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } });
    const result = await updateWithResolvedBy({ status: 'resolved', resolved_by: 'u1' }, run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(result.error).toEqual({ code: '42501' });
  });
});
