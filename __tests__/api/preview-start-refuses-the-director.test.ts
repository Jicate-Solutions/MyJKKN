/**
 * Draft #4121 review (W12, 30 Sep): "preview as" mints a REAL session for the
 * target. If a super admin could preview as someone on the Director list, the
 * database would see the Director signed in, and the list's guard would let
 * that super admin add themselves. The start route must refuse any target on
 * the list BEFORE any session is minted, and refuse when it cannot tell.
 *
 * Runs the REAL route against in-memory stand-ins for Supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const DIRECTOR = 'd0000000-0000-4000-8000-000000000001';
const JOINT_MD = 'd0000000-0000-4000-8000-000000000006';
const HOD = 'd0000000-0000-4000-8000-000000000005';
const DEV = 'd0000000-0000-4000-8000-000000000002';

type ListRow = { value: unknown; is_active: boolean } | null;
let listRow: ListRow;
let listError: { message: string } | null;
let listQuery: Array<[string, string, unknown]>;
const generateLink = vi.fn();
const verifyOtp = vi.fn();

const profiles: Record<string, Record<string, unknown>> = {
  [DEV]: { id: DEV, email: 'dev.one@jkkn.ac.in', full_name: 'Dev One', role: 'super_admin', is_super_admin: true },
  [DIRECTOR]: { id: DIRECTOR, email: 'director@jkkn.ac.in', full_name: 'The Director', role: 'super_admin', is_active: true },
  [JOINT_MD]: { id: JOINT_MD, email: 'jointmd@jkkn.ac.in', full_name: 'Joint MD', role: 'admin', is_active: true },
  [HOD]: { id: HOD, email: 'hod@jkkn.ac.in', full_name: 'An HOD', role: 'hod', is_active: true },
};

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, getAll: () => [] }),
}));
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('@/lib/auth/preview-session', () => ({
  mintPreviewToken: async () => 'preview-token',
  writePreviewAudit: async () => {},
  PREVIEW_COOKIE_NAME: 'sb-preview-session',
  canUseWriteMode: () => false,
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: DEV } }, error: null }),
      setSession: async () => ({ error: null }),
    },
    from: () => {
      let id = '';
      const q: any = {
        select: () => q,
        eq: (_col: string, v: string) => { id = v; return q; },
        single: async () => (profiles[id] ? { data: profiles[id], error: null } : { data: null, error: { message: 'not found' } }),
      };
      return q;
    },
  }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => {
    if (key === 'service-key') {
      return {
        auth: { admin: { generateLink } },
        from: (table: string) => {
          const q: any = {
            select: () => q,
            eq: (col: string, v: unknown) => { listQuery.push([table, col, v]); return q; },
            is: (col: string, v: unknown) => { listQuery.push([table, col, v]); return q; },
            maybeSingle: async () => ({ data: listError ? null : listRow, error: listError }),
          };
          return q;
        },
      };
    }
    return { auth: { verifyOtp } };
  },
}));

import { POST } from '@/app/api/users/permissions-audit/preview/start/route';

function start(targetUserId: string) {
  return POST(
    new NextRequest('http://localhost/api/users/permissions-audit/preview/start', {
      method: 'POST',
      body: JSON.stringify({ targetUserId, mode: 'read' }),
    }),
  );
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  listRow = { value: [DIRECTOR, JOINT_MD], is_active: true };
  listError = null;
  listQuery = [];
  generateLink.mockReset().mockResolvedValue({ data: { properties: { hashed_token: 'h' } }, error: null });
  verifyOtp.mockReset().mockResolvedValue({
    data: { session: { access_token: 'a', refresh_token: 'r' } },
    error: null,
  });
});

describe('preview/start refuses anyone on the Director list', () => {
  it('refuses the Director, and mints no session', async () => {
    const res = await start(DIRECTOR);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Director list/);
    expect(generateLink).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('refuses every other person on the list too (Joint MD)', async () => {
    const res = await start(JOINT_MD);
    expect(res.status).toBe(403);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('matches the id whatever its letter case in the list', async () => {
    listRow = { value: [DIRECTOR.toUpperCase()], is_active: true };
    const res = await start(DIRECTOR);
    expect(res.status).toBe(403);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('refuses when the list cannot be read (could not tell is not "no")', async () => {
    listError = { message: 'network down' };
    const res = await start(HOD);
    expect(res.status).toBe(503);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('reads the ONE global list row by its key', async () => {
    await start(HOD);
    expect(listQuery).toEqual([
      ['platform_policies', 'policy_key', 'platform.the_director_profile_ids'],
      ['platform_policies', 'scope_type', 'global'],
      ['platform_policies', 'scope_id', null],
    ]);
  });

  it('still lets a super admin preview someone who is not on the list', async () => {
    const res = await start(HOD);
    expect(res.status).toBe(200);
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'hod@jkkn.ac.in' });
  });

  it('a switched-off or missing list names nobody (same as fn_is_the_director)', async () => {
    listRow = { value: [DIRECTOR], is_active: false };
    expect((await start(DIRECTOR)).status).toBe(200);
    listRow = null;
    expect((await start(DIRECTOR)).status).toBe(200);
  });
});
