/**
 * HR scope gate — the application-side twin of the hr_scope_gate policies.
 *
 * The property under test in every case: an out-of-scope read is REFUSED with
 * HrScopeError (→ 403), never answered with an empty result. RLS on its own
 * returns zero rows for a read it denies, and zero rows reads as "nothing
 * here" — the gate exists so the leak is reported, not hidden.
 *
 * The predicates themselves live in Postgres (SECURITY DEFINER RPCs); these
 * tests fake the RPC answers and check what the gate does with them.
 */

import { describe, expect, it } from 'vitest';

import {
  HrScopeError,
  assertCandidatePackagesInScope,
  assertHrOrganizationInScope,
  assertInstitutionInHrScope,
  isOwnStaffRecord,
} from '@/lib/hr/scope-gate';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INST_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const READER = '11111111-1111-4111-8111-111111111111';
const SOMEONE_ELSE = '22222222-2222-4222-8222-222222222222';
const STAFF_ME = '33333333-3333-4333-8333-333333333333';
const CANDIDATE = '44444444-4444-4444-8444-444444444444';
const PACKAGE = '55555555-5555-4555-8555-555555555555';

type RpcAnswers = Record<string, { data?: unknown; error?: { message: string } | null }>;

/** A caller's session: every RPC answers from the table given. */
function readerClient(answers: RpcAnswers) {
  return {
    rpc: async (name: string) => {
      const a = answers[name];
      if (!a) throw new Error(`unexpected rpc ${name}`);
      return { data: a.data ?? null, error: a.error ?? null };
    },
  } as any;
}

/** The service-role client: one candidate row and one package row, by id. */
function adminClient(rows: { candidate?: Record<string, unknown> | null; pkg?: Record<string, unknown> | null }) {
  return {
    from: (table: string) => {
      const row =
        table === 'hr_recruitment_candidates' ? rows.candidate ?? null
        : table === 'hr_recruitment_candidate_packages' ? rows.pkg ?? null
        : null;
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: row, error: null }),
      };
      return chain;
    },
  } as any;
}

const ownScopedAt = (orgs: string[]) =>
  readerClient({
    is_super_admin: { data: false },
    fn_my_hr_organization_ids: { data: orgs },
  });

describe('assertInstitutionInHrScope', () => {
  it('refuses an institution role_has_institution_access says no to', async () => {
    const supabase = readerClient({ role_has_institution_access: { data: false } });
    await expect(assertInstitutionInHrScope(supabase, INST_B)).rejects.toBeInstanceOf(HrScopeError);
  });

  it('lets an in-scope institution through', async () => {
    const supabase = readerClient({ role_has_institution_access: { data: true } });
    await expect(assertInstitutionInHrScope(supabase, INST_B)).resolves.toBeUndefined();
  });

  it('treats NULL as system-wide, as role_has_institution_access(NULL) does', async () => {
    const supabase = readerClient({});
    await expect(assertInstitutionInHrScope(supabase, null)).resolves.toBeUndefined();
  });

  it('fails CLOSED when the RPC errors', async () => {
    const supabase = readerClient({ role_has_institution_access: { error: { message: 'boom' } } });
    await expect(assertInstitutionInHrScope(supabase, INST_B)).rejects.toBeInstanceOf(HrScopeError);
  });

  it('carries 403 so a route can answer with it', async () => {
    const supabase = readerClient({ role_has_institution_access: { data: false } });
    const err = await assertInstitutionInHrScope(supabase, INST_B).catch((e) => e);
    expect(err.status).toBe(403);
  });
});

