// The intake routes refuse out loud: signed out -> 401, no recruitment "create"
// -> 403, a service refusal -> its own status with { error }. Never a silent
// redirect or an empty list (rule #27).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntakeError } from '@/lib/services/hr/intake/intake-service';

const m = vi.hoisted(() => ({
  user: null as null | { id: string },
  rpc: {} as Record<string, boolean>,
  getBatch: vi.fn(),
}));

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => undefined,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: m.user }, error: null }) },
    rpc: async (name: string, args?: { permission_name?: string }) => ({
      data: m.rpc[args?.permission_name ?? name] ?? false,
      error: null,
    }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: 'Demo HR', institution_id: null }, error: null }) }) }),
    }),
  }),
  createServiceRoleClient: () => ({}),
}));
vi.mock('@/lib/google/drive-upload', () => ({ uploadResumeToJobFolder: vi.fn() }));
vi.mock('@/lib/services/hr/intake/intake-service', async (orig) => ({
  ...(await orig<typeof import('@/lib/services/hr/intake/intake-service')>()),
  getBatch: (...a: unknown[]) => m.getBatch(...a),
}));

import { GET as getOne } from '@/app/api/hr/recruitment/intake/batches/[id]/route';

const call = () => getOne(new Request('http://x/api') as never, { params: Promise.resolve({ id: 'b-1' }) });

beforeEach(() => {
  m.user = null;
  m.rpc = {};
  m.getBatch.mockReset();
});

describe('intake route gate', () => {
  it('signed out -> 401 with a reason', async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Sign in to continue.' });
  });

  it('signed in without the permission -> 403 with a reason', async () => {
    m.user = { id: 'u1' };
    m.rpc = { 'hr.recruitment.view': true };
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/do not have access/);
    expect(m.getBatch).not.toHaveBeenCalled();
  });

  it('with hr.recruitment.create -> the service runs as this person', async () => {
    m.user = { id: 'u1' };
    m.rpc = { 'hr.recruitment.create': true };
    m.getBatch.mockResolvedValue({ batch: { id: 'b-1' }, rows: [], open_jobs: [], skipped_files: [] });
    const res = await call();
    expect(res.status).toBe(200);
    expect(m.getBatch).toHaveBeenCalledWith(expect.objectContaining({ extractor: null }), 'b-1');
  });

  it('a service refusal keeps its status and says why', async () => {
    m.user = { id: 'u1' };
    m.rpc = { is_super_admin: true };
    m.getBatch.mockRejectedValue(new IntakeError('Batch not found, or you do not have access to it.', 404));
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Batch not found, or you do not have access to it.' });
  });
});
