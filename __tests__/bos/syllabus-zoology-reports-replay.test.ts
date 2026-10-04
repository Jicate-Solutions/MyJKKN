/**
 * Replays the six Zoology reports behind #4018 against the REAL rows they were
 * looking at — a copy of JKKN CAS's Zoology papers taken read-only from
 * production on 27 Sep 2026 (_fixtures/zoology-cas-2026-09-27.json: codes,
 * names, board, regulation, stream, latest flag; no personal data).
 *
 * Each report's URL is sent to the real list route exactly as the reporter had
 * it (board, regulation, stream "Arts", search). The route lists current
 * versions only (isLatest defaults to true), as the page does. The route must say how many
 * matching papers the Stream / Board choice hides, and the "Show all streams
 * and boards" request (the same URL without stream and boardId — what the page
 * button sends) must return the papers the reporter could not find.
 *
 * The in-memory table models what the route relies on: eq / in, the stream
 * `imatch` (Postgres `~*`), the search `.or(course_code.ilike…,course_name.ilike…)`,
 * range + exact count, and the CAS sibling-regulation lookup on `regulations`.
 */
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import ZOOLOGY from './_fixtures/zoology-cas-2026-09-27.json';

type Row = Record<string, unknown>;
const UG = '892a3578-5598-412f-827c-4f01e4f16b01';
const PG = 'dcabe2a0-eb16-41aa-876d-2ae5988c4b14';
const REG = '4dc273c5-3b38-425c-886b-eff19c4dfdb7';
const INST = 'a33138b6-4eea-4675-941f-1071bf88b127';

const TABLES: Record<string, Row[]> = {
  bos_course_syllabi: ZOOLOGY as Row[],
  // CAS: the Aided and Self rows of one regulation share its code.
  regulations: [
    { id: REG, regulation_code: 'R-2024', is_active: true },
    { id: 'faa44348-46f2-42a7-9f9a-bb4646f771a0', regulation_code: 'R-2024', is_active: true },
  ],
};

function pgImatch(pattern: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return new RegExp(pattern.replace(/\[\[:space:\]\]/g, '\\s'), 'i').test(value);
}
function ilike(value: unknown, pattern: string): boolean {
  if (typeof value !== 'string') return false;
  const body = pattern.replace(/%/g, '');
  return value.toLowerCase().includes(body.toLowerCase());
}

function table(name: string) {
  const rows = TABLES[name] ?? [];
  const preds: Array<(r: Row) => boolean> = [];
  let window: [number, number] | null = null;
  const matching = () => rows.filter((r) => preds.every((p) => p(r)));
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    order: () => b,
    range: (from: number, to: number) => {
      window = [from, to];
      return b;
    },
    eq: (c: string, v: unknown) => (preds.push((r) => r[c] === v), b),
    in: (c: string, vs: unknown[]) => (preds.push((r) => vs.includes(r[c])), b),
    filter: (c: string, op: string, v: unknown) => {
      if (op !== 'imatch') throw new Error(`unsupported operator ${op}`);
      preds.push((r) => pgImatch(String(v), r[c]));
      return b;
    },
    or: (expr: string) => {
      const parts = expr.split(',').map((p) => p.split('.ilike.') as [string, string]);
      preds.push((r) => parts.some(([c, pat]) => ilike(r[c], pat)));
      return b;
    },
    maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      const all = matching();
      const data = window ? all.slice(window[0], window[1] + 1) : all;
      return Promise.resolve({ data, count: all.length, error: null }).then(res, rej);
    },
  });
  return b;
}

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (name: string) => table(name),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => fakeClient(),
  createServiceRoleClient: () => fakeClient(),
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock('@/lib/utils/bos/bos-access', () => ({
  resolveBosAccess: async () => ({ isSuperAdmin: true }),
  resolveBosBoardScope: async () => ({ isSuperAdmin: true, boardsOf: new Set<string>() }),
  applyInstitutionScope: (_s: unknown, id: string | undefined) => id ?? null,
  guardInstitutionWrite: () => null,
  guardSyllabusEdit: () => null,
  resolveCoeInstitutionId: async () => null,
  readableCounsellingCodes: async () => [],
  readableInstitutionIds: async () => [],
  hasBosPermission: async () => true,
  isBosReadAllObserver: () => false,
}));
vi.mock('@/lib/utils/bos/institution-scope', () => ({ counsellingCodeFor: async () => null }));
vi.mock('@/lib/utils/bos/course-code-conflict', () => ({
  findCourseCodeConflict: async () => null,
  courseCodeConflictMessage: () => 'conflict',
  courseCodeConflictMessageFor: async () => 'conflict',
  UNIQUE_VIOLATION: '23505',
}));
vi.mock('@/lib/services/coe/coe-rest-client', () => ({
  CoeRestClient: { create: () => ({ get: async () => ({ data: [] }) }) },
}));

