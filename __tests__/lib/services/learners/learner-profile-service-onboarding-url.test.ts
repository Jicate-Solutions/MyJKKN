// @vitest-environment jsdom
/**
 * Learners — the browser must call POST /api/learners/complete-onboarding
 * same-origin.
 *
 * That route now refuses callers without a session. Production lives at
 * https://www.jkkn.ai, and https://jkkn.ai only redirects there, so a
 * configured site URL of the bare domain would make the call cross-origin
 * and the sign-in cookie would not travel: the "Ready to Activate" button
 * would get a 401. In the browser the call must be the relative path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function profilesLookupBuilder() {
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  return b;
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ from: () => profilesLookupBuilder() }),
}));

import { LearnerProfileService } from '@/lib/services/learner-profile-service';

const LEARNER_ID = '11111111-1111-4111-8111-111111111111';
const profile = {
  id: LEARNER_ID,
  first_name: 'Test',
  last_name: 'Learner',
  college_email: 'learner@jkkn.ac.in',
} as any;

const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) } as any)
);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://jkkn.ai');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('LearnerProfileService login creation URL', () => {
  it('calls the route by its relative path in the browser, ignoring the configured site URL', async () => {
    const result = await (LearnerProfileService as any).triggerUserCreation(LEARNER_ID, profile);
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/learners/complete-onboarding');
  });

  it('still uses the configured site URL outside the browser', async () => {
    vi.stubGlobal('window', undefined);
    await (LearnerProfileService as any).triggerUserCreation(LEARNER_ID, profile);
    expect(fetchMock.mock.calls[0][0]).toBe('https://jkkn.ai/api/learners/complete-onboarding');
  });
});
