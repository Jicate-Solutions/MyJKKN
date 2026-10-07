// @vitest-environment jsdom
/**
 * Learners — the browser must call the account routes same-origin.
 *
 * Deleting a learner calls DELETE /api/users/{id}, and moving a learner into
 * or out of "exited" calls PATCH /api/users/manage-auth. Both routes read the
 * caller's session from cookies and answer 401 without one. Production lives
 * at https://www.jkkn.ai and https://jkkn.ai only redirects there, so a
 * configured site URL of the bare domain would make these calls cross-origin
 * and the sign-in cookie would not travel. In the browser each call must be
 * the relative path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const PROFILE_ID = '22222222-2222-4222-8222-222222222222';

// One chainable query builder: `.maybeSingle()` finds the learner's login
// profile, and every awaited delete chain succeeds.
function queryBuilder() {
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    is: vi.fn(() => b),
    delete: vi.fn(() => b),
    maybeSingle: vi.fn(() => Promise.resolve({ data: { id: PROFILE_ID }, error: null })),
    then: (resolve: any, reject: any) =>
      Promise.resolve({ data: null, error: null }).then(resolve, reject),
  };
  return b;
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ from: () => queryBuilder() }),
}));

import { LearnerProfileService } from '@/lib/services/learner-profile-service';

const LEARNER_ID = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'learner@jkkn.ac.in';

const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true }),
    text: () => Promise.resolve(''),
  } as any)
);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://jkkn.ai');
  vi.spyOn(LearnerProfileService, 'getLearnerProfile').mockResolvedValue({
    id: LEARNER_ID,
    college_email: EMAIL,
  } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('LearnerProfileService account calls in the browser', () => {
  it('deletes the learner login by the relative path', async () => {
    await LearnerProfileService.deleteLearnerProfile(LEARNER_ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/users/${PROFILE_ID}`);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE');
  });

  it('disables the login by the relative path', async () => {
    await (LearnerProfileService as any).disableUserAccount(EMAIL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/users/manage-auth');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).action).toBe('disable');
  });

  it('enables the login by the relative path', async () => {
    await (LearnerProfileService as any).enableUserAccount(EMAIL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/users/manage-auth');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).action).toBe('enable');
  });
});

describe('LearnerProfileService account calls outside the browser', () => {
  it('uses the configured site URL', async () => {
    vi.stubGlobal('window', undefined);
    await (LearnerProfileService as any).disableUserAccount(EMAIL);
    await (LearnerProfileService as any).enableUserAccount(EMAIL);
    await LearnerProfileService.deleteLearnerProfile(LEARNER_ID);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://jkkn.ai/api/users/manage-auth',
      'https://jkkn.ai/api/users/manage-auth',
      `https://jkkn.ai/api/users/${PROFILE_ID}`,
    ]);
  });
});
