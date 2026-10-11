/**
 * Command-palette search logging (the only browser writer of usage_events,
 * pinned by usage_events_insert_own in 20271011110000) must never surface an
 * error. The palette passes profile.institution_id, read straight from the
 * caller's own profiles row (hooks/use-auth-provider.tsx), so it matches the
 * policy; if that ever goes stale mid-session the INSERT is refused (42501) and
 * the call must still resolve quietly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn();
let rejectingInsert: null | (() => Promise<never>) = null;
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    from: () => ({ insert: (row: unknown) => (rejectingInsert ? rejectingInsert() : insert(row)) }),
  }),
}));

import { trackSearchAnalytics } from '@/lib/navigation/search-analytics';

const base = { userId: 'u1', query: 'fees', resultsCount: 3, selectedPath: '/billing' };

describe('trackSearchAnalytics', () => {
  beforeEach(() => insert.mockReset());

  it('writes a search event with the given institution (or NULL)', async () => {
    insert.mockResolvedValue({ error: null });
    await trackSearchAnalytics({ ...base, institutionId: 'inst-a' });
    await trackSearchAnalytics(base);
    expect(insert.mock.calls.map(([row]) => [row.user_id, row.event_type, row.institution_id])).toEqual([
      ['u1', 'search', 'inst-a'],
      ['u1', 'search', null],
    ]);
  });

  it('resolves quietly when RLS refuses the row (42501)', async () => {
    insert.mockResolvedValue({ error: { code: '42501', message: 'new row violates row-level security policy' } });
    await expect(trackSearchAnalytics({ ...base, institutionId: 'other-inst' })).resolves.toBeUndefined();
  });

  it('resolves quietly when the request itself fails', async () => {
    // Plain function, not vi.fn: observed under vitest 4.1, a rejection returned
    // by a vi.fn fails the test even though trackSearchAnalytics catches it.
    let calls = 0;
    rejectingInsert = () => {
      calls += 1;
      return Promise.reject(new TypeError('Failed to fetch'));
    };
    try {
      await expect(trackSearchAnalytics(base)).resolves.toBeUndefined();
      expect(calls).toBe(1);
    } finally {
      rejectingInsert = null;
    }
  });
});
