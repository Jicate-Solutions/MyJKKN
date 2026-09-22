import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';

/**
 * promoteJobApplication used to derive the candidate's `source` from
 * applicant_user_id alone. Website applicants have no account, so every one of
 * them would have been labelled an HR submission. `source` on the application
 * row is now the primary signal; the user-id path stays for the internal wizard.
 */

function fakeDb(application: Record<string, unknown>) {
  const terminal = (data: unknown) => ({
    eq: () => terminal(data), select: () => terminal(data),
    single: async () => ({ data, error: null }), maybeSingle: async () => ({ data, error: null }),
  });
  return {
    from: () => ({
      select: () => terminal(application),
      update: (p: Record<string, unknown>) => terminal({ ...application, ...p }),
    }),
  } as never;
}

const BASE = {
  id: 'app-1', status: 'shortlisted', promoted_candidate_id: null, institution_id: 'i1',
  first_name: 'Priya', last_name: 'R', email: 'p@x.com', phone: '9876543210', resume_url: 'u',
  qualification: 'M.Pharm', experience_months: 24,
  job: { id: 'j1', title: 'Lab Assistant', role_category: 'non_teaching', institution_id: 'i1', hr_organization_id: 'o1' },
};

describe('promoteJobApplication — candidate source', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    [{ source: 'external_website', applicant_user_id: null }, 'public_careers_page'],
    [{ source: 'internal', applicant_user_id: 'u1' }, 'public_careers_page'],
    [{ source: 'internal', applicant_user_id: null }, 'hr_submission'],
  ])('%o → %s', async (patch, expected) => {
    const spy = vi.spyOn(RecruitmentService, 'submitCandidate').mockResolvedValue({ id: 'c1' } as never);
    await RecruitmentService.promoteJobApplication(fakeDb({ ...BASE, ...patch }), 'app-1', 'hr-1');
    expect((spy.mock.calls[0][1] as { source: string }).source).toBe(expected);
  });
});
