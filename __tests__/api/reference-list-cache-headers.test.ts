/**
 * Reference lists — 60-second private browser cache.
 *
 * Five GET-only reference routes (institutions, departments, BoS
 * institutions / regulations / boards) set
 * `Cache-Control: private, max-age=60, stale-while-revalidate=300` on their
 * 200 response so the browser reuses the body across page navigations and
 * React Query refetches. The two things that must never happen:
 *
 *   - an error response carries the header (a 401 cached for 60 s would keep a
 *     freshly signed-in user locked out of every dropdown);
 *   - a response is ever `public` / `s-maxage` (these rows are per-user and
 *     per-tenant; the CDN must never hold them).
 *
 * Auth and the Supabase / COE reads are faked; only the header is under test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { REFERENCE_LIST_CACHE, withReferenceListCache } from '@/lib/http/cache-control';

// ---------------------------------------------------------------------------
// Mocks — declared before the handlers are imported (vitest hoists vi.mock).
// ---------------------------------------------------------------------------

let currentUser: { id: string } | null = { id: 'user-1' };
let queryError: { message: string } | null = null;

/** Chainable PostgREST fake: every builder call returns itself; awaiting it yields rows. */
function chain(rows: unknown[]) {
  const q: any = {};
  for (const m of ['select', 'order', 'eq', 'in']) q[m] = () => q;
  q.then = (res: any, rej: any) =>
    Promise.resolve(queryError ? { data: null, error: queryError } : { data: rows, error: null }).then(res, rej);
  return q;
}

const ROWS: Record<string, unknown[]> = {
  institutions: [{ id: 'i1', name: 'JKKN College of Arts and Science', display_name: 'CAS' }],
  departments: [{ id: 'd1', department_name: 'Computer Science' }],
  regulations: [{ id: 'r1', regulation_year: 2024, regulation_code: 'R24', institution_id: 'i1' }],
};

const fakeSupabase = {
  auth: { getUser: () => Promise.resolve({ data: { user: currentUser }, error: null }) },
  from: (table: string) => chain(ROWS[table] ?? []),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(fakeSupabase),
  createServerSupabaseClient: () =>
    Promise.resolve({
      ...fakeSupabase,
      from: (table: string) =>
        table === 'profiles'
          ? { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'user-1', email: 'a@jkkn.ac.in', role: 'admin', institution_id: 'i1' }, error: null }) }) }) }
          : chain(ROWS[table] ?? []),
    }),
}));

// departments uses the service-role client (RLS bypass) behind withAuth.
vi.mock('@/lib/supabase/client', () => ({ createAdminClient: () => fakeSupabase }));

// withAuth's session detection: a Supabase auth cookie is always present so the
// session flow runs; whether it succeeds is decided by `currentUser` above.
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ getAll: () => [{ name: 'sb-test-auth-token', value: 'x' }] }),
}));
vi.mock('@/lib/auth/preview-session', () => ({
  getPreviewClaimsFromCookies: () => Promise.resolve(null),
  writePreviewAudit: () => Promise.resolve(),
  canUseWriteMode: () => false,
}));
vi.mock('@/lib/auth/impersonate', () => ({ createImpersonatedClient: () => Promise.resolve(fakeSupabase) }));
vi.mock('@/lib/services/base-service', () => ({
  BaseService: { runWithClient: (_client: unknown, fn: () => unknown) => fn() },
}));

// BoS scope helpers: a super admin, so every list is visible without a DB read.
vi.mock('@/lib/utils/bos/bos-access', () => ({
  BOS_LOOKUP_VIEW_KEYS: [],
  resolveBosAccess: () => Promise.resolve({ isSuperAdmin: true, institutionsId: null }),
  resolveBosBoardScope: () => Promise.resolve({ isSuperAdmin: true, institutionsId: null, allInstitutionIds: [] }),
  hasAnyBosPermission: () => Promise.resolve(false),
  isBosReadAllObserver: () => false,
  resolveCoeInstitutionCode: () => Promise.resolve('JKKN-CAS'),
  resolveCoeInstitutionById: () => Promise.resolve(null),
}));

// COE (external MDM) reads for BoS institutions and boards.
vi.mock('@/lib/services/coe/coe-rest-client', () => ({
  CoeApiError: class CoeApiError extends Error { status = 500; },
  CoeRestClient: {
    create: () => ({
      get: (path: string) =>
        Promise.resolve(
          path === '/api/v1/institutions'
            ? [{ id: 'c1', institution_code: 'JKKN-CAS', name: 'JKKN CAS', myjkkn_institution_ids: ['i1'], is_active: true }]
            : [{ id: 'b1', board_code: 'CS', board_name: 'Computer Science' }]
        ),
    }),
  },
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

// SUTs imported AFTER the mocks.
import { GET as getInstitutions } from '@/app/api/institutions/route';
import { GET as getDepartments } from '@/app/api/departments/route';
import { GET as getBosInstitutions } from '@/app/api/bos/institutions/route';
import { GET as getBosRegulations } from '@/app/api/bos/regulations/route';
import { GET as getBosBoards } from '@/app/api/bos/boards/route';

function req(path: string) {
  return new NextRequest(`https://jkkn.ai${path}`, { method: 'GET' });
}

const ROUTES: Array<{ name: string; call: () => Promise<Response> }> = [
  { name: 'GET /api/institutions', call: () => getInstitutions(req('/api/institutions')) },
  { name: 'GET /api/departments', call: () => getDepartments(req('/api/departments?institution_id=i1')) },
  { name: 'GET /api/bos/institutions', call: () => getBosInstitutions() },
  { name: 'GET /api/bos/regulations', call: () => getBosRegulations(req('/api/bos/regulations?institutionId=i1')) },
  { name: 'GET /api/bos/boards', call: () => getBosBoards(req('/api/bos/boards?institutionsId=i1')) },
];

beforeEach(() => {
  currentUser = { id: 'user-1' };
  queryError = null;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('withReferenceListCache', () => {
  it('sets the private 60 s policy and keys the browser cache on the session cookie', () => {
    const res = withReferenceListCache(NextResponse.json({ ok: true }));
    expect(res.headers.get('cache-control')).toBe(REFERENCE_LIST_CACHE);
    expect(res.headers.get('vary')).toBe('Cookie');
  });

  it('is browser-only: never public, never s-maxage', () => {
    expect(REFERENCE_LIST_CACHE).toMatch(/^private,/);
    expect(REFERENCE_LIST_CACHE).not.toMatch(/public|s-maxage/);
  });
});

describe.each(ROUTES)('$name', ({ call }) => {
  it('200 carries the reference-list cache policy', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(REFERENCE_LIST_CACHE);
  });

  it('401 (no session) never carries it', async () => {
    currentUser = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).not.toBe(REFERENCE_LIST_CACHE);
  });
});

describe('error and empty-fallback paths stay uncached', () => {
  it('GET /api/institutions 500 (query error) never carries it', async () => {
    queryError = { message: 'connection refused' };
    const res = await getInstitutions(req('/api/institutions'));
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).not.toBe(REFERENCE_LIST_CACHE);
  });

  it('GET /api/bos/boards empty fallback (no resolvable institution) is not pinned for 60 s', async () => {
    const res = await getBosBoards(req('/api/bos/boards'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [], count: 0 });
    expect(res.headers.get('cache-control')).not.toBe(REFERENCE_LIST_CACHE);
  });
});
