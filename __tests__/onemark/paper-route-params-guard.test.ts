/**
 * PR #4010 review, point 3 — PATCH /api/foundation/onemark/paper/[id] refuses
 * what the wizard refuses:
 *   - a manual distribution whose chapter counts do not add up to the question
 *     count (the wizard blocks Step 3 → 4 on it; Regenerate went round that);
 *   - "By volume" on an English paper (English has no volumes).
 * And "Use the N available" in manual mode keeps the counts adding up, so the
 * next Regenerate is not refused by the rule above.
 *
 * The data loaders are stubbed; the route, the engine and the config
 * normaliser are the real ones.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const PAPER_ID = '33333333-3333-4333-8333-333333333333';

let examKey = 'tn_hsc_physics';
let storedConfig: any;
let updates: any[] = [];

vi.mock('next/server', async () => {
  const actual = await vi.importActual<any>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

function chain(result: () => any) {
  const c: any = {};
  for (const m of ['select', 'eq', 'contains', 'order', 'in', 'range']) c[m] = () => c;
  c.update = (u: any) => {
    updates.push(u);
    storedConfig = u.config;
    return c;
  };
  c.maybeSingle = () => Promise.resolve({ data: result(), error: null });
  c.single = () => Promise.resolve({ data: result(), error: null });
  return c;
}

const row = () => ({
  id: PAPER_ID,
  title: 'Mock',
  exam_definition_id: 'exam-1',
  cohort_id: null,
  kind: 'mock',
  config: storedConfig,
  created_by: 'user-1',
  updated_at: '2026-09-24T00:00:00Z',
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: () => chain(row) }),
  createServiceRoleClient: () => ({}),
}));

// English grammar-general "chapter" (is_general) — only in the pool when a
// test adds it.
const G = '44444444-4444-4444-8444-444444444444';
let withGeneral = false;

// U1 holds 3 items, U2 holds 20 (and G holds 2 when withGeneral).
const item = (p: { id: string; topic_id: string }) => ({
  ...p,
  bloom_level: 'K1',
  tags: [],
  source_key: null,
  source_year: null,
  times_served: 0,
});
const basePool = [
  ...Array.from({ length: 3 }, (_, i) => ({ id: `a${i}`, topic_id: U1 })),
  ...Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, topic_id: U2 })),
].map(item);
const generalPool = Array.from({ length: 2 }, (_, i) => item({ id: `g${i}`, topic_id: G }));
const pool = () => (withGeneral ? [...basePool, ...generalPool] : basePool);

vi.mock('@/app/api/foundation/onemark/paper/_shared', async (orig) => {
  const real = await orig<typeof import('@/app/api/foundation/onemark/paper/_shared')>();
  return {
    ...real,
    gate: async () => ({ userId: 'user-1', canManage: true, canSeeAnswers: true }),
    loadExam: async () => ({ id: 'exam-1', config_key: examKey, display_name: 'Subject' }),
    readPolicies: async () => ({ question_count: 15, question_count_by_exam: {}, max_series: 4 }),
    loadPool: async () => pool(),
    loadChapters: async () => [
      { id: U1, config_key: 'u1', display_name: 'Unit 1', sort_order: 1, is_general: false },
      { id: U2, config_key: 'u2', display_name: 'Unit 2', sort_order: 2, is_general: false },
      ...(withGeneral
        ? [{ id: G, config_key: 'onemark_eng_grammar_general', display_name: 'Grammar', sort_order: 99, is_general: true }]
        : []),
    ],
    loadCategoryWeights: async () => ({}),
    recentlyUsedIds: async () => new Set<string>(),
    loadItemsById: async () => [],
    buildDetail: (input: any) => ({ config: input.config }),
  };
});

import { PATCH } from '@/app/api/foundation/onemark/paper/[id]/route';

function patch(body: unknown) {
  const { NextRequest } = require('next/server');
  const req = new NextRequest(`http://localhost/api/foundation/onemark/paper/${PAPER_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ id: PAPER_ID }) });
}

function config(params: Record<string, unknown>) {
  return { onemark: true, state: 'DRAFT', step: 3, params, locked_ids: [], question_overrides: {}, resolved_item_ids: [] };
}

beforeEach(() => {
  examKey = 'tn_hsc_physics';
  withGeneral = false;
  updates = [];
});

describe('PATCH generate — manual counts must add up to the question count', () => {
  it('12 asked against a count of 15 is a 400 naming both numbers; nothing is written', async () => {
    storedConfig = config({ question_count: 15, distribution_mode: 'manual', chapter_counts: { [U1]: 2, [U2]: 10 } });
    const res = await patch({ action: 'generate' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/add up to 12, not 15/);
    expect(updates).toEqual([]);
  });

  it('a balanced manual set generates', async () => {
    storedConfig = config({ question_count: 15, distribution_mode: 'manual', chapter_counts: { [U1]: 3, [U2]: 12 } });
    const res = await patch({ action: 'generate' });
    expect(res.status).toBe(200);
    expect(storedConfig.resolved_item_ids).toHaveLength(15);
  });
});

describe('PATCH — "By volume" is Physics only', () => {
  it('saving selection_mode volume on an English paper is a 400; nothing is written', async () => {
    examKey = 'tn_hsc_english';
    storedConfig = config({ question_count: 20 });
    const res = await patch({ action: 'save', params: { selection_mode: 'volume', chapter_ids: [U1] } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/English has no volumes/);
    expect(updates).toEqual([]);
  });

  it('generating an English paper that already carries volume is refused too', async () => {
    examKey = 'tn_hsc_english';
    storedConfig = config({ question_count: 20, selection_mode: 'volume', chapter_ids: [U1] });
    const res = await patch({ action: 'generate' });
    expect(res.status).toBe(400);
    expect(updates).toEqual([]);
  });

  it('Physics may save By volume', async () => {
    storedConfig = config({ question_count: 15 });
    const res = await patch({ action: 'save', params: { selection_mode: 'volume', chapter_ids: [U1] } });
    expect(res.status).toBe(200);
    expect(storedConfig.params.selection_mode).toBe('volume');
  });
});

describe('PATCH use_available — manual counts keep adding up', () => {
  it('U1 asked 5 but holds 3: U1 becomes 3, the count 13, and Regenerate still works', async () => {
    storedConfig = config({ question_count: 15, distribution_mode: 'manual', chapter_counts: { [U1]: 5, [U2]: 10 } });
    expect((await patch({ action: 'generate' })).status).toBe(200);
    expect(storedConfig.last_generation.available).toBe(13);

    expect((await patch({ action: 'use_available' })).status).toBe(200);
    expect(storedConfig.params.question_count).toBe(13);
    expect(storedConfig.params.chapter_counts).toEqual({ [U1]: 3, [U2]: 10 });
    expect(storedConfig.resolved_item_ids).toHaveLength(13);

    const again = await patch({ action: 'generate' });
    expect(again.status).toBe(200);
    expect(storedConfig.resolved_item_ids).toHaveLength(13);
  });

  it('a report saved before chapter_shortfalls existed: the chapter figures are worked out afresh, not left as they were', async () => {
    storedConfig = config({ question_count: 15, distribution_mode: 'manual', chapter_counts: { [U1]: 5, [U2]: 10 } });
    expect((await patch({ action: 'generate' })).status).toBe(200);
    // What every production report looks like today (0 of 7 carry the field).
    delete storedConfig.last_generation.chapter_shortfalls;

    expect((await patch({ action: 'use_available' })).status).toBe(200);
    expect(storedConfig.params.chapter_counts).toEqual({ [U1]: 3, [U2]: 10 });
    expect(storedConfig.params.question_count).toBe(13);
    expect(storedConfig.resolved_item_ids).toHaveLength(13);
    expect((await patch({ action: 'generate' })).status).toBe(200);
  });

  it('English: a short grammar-general figure (the no-chapter group) is lowered too', async () => {
    examKey = 'tn_hsc_english';
    withGeneral = true;
    storedConfig = config({
      question_count: 15,
      distribution_mode: 'manual',
      enforce_board_blueprint: false,
      chapter_counts: { [U2]: 10, [G]: 5 },
    });
    expect((await patch({ action: 'generate' })).status).toBe(200);
    expect(storedConfig.last_generation.chapter_shortfalls).toEqual([
      { chapter_id: null, requested: 5, available: 2, chapter_ids: [G] },
    ]);

    expect((await patch({ action: 'use_available' })).status).toBe(200);
    expect(storedConfig.params.chapter_counts).toEqual({ [U2]: 10, [G]: 2 });
    expect(storedConfig.params.question_count).toBe(12);
    expect(storedConfig.resolved_item_ids).toHaveLength(12);
    expect(storedConfig.last_generation.chapter_shortfalls).toEqual([]);
  });
});
