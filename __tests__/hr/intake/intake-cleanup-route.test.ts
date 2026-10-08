// The idle-upload clean-up route: Bearer CRON_SECRET only, then the sweep.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ cleanup: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ service: true }) }));
vi.mock('@/lib/services/hr/intake/intake-service', () => ({ cleanupIdleBatches: (...a: unknown[]) => m.cleanup(...a) }));

import { GET } from '@/app/api/cron/hr-intake-cleanup/route';

const req = (auth?: string) =>
  new Request('http://x/api/cron/hr-intake-cleanup', { headers: auth ? { authorization: auth } : {} }) as never;

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'right-secret');
  m.cleanup.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /api/cron/hr-intake-cleanup', () => {
  it('refuses without the right Bearer secret, and never runs the sweep', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req('Bearer wrong'))).status).toBe(401);
    expect(m.cleanup).not.toHaveBeenCalled();
  });

  it('runs the sweep with the service role and returns its counts', async () => {
    m.cleanup.mockResolvedValue({ ok: true, checked: 3, closed: 2, files_removed: 5, failed: 0, count: 2 });
    const res = await GET(req('Bearer right-secret'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, closed: 2, count: 2 });
    expect(m.cleanup).toHaveBeenCalledWith({ service: true });
  });
});
