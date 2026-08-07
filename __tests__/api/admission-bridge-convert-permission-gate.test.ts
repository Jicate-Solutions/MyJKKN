/**
 * Admission — POST /api/admission/bridge/convert permission gate.
 *
 * BUG-"Move to Counselor says Forbidden" (reported 2026-08-06 by an Admission
 * user at JKKN Main Office whose role DOES carry
 * admission.leads.convert_to_admitted).
 *
 * Root cause was in the database: public.user_has_permission(uuid, text) lost
 * its `GRANT EXECUTE ... TO authenticated` when the director-handover work
 * replaced it, so PostgREST answered the route's RPC with 42501 "permission
 * denied for function user_has_permission". The route destructured only
 * `{ data }` and threw the error away, so a DATABASE MISCONFIGURATION was
 * reported to the user as "you are not allowed" — the single most misleading
 * answer available, and the reason the report chased a permissions ghost.
 *
 * These tests pin the distinction the route must keep making:
 *   - the check ran and said no            -> 403 Forbidden
 *   - the check itself could not run       -> 500, and NOT the word Forbidden
 * The grant is restored in migration 20260814020000; this suite is what stops
 * the failure from being silent if it is ever lost again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before the handler is imported (vitest hoists vi.mock).
// ---------------------------------------------------------------------------

let currentUser: { id: string } | null = { id: 'user-admission' };
let permissionResponse: { data: unknown; error: unknown } = { data: true, error: null };

const rpcMock = vi.fn(() => Promise.resolve(permissionResponse));

/**
 * Service-role stand-in. Every test here stops at (or before) the lead fetch,
 * so the builder only has to be chainable and resolve `.single()` to "no lead".
 * A 404 therefore means "the gate let us through" — which is exactly the
 * assertion the happy-path test needs and nothing more.
 */
function svcBuilder() {
  const b: any = {
    from: vi.fn(() => b),
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    limit: vi.fn(() => b),
    single: vi.fn(() => Promise.resolve({ data: null, error: { message: 'no rows' } })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser }, error: null }) },
      rpc: (...args: unknown[]) => rpcMock(...(args as [])),
    }),
  createServiceRoleClient: () => svcBuilder(),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

// SUT imported AFTER the mocks.
import { POST } from '@/app/api/admission/bridge/convert/route';

const LEAD_ID = '4f45aa33-fdc9-4421-baf0-842c4452516f';
const INSTITUTION_ID = 'b962527f-97ce-4238-89ce-7b532d7c2bc6';

function convertRequest(body: unknown = { leadId: LEAD_ID, institutionId: INSTITUTION_ID }) {
  return new Request('https://jkkn.ai/api/admission/bridge/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  currentUser = { id: 'user-admission' };
  permissionResponse = { data: true, error: null };
  rpcMock.mockClear();
});

// ---------------------------------------------------------------------------

describe('POST /api/admission/bridge/convert — permission gate', () => {
  it('refuses an unauthenticated caller with 401', async () => {
    currentUser = null;
    const res = await POST(convertRequest());
    expect(res.status).toBe(401);
  });

  it('asks the database about the catalog key, keyed to the signed-in user', async () => {
    await POST(convertRequest());
    expect(rpcMock).toHaveBeenCalledWith('user_has_permission', {
      user_id: 'user-admission',
      permission_key: 'admission.leads.convert_to_admitted',
    });
  });

  it('returns 403 when the check RAN and answered no', async () => {
    permissionResponse = { data: false, error: null };
    const res = await POST(convertRequest());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
  });

  it('REGRESSION: a failed permission CHECK is 500, never 403 Forbidden', async () => {
    // The exact production shape: the grant on user_has_permission(uuid, text)
    // is missing, so PostgREST rejects the call. `data` comes back null, which
    // is falsy — indistinguishable from a genuine denial unless the route reads
    // `error`. Reporting this as Forbidden tells an admission officer with the
    // right role that she does not have it, and sends the whole investigation
    // to the permissions catalog instead of to the ACL.
    permissionResponse = {
      data: null,
      error: { code: '42501', message: 'permission denied for function user_has_permission' },
    };
    const res = await POST(convertRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toBe('Forbidden');
    expect(String(body.error)).toMatch(/permission check/i);
  });

  it('lets a permitted caller past the gate and on to the lead lookup', async () => {
    permissionResponse = { data: true, error: null };
    const res = await POST(convertRequest());
    // 404 = the gate passed and the (absent) lead was looked up.
    expect(res.status).toBe(404);
  });
});
