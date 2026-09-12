// Two failures that only appear at the seam between a merge and a migration,
// and one that only appears when a read is REFUSED rather than empty.
//
// 1. THE MIGRATION IS NOT APPLIED YET. Migrations in this repo ship as files and
//    are applied separately, so there is a window in which the code calling
//    fn_cohort_status_control is live and the function does not exist. PostgREST
//    answers PGRST202 ("Could not find the function public.fn_cohort_status_control
//    in the schema cache"). getStatusControl used to throw that straight through,
//    and BatchStatusCard renders for EVERY viewer who selects a batch — including
//    the School of Influencer learner-members — so the amber panel showed them a
//    raw database message about a missing function. The window is the normal
//    state of a merged-but-unapplied PR, not an edge case.
//
// 2. A REFUSED LIST READ IS NOT AN EMPTY LIST. getCohortsByKind swallowed every
//    error into `[]`, which turns "you may not read this" into "there is nothing
//    here" — the two are indistinguishable on screen and only one of them is
//    true (CLAUDE.md rule 27). Every caller has a catch; none of them could ever
//    reach it.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: vi.fn(() => (globalThis as any).__cohortClient),
}));

/** A client whose .rpc() answers with `result`. */
function rpcClient(result: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn(async () => result),
    from: vi.fn(),
  };
}

/** A client whose table read answers with `result` through the usual chain. */
function tableClient(result: { data?: unknown; error?: unknown }) {
  const builder: any = {};
  for (const m of ['select', 'eq', 'order']) builder[m] = vi.fn(() => builder);
  builder.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return { from: vi.fn(() => builder), rpc: vi.fn() };
}

async function loadService() {
  vi.resetModules();
  return (await import('@/lib/services/cohort-core/cohort-service')).CohortService;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getStatusControl when the migration has not been applied', () => {
  // The exact shape PostgREST returns for a function it cannot find.
  const PGRST202 = {
    code: 'PGRST202',
    message:
      'Could not find the function public.fn_cohort_status_control(p_cohort_id) in the schema cache',
    details: null,
    hint: null,
  };

  it('renders the read-only state instead of throwing the PostgREST message', async () => {
    (globalThis as any).__cohortClient = rpcClient({ data: null, error: PGRST202 });
    const CohortService = await loadService();

    const control = await CohortService.getStatusControl('cohort-1');

    expect(control).toEqual({
      canChange: false,
      status: null,
      nextStatuses: [],
      history: [],
    });
  });

  it('still logs the real cause, so an engineer can see why the control is inert', async () => {
    (globalThis as any).__cohortClient = rpcClient({ data: null, error: PGRST202 });
    const CohortService = await loadService();

    await CohortService.getStatusControl('cohort-1');

    const logged = (console.error as any).mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(logged).toContain('20261115043000');
  });

  it('degrades on a proxy that drops the code but keeps the sentence', async () => {
    (globalThis as any).__cohortClient = rpcClient({
      data: null,
      error: { message: 'Could not find the function public.fn_cohort_status_control' },
    });
    const CohortService = await loadService();

    await expect(CohortService.getStatusControl('cohort-1')).resolves.toMatchObject({
      canChange: false,
    });
  });

  it('does NOT swallow a real refusal — 42501 still reaches the caller as a 403', async () => {
    (globalThis as any).__cohortClient = rpcClient({
      data: null,
      error: { code: '42501', message: 'You do not have permission to change this group’s stage.' },
    });
    const CohortService = await loadService();

    await expect(CohortService.getStatusControl('cohort-1')).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('getCohortsByKind on a refused read', () => {
  it('throws rather than returning an empty list', async () => {
    (globalThis as any).__cohortClient = tableClient({
      data: null,
      error: { code: '42501', message: 'permission denied for table cohorts' },
    });
    const CohortService = await loadService();

    await expect(CohortService.getCohortsByKind('school_of_influence')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('still returns the rows when the read succeeds', async () => {
    (globalThis as any).__cohortClient = tableClient({
      data: [{ id: 'a' }, { id: 'b' }],
      error: null,
    });
    const CohortService = await loadService();

    await expect(CohortService.getCohortsByKind('school_of_influence')).resolves.toHaveLength(2);
  });
});
