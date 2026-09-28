import { describe, it, expect, vi } from 'vitest';

// The hook module imports the browser Supabase client and sonner at module
// load; stub them so the pure guard can be tested without React or env vars.
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  assertPolicyRowUpdated,
  NO_POLICY_ROW_MESSAGE,
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
