/**
 * Parent Portal sliding session (Director ruling, 1 Oct 2026: once a parent
 * logs in to the installed app it should never log them out).
 *
 * Proves, against the REAL proxy() export and the real jose signing:
 *   1. an old-but-valid token (issued > 1 day ago) is re-issued with a fresh
 *      400-day cookie; a fresh token is NOT re-issued
 *   2. a disabled / removed / signed-out-everywhere account has its cookie
 *      cleared and is sent to login — including from /parent/login itself,
 *      where it must NOT bounce to the dashboard
 *   3. a tampered, expired or alg-swapped token is still rejected (and the
 *      database is never asked about it)
 *   4. a database error never logs a parent out (page gate fails open, no
 *      renewal) while the API gate fails closed
 * Only the Supabase service-role client is faked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';

const SECRET = 'test-parent-jwt-secret-0123456789';
const DAY = 60 * 60 * 24;
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
const LEARNER_ID = '22222222-2222-2222-2222-222222222222';

// ---------------------------------------------------------------------------
// Service-role client double: answers the pp_parent_accounts lookup only.
// ---------------------------------------------------------------------------
type AccountAnswer =
  | { data: Record<string, unknown> | null; error: null }
  | { data: null; error: { message: string } };

const db = {
  answer: { data: null, error: null } as AccountAnswer,
  calls: 0,
};

function fakeServiceRoleClient() {
  return {
    from(table: string) {
      expect(table).toBe('pp_parent_accounts');
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          db.calls += 1;
          return db.answer;
        },
      };
      return chain;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => fakeServiceRoleClient(),
  createClient: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/services/auth/student-validation-service', () => ({
  StudentValidationService: {},
}));

process.env.PARENT_JWT_SECRET = SECRET;

const secretKey = new TextEncoder().encode(SECRET);

async function tokenIssuedAt(iatSeconds: number, expSeconds?: number) {
  return new SignJWT({ learnerProfileId: LEARNER_ID })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(ACCOUNT_ID)
    .setIssuedAt(iatSeconds)
    .setExpirationTime(expSeconds ?? iatSeconds + 400 * DAY)
    .sign(secretKey);
}

const now = () => Math.floor(Date.now() / 1000);

function activeAccount(extra: Record<string, unknown> = {}): AccountAnswer {
  return {
    data: { id: ACCOUNT_ID, is_active: true, sessions_revoked_at: null, ...extra },
    error: null,
  };
}

async function runProxy(path: string, token?: string) {
  const { proxy } = await import('@/proxy');
  const req = new NextRequest(new URL(path, 'https://www.jkkn.ai'));
  if (token) req.cookies.set('parent_session', token);
  return proxy(req);
}

function sessionCookie(res: Response & { cookies?: { get(name: string): unknown } }) {
  // NextResponse exposes parsed Set-Cookie entries via .cookies
  return (res as unknown as {
    cookies: { get(n: string): { value: string; maxAge?: number } | undefined };
  }).cookies.get('parent_session');
}

beforeEach(() => {
  db.answer = activeAccount();
  db.calls = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
describe('parent-jwt helpers', () => {
  it('signs a 400-day token and a 400-day cookie', async () => {
    const { signParentSession, verifyParentSession, parentSessionCookieOptions } =
      await import('@/lib/auth/parent-jwt');
    const claims = await verifyParentSession(
      await signParentSession({ sub: ACCOUNT_ID, learnerProfileId: LEARNER_ID })
    );
    expect(claims).not.toBeNull();
    expect((claims!.exp as number) - (claims!.iat as number)).toBe(400 * DAY);
    const opts = parentSessionCookieOptions();
    expect(opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 400 * DAY });
  });

  it('renews only a token older than one day', async () => {
    const { shouldRenewParentSession } = await import('@/lib/auth/parent-jwt');
    const t = now();
    const base = { sub: ACCOUNT_ID, learnerProfileId: LEARNER_ID };
    expect(shouldRenewParentSession({ ...base, iat: t - 2 * DAY }, t)).toBe(true);
    expect(shouldRenewParentSession({ ...base, iat: t - 60 }, t)).toBe(false);
    expect(shouldRenewParentSession({ ...base, iat: t - DAY }, t)).toBe(false);
  });

  it('treats a token issued at or before sessions_revoked_at as revoked', async () => {
    const { isParentSessionRevoked } = await import('@/lib/auth/parent-jwt');
    const t = now();
    const c = { sub: ACCOUNT_ID, learnerProfileId: LEARNER_ID, iat: t - 100 };
    expect(isParentSessionRevoked(c, null)).toBe(false);
    expect(isParentSessionRevoked(c, new Date((t - 50) * 1000).toISOString())).toBe(true);
    expect(isParentSessionRevoked(c, new Date((t - 100) * 1000).toISOString())).toBe(true);
    expect(isParentSessionRevoked(c, new Date((t - 200) * 1000).toISOString())).toBe(false);
  });

  it('rejects tampered, expired and unsigned tokens', async () => {
    const { verifyParentSession } = await import('@/lib/auth/parent-jwt');
    const good = await tokenIssuedAt(now() - 10);
    expect(await verifyParentSession(good)).not.toBeNull();

    const [h, p, s] = good.split('.');
    const flipped = s[0] === 'A' ? 'B' + s.slice(1) : 'A' + s.slice(1);
    expect(await verifyParentSession(`${h}.${p}.${flipped}`)).toBeNull();

    const expired = await tokenIssuedAt(now() - 500 * DAY, now() - 60);
    expect(await verifyParentSession(expired)).toBeNull();

    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${p}.`;
    expect(await verifyParentSession(none)).toBeNull();
  });
});

describe('parent account state', () => {
  const claims = { sub: ACCOUNT_ID, learnerProfileId: LEARNER_ID, iat: now() - 100 };

  it.each([
    ['row present, active', activeAccount(), 'alive'],
    ['row present, is_active null (column default is true)', activeAccount({ is_active: null }), 'alive'],
    ['row disabled', activeAccount({ is_active: false }), 'dead'],
    ['row removed', { data: null, error: null } as AccountAnswer, 'dead'],
    [
      'signed out everywhere after this token',
      activeAccount({ sessions_revoked_at: new Date().toISOString() }),
      'dead',
    ],
    [
      'signed out everywhere before this token',
      activeAccount({ sessions_revoked_at: new Date((now() - 1000) * 1000).toISOString() }),
      'alive',
    ],
    ['database error', { data: null, error: { message: 'boom' } } as AccountAnswer, 'error'],
  ])('%s → %s', async (_label, answer, expected) => {
    const { getParentAccountState } = await import('@/lib/auth/parent-session-state');
    db.answer = answer;
    expect(await getParentAccountState(fakeServiceRoleClient() as never, claims)).toBe(expected);
  });

  it('decides clear / keep / renew', async () => {
    const { decideParentSessionAction } = await import('@/lib/auth/parent-session-state');
    const t = now();
    const old = { ...claims, iat: t - 3 * DAY };
    const fresh = { ...claims, iat: t - 60 };
    expect(decideParentSessionAction(old, 'dead', t)).toBe('clear');
    expect(decideParentSessionAction(old, 'error', t)).toBe('keep');
    expect(decideParentSessionAction(old, 'alive', t)).toBe('renew');
    expect(decideParentSessionAction(fresh, 'alive', t)).toBe('keep');
  });
});

// ---------------------------------------------------------------------------
// The real proxy
// ---------------------------------------------------------------------------
describe('proxy /parent/* sliding session', () => {
  it('re-issues an old-but-valid session with a fresh 400-day cookie', async () => {
    const old = await tokenIssuedAt(now() - 5 * DAY);
    const res = await runProxy('/parent/dashboard', old);
    expect(res.headers.get('location')).toBeNull();
    const c = sessionCookie(res);
    expect(c).toBeDefined();
    expect(c!.value).not.toBe(old);
    expect(c!.maxAge).toBe(400 * DAY);
    const { verifyParentSession } = await import('@/lib/auth/parent-jwt');
    const renewed = await verifyParentSession(c!.value);
    expect(renewed?.sub).toBe(ACCOUNT_ID);
    expect(renewed?.learnerProfileId).toBe(LEARNER_ID);
    expect(now() - (renewed!.iat as number)).toBeLessThan(5);
  });

  it('renews on the authed-funnel redirect too', async () => {
    const res = await runProxy('/parent/login', await tokenIssuedAt(now() - 2 * DAY));
    expect(res.headers.get('location')).toContain('/parent/dashboard');
    expect(sessionCookie(res)?.maxAge).toBe(400 * DAY);
  });

  it('does not re-issue a fresh session', async () => {
    const res = await runProxy('/parent/dashboard', await tokenIssuedAt(now() - 60));
    expect(res.headers.get('location')).toBeNull();
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('clears a disabled account and sends it to login', async () => {
    db.answer = activeAccount({ is_active: false });
    const res = await runProxy('/parent/fees', await tokenIssuedAt(now() - 5 * DAY));
    expect(res.headers.get('location')).toContain('/parent/login');
    const c = sessionCookie(res);
    expect(c?.value).toBe('');
    expect(c?.maxAge).toBe(0);
  });

  it('clears a removed account on /parent/login without bouncing to the dashboard', async () => {
    db.answer = { data: null, error: null };
    const res = await runProxy('/parent/login', await tokenIssuedAt(now() - 60));
    expect(res.headers.get('location')).toBeNull();
    expect(sessionCookie(res)?.maxAge).toBe(0);
  });

  it('clears a session signed out everywhere after it was issued', async () => {
    db.answer = activeAccount({ sessions_revoked_at: new Date().toISOString() });
    const res = await runProxy('/parent/dashboard', await tokenIssuedAt(now() - 5 * DAY));
    expect(res.headers.get('location')).toContain('/parent/login');
    expect(sessionCookie(res)?.value).toBe('');
  });

  it('rejects tampered and expired tokens without asking the database', async () => {
    const good = await tokenIssuedAt(now() - 5 * DAY);
    const tampered = good.slice(0, -2) + (good.endsWith('AA') ? 'BB' : 'AA');
    const expired = await tokenIssuedAt(now() - 500 * DAY, now() - 60);
    for (const t of [tampered, expired]) {
      const res = await runProxy('/parent/dashboard', t);
      expect(res.headers.get('location')).toContain('/parent/login');
      expect(sessionCookie(res)?.value ?? '').not.toMatch(/^ey/);
    }
    expect(db.calls).toBe(0);
  });

  it('a database error never logs a parent out and does not renew', async () => {
    db.answer = { data: null, error: { message: 'timeout' } };
    const res = await runProxy('/parent/dashboard', await tokenIssuedAt(now() - 5 * DAY));
    expect(res.headers.get('location')).toBeNull();
    expect(sessionCookie(res)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The API gate (resolveParentScope) — fails closed
// ---------------------------------------------------------------------------
describe('resolveParentScope kill switch', () => {
  async function scopeFor(token: string) {
    const { resolveParentScope } = await import('@/lib/utils/parent-access');
    const req = new NextRequest(new URL('/api/parent/children', 'https://www.jkkn.ai'));
    req.cookies.set('parent_session', token);
    return resolveParentScope(req);
  }

  it('returns null (401) for a disabled account', async () => {
    db.answer = activeAccount({ is_active: false });
    expect(await scopeFor(await tokenIssuedAt(now() - 60))).toBeNull();
  });

  it('returns null (401) for a signed-out-everywhere account', async () => {
    db.answer = activeAccount({ sessions_revoked_at: new Date().toISOString() });
    expect(await scopeFor(await tokenIssuedAt(now() - 60))).toBeNull();
  });

  it('throws a 500 on a database error (fails closed)', async () => {
    db.answer = { data: null, error: { message: 'boom' } };
    await expect(scopeFor(await tokenIssuedAt(now() - 60))).rejects.toMatchObject({ status: 500 });
  });
});
