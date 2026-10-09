// BUG-006273 review round 3: /api/events/[eventId]/winners answers a tie with
// 409 (not a generic 500), refuses malformed ids with 400 before reaching the
// database, and reads registrations in pages past PostgREST's 1000-row cap.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const svcPages = vi.hoisted(() => ({ rows: [] as any[], ranges: [] as [number, number][] }));

vi.mock('@/lib/supabase/server', () => ({
  getAuthUser: async () => ({ user: { id: 'u1' }, error: null }),
  createServerSupabaseClient: async () => ({
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: EV, event_type: 'cultural' } }) }),
      }),
    }),
  }),
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'event_registration_forms') {
        return { select: () => ({ eq: async () => ({ data: [] }) }) };
      }
      const q: any = {
        select: () => q,
        eq: () => q,
        not: () => q,
        order: () => q,
        range: async (from: number, to: number) => {
          svcPages.ranges.push([from, to]);
          return { data: svcPages.rows.slice(from, to + 1), error: null };
        },
      };
      return q;
    },
  }),
}));

const EV = '11111111-1111-4111-8111-111111111111';
const REG = '22222222-2222-4222-8222-222222222222';

import { GET, POST } from '@/app/api/events/[eventId]/winners/route';

const post = (eventId: string, changes: unknown) =>
  POST(
    new Request(`http://x/api/events/${eventId}/winners`, {
      method: 'POST',
      body: JSON.stringify({ changes }),
    }) as any,
    { params: Promise.resolve({ eventId }) },
  );

beforeEach(() => {
  rpc.mockReset();
  svcPages.rows = [];
  svcPages.ranges = [];
});

describe('POST /api/events/[eventId]/winners', () => {
  it('a tie (23505) is a 409 with a message the organiser can act on', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } });
    const res = await post(EV, [{ registrationId: REG, final_rank: 1 }]);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already holds/);
  });

  it('a malformed registration id is a 400 and never reaches the database', async () => {
    const res = await post(EV, [{ registrationId: 'not-a-uuid', final_rank: 1 }]);
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a malformed event id is a 400', async () => {
    const res = await post('nope', [{ registrationId: REG, final_rank: 1 }]);
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('22P02 from the database is a 400, not a 500', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } });
    const res = await post(EV, [{ registrationId: REG, final_rank: 1 }]);
    expect(res.status).toBe(400);
  });

  it('more than 100 changes is a 400 and never reaches the database', async () => {
    const many = Array.from({ length: 101 }, () => ({ registrationId: REG, final_rank: null }));
    const res = await post(EV, many);
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a deadlock or serialization failure (40P01 / 40001) is a 409', async () => {
    for (const code of ['40P01', '40001']) {
      rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'deadlock detected' } });
      const res = await post(EV, [{ registrationId: REG, final_rank: 1 }]);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/same moment/);
    }
  });

  it('42501 is a 403', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'no' } });
    expect((await post(EV, [{ registrationId: REG, final_rank: 1 }])).status).toBe(403);
  });
});

describe('GET /api/events/[eventId]/winners', () => {
  it('reads every registration in pages, past the 1000-row cap', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    svcPages.rows = Array.from({ length: 2345 }, (_, i) => ({ id: `r${i}`, final_rank: null }));
    const res = await GET(new Request('http://x') as any, { params: Promise.resolve({ eventId: EV }) });
    const body = await res.json();
    expect(body.canManage).toBe(true);
    expect(body.registrations).toHaveLength(2345);
    expect(svcPages.ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });
});
