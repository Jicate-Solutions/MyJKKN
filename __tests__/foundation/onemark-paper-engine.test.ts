// OneMark paper wizard — the pure selection engine, exercised with no database.
// Each test names the Director decision it guards.

import { describe, expect, it } from 'vitest';
import {
  apportion,
  boardOf,
  boardShapeConflicts,
  defaultLevelMix,
  defaultParams,
  filterMismatches,
  findSwap,
  generatePaper,
  isPaperLive,
  lockWarnings,
  questionCountFor,
  resolveOptionLayout,
  type EngineContext,
  type PaperParams,
  type PaperPolicies,
  type PoolItem,
} from '@/lib/services/onemark/paper-service';

/** Deterministic rng: a fixed LCG so runs are repeatable. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const CH = {
  u1: '11111111-1111-4111-8111-111111111111',
  u2: '22222222-2222-4222-8222-222222222222',
  u3: '33333333-3333-4333-8333-333333333333',
  /** The seeded English grammar-general "chapter" (onemark_eng_grammar_general). */
  general: '99999999-9999-4999-8999-999999999999',
};

/** What readPolicies returns when the base row is 15 and no per-subject row exists yet. */
const POLICIES: PaperPolicies = {
  question_count: 15,
  question_count_by_exam: { tn_hsc_physics: 15, tn_hsc_english: 20 },
  max_series: 4,
};

function item(
  id: string,
  over: Partial<PoolItem> = {},
): PoolItem {
  return {
    id,
    topic_id: CH.u1,
    bloom_level: 'K1',
    tags: [],
    source_key: 'past_board_exam',
    source_year: 2023,
    times_served: 0,
    ...over,
  };
}

function ctx(examKey: string, params: Partial<PaperParams> = {}, extra: Partial<EngineContext> = {}): EngineContext {
  return {
    examKey,
    params: { ...defaultParams({ examKey, questionCount: questionCountFor(examKey, POLICIES) }), ...params },
    recentlyUsedIds: new Set(),
    chapterOrder: { [CH.u1]: 1, [CH.u2]: 2, [CH.u3]: 3 },
    categoryWeights: {},
    rng: seeded(),
    ...extra,
  };
}

describe('defaults — decision 6 (JABT only) and decision 15 (English board shape)', () => {
  it('each subject reads its own policy row; the base row is the fallback', () => {
    expect(questionCountFor('tn_hsc_physics', POLICIES)).toBe(15);
    expect(questionCountFor('tn_hsc_english', POLICIES)).toBe(20);
    // A per-subject row, once seeded, wins without a deploy.
    expect(questionCountFor('tn_hsc_english', { ...POLICIES, question_count_by_exam: { tn_hsc_english: 25 } })).toBe(25);
    // No row for the subject at all → the base policy.
    expect(questionCountFor('tn_hsc_physics', { ...POLICIES, question_count_by_exam: {} })).toBe(15);
    expect(defaultParams({ examKey: 'tn_hsc_english', questionCount: 20 }).enforce_board_blueprint).toBe(true);
    expect(defaultParams({ examKey: 'tn_hsc_physics', questionCount: 15 }).enforce_board_blueprint).toBe(false);
  });

  it('the parameter object carries no difficulty field at all', () => {
    const p = defaultParams({ examKey: 'tn_hsc_physics', questionCount: 15 });
    expect(Object.keys(p).some((k) => /difficulty/i.test(k))).toBe(false);
    expect(JSON.stringify(p)).not.toMatch(/difficult/i);
  });

  it('the default level mix follows the pool proportionally (largest remainder)', () => {
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => item(`a${i}`, { bloom_level: 'K1' })),
      ...Array.from({ length: 3 }, (_, i) => item(`b${i}`, { bloom_level: 'K3' })),
      item('c0', { bloom_level: null }),
    ];
    const mix = defaultLevelMix(pool, 10);
    expect(mix.K1).toBe(6);
    expect(mix.K3).toBe(3);
    expect(mix.unlevelled).toBe(1);
    expect(Object.values(mix).reduce((s, n) => s + n, 0)).toBe(10);
  });

  it('apportion never exceeds the total and hands out remainders to the largest fractions', () => {
    expect(apportion({ a: 1, b: 1, c: 1 }, 10)).toEqual({ a: 4, b: 3, c: 3 });
    expect(apportion({ a: 0, b: 0 }, 5)).toEqual({ a: 0, b: 0 });
  });
});

