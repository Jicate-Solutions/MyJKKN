import { describe, expect, it, vi } from 'vitest';
import { fetchOwnerCandidates } from '@/lib/services/accreditation/owner-candidates';

describe('fetchOwnerCandidates', () => {
  it('reads the pool through the union RPC, never profiles.role alone', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'u1',
          full_name: 'KRISHNAN R',
          email: 'krishnan@jkkn.ac.in',
          role: 'digital_coordinator',
          institution_id: 'pharmacy'
        }
      ],
      error: null
    });

    const people = await fetchOwnerCandidates({ rpc });

    expect(rpc).toHaveBeenCalledWith('fn_accreditation_owner_candidates');
    // A primary role outside the eligible list must NOT exclude the person:
    // eligibility now comes from user_roles too, decided inside the RPC.
    expect(people.map((p) => p.full_name)).toEqual(['KRISHNAN R']);
  });

  it('propagates a permission refusal instead of returning an empty pool', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Not permitted' }
    });

    await expect(fetchOwnerCandidates({ rpc })).rejects.toMatchObject({
      code: '42501'
    });
  });

  it('treats a null payload as an empty pool', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    await expect(fetchOwnerCandidates({ rpc })).resolves.toEqual([]);
  });
});
