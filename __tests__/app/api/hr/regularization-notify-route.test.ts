import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/hr/attendance/regularizations/notify — the id now travels in the
// JSON body (static path, no dynamic segment). The gates are unchanged:
// a valid id, a signed-in user, and the request visible under their own session.

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

const notifySpy = vi.fn(async () => ({ kind: 'submitted', outcome: 'sent' }));
vi.mock('@/lib/services/hr/duty-notices/dispatch', () => ({
  notifyRegularizationEvent: (...args: unknown[]) => notifySpy(...(args as [])),
}));

let user: { id: string } | null = { id: 'u-1' };
let visible: { id: string } | null = { id: 'x' };
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ service: true }),
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: visible, error: null }) };
      return q;
    },
  }),
}));

import { POST } from '@/app/api/hr/attendance/regularizations/notify/route';
import { NextRequest } from 'next/server';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const call = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/hr/attendance/regularizations/notify', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  notifySpy.mockClear();
  user = { id: 'u-1' };
  visible = { id: ID };
});

describe('regularisation notify route (static path, id in the body)', () => {
  it('rejects a missing, malformed or non-string id with 400 and sends nothing', async () => {
    for (const body of [{}, { id: 'abc' }, { id: 42 }, 'not json']) {
      expect((await call(body)).status).toBe(400);
    }
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('401 when not signed in', async () => {
    user = null;
    expect((await call({ id: ID })).status).toBe(401);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('404 when the request is not visible under your own session', async () => {
    visible = null;
    expect((await call({ id: ID })).status).toBe(404);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('sends the notice for a visible request, using the service client', async () => {
    const res = await call({ id: ID });
    expect(res.status).toBe(200);
    expect(notifySpy).toHaveBeenCalledWith({ service: true }, ID);
  });
});
