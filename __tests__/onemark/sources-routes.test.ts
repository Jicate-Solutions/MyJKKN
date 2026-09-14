/**
 * OneMark — the source routes refuse before they read, and refuse OUT LOUD.
 *
 * Four things are asserted here and nowhere else:
 *   · DELETE is 405 on both source routes, always, with the reason in the body
 *     (Lane S3's BEFORE DELETE trigger is the second wall, not the first);
 *   · a caller without `foundation.items.manage` cannot write, and gets a
 *     sentence rather than an empty 200 (CLAUDE.md #27);
 *   · a learner may READ the list — they pick sources when they practise;
 *   · a missing Lane S3 object reads as "not switched on yet", not as an error.
 *
 * The Supabase client is mocked. This file is about the gate, the status codes
 * and the wording, never about SQL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface QueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

let currentUser: { id: string } | null = { id: 'user-1' };
let permissionResult: boolean | null = true;
let permissionError: { message: string } | null = null;
let tableResults: Record<string, QueryResult> = {};
let writeResults: Record<string, QueryResult> = {};
let rpcResults: Record<string, QueryResult> = {};
let inserted: Array<{ table: string; payload: unknown }> = [];
let updated: Array<{ table: string; payload: unknown }> = [];
let deleted: Array<{ table: string }> = [];

vi.mock('next/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

/** A thenable query builder: every chainable method returns `this`, and awaiting
 *  it yields whatever the test parked under that table name.
 *
 *  Two deliberate refinements, both because the real client behaves this way and
 *  a cruder mock would let a route pass a test it should fail:
 *   · `single`/`maybeSingle` yield ONE row, taking the first of a parked list —
 *     otherwise a route that reads a row gets an array and every field is
 *     undefined, which quietly satisfies the wrong branch;
 *   · a WRITE reads `writeResults` first, so a test can park a healthy read and
 *     a failing insert (a unique-key race is exactly that shape). */
function builder(table: string) {
  let isWrite = false;
  const read = () => tableResults[table] ?? { data: [], error: null };
  const result = (): QueryResult => (isWrite ? (writeResults[table] ?? read()) : read());
  const one = (): QueryResult => {
    const r = result();
    return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
  };
  const self: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'ilike', 'order', 'range', 'limit', 'contains']) {
    self[m] = () => self;
  }
  self.insert = (payload: unknown) => {
    inserted.push({ table, payload });
    isWrite = true;
    return self;
  };
  self.update = (payload: unknown) => {
    updated.push({ table, payload });
    isWrite = true;
    return self;
  };
  self.delete = () => {
    deleted.push({ table });
    isWrite = true;
    return self;
  };
  self.single = () => Promise.resolve(one());
  self.maybeSingle = () => Promise.resolve(one());
  self.then = (resolve: (v: QueryResult) => unknown) => Promise.resolve(result()).then(resolve);
  return self;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) },
      from: (table: string) => builder(table),
      rpc: (name: string) => {
        if (name === 'user_has_permission') {
          return Promise.resolve({ data: permissionResult, error: permissionError });
        }
        return Promise.resolve(rpcResults[name] ?? { data: null, error: null });
      },
    }),
  createServiceRoleClient: () => ({}),
}));

import { NextRequest } from 'next/server';
import {
  GET as listSources,
  POST as createSource,
  DELETE as deleteSources,
} from '@/app/api/foundation/onemark/sources/route';
import {
  PATCH as patchSource,
  DELETE as deleteSource,
} from '@/app/api/foundation/onemark/sources/[key]/route';
import { GET as analyticsGet } from '@/app/api/foundation/onemark/results/sources/route';
import {
  GET as boardGet,
  POST as boardPost,
} from '@/app/api/foundation/onemark/sources/board-paper/route';

const EXAM = '11111111-1111-1111-1111-111111111111';
const ITEM = '22222222-2222-2222-2222-222222222222';

function req(url: string, init?: RequestInit) {
  return new NextRequest(`http://localhost${url}`, init as never);
}

function jsonReq(url: string, body: unknown) {
  return req(url, { method: 'POST', body: JSON.stringify(body) });
}

beforeEach(() => {
  currentUser = { id: 'user-1' };
  permissionResult = true;
  permissionError = null;
  inserted = [];
  updated = [];
  deleted = [];
  rpcResults = {};
  writeResults = {};
  tableResults = {
    onemark_item_sources: {
      data: [
        { key: 'internal', label: 'Internal', description: null, is_system: true, is_active: true, sort_order: 50 },
      ],
      error: null,
    },
    fp_items: { data: [], error: null },
    exam_definitions: { data: [{ id: EXAM, config_key: 'tn_hsc_physics', display_name: 'Physics' }], error: null },
    onemark_board_paper_hits: { data: [], error: null },
  };
});

