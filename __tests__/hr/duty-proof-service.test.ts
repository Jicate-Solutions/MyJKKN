// =====================================================================
// HR staff harness — proof of done (2): the service's second-check call
// =====================================================================
// Review round 6 on #4263:
//   - deploy order: until 20271008110105 is applied the six-argument
//     fn_hr_duty_proof_second_check does not exist. The service then makes
//     the five-argument call it replaced (the behaviour before that file),
//     so the app works whichever of the two ships first.
//   - "the amount changed" is SQLSTATE 55000 and "being changed right now"
//     is 55P03: both answer 409. 40001 is left to real serialization failures.
// =====================================================================

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DutyProofService, toDutyProofError } from '@/lib/services/hr/duty-proof-service';

const ITEM = '00000000-0000-4000-8000-000000000002';
const input = { duty: 'L4' as const, itemId: ITEM, result: 'confirmed' as const, expectedAmount: 7200 };

function fakeClient(...responses: Array<{ data: unknown; error: { code?: string; message?: string } | null }>) {
  const rpc = vi.fn();
  for (const r of responses) rpc.mockResolvedValueOnce(r);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('DutyProofService.recordSecondCheck — either deploy order', () => {
  it('sends the amount the checker was shown to the six-argument function', async () => {
    const { client, rpc } = fakeClient({ data: 'p1', error: null });
    await expect(DutyProofService.recordSecondCheck(client, input)).resolves.toBe('p1');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_item_id: ITEM, p_expected_amount: 7200 });
  });

  it.each(['PGRST202', '42883'])(
    'falls back to the five-argument call when the six-argument function is not there yet (%s)',
    async (code) => {
      const { client, rpc } = fakeClient(
        { data: null, error: { code, message: 'Could not find the function' } },
        { data: 'p2', error: null },
      );
      await expect(DutyProofService.recordSecondCheck(client, input)).resolves.toBe('p2');
      expect(rpc).toHaveBeenCalledTimes(2);
      expect(rpc.mock.calls[1][0]).toBe('fn_hr_duty_proof_second_check');
      expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_expected_amount');
      expect(rpc.mock.calls[1][1]).toMatchObject({ p_duty: 'L4', p_item_id: ITEM, p_result: 'confirmed' });
    },
  );

  it('does not fall back when the check is refused because the amount changed', async () => {
    const { client, rpc } = fakeClient(
      { data: null, error: { code: '55000', message: 'The amount changed after you opened this check.' } },
    );
    await expect(DutyProofService.recordSecondCheck(client, input)).rejects.toMatchObject({ status: 409 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('toDutyProofError', () => {
  it('answers 409 for "the amount changed" (55000) and "being changed right now" (55P03)', () => {
    expect(toDutyProofError({ code: '55000' }).status).toBe(409);
    expect(toDutyProofError({ code: '55P03' }).status).toBe(409);
  });

  it('does not treat a real serialization failure (40001) as "the amount changed"', () => {
    expect(toDutyProofError({ code: '40001' }).status).toBe(500);
  });
});
