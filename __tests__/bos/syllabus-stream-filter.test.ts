/**
 * BOS syllabus Stream — case/space-tolerant list filter, de-duplicated stream
 * facet, and trim-on-save.
 *
 * BUG-005789, 005787, 005779, 005774, 005798, 005542: the syllabus list
 * filtered Stream with an exact match while Stream is a free-text box, so
 * production holds "Arts" 132 / "ARTS" 224 / "arts" 26 / "Arts " 1 (desk count,
 * 24 Sep 2026) and choosing Arts showed 132 of ~383 Arts syllabi.
 *
 * These tests drive the REAL route handlers against an in-memory table whose
 * `imatch` behaves like Postgres `~*` and whose `eq` is exact — so the old
 * `.eq('stream', stream)` returns only the exact spelling, and the fix returns
 * every case/space variant and nothing else.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;

// Postgres `~*` (case-insensitive regex) stand-in. POSIX [[:space:]] → \s.
// NULL never matches, as in SQL.
function pgImatch(pattern: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return new RegExp(pattern.replace(/\[\[:space:\]\]/g, '\\s'), 'i').test(value);
}

interface Log {
  filters: Array<[string, ...unknown[]]>;
  writes: Array<[string, Row]>;
}

function fakeTable(rows: Row[], log: Log) {
  const preds: Array<(r: Row) => boolean> = [];
  let written: Row | null = null;
  const matching = () => rows.filter((r) => preds.every((p) => p(r)));
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    order: () => b,
    range: () => b,
    or: () => b,
    eq: (c: string, v: unknown) => {
      log.filters.push(['eq', c, v]);
      preds.push((r) => r[c] === v);
      return b;
    },
    in: (c: string, vs: unknown[]) => {
      preds.push((r) => vs.includes(r[c]));
      return b;
    },
    filter: (c: string, op: string, v: unknown) => {
      log.filters.push(['filter', c, op, v]);
      if (op !== 'imatch') throw new Error(`fake table: unsupported operator ${op}`);
      preds.push((r) => pgImatch(String(v), r[c]));
      return b;
    },
    ilike: (c: string, v: unknown) => {
      log.filters.push(['ilike', c, v]);
      throw new Error('fake table: ilike not modelled');
    },
    insert: (p: Row) => {
      log.writes.push(['insert', p]);
      written = p;
      return b;
    },
    update: (p: Row) => {
      log.writes.push(['update', p]);
      written = p;
      return b;
    },
    single: async () => ({ data: written ?? matching()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      const data = matching();
      return Promise.resolve({ data, count: data.length, error: null }).then(res, rej);
    },
  });
  return b;
}

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  log: { filters: [], writes: [] } as {
    filters: Array<[string, ...unknown[]]>;
    writes: Array<[string, Record<string, unknown>]>;
  },
}));

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => fakeTable(state.rows, state.log),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => fakeClient(),
  createServiceRoleClient: () => fakeClient(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => fakeClient(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));

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

vi.mock('@/lib/utils/bos/institution-scope', () => ({
  counsellingCodeFor: async () => null,
}));

vi.mock('@/lib/utils/bos/course-code-conflict', () => ({
  findCourseCodeConflict: async () => null,
  courseCodeConflictMessage: () => 'conflict',
  courseCodeConflictMessageFor: async () => 'conflict',
  UNIQUE_VIOLATION: '23505',
}));

vi.mock('@/lib/services/coe/coe-rest-client', () => ({
  CoeRestClient: { create: () => ({ get: async () => ({ data: [] }) }) },
}));

import { GET as listSyllabi, POST as createSyllabus } from '@/app/api/bos/syllabus/route';
import { PUT as updateSyllabus } from '@/app/api/bos/syllabus/[id]/route';
import { GET as syllabusMetrics } from '@/app/api/bos/syllabus/metrics/route';

const row = (id: string, stream: string | null): Row => ({
  id,
  course_code: id,
  course_name: `Course ${id}`,
  stream,
  is_latest: true,
  is_archived: false,
  version_number: 1,
  regulation_id: 'reg-1',
  institutions_id: 'inst-1',
  board_id: 'board-1',
  created_by: 'u1',
  last_modified_at: '2026-09-24T00:00:00Z',
});

const STREAM_ROWS: Row[] = [
  row('A1', 'Arts'),
  row('A2', 'ARTS'),
  row('A3', 'arts'),
  row('A4', 'Arts '),
  row('A5', '  arts'),
  row('X1', 'Arts and Science'),
  row('X2', 'Fine Arts'),
  row('S1', 'Science'),
  row('S2', 'SCIENCE '),
  row('N1', null),
];

async function list(stream: string): Promise<string[]> {
  const res = await listSyllabi(
    new NextRequest(`http://x/api/bos/syllabus?limit=500&stream=${encodeURIComponent(stream)}`),
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as { data: Row[] };
  return json.data.map((r) => String(r.id)).sort();
}

beforeEach(() => {
  state.rows = STREAM_ROWS.map((r) => ({ ...r }));
  state.log.filters = [];
  state.log.writes = [];
});

describe('GET /api/bos/syllabus — Stream filter', () => {
  it('Arts matches "Arts", "ARTS", "arts", "Arts " and "  arts" — not "Arts and Science", "Fine Arts" or NULL', async () => {
    expect(await list('Arts')).toEqual(['A1', 'A2', 'A3', 'A4', 'A5']);
  });

  it('the chosen value itself is matched case/space-insensitively ("ARTS " finds every Arts row)', async () => {
    expect(await list('ARTS ')).toEqual(['A1', 'A2', 'A3', 'A4', 'A5']);
  });

  it('Science matches "Science" and "SCIENCE " only', async () => {
    expect(await list('Science')).toEqual(['S1', 'S2']);
  });

  it('wildcards in the value are never passed through ("*", "%", "_" match nothing)', async () => {
    expect(await list('*')).toEqual([]);
    expect(await list('%')).toEqual([]);
    expect(await list('A_ts')).toEqual([]);
    expect(await list('Ar*')).toEqual([]);
    expect(await list('.*')).toEqual([]);
    expect(await list('Arts|Science')).toEqual([]);
    for (const f of state.log.filters) {
      if (f[0] !== 'filter' || f[1] !== 'stream') continue;
      // Strip the fixed wrapper the helper adds; what is left came from the user.
      const userPart = String(f[3])
        .replace(/\[\[:space:\]\][*+]/g, '')
        .replace(/^\^|\$$/g, '');
      expect(userPart).not.toMatch(/[*%_\\^$.?+()[\]{}|]/);
    }
  });
});

describe('GET /api/bos/syllabus/metrics — By Stream facet', () => {
  it('folds case/space variants into ONE entry per stream, labelled with the most-used spelling', async () => {
    const res = await syllabusMetrics(new Request('http://x/api/bos/syllabus/metrics?institutions_id=inst-1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { byStream: Record<string, number> };
    expect(json.byStream).toEqual({
      // "Arts", "ARTS", "arts", "Arts ", "  arts" → 5 rows. Trimmed spellings:
      // "Arts" ×2, "arts" ×2, "ARTS" ×1 — the tie goes to the first seen.
      Arts: 5,
      'Arts and Science': 1,
      'Fine Arts': 1,
      Science: 2,
      null: 1,
    } as unknown as Record<string, number>);
  });
});

describe('Save — Stream is trimmed', () => {
  it('POST /api/bos/syllabus stores "  Arts  " as "Arts"', async () => {
    const res = await createSyllabus(
      new NextRequest('http://x/api/bos/syllabus', {
        method: 'POST',
        body: JSON.stringify({
          institutions_id: 'inst-1',
          course_code: 'NEW1',
          course_name: 'New course',
          stream: '  Arts  ',
        }),
      }),
    );
    expect(res.status).toBe(201);
    const insert = state.log.writes.find((w) => w[0] === 'insert');
    expect(insert?.[1].stream).toBe('Arts');
  });

  it('PUT /api/bos/syllabus/[id] stores "Science " as "Science", and a blank stream as null', async () => {
    for (const [sent, stored] of [
      ['Science ', 'Science'],
      ['   ', null],
    ] as const) {
      state.log.writes = [];
      const res = await updateSyllabus(
        new NextRequest('http://x/api/bos/syllabus/A1', {
          method: 'PUT',
          body: JSON.stringify({ course_name: 'Course A1', stream: sent }),
        }),
        { params: Promise.resolve({ id: 'A1' }) },
      );
      expect(res.status).toBe(200);
      const update = state.log.writes.find((w) => w[0] === 'update');
      expect(update?.[1].stream).toBe(stored);
    }
  });

  it('PUT leaves the stream untouched when the body does not send one', async () => {
    const res = await updateSyllabus(
      new NextRequest('http://x/api/bos/syllabus/A1', {
        method: 'PUT',
        body: JSON.stringify({ course_name: 'Course A1' }),
      }),
      { params: Promise.resolve({ id: 'A1' }) },
    );
    expect(res.status).toBe(200);
    const update = state.log.writes.find((w) => w[0] === 'update');
    expect(update?.[1].stream).toBeUndefined();
  });
});
