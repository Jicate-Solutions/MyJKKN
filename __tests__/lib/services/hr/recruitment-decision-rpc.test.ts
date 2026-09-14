/**
 * Approving a candidate must not depend on `hr.recruitment.edit`.
 *
 * `approveCandidate` used to authorize the approver in TypeScript and then write
 * through the caller's own RLS-bound client. The UPDATE policy on
 * hr_recruitment_candidates requires `hr.recruitment.edit`, which the approver
 * roles `hod`, `board` and `medical_superintendent` do not hold — they hold
 * `hr.recruitment.approve` only. The policy matched zero rows, `.single()` raised
 * PGRST116, and the route reported "Unknown error". Every teaching_faculty chain
 * opens on a `hod` step, so in production no HOD had ever approved a candidate:
 * all 30 decided `hod` steps were the COO or a super admin using the override.
 *
 * The guard is structural — the decision must travel through the SECURITY DEFINER
 * RPC `fn_decide_recruitment_candidate` and must never issue a table UPDATE, since
 * a table UPDATE is exactly what the policy blocks.
 *
 * Lives under __tests__/lib/ deliberately: the `Lib unit suite` gate runs
 * `__tests__/lib/` only, so a copy elsewhere would never execute in CI.
 */
import { describe, it, expect } from 'vitest';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';

const CANDIDATE_ID = 'cand-1';
const HOD_ID = 'hod-user-1';

type RpcCall = { name: string; args: Record<string, unknown> };

/**
 * Stand-in client that records rpc() calls and fails loudly on any `from()` —
 * reaching the query builder at all means we are back on the blocked path.
 */
function makeSupabase(rpcResult: { data: unknown; error: unknown } = {
  data: { id: CANDIDATE_ID, status: 'pending_approval', current_step: 1 },
  error: null,
}) {
  const rpcCalls: RpcCall[] = [];
  const supabase = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return rpcResult;
    },
    from: (table: string) => {
      throw new Error(`unexpected table access: ${table}`);
    },
  } as unknown as Parameters<typeof RecruitmentService.approveCandidate>[0];
  return { supabase, rpcCalls };
}

describe('RecruitmentService.approveCandidate', () => {
  it('decides through the SECURITY DEFINER RPC, never a table UPDATE', async () => {
    const { supabase, rpcCalls } = makeSupabase();

    await RecruitmentService.approveCandidate(supabase, CANDIDATE_ID, HOD_ID, 'looks good');

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe('fn_decide_recruitment_candidate');
    expect(rpcCalls[0].args).toEqual({
      p_candidate_id: CANDIDATE_ID,
      p_decision: 'approve',
      p_comment: 'looks good',
    });
  });

  it('sends an explicit null when the approver left no comment', async () => {
    const { supabase, rpcCalls } = makeSupabase();

    await RecruitmentService.approveCandidate(supabase, CANDIDATE_ID, HOD_ID);

    expect(rpcCalls[0].args.p_comment).toBeNull();
  });

  it('surfaces the function\'s own refusal text instead of swallowing it', async () => {
    // A PostgrestError is a plain object, not an Error instance — the shape that
    // used to reach the route and become "Unknown error".
    const refusal = {
      code: '42501',
      message: 'This step is assigned to a specific approver and can only be actioned by them.',
    };
    const { supabase } = makeSupabase({ data: null, error: refusal });

    await expect(
      RecruitmentService.approveCandidate(supabase, CANDIDATE_ID, HOD_ID)
    ).rejects.toMatchObject({ code: '42501', message: refusal.message });
  });
});

describe('RecruitmentService.rejectCandidate', () => {
  it('decides through the same RPC, carrying the reason as the comment', async () => {
    const { supabase, rpcCalls } = makeSupabase({
      data: { id: CANDIDATE_ID, status: 'rejected' },
      error: null,
    });

    await RecruitmentService.rejectCandidate(supabase, CANDIDATE_ID, HOD_ID, 'not a fit');

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe('fn_decide_recruitment_candidate');
    expect(rpcCalls[0].args).toEqual({
      p_candidate_id: CANDIDATE_ID,
      p_decision: 'reject',
      p_comment: 'not a fit',
    });
  });
});