describe('DELETE is refused on every source route', () => {
  it('answers the collection route with 405 and the reason', async () => {
    const res = await deleteSources();
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error).toMatch(/retired, never deleted/i);
    expect(body.error).toMatch(/blank the origin/i);
  });

  it('answers the single-source route with 405 too', async () => {
    const res = await deleteSource();
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error).toMatch(/retired, never deleted/i);
  });

  it('never issues a delete against the table', async () => {
    await deleteSources();
    await deleteSource();
    expect(deleted).toHaveLength(0);
  });
});

describe('GET /sources — a learner may read the list', () => {
  it('refuses an unauthenticated caller', async () => {
    currentUser = null;
    const res = await listSources(req('/api/foundation/onemark/sources'));
    expect(res.status).toBe(401);
  });

  it('serves the list to a signed-in caller who cannot manage, and says so', async () => {
    permissionResult = false;
    const res = await listSources(req('/api/foundation/onemark/sources'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.can_manage).toBe(false);
    expect(body.sources).toHaveLength(1);
  });

  it('leaves the counts out for a caller who cannot manage rather than 403-ing the whole list', async () => {
    permissionResult = false;
    const res = await listSources(req('/api/foundation/onemark/sources?counts=1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unrecorded).toBeUndefined();
  });

  it('adds the counts for a question author', async () => {
    tableResults.fp_items = {
      data: [
        { source_key: 'internal', is_active: true },
        { source_key: null, is_active: false },
      ],
      error: null,
    };
    const res = await listSources(req('/api/foundation/onemark/sources?counts=1'));
    const body = await res.json();
    expect(body.sources[0]).toMatchObject({ key: 'internal', items_total: 1, items_active: 1 });
    expect(body.unrecorded).toEqual({ total: 1, active: 0 });
  });

  it('turns a failed permission check into a 500, never into a quiet "no"', async () => {
    permissionError = { message: 'timeout' };
    const res = await listSources(req('/api/foundation/onemark/sources'));
    expect(res.status).toBe(500);
  });

  it('refuses a malformed exam filter', async () => {
    const res = await listSources(req('/api/foundation/onemark/sources?counts=1&exam=nope'));
    expect(res.status).toBe(400);
  });
});

describe('POST /sources', () => {
  it('refuses a caller without the question-author permission, with a sentence', async () => {
    permissionResult = false;
    const res = await createSource(jsonReq('/api/foundation/onemark/sources', { label: 'Weekly paper' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/question author/i);
    expect(inserted).toHaveLength(0);
  });

  it('derives the key server-side and refuses to let the caller choose one', async () => {
    tableResults.onemark_item_sources = { data: [], error: null };
    await createSource(
      jsonReq('/api/foundation/onemark/sources', { label: 'Weekly slip paper', key: 'anything_i_like' }),
    );
    expect(inserted).toHaveLength(1);
    expect(inserted[0].payload).toMatchObject({ key: 'weekly_slip_paper', is_system: false, is_active: true });
  });

  it('refuses a duplicate name before it reaches the database', async () => {
    const res = await createSource(jsonReq('/api/foundation/onemark/sources', { label: 'Internal' }));
    expect(res.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it('reports a race on the unique key as a 409 in plain words', async () => {
    tableResults.onemark_item_sources = { data: [], error: null };
    writeResults.onemark_item_sources = { data: null, error: { message: 'duplicate key', code: '23505' } };
    const res = await createSource(jsonReq('/api/foundation/onemark/sources', { label: 'Weekly paper' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/just added/i);
  });

  it('refuses a body that is not JSON', async () => {
    const res = await createSource(req('/api/foundation/onemark/sources', { method: 'POST', body: 'not json' }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /sources/<key>', () => {
  const params = { params: Promise.resolve({ key: 'internal' }) };

  it('refuses a caller without the question-author permission', async () => {
    permissionResult = false;
    const res = await patchSource(
      req('/api/foundation/onemark/sources/internal', { method: 'PATCH', body: JSON.stringify({ label: 'x' }) }),
      params,
    );
    expect(res.status).toBe(403);
    expect(updated).toHaveLength(0);
  });

  it('refuses to retire a built-in source and names the reason', async () => {
    const res = await patchSource(
      req('/api/foundation/onemark/sources/internal', {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      }),
      params,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/built-in/i);
    expect(updated).toHaveLength(0);
  });

  it('refuses a patch that tries to change the key', async () => {
    const res = await patchSource(
      req('/api/foundation/onemark/sources/internal', {
        method: 'PATCH',
        body: JSON.stringify({ key: 'renamed' }),
      }),
      params,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/identifier is fixed/i);
  });

  it('lets a built-in source be renamed, and never writes the key', async () => {
    const res = await patchSource(
      req('/api/foundation/onemark/sources/internal', {
        method: 'PATCH',
        body: JSON.stringify({ label: 'In-house' }),
      }),
      params,
    );
    expect(res.status).toBe(200);
    expect(updated).toHaveLength(1);
    expect(Object.keys(updated[0].payload as object)).not.toContain('key');
    expect(updated[0].payload).toMatchObject({ label: 'In-house', updated_by: 'user-1' });
  });

  it('404s a source that no longer exists rather than creating one', async () => {
    tableResults.onemark_item_sources = { data: null, error: null };
    const res = await patchSource(
      req('/api/foundation/onemark/sources/ghost', { method: 'PATCH', body: JSON.stringify({ label: 'x' }) }),
      { params: Promise.resolve({ key: 'ghost' }) },
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /results/sources — Lane S3 not applied yet', () => {
  it('reports "not switched on yet" instead of an error when the function is missing', async () => {
    rpcResults.fn_onemark_source_analytics = {
      data: null,
      error: { message: 'Could not find the function public.fn_onemark_source_analytics', code: 'PGRST202' },
    };
    const res = await analyticsGet(req(`/api/foundation/onemark/results/sources?exam=${EXAM}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toMatch(/not switched on yet/i);
    expect(body.analytics).toBeNull();
  });

  it('passes the function own refusal through as a 403 with a reason (ruling #1 keeps the OR in one place)', async () => {
    rpcResults.fn_onemark_source_analytics = {
      data: null,
      error: { message: 'fn_onemark_source_analytics: not authorized', code: '42501' },
    };
    const res = await analyticsGet(req(`/api/foundation/onemark/results/sources?exam=${EXAM}`));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/owns a school/i);
  });

  it('parses a real payload and keeps the no-origin bucket', async () => {
    rpcResults.fn_onemark_source_analytics = {
      data: {
        exam_definition_id: EXAM,
        exam_year: null,
        min_learners_for_item_stats: 3,
        sources: [{ source_key: null, items_total: 126, items_active: 1 }],
        notes: { hit_rate: 'h', lift: 'l' },
      },
      error: null,
    };
    const res = await analyticsGet(req(`/api/foundation/onemark/results/sources?exam=${EXAM}`));
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.analytics.sources[0].label).toBe('source not recorded');
    expect(body.analytics.min_learners_for_item_stats).toBe(3);
  });

  it('does not call the function at all without a subject', async () => {
    const res = await analyticsGet(req('/api/foundation/onemark/results/sources'));
    const body = await res.json();
    expect(body.analytics).toBeNull();
    expect(body.exams).toHaveLength(1);
  });

  it('refuses an unauthenticated caller', async () => {
    currentUser = null;
    const res = await analyticsGet(req('/api/foundation/onemark/results/sources'));
    expect(res.status).toBe(401);
  });
});

describe('board-paper ticks', () => {
  it('refuses a reader without the question-author permission', async () => {
    permissionResult = false;
    const res = await boardGet(req('/api/foundation/onemark/sources/board-paper'));
    expect(res.status).toBe(403);
  });

  it('reports "not switched on yet" when Lane S3 table is missing', async () => {
    tableResults.onemark_board_paper_hits = {
      data: null,
      error: { message: 'relation "onemark_board_paper_hits" does not exist', code: '42P01' },
    };
    const res = await boardGet(req(`/api/foundation/onemark/sources/board-paper?exam=${EXAM}&year=2025`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toMatch(/not switched on yet/i);
  });

  it('refuses a tick with no match kind, before touching the database', async () => {
    const res = await boardPost(
      jsonReq('/api/foundation/onemark/sources/board-paper', {
        exam_definition_id: EXAM,
        exam_year: 2025,
        item_id: ITEM,
      }),
    );
    expect(res.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it('records a valid tick with the author stamped on it', async () => {
    const res = await boardPost(
      jsonReq('/api/foundation/onemark/sources/board-paper', {
        exam_definition_id: EXAM,
        exam_year: 2025,
        item_id: ITEM,
        match_kind: 'near',
        board_qno: 12,
      }),
    );
    expect(res.status).toBe(201);
    expect(inserted[0].payload).toMatchObject({ noted_by: 'user-1', match_kind: 'near', board_qno: 12 });
  });

  it('reports a second tick for the same year and sitting as a 409 in plain words', async () => {
    writeResults.onemark_board_paper_hits = { data: null, error: { message: 'duplicate', code: '23505' } };
    const res = await boardPost(
      jsonReq('/api/foundation/onemark/sources/board-paper', {
        exam_definition_id: EXAM,
        exam_year: 2025,
        item_id: ITEM,
        match_kind: 'exact',
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already recorded/i);
  });

  it('returns 503 with a plain reason when the table is missing on write', async () => {
    writeResults.onemark_board_paper_hits = {
      data: null,
      error: { message: 'relation does not exist', code: '42P01' },
    };
    const res = await boardPost(
      jsonReq('/api/foundation/onemark/sources/board-paper', {
        exam_definition_id: EXAM,
        exam_year: 2025,
        item_id: ITEM,
        match_kind: 'exact',
      }),
    );
    expect(res.status).toBe(503);
  });
});
