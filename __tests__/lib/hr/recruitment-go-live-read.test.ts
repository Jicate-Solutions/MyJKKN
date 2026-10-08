import { describe, it, expect, vi } from 'vitest';

// harness-run.ts imports the notification sender; nothing here sends.
vi.mock('@/lib/services/_shared/notifications/notify', () => ({ fanoutNotification: vi.fn() }));

import { readGoLiveAt } from '@/lib/hr/recruitment/harness-run';
import { GO_LIVE_POLICY_KEY } from '@/lib/hr/recruitment/harness-selection';

// A tiny fake of the Supabase client: one canned answer for platform_policies.
type Answer = { data: unknown; error: unknown } | 'throw';

function fakeDb(answer: Answer) {
  const filters: Record<string, unknown> = {};
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return q;
    },
    is: (col: string, val: unknown) => {
      filters[col] = val;
      return q;
    },
    maybeSingle: async () => {
      if (answer === 'throw') throw new Error('network down');
      return answer;
    },
  };
  return { db: { from: () => q } as any, filters };
}

const NOW = new Date('2026-10-10T04:00:00Z');

describe('readGoLiveAt — the go-live cutoff as the scheduled run reads it', () => {
  it('returns the stored moment, read from the global active row', async () => {
    const { db, filters } = fakeDb({ data: { value: '2026-10-07T10:55:12+00:00' }, error: null });
    expect((await readGoLiveAt(db, NOW)).toISOString()).toBe('2026-10-07T10:55:12.000Z');
    expect(filters).toEqual({ policy_key: GO_LIVE_POLICY_KEY, scope_type: 'global', scope_id: null, is_active: true });
  });

  it('(c) fails closed to NOW when the row is missing, unreadable, errors or throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cases: Answer[] = [
      { data: null, error: null },
      { data: { value: 'yesterday-ish' }, error: null },
      { data: { value: 1728300000 }, error: null },
      { data: null, error: { message: 'permission denied' } },
      'throw',
    ];
    for (const a of cases) {
      expect(await readGoLiveAt(fakeDb(a).db, NOW)).toEqual(NOW);
    }
  });
});