describe('assertHrOrganizationInScope', () => {
  it("refuses an organisation outside fn_my_hr_organization_ids — college A's admin asking for college B", async () => {
    await expect(assertHrOrganizationInScope(ownScopedAt([ORG_A]), ORG_B)).rejects.toBeInstanceOf(HrScopeError);
  });

  it('lets an included organisation through', async () => {
    await expect(assertHrOrganizationInScope(ownScopedAt([ORG_A, ORG_B]), ORG_B)).resolves.toBeUndefined();
  });

  it('never confines a super admin', async () => {
    const supabase = readerClient({ is_super_admin: { data: true } });
    await expect(assertHrOrganizationInScope(supabase, ORG_B)).resolves.toBeUndefined();
  });

  it('fails CLOSED when the organisation list cannot be read', async () => {
    const supabase = readerClient({
      is_super_admin: { data: false },
      fn_my_hr_organization_ids: { error: { message: 'boom' } },
    });
    await expect(assertHrOrganizationInScope(supabase, ORG_B)).rejects.toBeInstanceOf(HrScopeError);
  });
});

describe('isOwnStaffRecord', () => {
  it('recognises the caller’s own staff row', async () => {
    const supabase = readerClient({ fn_my_staff_ids: { data: [STAFF_ME] } });
    expect(await isOwnStaffRecord(supabase, STAFF_ME)).toBe(true);
    expect(await isOwnStaffRecord(supabase, SOMEONE_ELSE)).toBe(false);
  });
});

describe('assertCandidatePackagesInScope', () => {
  const candidateAtB = { id: CANDIDATE, hr_organization_id: ORG_B, submitted_by: SOMEONE_ELSE };

  it("is a 403, not an empty list: college A's admin asking for college B's candidate", async () => {
    await expect(
      assertCandidatePackagesInScope({
        admin: adminClient({ candidate: candidateAtB }),
        supabase: ownScopedAt([ORG_A]),
        userId: READER,
        candidateId: CANDIDATE,
      })
    ).rejects.toBeInstanceOf(HrScopeError);
  });

  it('is ok for a reader whose scope includes the candidate’s organisation', async () => {
    await expect(
      assertCandidatePackagesInScope({
        admin: adminClient({ candidate: candidateAtB }),
        supabase: ownScopedAt([ORG_B]),
        userId: READER,
        candidateId: CANDIDATE,
      })
    ).resolves.toBe('ok');
  });

  it('is not_found for a candidate that does not exist — no scope question is asked', async () => {
    await expect(
      assertCandidatePackagesInScope({
        admin: adminClient({ candidate: null }),
        supabase: readerClient({}),
        userId: READER,
        candidateId: CANDIDATE,
      })
    ).resolves.toBe('not_found');
  });

  it('honours the submitter identity path the policy repeats', async () => {
    await expect(
      assertCandidatePackagesInScope({
        admin: adminClient({ candidate: { ...candidateAtB, submitted_by: READER } }),
        supabase: readerClient({}),
        userId: READER,
        candidateId: CANDIDATE,
      })
    ).resolves.toBe('ok');
  });

  it('honours the proposer identity path on a single package', async () => {
    await expect(
      assertCandidatePackagesInScope({
        admin: adminClient({
          candidate: candidateAtB,
          pkg: { id: PACKAGE, candidate_id: CANDIDATE, proposed_by: READER, approved_by: null },
        }),
        supabase: readerClient({}),
        userId: READER,
        candidateId: CANDIDATE,
        packageId: PACKAGE,
      })
    ).resolves.toBe('ok');
  });

  it('still refuses a single package the reader neither proposed nor approved, outside scope', async () => {
    await expect(
      assertCandidatePackagesInScope({
        admin: adminClient({
          candidate: candidateAtB,
          pkg: { id: PACKAGE, candidate_id: CANDIDATE, proposed_by: SOMEONE_ELSE, approved_by: null },
        }),
        supabase: ownScopedAt([ORG_A]),
        userId: READER,
        candidateId: CANDIDATE,
        packageId: PACKAGE,
      })
    ).rejects.toBeInstanceOf(HrScopeError);
  });

  it('is not_found when the package is not this candidate’s', async () => {
    await expect(
      assertCandidatePackagesInScope({
        admin: adminClient({
          candidate: candidateAtB,
          pkg: { id: PACKAGE, candidate_id: SOMEONE_ELSE, proposed_by: READER, approved_by: null },
        }),
        supabase: readerClient({}),
        userId: READER,
        candidateId: CANDIDATE,
        packageId: PACKAGE,
      })
    ).resolves.toBe('not_found');
  });
});