import { GET as listPapers } from '@/app/api/bos/syllabus/route';

type Filters = { search: string; board?: string; stream?: string };

async function get(f: Filters) {
  const qs = new URLSearchParams({ institutionsId: INST, regulationId: REG, search: f.search, limit: '500' });
  if (f.board) qs.set('boardId', f.board);
  if (f.stream) qs.set('stream', f.stream);
  const res = await listPapers(new NextRequest(`http://x/api/bos/syllabus?${qs.toString()}`));
  expect(res.status).toBe(200);
  return (await res.json()) as { data: Row[]; metadata: { total: number; hidden_by_filters?: number } };
}
const codes = (rows: Row[]) => [...new Set(rows.map((r) => String(r.course_code)))].sort();
const latest = (rows: Row[]) => rows.filter((r) => r.is_latest === true);

describe('the six Zoology reports, replayed on the real rows', () => {
  it('BUG-005542 — 24UZOS02 (blank stream) is hidden by "Arts"; the notice counts it and show-all returns it', async () => {
    const asReported = await get({ search: '24UZOS02', stream: 'Arts' });
    expect(asReported.metadata.total).toBe(0);
    expect(asReported.metadata.hidden_by_filters).toBe(1);
    const all = await get({ search: '24UZOS02' });
    expect(codes(all.data)).toEqual(['24UZOS02']);
  });

  it('BUG-005774 — 24UZO searched under the PG board: nothing shows, 33 are counted, show-all returns all 33 current UG papers', async () => {
    const asReported = await get({ search: '24UZO', board: PG, stream: 'Arts' });
    expect(asReported.metadata.total).toBe(0);
    expect(asReported.metadata.hidden_by_filters).toBe(33);
    const all = await get({ search: '24UZO' });
    expect(codes(latest(all.data))).toHaveLength(33);
    expect(latest(all.data).every((r) => r.board_id === UG)).toBe(true);
  });

  it('BUG-005779 — UG board, "Arts": 16 shown, 17 more counted; show-all returns all 33 current UG papers', async () => {
    const asReported = await get({ search: '24UZO', board: UG, stream: 'Arts' });
    expect(asReported.metadata.total).toBe(16);
    expect(asReported.metadata.hidden_by_filters).toBe(17);
    const all = await get({ search: '24UZO' });
    expect(codes(latest(all.data))).toHaveLength(33);
  });

  it('BUG-005789 — PG board, "Arts": 19 shown, 8 more counted; show-all returns all 27 current PG papers', async () => {
    const asReported = await get({ search: '24PZO', board: PG, stream: 'Arts' });
    expect(asReported.metadata.total).toBe(19);
    expect(asReported.metadata.hidden_by_filters).toBe(8);
    const all = await get({ search: '24PZO' });
    expect(codes(latest(all.data))).toHaveLength(27);
  });

  it('BUG-005798 — 24PZOE03 is on the PG board but was searched under UG; the notice counts it and show-all returns it', async () => {
    const asReported = await get({ search: '24PZOE03', board: UG, stream: 'Arts' });
    expect(asReported.metadata.total).toBe(0);
    expect(asReported.metadata.hidden_by_filters).toBe(1);
    const all = await get({ search: '24PZOE03' });
    expect(codes(all.data)).toEqual(['24PZOE03']);
    expect(all.data[0].board_id).toBe(PG);
  });

  it('BUG-005787 — the search "24UO" (no Z) matches no Zoology paper at all: nothing hidden, so no notice — the search text is the cause', async () => {
    const asReported = await get({ search: '24UO', board: UG, stream: 'Arts' });
    expect(asReported.metadata.total).toBe(0);
    expect(asReported.metadata.hidden_by_filters).toBeUndefined();
    expect((await get({ search: '24UO' })).metadata.total).toBe(0);
  });
});
