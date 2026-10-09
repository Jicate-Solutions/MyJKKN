/**
 * /preview/end must revoke the session /preview/start minted, not only clear
 * its cookies (#4121 panel round 1, finding 2). Clearing cookies leaves the
 * refresh token valid on the server, so a kept copy would still act as the
 * previewed person — even after that person is put on the Director list.
 *
 * Run: npx vitest run __tests__/api/preview-end-revokes-the-minted-session.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TARGET = '22222222-2222-4222-8222-222222222222';
const ADMIN = '11111111-1111-4111-8111-111111111111';

let claims: Record<string, unknown> | null = null;
let cookieSession: { access_token: string; user: { id: string } } | null = null;
let signOutResult: { error: unknown } = { error: null };
const adminSignOut = vi.fn(async () => signOutResult);
const writePreviewAudit = vi.fn(async () => {});

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'sb-preview-session' ? { value: 'preview-token' } : undefined),
    getAll: () => [{ name: 'sb-test-auth-token', value: 'x' }],
    set: () => {},
  }),
}));
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('@/lib/auth/preview-session', () => ({
  getPreviewClaimsFromCookies: async () => claims,
  writePreviewAudit: (...a: unknown[]) => writePreviewAudit(...(a as [])),
  PREVIEW_COOKIE_NAME: 'sb-preview-session',
}));
vi.mock('@/app/api/users/permissions-audit/preview/start/route', () => ({
  PREVIEW_ADMIN_BACKUP_COOKIE: 'sb-preview-admin-backup',
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getSession: async () => ({ data: { session: cookieSession }, error: null }) },
  }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const q: any = {
      select: () => q,
      eq: () => q,
      single: async () => ({ data: null, error: null }),
    };
    return { auth: { admin: { signOut: adminSignOut } }, from: () => q };
  },
}));

import { POST } from '@/app/api/users/permissions-audit/preview/end/route';

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  claims = { sub: TARGET, originator: ADMIN, originator_email: 'a@jkkn.ac.in', mode: 'read', sessionId: 's' };
  cookieSession = { access_token: 'minted-token', user: { id: TARGET } };
  signOutResult = { error: null };
  adminSignOut.mockClear();
  writePreviewAudit.mockClear();
});

describe('preview/end revokes the session preview/start minted', () => {
  it("signs out that ONE session on the server ('local'), then clears the cookies", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(adminSignOut).toHaveBeenCalledTimes(1);
    expect(adminSignOut).toHaveBeenCalledWith('minted-token', 'local');
    expect(adminSignOut).not.toHaveBeenCalledWith('minted-token', 'global');
    expect(res.headers.get('set-cookie') ?? '').toContain('sb-test-auth-token=');
  });

  it('revokes nothing when the session in the cookies is not the previewed person', async () => {
    cookieSession = { access_token: 'someone-else', user: { id: ADMIN } };
    const res = await POST();
    expect(res.status).toBe(200);
    expect(adminSignOut).not.toHaveBeenCalled();
  });

  it('revokes nothing without a verified preview marker', async () => {
    claims = null;
    const res = await POST();
    expect(res.status).toBe(200);
    expect(adminSignOut).not.toHaveBeenCalled();
  });

  it('still clears the cookies when the server refuses the sign-out', async () => {
    signOutResult = { error: { message: 'session not found' } };
    const res = await POST();
    expect(res.status).toBe(200);
    expect(adminSignOut).toHaveBeenCalledTimes(1);
    expect(res.headers.get('set-cookie') ?? '').toContain('sb-preview-session=');
  });
});
