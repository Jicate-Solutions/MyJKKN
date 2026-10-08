// The intake op route: it hands the handler the id the old [id] folder gave it
// (now from ?id=), answers an unknown op 404 and a wrong verb 405, and keeps
// the longest segment config of the six files it stands in for.

import { describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => undefined,
}));
vi.mock('@/lib/api/hr/recruitment/intake/handlers/row-decide', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/hr/recruitment/intake/handlers/row-decide')>()),
  POST: vi.fn(async (req: Request, ctx: { params: Promise<{ id: string }> }) =>
    Response.json({ handled: 'row-decide', id: (await ctx.params).id, body: await req.json() }),
  ),
}));

import * as opRoute from '@/app/api/hr/recruitment/intake/op/route';

const req = (method: string, query: string, body?: unknown) =>
  new Request(`http://x/api/hr/recruitment/intake/op${query}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;

describe('intake op route', () => {
  it('hands the matched handler the ?id= the [id] folder used to give it, body untouched', async () => {
    const res = await opRoute.POST(req('POST', '?op=row-decide&id=r-1', { action: 'skip' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ handled: 'row-decide', id: 'r-1', body: { action: 'skip' } });
  });

  it('an unknown op answers 404 with a reason', async () => {
    const res = await opRoute.GET(req('GET', '?op=nothing&id=r-1'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('a missing id answers 404, as an empty [id] segment never routed', async () => {
    const res = await opRoute.POST(req('POST', '?op=row-decide', {}));
    expect(res.status).toBe(404);
  });

  it('a verb the old folder never exported answers 405 with Allow', async () => {
    const res = await opRoute.GET(req('GET', '?op=rule&id=r-1'));
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('DELETE');
  });

  it('keeps the longest segment config of the six (prepare and apply needed 300 s)', () => {
    expect(opRoute.dynamic).toBe('force-dynamic');
    expect(opRoute.maxDuration).toBe(300);
  });
});
