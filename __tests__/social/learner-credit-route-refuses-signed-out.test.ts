/**
 * Every handler of /api/social/learner-credit must refuse a signed-out caller.
 *
 * WHY THIS EXISTS, since the type checker cannot carry it. getAuthUser()
 * returns `{ user, error }`, never a bare user. The first version of this route
 * wrote `const user = await getAuthUser(); if (!user) ...` in all four handlers.
 * The wrapper object is always truthy, so that guard never fired.
 *
 * The PR-scoped typecheck caught it in THREE handlers — only because they go on
 * to read `user.id`, and `id` does not exist on the wrapper. The GET handler
 * never reads `user.id`, so its identical broken guard type-checked perfectly
 * and would have shipped. TypeScript is structurally blind to this bug whenever
 * a handler only checks that someone is signed in.
 *
 * So the guarantee is asserted on behaviour, per handler, rather than left to
 * whichever handlers happen to dereference the user.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const touched = { session: 0, service: 0 };

vi.mock('@/lib/supabase/server', () => ({
  getAuthUser: async () => ({ user: null, error: new Error('No user found') }),
  createServerSupabaseClient: async () => {
    touched.session += 1;
    throw new Error('a signed-out caller must never reach the database');
  },
  createServiceRoleClient: () => {
    touched.service += 1;
    throw new Error('a signed-out caller must never reach the database');
  },
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { error: () => {}, warn: () => {}, dev: () => {} },
}));

const URL_ = 'https://example.test/api/social/learner-credit';

function req(method: string, body?: unknown, query = ''): NextRequest {
  return new NextRequest(URL_ + query, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('learner-credit refuses a signed-out caller on every handler', () => {
  beforeEach(() => {
    touched.session = 0;
    touched.service = 0;
    vi.resetModules();
  });

  it('GET — the handler TypeScript cannot protect', async () => {
    const { GET } = await import('@/app/api/social/learner-credit/route');
    const res = await GET(req('GET'));
    expect(res.status).toBe(401);
    expect(touched.service).toBe(0);
    expect(touched.session).toBe(0);
  });

  it('POST', async () => {
    const { POST } = await import('@/app/api/social/learner-credit/route');
    const res = await POST(req('POST', { ig_url: 'https://www.instagram.com/p/AbC123/' }));
    expect(res.status).toBe(401);
    expect(touched.session + touched.service).toBe(0);
  });

  it('PATCH', async () => {
    const { PATCH } = await import('@/app/api/social/learner-credit/route');
    const res = await PATCH(req('PATCH', { claim_id: 'c1', status: 'confirmed' }));
    expect(res.status).toBe(401);
    expect(touched.session + touched.service).toBe(0);
  });

  it('DELETE', async () => {
    const { DELETE } = await import('@/app/api/social/learner-credit/route');
    const res = await DELETE(req('DELETE', undefined, '?claim_id=c1'));
    expect(res.status).toBe(401);
    expect(touched.session + touched.service).toBe(0);
  });
});
