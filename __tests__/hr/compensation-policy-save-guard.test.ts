import { describe, it, expect, vi } from 'vitest';

// The hook module imports the browser Supabase client and sonner at module
// load; stub them so the pure guard can be tested without React or env vars.
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  assertPolicyRowUpdated,
  updatePolicyRow,
  NO_POLICY_ROW_MESSAGE,
  STALE_POLICY_MESSAGE,
  NOT_ALLOWED_POLICY_MESSAGE,
  NOT_SAVED_UNKNOWN_MESSAGE,
  PAY_SCALE_INSTITUTIONS,
  COMPENSATION_INSTITUTIONS,
} from '@/hooks/admin/use-hr-compensation-policies';

describe('assertPolicyRowUpdated — a save that matched no row is a failure', () => {
  it('throws the plain-English message when zero rows were updated', () => {
    expect(() => assertPolicyRowUpdated([])).toThrow(NO_POLICY_ROW_MESSAGE);
    expect(NO_POLICY_ROW_MESSAGE).toBe(
      'No policy row exists for this college yet, so nothing was saved. Ask an administrator to create it.'
    );
  });

  it('passes when one row was updated', () => {
    expect(() => assertPolicyRowUpdated([{ policy_key: 'hr.pay_scales' }])).not.toThrow();
  });

  it('throws when the response carries no data at all', () => {
    expect(() => assertPolicyRowUpdated(null)).toThrow(NO_POLICY_ROW_MESSAGE);
    expect(() => assertPolicyRowUpdated(undefined)).toThrow(NO_POLICY_ROW_MESSAGE);
  });
});

describe('institution lists', () => {
  it('pay-scale list adds Arts & Science without changing the shared list', () => {
    expect(PAY_SCALE_INSTITUTIONS.map((i) => i.id)).toEqual([
      '5de4fba1-4564-41ed-8c73-5d948b74b843',
      'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5',
      'b0b8a724-7c65-4f07-8047-2a38e8100ad5',
    ]);
    expect(COMPENSATION_INSTITUTIONS).toHaveLength(2);
  });
});

// A stand-in for the browser client's UPDATE chain: records every filter and
// answers with the rows a real row would match under those filters.
function fakeClient(row: { updated_at: string | null } | null) {
  const filters: Array<[string, string, unknown]> = [];
  const builder = {
    update: vi.fn(() => builder),
    eq: vi.fn((col: string, val: unknown) => {
      filters.push(['eq', col, val]);
      return builder;
    }),
    is: vi.fn((col: string, val: unknown) => {
      filters.push(['is', col, val]);
      return builder;
    }),
    select: vi.fn(async () => {
      const lock = filters.find(([, col]) => col === 'updated_at');
      const matches =
        row !== null && (!lock || lock[2] === row.updated_at);
      return {
        data: matches ? [{ policy_key: 'hr.pay_scales', updated_at: 'NEW' }] : [],
        error: null,
      };
    }),
  };
  const client = { from: vi.fn(() => builder) } as unknown as Parameters<typeof updatePolicyRow>[0];
  return { client, filters, builder };
}

const ENG = '5de4fba1-4564-41ed-8c73-5d948b74b843';
const LOADED = '2026-10-08T10:00:00.123+00:00';

describe('updatePolicyRow — two people saving the same college', () => {
  it('refuses a stale save: the row changed after the screen loaded it', async () => {
    const { client, filters } = fakeClient({ updated_at: '2026-10-08T10:05:00.000+00:00' });
    const readSaved = async () => ({ exists: true, updatedAt: '2026-10-08T10:05:00.000+00:00' });
    await expect(
      updatePolicyRow(client, 'hr.pay_scales', ENG, { pay_matrix: [] }, LOADED, readSaved)
    ).rejects.toThrow(STALE_POLICY_MESSAGE);
    expect(filters).toContainEqual(['eq', 'updated_at', LOADED]);
    expect(STALE_POLICY_MESSAGE).toBe(
      'Someone else just changed the pay scales. Reload and try again; nothing you entered here was saved.'
    );
  });

  it('saves when the row is still as loaded, and returns the new updated_at', async () => {
    const { client } = fakeClient({ updated_at: LOADED });
    await expect(
      updatePolicyRow(client, 'hr.pay_scales', ENG, { pay_matrix: [] }, LOADED)
    ).resolves.toBe('NEW');
  });

  it('locks a row that never had an updated_at with IS NULL', async () => {
    const { client, filters } = fakeClient({ updated_at: null });
    await expect(
      updatePolicyRow(client, 'hr.pay_scales', ENG, { pay_matrix: [] }, null)
    ).resolves.toBe('NEW');
    expect(filters).toContainEqual(['is', 'updated_at', null]);
  });

  it('a write the database refused for this account is reported as a refusal, not as someone else\'s save', async () => {
    // RLS filters a refused UPDATE to zero rows with no error. The row is
    // still exactly as loaded, so nobody else changed it.
    const { client } = fakeClient(null);
    const readSaved = vi.fn(async () => ({ exists: true, updatedAt: '2026-10-08T10:00:00.123Z' }));
    await expect(
      updatePolicyRow(client, 'hr.pay_scales', ENG, { pay_matrix: [] }, LOADED, readSaved)
    ).rejects.toThrow(NOT_ALLOWED_POLICY_MESSAGE);
    expect(readSaved).toHaveBeenCalledWith('hr.pay_scales', ENG);
  });

  it('a locked save on a row that no longer exists says so', async () => {
    const { client } = fakeClient(null);
    await expect(
      updatePolicyRow(client, 'hr.pay_scales', ENG, { pay_matrix: [] }, LOADED, async () => ({ exists: false, updatedAt: null }))
    ).rejects.toThrow(NO_POLICY_ROW_MESSAGE);
  });

  it('when the row cannot be re-read, it says the cause is unknown instead of guessing', async () => {
    const { client } = fakeClient(null);
    await expect(
      updatePolicyRow(client, 'hr.pay_scales', ENG, { pay_matrix: [] }, LOADED, async () => {
        throw new Error('offline');
      })
    ).rejects.toThrow(NOT_SAVED_UNKNOWN_MESSAGE);
  });

  it('without a lock writes unconditionally and still reports a missing row', async () => {
    const { client, filters } = fakeClient(null);
    await expect(
      updatePolicyRow(client, 'hr.allowances_and_increments', ENG, {})
    ).rejects.toThrow(NO_POLICY_ROW_MESSAGE);
    expect(filters.some(([, col]) => col === 'updated_at')).toBe(false);
  });
});