describe('generation — decisions 11 and 12', () => {
  it('fills the requested count from the eligible pool, chapter-ordered', () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => item(`u1-${i}`, { topic_id: CH.u1 })),
      ...Array.from({ length: 10 }, (_, i) => item(`u2-${i}`, { topic_id: CH.u2 })),
    ];
    const r = generatePaper({ pool, ctx: ctx('tn_hsc_physics', { question_count: 10 }), lockedIds: [], previousIds: [] });
    expect(r.report.selected).toBe(10);
    expect(r.report.missing).toBe(0);
    expect(r.slots.every((s) => s !== null)).toBe(true);
    // proportional: 5 / 5
    const u1 = r.slots.filter((s) => s?.startsWith('u1-')).length;
    expect(u1).toBe(5);
    // chapter order: every u1 slot before every u2 slot
    const firstU2 = r.slots.findIndex((s) => s?.startsWith('u2-'));
    const lastU1 = r.slots.map((s) => s?.startsWith('u1-')).lastIndexOf(true);
    expect(lastU1).toBeLessThan(firstU2);
  });

  it('decision 11 — reports the exact available count and never pads from outside the filters', () => {
    const pool = [
      ...Array.from({ length: 4 }, (_, i) => item(`in-${i}`, { topic_id: CH.u1 })),
      ...Array.from({ length: 20 }, (_, i) => item(`out-${i}`, { topic_id: CH.u2 })),
    ];
    const r = generatePaper({
      pool,
      ctx: ctx('tn_hsc_physics', { question_count: 15, chapter_ids: [CH.u1], selection_mode: 'single' }),
      lockedIds: [],
      previousIds: [],
    });
    expect(r.report.requested).toBe(15);
    expect(r.report.available).toBe(4);
    expect(r.report.selected).toBe(4);
    expect(r.report.missing).toBe(11);
    expect(r.slots.filter((s) => s !== null).every((s) => s!.startsWith('in-'))).toBe(true);
  });

  it('decision 12 — a locked item keeps its slot and survives a filter that now excludes it', () => {
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => item(`u1-${i}`, { topic_id: CH.u1 })),
      item('locked-u2', { topic_id: CH.u2 }),
    ];
    const previous = ['u1-0', 'u1-1', 'locked-u2', 'u1-2', 'u1-3'];
    const c = ctx('tn_hsc_physics', { question_count: 5, chapter_ids: [CH.u1], selection_mode: 'single' });
    const r = generatePaper({ pool, ctx: c, lockedIds: ['locked-u2'], previousIds: previous });
    expect(r.slots[2]).toBe('locked-u2');
    expect(r.report.selected).toBe(5);
    const warnings = lockWarnings([pool[6]], c);
    expect(warnings).toEqual([{ item_id: 'locked-u2', reasons: ['outside the selected chapters'] }]);
  });

  it('exclude-recent suppresses items from earlier papers', () => {
    const pool = Array.from({ length: 5 }, (_, i) => item(`i${i}`));
    const r = generatePaper({
      pool,
      ctx: ctx('tn_hsc_physics', { question_count: 5 }, { recentlyUsedIds: new Set(['i0', 'i1']) }),
      lockedIds: [],
      previousIds: [],
    });
    expect(r.report.available).toBe(3);
    expect(r.slots).not.toContain('i0');
    expect(r.slots).not.toContain('i1');
  });

  it('honours a custom JABT mix when the pool allows it', () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => item(`k1-${i}`, { bloom_level: 'K1' })),
      ...Array.from({ length: 10 }, (_, i) => item(`k3-${i}`, { bloom_level: 'K3' })),
    ];
    const r = generatePaper({
      pool,
      ctx: ctx('tn_hsc_physics', { question_count: 10, level_mix: { K1: 7, K3: 3 } }),
      lockedIds: [],
      previousIds: [],
    });
    expect(r.slots.filter((s) => s?.startsWith('k1-')).length).toBe(7);
    expect(r.slots.filter((s) => s?.startsWith('k3-')).length).toBe(3);
  });

  it('prefers least-served items (PRD §8.1 ORDER BY times_served)', () => {
    const pool = [
      ...Array.from({ length: 5 }, (_, i) => item(`fresh-${i}`, { times_served: 0 })),
      ...Array.from({ length: 5 }, (_, i) => item(`worn-${i}`, { times_served: 9 })),
    ];
    const r = generatePaper({ pool, ctx: ctx('tn_hsc_physics', { question_count: 5 }), lockedIds: [], previousIds: [] });
    expect(r.slots.every((s) => s?.startsWith('fresh-'))).toBe(true);
  });
});

