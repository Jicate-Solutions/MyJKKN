/**
 * A salary package may only be fixed AFTER the full approval chain completes.
 *
 * Director's ruling, 2026-08-28. Before it, `approvePackage` accepted a
 * candidate in 'pending_approval' and flipped them to 'package_fixed' — a
 * status `approveCandidate` refuses, so the final approver could never record
 * their decision. One real hire (Sabari V S) sat frozen at the super-admin
 * step for four days.
 *
 * These tests live under __tests__/lib/ deliberately: the `Lib unit suite`
 * gate runs `__tests__/lib/` only, so a copy under __tests__/hr/ would never
 * execute in CI and this guard would be unenforced.
 */
import { describe, it, expect } from 'vitest';
import { RecruitmentPackageService } from '@/lib/services/hr/recruitment-package-service';

type Op = { fn: string; args: unknown[] };
type Call = { table: string; ops: Op[] };

const CANDIDATE_ID = 'cand-1';
const PACKAGE_ID = 'pkg-1';

/** Minimal chainable stand-in for the PostgREST query builder. */
function makeSupabase(parentStatus: string) {
  const calls: Call[] = [];

  const resolve = (table: string, ops: Op[]) => {
    const isUpdate = ops.some((o) => o.fn === 'update');
    if (table === 'hr_recruitment_candidate_packages') {
      return isUpdate
        ? { data: { id: PACKAGE_ID, status: 'approved', candidate_id: CANDIDATE_ID }, error: null }
        : { data: { id: PACKAGE_ID, status: 'proposed', candidate_id: CANDIDATE_ID }, error: null };
    }
    return isUpdate
      ? { data: [{ id: CANDIDATE_ID }], error: null }
      : { data: { status: parentStatus }, error: null };
  };

  const from = (table: string) => {
    const ops: Op[] = [];
    calls.push({ table, ops });
    const b: Record<string, unknown> = {};
    for (const fn of ['select', 'eq', 'in', 'update', 'neq', 'order', 'limit']) {
      b[fn] = (...args: unknown[]) => { ops.push({ fn, args }); return b; };
    }
    b.single = async () => resolve(table, ops);
    b.maybeSingle = async () => resolve(table, ops);
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve(resolve(table, ops)).then(ok, bad);
    return b;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: { from } as any, calls };
}

const packageWrites = (calls: Call[]) =>
  calls.filter((c) => c.table === 'hr_recruitment_candidate_packages' && c.ops.some((o) => o.fn === 'update'));

const candidateWrites = (calls: Call[]) =>
  calls.filter((c) => c.table === 'hr_recruitment_candidates' && c.ops.some((o) => o.fn === 'update'));

