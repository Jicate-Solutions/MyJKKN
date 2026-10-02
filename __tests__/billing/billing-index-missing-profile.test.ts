/**
 * /billing index: a signed-in person whose profile cannot be loaded.
 *
 * - the profile row genuinely does not exist → the login page's "We could not
 *   open your account" message (same hand-off the proxy uses for PGRST116),
 *   never an endless Try-again
 * - the read failed (timeout, network) → TransientAuthError (Try again page),
 *   never the sign-in page
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransientAuthError } from '@/lib/auth/auth-retry';

const USER = { id: '11111111-1111-4111-8111-111111111111' };
let rowAnswer: { data: unknown; error: unknown };

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { to });
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  getEnhancedUserProfile: async () => ({ profile: null, error: new Error('folded') }),
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: USER }, error: null }) },
    from: () => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => rowAnswer,
      };
      return builder;
    },
    rpc: async () => ({ data: false, error: null }),
  }),
}));

async function render(): Promise<unknown> {
  const { default: BillingIndex } = await import('@/app/(routes)/billing/page');
  try {
    await BillingIndex();
    return null;
  } catch (thrown) {
    return thrown;
  }
}

beforeEach(() => {
  rowAnswer = { data: null, error: null };
});

describe('/billing — profile not loaded', () => {
  it('no profile row → the login page message, not an endless Try again', async () => {
    rowAnswer = { data: null, error: null };
    const thrown = (await render()) as { to?: string };
    expect(thrown?.to).toBe('/auth/login?error=profile_load_failed&redirectedFrom=%2Fbilling');
  });

  it('the read failed → temporary error page, not the sign-in page', async () => {
    rowAnswer = { data: null, error: { code: '57014', message: 'statement timeout' } };
    expect(await render()).toBeInstanceOf(TransientAuthError);
  });

  it('the row exists but the full profile read failed → temporary error page', async () => {
    rowAnswer = { data: { id: USER.id }, error: null };
    expect(await render()).toBeInstanceOf(TransientAuthError);
  });
});
