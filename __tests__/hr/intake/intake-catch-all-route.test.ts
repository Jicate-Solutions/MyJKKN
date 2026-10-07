// The intake catch-all route: it hands the handler the id the old [id] folder
// gave it, answers an unknown path 404 and a wrong verb 405, and keeps the
// longest segment config of the six files it stands in for.

import { describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => undefined,
}));
vi.mock('@/lib/api/hr/recruitment/intake/handlers/row-decide', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/hr/recruitment/intake/handlers/row-decide')>()),
  POST: vi.fn(async (_req: Request, ctx: { params: Promise<{ id: string }> }) =>
    Response.json({ handled: 'row-decide', id: (await ctx.params).id }),
  ),
}));

import * as catchAll from '@/app/api/hr/recruitment/intake/[...path]/route';

const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });
const req = (method: string) => new Request('http://x/api', { method }) as never;

describe('intake catch-all route', () => {
  it('hands the matched handler the id the [id] folder used to give it', async () => {
    const res = await catchAll.POST(req('POST'), ctx(['rows', 'r-1', 'decide']));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ handled: 'row-decide', id: 'r-1' });
  });

  it('an unknown path answers 404 with a reason', async () => {
    const res = await catchAll.GET(req('GET'), ctx(['nothing', 'here']));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('a verb the old folder never exported answers 405 with Allow', async () => {
    const res = await catchAll.GET(req('GET'), ctx(['rules', 'r-1']));
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('DELETE');
  });

  it('keeps the longest segment config of the six (prepare and apply needed 300 s)', () => {
    expect(catchAll.dynamic).toBe('force-dynamic');
    expect(catchAll.maxDuration).toBe(300);
  });
});
