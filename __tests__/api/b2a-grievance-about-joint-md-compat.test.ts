/**
 * B2A grievance reads and the "about the Joint MD" filter (deep review of
 * #4079, M4).
 *
 *   GET /api/b2a/grievance            (list)
 *   GET /api/b2a/grievance/:id        (detail)
 *   GET /api/b2a/grievance/dashboard  (counts)
 *
 * With migration 20271010020000 applied, every read leaves out complaints
 * about the Joint MD (.eq('about_joint_md', false)). If the app reaches
 * production first, that column does not exist and PostgREST answers 42703;
 * the routes must then answer exactly as before the PR (no ticket can be
 * marked about the Joint MD yet) instead of a 500. Any other database error
 * is still a 500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data?: unknown; error: { code?: string; message: string } | null; count?: number | null };

/**
 * 'applied' = the column exists; 'missing' = 42703 when it is filtered on;
 * 'broken' = any read fails. A head:true count's failure arrives EMPTY (no
 * code, no message — PostgREST sends no body for HEAD; round 3, M4), so the
 * mock answers head requests that way, as postgrest-js does.
 * 'broken-head' = head counts fail empty for some other reason (column there).
 */
let dbState: 'applied' | 'missing' | 'broken' | 'broken-head' = 'applied';
const reads: { jmdFilter: boolean; head: boolean; probe: boolean }[] = [];

function chain() {
  let jmdFilter = false;
  let single = false;
  let head = false;
  let probe = false;
  const settle = (): Result => {
    reads.push({ jmdFilter, head, probe });
    if (dbState === 'broken') return { error: { code: '57014', message: 'canceling statement due to statement timeout' } };
    if (dbState === 'broken-head' && head) return { error: { message: '' } };
    if (dbState === 'missing' && jmdFilter) {
      if (head) return { error: { message: '' } };
      return { error: { code: '42703', message: 'column grievance_tickets.about_joint_md does not exist' } };
    }
    if (single) return { data: { id: ID, ticket_number: 'GRV-1' }, error: null };
    return { data: [{ id: ID, ticket_number: 'GRV-1' }], error: null, count: 3 };
  };
  const c: Record<string, unknown> = {};
  for (const m of ['not', 'in', 'is', 'lt', 'order', 'range']) c[m] = () => c;
  c.select = (_cols: string, opts?: { head?: boolean }) => {
    head = opts?.head === true;
    return c;
  };
  c.limit = () => {
    probe = true;
    return Promise.resolve(settle());
  };
  c.eq = (col: string) => {
    if (col === 'about_joint_md') jmdFilter = true;
    return c;
  };
  c.single = () => {
    single = true;
    return Promise.resolve(settle());
  };
  c.then = (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(settle()).then(resolve, reject);
  return c;
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ from: () => chain() }),
}));
vi.mock('@/lib/api-keys/authenticate', () => ({
  authenticateApiKey: async () => ({ context: { keyId: 'k1', institutionId: null } }),
  resolveInstitutionId: () => null,
}));
vi.mock('@/lib/api-keys/rate-limiter', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 59, resetAt: new Date() }),
}));
vi.mock('@/lib/api-keys/audit-logger', () => ({
  logApiUsage: () => undefined,
  extractRequestMeta: () => ({ ipAddress: null, userAgent: null }),
}));

import { GET as listGET } from '@/app/api/b2a/grievance/route';
import { GET as detailGET } from '@/app/api/b2a/grievance/[id]/route';
import { GET as dashboardGET } from '@/app/api/b2a/grievance/dashboard/route';

const ID = '11111111-1111-4111-8111-111111111111';
const req = (path: string) => new Request(`http://localhost:3000${path}`) as never;

beforeEach(() => {
  dbState = 'applied';
  reads.length = 0;
});

describe('migration applied: complaints about the Joint MD are left out', () => {
  it('list, detail and every dashboard count filter on about_joint_md', async () => {
    expect((await listGET(req('/api/b2a/grievance'))).status).toBe(200);
    expect((await detailGET(req(`/api/b2a/grievance/${ID}`), { params: Promise.resolve({ id: ID }) })).status).toBe(200);
    expect((await dashboardGET(req('/api/b2a/grievance/dashboard'))).status).toBe(200);
    expect(reads.length).toBe(1 + 1 + 8);
    expect(reads.every(r => r.jmdFilter)).toBe(true);
  });
});

describe('app deployed before the migration: answers as before, not a 500', () => {
  beforeEach(() => {
    dbState = 'missing';
  });

  it('list', async () => {
    const res = await listGET(req('/api/b2a/grievance'));
    expect(res.status).toBe(200);
    expect((await res.json()).data.total).toBe(3);
    expect(reads.map(r => r.jmdFilter)).toEqual([true, false]);
  });

  it('detail', async () => {
    const res = await detailGET(req(`/api/b2a/grievance/${ID}`), { params: Promise.resolve({ id: ID }) });
    expect(res.status).toBe(200);
    expect(reads.map(r => r.jmdFilter)).toEqual([true, false]);
  });

  it('dashboard: its head:true counts fail EMPTY, so one probe decides (round 3, M4)', async () => {
    const res = await dashboardGET(req('/api/b2a/grievance/dashboard'));
    expect(res.status).toBe(200);
    expect(reads.filter(r => r.probe)).toHaveLength(1);
    expect(reads.filter(r => !r.jmdFilter && r.head)).toHaveLength(8);
  });
});

describe('an empty head-count failure with the column present is still a 500', () => {
  it('dashboard: the probe finds the column, so nothing is re-run without the filter', async () => {
    dbState = 'broken-head';
    const res = await dashboardGET(req('/api/b2a/grievance/dashboard'));
    expect(res.status).toBe(500);
    expect(reads.filter(r => r.probe)).toHaveLength(1);
    expect(reads.every(r => r.jmdFilter)).toBe(true);
  });
});

describe('any other database error is still a 500', () => {
  it('list, detail and dashboard', async () => {
    dbState = 'broken';
    expect((await listGET(req('/api/b2a/grievance'))).status).toBe(500);
    expect((await detailGET(req(`/api/b2a/grievance/${ID}`), { params: Promise.resolve({ id: ID }) })).status).toBe(500);
    expect((await dashboardGET(req('/api/b2a/grievance/dashboard'))).status).toBe(500);
    expect(reads.every(r => r.jmdFilter)).toBe(true);   // no retry without the filter
  });
});
