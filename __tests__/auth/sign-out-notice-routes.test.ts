/**
 * "An admin signed you out of all devices on <date>." — Director ruling 2 Oct 2026.
 *
 * The notice appears ONCE, after the person's NEXT sign-in, and is then marked
 * seen. Team members and learners read it through their own session
 * (/api/auth/sign-out-notice); parents through their verified parent token
 * (/api/parent/sign-out-notice), scoped to the token's own account.
 *
 * The database stand-in below applies the same filters PostgREST would
 * (eq / is / lt / lte / order / limit), so a wrong filter shows up as a wrong
 * answer rather than a wrong call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { formatSignOutNoticeDate, signOutNoticeText } from '@/lib/auth/sign-out-notices';

type Row = Record<string, unknown>;
let rows: Row[] = [];

function table(name: string) {
  if (name !== 'sign_out_notices') throw new Error(`unexpected table ${name}`);
  const filters: Array<(r: Row) => boolean> = [];
  let orderDesc: string | null = null;
  let max = Infinity;
  let patch: Row | null = null;
  const pick = () => {
    let out = rows.filter((r) => filters.every((f) => f(r)));
    if (orderDesc) {
      const k = orderDesc;
      out = [...out].sort((a, b) => String(b[k]).localeCompare(String(a[k])));
    }
    return out.slice(0, max);
  };
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
    is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), q),
    lt: (k: string, v: string) => (filters.push((r) => Date.parse(String(r[k])) < Date.parse(v)), q),
    lte: (k: string, v: string) => (filters.push((r) => Date.parse(String(r[k])) <= Date.parse(v)), q),
    order: (k: string, o: { ascending: boolean }) => ((orderDesc = o.ascending ? null : k), q),
    limit: (n: number) => ((max = n), q),
    update: (p: Row) => ((patch = p), q),
    maybeSingle: async () => ({ data: pick()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => {
      if (patch) {
        const hit = pick();
        for (const r of hit) Object.assign(r, patch);
        return resolve({ data: null, error: null });
      }
      return resolve({ data: pick(), error: null });
    },
  };
  return q;
}

const getUser = vi.fn();
const verifyParentSession = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser }, from: table }),
  createServiceRoleClient: () => ({ from: table }),
}));
vi.mock('@/lib/auth/parent-jwt', () => ({
  PARENT_SESSION_COOKIE: 'parent_session',
  verifyParentSession: (t: unknown) => verifyParentSession(t),
}));

import * as staffRoute from '@/app/api/auth/sign-out-notice/route';
import * as parentRoute from '@/app/api/parent/sign-out-notice/route';

const ME = '00000000-0000-4000-8000-0000000000a1';
const SOMEONE = '00000000-0000-4000-8000-0000000000b2';
const PARENT = '00000000-0000-4000-8000-0000000000c3';
const OTHER_PARENT = '00000000-0000-4000-8000-0000000000c4';
const ADMIN = '00000000-0000-4000-8000-0000000000d4';
const N1 = '00000000-0000-4000-8000-000000000001';
const N2 = '00000000-0000-4000-8000-000000000002';
const N3 = '00000000-0000-4000-8000-000000000003';
const P1 = '00000000-0000-4000-8000-000000000011';
const P2 = '00000000-0000-4000-8000-000000000012';

// 2 Oct 2026, 3:15 pm India time = 09:45 UTC.
const SIGNED_OUT_AT = '2026-10-02T09:45:00.000Z';

function req(url: string, method: 'GET' | 'POST', body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: 'parent_session=tok' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  rows = [
    { id: N1, user_id: ME, parent_account_id: null, signed_out_by: ADMIN, signed_out_at: SIGNED_OUT_AT, seen_at: null },
    { id: N2, user_id: SOMEONE, parent_account_id: null, signed_out_by: ADMIN, signed_out_at: SIGNED_OUT_AT, seen_at: null },
    { id: P1, user_id: null, parent_account_id: PARENT, signed_out_by: ADMIN, signed_out_at: SIGNED_OUT_AT, seen_at: null },
    { id: P2, user_id: null, parent_account_id: OTHER_PARENT, signed_out_by: ADMIN, signed_out_at: SIGNED_OUT_AT, seen_at: null },
  ];
  // Signed in again 10 minutes after the admin signed them out.
  getUser.mockResolvedValue({ data: { user: { id: ME, last_sign_in_at: '2026-10-02T09:55:00.000Z' } } });
  verifyParentSession.mockResolvedValue({ sub: PARENT, learnerProfileId: 'l-1', iat: Date.parse('2026-10-02T10:00:00Z') / 1000 });
});

describe('the wording', () => {
  it('says the date the plain way, in India time', () => {
    expect(formatSignOutNoticeDate(SIGNED_OUT_AT)).toBe('2 Oct 2026, 3:15 pm');
    expect(formatSignOutNoticeDate('2026-10-01T18:35:00Z')).toBe('2 Oct 2026, 12:05 am');
    expect(formatSignOutNoticeDate('2026-10-02T06:40:00Z')).toBe('2 Oct 2026, 12:10 pm');
    expect(signOutNoticeText(SIGNED_OUT_AT)).toBe('An admin signed you out of all devices on 2 Oct 2026, 3:15 pm.');
  });
});

describe('team members and learners — /api/auth/sign-out-notice', () => {
  it('after the next sign-in: shows their own notice once, then it is gone', async () => {
    const first = await (await staffRoute.GET()).json();
    expect(first.notice).toEqual({
      id: N1,
      signedOutAt: SIGNED_OUT_AT,
      message: 'An admin signed you out of all devices on 2 Oct 2026, 3:15 pm.',
    });

    const seen = await staffRoute.POST(req('/api/auth/sign-out-notice', 'POST', { id: N1 }));
    expect(seen.status).toBe(200);
    expect(rows.find((r) => r.id === N1)?.seen_at).toBeTruthy();
    // Someone else's notice is untouched.
    expect(rows.find((r) => r.id === N2)?.seen_at).toBeNull();

    const again = await (await staffRoute.GET()).json();
    expect(again.notice).toBeNull();
  });

  it('a page still open from BEFORE the sign-out does not show it (not signed in again yet)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: ME, last_sign_in_at: '2026-10-01T08:00:00.000Z' } } });
    expect((await (await staffRoute.GET()).json()).notice).toBeNull();
  });

  it('shows the latest when there are two, and marking it seen clears the older one too', async () => {
    rows.push({ id: N3, user_id: ME, parent_account_id: null, signed_out_by: ADMIN, signed_out_at: '2026-10-02T09:50:00.000Z', seen_at: null });
    const first = await (await staffRoute.GET()).json();
    expect(first.notice.id).toBe(N3);
    await staffRoute.POST(req('/api/auth/sign-out-notice', 'POST', { id: N3 }));
    expect((await (await staffRoute.GET()).json()).notice).toBeNull();
  });

  it("cannot mark someone else's notice seen", async () => {
    const res = await staffRoute.POST(req('/api/auth/sign-out-notice', 'POST', { id: N2 }));
    expect(res.status).toBe(404);
    expect(rows.find((r) => r.id === N2)?.seen_at).toBeNull();
  });

  it('a signed-out caller is refused', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await staffRoute.GET()).status).toBe(401);
    expect((await staffRoute.POST(req('/api/auth/sign-out-notice', 'POST', { id: N1 }))).status).toBe(401);
  });
});

describe('parents — /api/parent/sign-out-notice', () => {
  it("after the next sign-in: shows the token's own account notice once", async () => {
    const first = await (await parentRoute.GET(req('/api/parent/sign-out-notice', 'GET'))).json();
    expect(first.notice.id).toBe(P1);
    expect(first.notice.message).toBe('An admin signed you out of all devices on 2 Oct 2026, 3:15 pm.');

    await parentRoute.POST(req('/api/parent/sign-out-notice', 'POST', { id: P1 }));
    expect(rows.find((r) => r.id === P1)?.seen_at).toBeTruthy();
    expect(rows.find((r) => r.id === P2)?.seen_at).toBeNull();
    expect((await (await parentRoute.GET(req('/api/parent/sign-out-notice', 'GET'))).json()).notice).toBeNull();
  });

  it('a token issued before the sign-out (an old open page) does not show it', async () => {
    verifyParentSession.mockResolvedValue({ sub: PARENT, learnerProfileId: 'l-1', iat: Date.parse('2026-10-01T10:00:00Z') / 1000 });
    expect((await (await parentRoute.GET(req('/api/parent/sign-out-notice', 'GET'))).json()).notice).toBeNull();
  });

  it("cannot mark another parent's notice seen", async () => {
    const res = await parentRoute.POST(req('/api/parent/sign-out-notice', 'POST', { id: P2 }));
    expect(res.status).toBe(404);
    expect(rows.find((r) => r.id === P2)?.seen_at).toBeNull();
  });

  it('no parent session → refused', async () => {
    verifyParentSession.mockResolvedValue(null);
    expect((await parentRoute.GET(req('/api/parent/sign-out-notice', 'GET'))).status).toBe(401);
  });
});