describe('approvePackage — package may only be fixed after full approval', () => {
  it('REFUSES a candidate still mid-chain, and says why', async () => {
    const { supabase, calls } = makeSupabase('pending_approval');

    await expect(
      RecruitmentPackageService.approvePackage(supabase, PACKAGE_ID, 'approver-1')
    ).rejects.toThrow(/Every approver must sign off first/);

    // The refusal must be explicit AND must happen before anything is written.
    expect(packageWrites(calls)).toHaveLength(0);
    expect(candidateWrites(calls)).toHaveLength(0);
  });

  it('REFUSES a candidate that was only submitted', async () => {
    const { supabase, calls } = makeSupabase('submitted');
    await expect(
      RecruitmentPackageService.approvePackage(supabase, PACKAGE_ID, 'approver-1')
    ).rejects.toThrow(/still in status 'submitted'/);
    expect(packageWrites(calls)).toHaveLength(0);
  });

  it('ALLOWS it once the chain is complete, and advances the candidate', async () => {
    const { supabase, calls } = makeSupabase('approved');

    const result = await RecruitmentPackageService.approvePackage(supabase, PACKAGE_ID, 'approver-1');
    expect(result.status).toBe('approved');

    const advanced = candidateWrites(calls);
    expect(advanced).toHaveLength(1);
    const payload = advanced[0].ops.find((o) => o.fn === 'update')?.args[0];
    expect(payload).toEqual({ status: 'package_fixed' });
  });

  it('ALLOWS a revised package on a candidate already at package_fixed, without moving them', async () => {
    // package_fixed sits DOWNSTREAM of approved in the transition map, so such a
    // candidate has completed every approval. Refusing them blocked real hires:
    // SARANYA R and Anand V both sit there with a further proposed package.
    const { supabase, calls } = makeSupabase('package_fixed');

    const result = await RecruitmentPackageService.approvePackage(supabase, PACKAGE_ID, 'approver-1');
    expect(result.status).toBe('approved');

    // The package is approved, but the candidate must NOT be written to at all.
    expect(packageWrites(calls)).toHaveLength(1);
    expect(candidateWrites(calls)).toHaveLength(0);
  });

  it('does NOT drag an offer_issued candidate BACKWARDS to package_fixed', async () => {
    // Writing status unconditionally would regress them through the transition
    // map. The old `.in(...)` filter prevented this as a side effect.
    const { supabase, calls } = makeSupabase('offer_issued');

    await RecruitmentPackageService.approvePackage(supabase, PACKAGE_ID, 'approver-1');
    expect(candidateWrites(calls)).toHaveLength(0);
  });

  // The DB CHECK on hr_recruitment_candidates.status permits exactly ten values:
  // submitted · pending_approval · approved · package_fixed · offer_issued ·
  // joined · rejected · withdrawn · offer_rescinded · no_show.
  //
  // The guard refuses the two meaning the chain has not finished. The four
  // terminal-negative ones pass through and change nothing — the same OUTCOME
  // the pre-guard code produced, though by a different route: it issued an
  // UPDATE filtered `.in(['approved','pending_approval','submitted'])` which
  // matched no row, where this issues no call at all. Effect identical, call
  // count not — so these assert the effect, which is what matters.
  //
  // Whether a package should be approvable AT ALL for a rejected or withdrawn
  // candidate is a real open question. It is deliberately left as-is here
  // rather than changed under cover of a regression fix; these tests pin the
  // current answer so any future change to it is a conscious one.
  for (const terminal of ['rejected', 'withdrawn', 'offer_rescinded', 'no_show']) {
    it(`leaves a ${terminal} candidate untouched — package approved, no candidate write, no throw`, async () => {
      const { supabase, calls } = makeSupabase(terminal);
      const result = await RecruitmentPackageService.approvePackage(supabase, PACKAGE_ID, 'approver-1');
      expect(result.status).toBe('approved');
      expect(packageWrites(calls)).toHaveLength(1);
      expect(candidateWrites(calls)).toHaveLength(0);
    });
  }

  it('joined and offer_issued are likewise left untouched', async () => {
    for (const st of ['joined', 'offer_issued']) {
      const { supabase, calls } = makeSupabase(st);
      await RecruitmentPackageService.approvePackage(supabase, PACKAGE_ID, 'approver-1');
      expect(candidateWrites(calls), `${st} must not be written`).toHaveLength(0);
    }
  });

  it('does NOT filter the candidate UPDATE on status (PostgREST RETURNING trap)', async () => {
    // PostgREST re-applies request filters to an UPDATE's RETURNING projection.
    // Filtering on `status` while writing `status` makes the row update itself
    // out of its own response body: the write commits, the caller sees [], and
    // the caller then reports a false failure. That exact pattern silently
    // broke meeting booking for months (#3126). Keep the filter on `id` only.
    const { supabase, calls } = makeSupabase('approved');
    await RecruitmentPackageService.approvePackage(supabase, PACKAGE_ID, 'approver-1');

    const filters = candidateWrites(calls)[0].ops.filter((o) => o.fn === 'eq' || o.fn === 'in');
    expect(filters.length).toBeGreaterThan(0);
    for (const f of filters) {
      expect(f.args[0]).not.toBe('status');
    }
  });
});