describe('English — decision 15 board shape and PRD §4.4 chapter-agnostic items', () => {
  const englishPool = [
    ...Array.from({ length: 4 }, (_, i) => item(`syn-${i}`, { tags: ['synonyms'], topic_id: CH.u1 })),
    ...Array.from({ length: 4 }, (_, i) => item(`ant-${i}`, { tags: ['antonyms'], topic_id: CH.u1 })),
    ...Array.from({ length: 6 }, (_, i) => item(`gram-${i}`, { tags: ['prepositions'], topic_id: null })),
    ...Array.from({ length: 6 }, (_, i) => item(`idiom-${i}`, { tags: ['idioms'], topic_id: CH.u2 })),
  ];

  it('reserves Q1–3 for synonyms and Q4–6 for antonyms', () => {
    const r = generatePaper({
      pool: englishPool,
      ctx: ctx('tn_hsc_english', { question_count: 12 }, { categoryWeights: { prepositions: 6, idioms: 8 } }),
      lockedIds: [],
      previousIds: [],
    });
    expect(r.slots.slice(0, 3).every((s) => s?.startsWith('syn-'))).toBe(true);
    expect(r.slots.slice(3, 6).every((s) => s?.startsWith('ant-'))).toBe(true);
    expect(r.slots.slice(6).some((s) => s?.startsWith('syn-') || s?.startsWith('ant-'))).toBe(false);
    expect(r.report.selected).toBe(12);
  });

  it('a chapter filter does not exclude grammar items with no chapter', () => {
    const c = ctx('tn_hsc_english', { question_count: 10, chapter_ids: [CH.u1], selection_mode: 'single' });
    expect(filterMismatches(item('g', { topic_id: null, tags: ['linkers'] }), c)).toEqual([]);
    expect(filterMismatches(item('x', { topic_id: CH.u2 }), c)).toEqual(['outside the selected chapters']);
    // Physics has no chapter-agnostic class: a null-topic item IS outside.
    const p = ctx('tn_hsc_physics', { chapter_ids: [CH.u1], selection_mode: 'single' });
    expect(filterMismatches(item('p', { topic_id: null }), p)).toEqual(['outside the selected chapters']);
  });

  it('an item filed under the seeded grammar-general topic is chapter-agnostic too (one rule, two spellings)', () => {
    const c = ctx(
      'tn_hsc_english',
      { question_count: 10, chapter_ids: [CH.u1], selection_mode: 'single' },
      { generalTopicIds: new Set([CH.general]) },
    );
    expect(filterMismatches(item('g2', { topic_id: CH.general, tags: ['question_tags'] }), c)).toEqual([]);
    // Without the topic registered as general it would be an ordinary (unselected) chapter.
    const plain = ctx('tn_hsc_english', { question_count: 10, chapter_ids: [CH.u1], selection_mode: 'single' });
    expect(filterMismatches(item('g2', { topic_id: CH.general }), plain)).toEqual(['outside the selected chapters']);
  });

  it('decision 15 — a reserved slot the pool cannot fill is reported as a GAP at its position, never collapsed', () => {
    const pool = [
      item('syn-0', { tags: ['synonyms'] }),
      item('syn-1', { tags: ['synonyms'] }),
      ...Array.from({ length: 3 }, (_, i) => item(`ant-${i}`, { tags: ['antonyms'] })),
      ...Array.from({ length: 10 }, (_, i) => item(`gram-${i}`, { tags: ['spelling'], topic_id: null })),
    ];
    const r = generatePaper({ pool, ctx: ctx('tn_hsc_english', { question_count: 12 }), lockedIds: [], previousIds: [] });
    expect(r.slots[2]).toBeNull();
    expect(r.empty_reserved_slots).toEqual([2]);
    // The antonyms stay at Q4–6; nothing moved up into Q3.
    expect(r.slots.slice(3, 6).every((s) => s?.startsWith('ant-'))).toBe(true);
    expect(r.report.blueprint_missing).toBe(1);
    // What the route persists, and how the board is rebuilt from it.
    const resolved = r.slots.filter((s): s is string => s !== null);
    const board = boardOf({ resolved_item_ids: resolved, empty_slots: r.empty_reserved_slots });
    expect(board.length).toBe(12);
    expect(board[2]).toBeNull();
    expect(board[3]).toBe(r.slots[3]);
  });

  it('a locked item keeps its BOARD slot across a gap, not its compacted index', () => {
    const pool = [
      item('syn-0', { tags: ['synonyms'] }),
      item('syn-1', { tags: ['synonyms'] }),
      ...Array.from({ length: 3 }, (_, i) => item(`ant-${i}`, { tags: ['antonyms'] })),
      ...Array.from({ length: 10 }, (_, i) => item(`gram-${i}`, { tags: ['spelling'], topic_id: null })),
    ];
    const c = ctx('tn_hsc_english', { question_count: 12 });
    const first = generatePaper({ pool, ctx: c, lockedIds: [], previousIds: [] });
    const lockedId = first.slots[7] as string; // Q8, a grammar item after the gap at Q3
    const resolved = first.slots.filter((s): s is string => s !== null);
    const board = boardOf({ resolved_item_ids: resolved, empty_slots: first.empty_reserved_slots });
    const second = generatePaper({ pool, ctx: c, lockedIds: [lockedId], previousIds: board });
    expect(second.slots[7]).toBe(lockedId);
  });

  it('round 3 (a) — a lock held at Q1 under shape OFF moves out of Q1 when the shape is switched ON', () => {
    const pool = [
      ...Array.from({ length: 4 }, (_, i) => item(`syn-${i}`, { tags: ['synonyms'] })),
      ...Array.from({ length: 4 }, (_, i) => item(`ant-${i}`, { tags: ['antonyms'] })),
      ...Array.from({ length: 20 }, (_, i) => item(`gram-${i}`, { tags: ['spelling'], topic_id: null })),
    ];
    const off = generatePaper({ pool, ctx: ctx('tn_hsc_english', { question_count: 20, enforce_board_blueprint: false }), lockedIds: [], previousIds: [] });
    // Lock whatever sits at Q1 under the free shape — make sure it is a grammar item for the repro.
    const q1 = off.slots[0] as string;
    const lockedId = q1.startsWith('gram-') ? q1 : (off.slots.find((s) => s?.startsWith('gram-')) as string);
    const previous = off.slots.map((s) => (s === lockedId ? lockedId : s));
    // Force the lock to be remembered at board slot 0.
    previous.splice(previous.indexOf(lockedId), 1);
    previous.unshift(lockedId);
    const on = generatePaper({ pool, ctx: ctx('tn_hsc_english', { question_count: 20 }), lockedIds: [lockedId], previousIds: previous });
    expect(on.slots.slice(0, 3).every((s) => s?.startsWith('syn-'))).toBe(true);
    expect(on.slots.slice(3, 6).every((s) => s?.startsWith('ant-'))).toBe(true);
    expect(on.slots.indexOf(lockedId)).toBeGreaterThanOrEqual(6);
    expect(on.report.lock_moves).toEqual([
      { item_id: lockedId, from: 0, to: on.slots.indexOf(lockedId), reason: 'Q1 is reserved for synonyms' },
    ]);
    expect(on.report.blueprint_missing).toBe(0);
  });

  it('round 3 (b) — a lock beyond the new count never overflows into a reserved slot', () => {
    const pool = [
      ...Array.from({ length: 4 }, (_, i) => item(`syn-${i}`, { tags: ['synonyms'] })),
      ...Array.from({ length: 4 }, (_, i) => item(`ant-${i}`, { tags: ['antonyms'] })),
      ...Array.from({ length: 20 }, (_, i) => item(`gram-${i}`, { tags: ['spelling'], topic_id: null })),
    ];
    const twenty = generatePaper({ pool, ctx: ctx('tn_hsc_english', { question_count: 20 }), lockedIds: [], previousIds: [] });
    const q20 = twenty.slots[19] as string;
    expect(q20.startsWith('gram-')).toBe(true);
    const fifteen = generatePaper({ pool, ctx: ctx('tn_hsc_english', { question_count: 15 }), lockedIds: [q20], previousIds: twenty.slots });
    expect(fifteen.slots[0]?.startsWith('syn-')).toBe(true);
    const to = fifteen.slots.indexOf(q20);
    expect(to).toBeGreaterThanOrEqual(6);
    expect(fifteen.report.lock_moves).toEqual([{ item_id: q20, from: 19, to, reason: 'beyond the new question count' }]);
    expect(fifteen.slots.slice(0, 6).some((s) => s?.startsWith('gram-'))).toBe(false);
  });

  it('a locked synonym keeps a reserved synonym slot; a locked synonym in an antonym slot is moved', () => {
    const pool = [
      ...Array.from({ length: 4 }, (_, i) => item(`syn-${i}`, { tags: ['synonyms'] })),
      ...Array.from({ length: 4 }, (_, i) => item(`ant-${i}`, { tags: ['antonyms'] })),
      ...Array.from({ length: 10 }, (_, i) => item(`gram-${i}`, { tags: ['spelling'], topic_id: null })),
    ];
    const keep = generatePaper({ pool, ctx: ctx('tn_hsc_english', { question_count: 12 }), lockedIds: ['syn-2'], previousIds: ['x', 'syn-2'] });
    expect(keep.slots[1]).toBe('syn-2');
    expect(keep.report.lock_moves).toEqual([]);
    const moved = generatePaper({ pool, ctx: ctx('tn_hsc_english', { question_count: 12 }), lockedIds: ['syn-2'], previousIds: ['x', 'y', 'z', 'syn-2'] });
    expect(moved.slots[3]?.startsWith('ant-')).toBe(true);
    expect(moved.slots.indexOf('syn-2')).toBeGreaterThanOrEqual(6);
    // Read-back check catches a persisted board that breaks the shape.
    const conflicts = boardShapeConflicts(
      { resolved_item_ids: ['gram-0', 'syn-0', 'syn-1', 'ant-0', 'ant-1', 'ant-2', 'gram-1'], empty_slots: [], params: { ...defaultParams({ examKey: 'tn_hsc_english', questionCount: 20 }) } },
      'tn_hsc_english',
      (id) => pool.find((p) => p.id === id)?.tags,
    );
    expect(conflicts).toEqual([{ position: 1, item_id: 'gram-0', tag_key: 'synonyms' }]);
    expect(isPaperLive({ outputs: { published_at: '2026-09-05T00:00:00Z' } })).toBe(true);
    expect(isPaperLive({ outputs: { pdf_exported_at: '2026-09-05T00:00:00Z' } })).toBe(false);
    expect(isPaperLive({})).toBe(false);
  });

  it('"available" counts only what the board shape can place — a fourth synonym is not a promise', () => {
    // 4 synonyms + 4 antonyms + 9 grammar = 17 eligible, but only 3 + 3 + 9 = 15 can sit on a board-shape paper.
    const pool = [
      ...Array.from({ length: 4 }, (_, i) => item(`syn-${i}`, { tags: ['synonyms'] })),
      ...Array.from({ length: 4 }, (_, i) => item(`ant-${i}`, { tags: ['antonyms'] })),
      ...Array.from({ length: 9 }, (_, i) => item(`gram-${i}`, { tags: ['spelling'], topic_id: null })),
    ];
    const r = generatePaper({ pool, ctx: ctx('tn_hsc_english', { question_count: 20 }), lockedIds: [], previousIds: [] });
    expect(r.report.available).toBe(15);
    expect(r.report.selected).toBe(15);
    expect(r.report.blueprint_missing).toBe(0);
    // "Use the 15 available" then delivers exactly 15 — no self-contradicting banner.
    const again = generatePaper({ pool, ctx: ctx('tn_hsc_english', { question_count: 15 }), lockedIds: [], previousIds: [] });
    expect(again.report.selected).toBe(15);
    expect(again.report.missing).toBe(0);
    // With the shape off every eligible item counts.
    const off = generatePaper({ pool, ctx: ctx('tn_hsc_english', { question_count: 20, enforce_board_blueprint: false }), lockedIds: [], previousIds: [] });
    expect(off.report.available).toBe(17);
  });

  it('names the deficient reserved tag instead of back-filling with grammar', () => {
    const pool = [
      item('syn-0', { tags: ['synonyms'] }),
      ...Array.from({ length: 10 }, (_, i) => item(`gram-${i}`, { tags: ['spelling'], topic_id: null })),
    ];
    const r = generatePaper({ pool, ctx: ctx('tn_hsc_english', { question_count: 8 }), lockedIds: [], previousIds: [] });
    expect(r.report.blueprint_shortfalls).toEqual([
      { tag_key: 'synonyms', needed: 3, available: 1 },
      { tag_key: 'antonyms', needed: 3, available: 0 },
    ]);
    expect(r.slots[0]).toBe('syn-0');
    expect(r.slots[1]).toBeNull();
    expect(r.slots[3]).toBeNull();
    expect(r.report.missing).toBe(5);
  });

  it('with the board shape off, synonyms are just another tag', () => {
    const r = generatePaper({
      pool: englishPool,
      ctx: ctx('tn_hsc_english', { question_count: 20, enforce_board_blueprint: false }),
      lockedIds: [],
      previousIds: [],
    });
    expect(r.report.selected).toBe(20);
  });
});

