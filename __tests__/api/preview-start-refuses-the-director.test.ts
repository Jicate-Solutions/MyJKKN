/**
 * Draft #4121 review (W12, 30 Sep): "preview as" mints a REAL session for the
 * target. If a super admin could preview as someone on the Director list, the
 * database would see the Director signed in, and the list's guard would let
 * that super admin add themselves. The start route must refuse any target on
 * the list BEFORE any session is minted, and refuse when it cannot tell.
 *
 * Round 3 (reviewer A): the route used to mint the session for
 * profiles.email, which its owner can edit. A profile that is NOT on the list,
 * whose email was set to a listed person's sign-in email, got a real session
 * as that listed person. The route now looks up the SIGN-IN account by id and
 * uses its own email, and after minting it checks that the session belongs
 * to the target, or it aborts.
 *
 * Runs the REAL route against in-memory stand-ins for Supabase. The stand-in
 * for GoTrue mints a session for whichever sign-in account owns the email
 * the magic link was made for, exactly as the real one does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const DIRECTOR = 'd0000000-0000-4000-8000-000000000001';
const JOINT_MD = 'd0000000-0000-4000-8000-000000000006';
const HOD = 'd0000000-0000-4000-8000-000000000005';
const DEV = 'd0000000-0000-4000-8000-000000000002';
const SPOOF = 'd0000000-0000-4000-8000-000000000009';

type ListRow = { value: unknown; is_active: boolean } | null;
let listRow: ListRow;
let listError: { message: string } | null;
let listQuery: Array<[string, string, unknown]>;
const generateLink = vi.fn();
const verifyOtp = vi.fn();
const getUserById = vi.fn();
const adminSignOut = vi.fn();
const setSession = vi.fn();
let lastLinkEmail: string | null;
let callerSignInEmail: string;

const profiles: Record<string, Record<string, unknown>> = {
  [DEV]: { id: DEV, email: 'dev.one@jkkn.ac.in', full_name: 'Dev One', role: 'super_admin', is_super_admin: true },
  [DIRECTOR]: { id: DIRECTOR, email: 'director@jkkn.ac.in', full_name: 'The Director', role: 'super_admin', is_active: true },
  [JOINT_MD]: { id: JOINT_MD, email: 'jointmd@jkkn.ac.in', full_name: 'Joint MD', role: 'admin', is_active: true },
  [HOD]: { id: HOD, email: 'hod@jkkn.ac.in', full_name: 'An HOD', role: 'hod', is_active: true },
  // NOT on the list; edited their own profile email to the Director's sign-in email.
  [SPOOF]: { id: SPOOF, email: 'director@jkkn.ac.in', full_name: 'Spoofer', role: 'hod', is_active: true },
};

// Sign-in accounts (auth.users). The email here is the one that signs in.
const authUsers: Record<string, { id: string; email: string }> = {
  [DEV]: { id: DEV, email: 'dev.one@jkkn.ac.in' },
  [DIRECTOR]: { id: DIRECTOR, email: 'director@jkkn.ac.in' },
  [JOINT_MD]: { id: JOINT_MD, email: 'isvarya@jkkn.ac.in' },
  [HOD]: { id: HOD, email: 'hod@jkkn.ac.in' },
  [SPOOF]: { id: SPOOF, email: 'spoof@jkkn.ac.in' },
};
const authIdForEmail = (email: string | null) =>
  Object.values(authUsers).find((u) => u.email === email)?.id ?? null;

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
  canUseWriteMode: (email: string | null | undefined) => email === 'director@jkkn.ac.in',
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: DEV, email: callerSignInEmail } }, error: null }),
      setSession,
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
        auth: { admin: { generateLink, getUserById, signOut: adminSignOut } },
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

function start(targetUserId: string, mode: 'read' | 'write' = 'read') {
  return POST(
    new NextRequest('http://localhost/api/users/permissions-audit/preview/start', {
      method: 'POST',
      body: JSON.stringify({ targetUserId, mode }),
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
  lastLinkEmail = null;
  callerSignInEmail = 'dev.one@jkkn.ac.in';
  profiles[DEV].email = 'dev.one@jkkn.ac.in';
  generateLink.mockReset().mockImplementation(async ({ email }: { email: string }) => {
    lastLinkEmail = email;
    return { data: { properties: { hashed_token: 'h' } }, error: null };
  });
  // Like GoTrue: the session belongs to the sign-in account that owns the email.
  verifyOtp.mockReset().mockImplementation(async () => {
    const id = authIdForEmail(lastLinkEmail);
    return {
      data: { session: { access_token: 'a', refresh_token: 'r', user: { id } }, user: { id } },
      error: null,
    };
  });
  getUserById.mockReset().mockImplementation(async (id: string) => ({
    data: { user: authUsers[id] ?? null },
    error: null,
  }));
  adminSignOut.mockReset().mockResolvedValue({ data: null, error: null });
  setSession.mockReset().mockResolvedValue({ error: null });
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

describe('preview/start mints the session for the SIGN-IN account, never profiles.email', () => {
  it('a non-listed person whose profile email equals the Director\'s sign-in email gets only their OWN session', async () => {
    const res = await start(SPOOF);
    expect(res.status).toBe(200);
    expect(getUserById).toHaveBeenCalledWith(SPOOF);
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'spoof@jkkn.ac.in' });
    expect(generateLink).not.toHaveBeenCalledWith({ type: 'magiclink', email: 'director@jkkn.ac.in' });
    expect(setSession).toHaveBeenCalledTimes(1);
    expect((await res.json()).target.id).toBe(SPOOF);
  });

  it('checks the Director list on the sign-in id', async () => {
    await start(SPOOF);
    expect(getUserById.mock.invocationCallOrder[0]).toBeLessThan(generateLink.mock.invocationCallOrder[0]);
    expect((await start(JOINT_MD)).status).toBe(403);
  });

  it('aborts, installs nothing and signs the stray session out when the minted session is someone else\'s', async () => {
    verifyOtp.mockResolvedValueOnce({
      data: { session: { access_token: 'stray', refresh_token: 'r', user: { id: DIRECTOR } }, user: { id: DIRECTOR } },
      error: null,
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await start(HOD);
    expect(res.status).toBe(500);
    expect(setSession).not.toHaveBeenCalled();
    expect(adminSignOut).toHaveBeenCalledWith('stray', 'global');
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('does not belong to the target'))).toBe(true);
    errSpy.mockRestore();
  });

  it('refuses when the sign-in account cannot be read (503), and mints nothing', async () => {
    getUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: 'network down' } });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await start(HOD);
    expect(res.status).toBe(503);
    expect(generateLink).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('refuses a profile with no sign-in account (404), and mints nothing', async () => {
    getUserById.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await start(HOD);
    expect(res.status).toBe(404);
    expect(generateLink).not.toHaveBeenCalled();
  });
});

describe('preview/start decides write mode by the SIGN-IN email, never profiles.email', () => {
  it('refuses write mode to a super admin whose PROFILE email is the Director\'s but whose sign-in email is not', async () => {
    profiles[DEV].email = 'director@jkkn.ac.in'; // editable by its owner
    callerSignInEmail = 'dev.one@jkkn.ac.in'; // auth.users, not editable
    const res = await start(HOD, 'write');
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Write-mode preview is restricted/);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('allows write mode when the sign-in email is allowed, whatever the profile email says', async () => {
    profiles[DEV].email = 'something.else@jkkn.ac.in';
    callerSignInEmail = 'director@jkkn.ac.in';
    const res = await start(HOD, 'write');
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe('write');
  });

  it('read mode never depends on either email', async () => {
    profiles[DEV].email = 'director@jkkn.ac.in';
    callerSignInEmail = 'dev.one@jkkn.ac.in';
    const res = await start(HOD, 'read');
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe('read');
  });
});
