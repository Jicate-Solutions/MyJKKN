/**
 * /api/cron/hr-playbook-lessons — Bearer CRON_SECRET only, and a non-200
 * whenever a database call fails or a harvest source could not be read.
 * Sends nothing; these tests only watch the two RPCs it calls.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Rpc = { data: unknown; error: { message: string } | null };
const rpcs = vi.hoisted(() => ({
  calls: [] as { fn: string; args: unknown }[],
  answers: {} as Record<string, Rpc>,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    rpc: async (fn: string, args?: unknown) => {
      rpcs.calls.push({ fn, args });
      return rpcs.answers[fn] ?? { data: null, error: null };
    },
  }),
}));

import { GET } from '@/app/api/cron/hr-playbook-lessons/route';

const req = (headers: Record<string, string> = {}, query = '') =>
  new NextRequest(`http://localhost/api/cron/hr-playbook-lessons${query}`, { headers });

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
  rpcs.calls = [];
  rpcs.answers = {
    fn_hr_duty_lessons_harvest: { data: { L1: 2, L2: 0, A3: 0, S2: 1, S3: 0, G2: 0 }, error: null },
    fn_hr_playbook_propose_from_lessons: { data: 1, error: null },
  };
});

describe('GET /api/cron/hr-playbook-lessons', () => {
  it('answers 401 without the Bearer secret, and calls nothing', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req({ authorization: 'Bearer wrong' }))).status).toBe(401);
    expect((await GET(req({}, '?secret=test-secret')))).toHaveProperty('status', 401);
    expect((await GET(req({ 'x-vercel-cron': '1' })))).toHaveProperty('status', 401);
    expect(rpcs.calls).toEqual([]);
  });

  it('answers 401 when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req({ authorization: 'Bearer undefined' }))).status).toBe(401);
  });

  it('harvests the last 35 days, then proposes, and answers 200', async () => {
    const res = await GET(req({ authorization: 'Bearer test-secret' }));
    expect(res.status).toBe(200);
    expect(rpcs.calls.map((c) => c.fn)).toEqual(['fn_hr_duty_lessons_harvest', 'fn_hr_playbook_propose_from_lessons']);
    const since = new Date((rpcs.calls[0].args as { p_since: string }).p_since).getTime();
    expect(Math.round((Date.now() - since) / 86_400_000)).toBe(35);
    expect(await res.json()).toMatchObject({ ok: true, proposed: 1 });
  });

  it('answers 500 when the harvest RPC errors', async () => {
    rpcs.answers.fn_hr_duty_lessons_harvest = { data: null, error: { message: 'boom' } };
    const res = await GET(req({ authorization: 'Bearer test-secret' }));
    expect(res.status).toBe(500);
    expect((await res.json()).errors).toEqual(['harvest: boom']);
  });

  it('answers 500 when the propose RPC errors', async () => {
    rpcs.answers.fn_hr_playbook_propose_from_lessons = { data: null, error: { message: 'nope' } };
    expect((await GET(req({ authorization: 'Bearer test-secret' }))).status).toBe(500);
  });

  it('answers 500 when the harvest could not read one source', async () => {
    rpcs.answers.fn_hr_duty_lessons_harvest = {
      data: { L1: 2, S3: { error: 'relation "hr_staff_photo_submissions" does not exist' } },
      error: null,
    };
    const res = await GET(req({ authorization: 'Bearer test-secret' }));
    expect(res.status).toBe(500);
    expect((await res.json()).errors[0]).toMatch(/^harvest S3: relation/);
  });
});