describe('swap — PRD §8.2 holds chapter, tag and level constant', () => {
  const pool = [
    item('out', { topic_id: CH.u1, tags: ['formula_recall'], bloom_level: 'K2' }),
    item('same', { topic_id: CH.u1, tags: ['formula_recall'], bloom_level: 'K2' }),
    item('other-tag', { topic_id: CH.u1, tags: ['law_statement'], bloom_level: 'K2' }),
    item('other-level', { topic_id: CH.u1, tags: ['formula_recall'], bloom_level: 'K4' }),
    item('other-chapter', { topic_id: CH.u2, tags: ['formula_recall'], bloom_level: 'K2' }),
  ];

  it('finds the only candidate that matches on all three', () => {
    const r = findSwap({ pool, ctx: ctx('tn_hsc_physics'), outgoing: pool[0], currentIds: ['out'] });
    expect(r?.id).toBe('same');
  });

  it('returns null when the stratum is exhausted rather than reaching outside it', () => {
    const r = findSwap({ pool, ctx: ctx('tn_hsc_physics'), outgoing: pool[0], currentIds: ['out', 'same'] });
    expect(r).toBeNull();
  });
});

describe('option layout — PRD §4.5, the lane rule shared with the PDF', () => {
  it('auto is stacked past 40 characters or on an assertion set, else inline 4', () => {
    const short = [{ key: 'A', text: 'likely' }, { key: 'B', text: 'certain' }];
    const mid = [{ key: 'A', text: 'in reference to' }, { key: 'B', text: 'with reference to the' }];
    const edge = [{ key: 'A', text: 'x'.repeat(40) }];
    const over = [{ key: 'A', text: 'x'.repeat(41) }];
    const long = [{ key: 'A', text: 'to wait for a situation to become clear before acting on it' }];
    expect(resolveOptionLayout('auto', short)).toBe('inline_4');
    expect(resolveOptionLayout('auto', mid)).toBe('inline_4');
    expect(resolveOptionLayout('auto', edge)).toBe('inline_4');
    expect(resolveOptionLayout('auto', over)).toBe('stacked');
    expect(resolveOptionLayout('auto', long)).toBe('stacked');
    expect(resolveOptionLayout('auto', short, ['assertion_set'])).toBe('stacked');
    // An explicit layout on the item is honoured as written.
    expect(resolveOptionLayout('stacked', short)).toBe('stacked');
    expect(resolveOptionLayout('inline_2x2', short)).toBe('inline_2x2');
  });
});
