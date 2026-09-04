// OneMark paper wizard — the pure selection engine, exercised with no database.
// Each test names the Director decision it guards.

import { describe, expect, it } from 'vitest';
import {
  apportion,
  defaultLevelMix,
  defaultParams,
  filterMismatches,
  findSwap,
  generatePaper,
  lockWarnings,
  resolveOptionLayout,
  type EngineContext,
  type PaperParams,
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
    params: { ...defaultParams({ examKey, policyQuestionCount: 15 }), ...params },
    recentlyUsedIds: new Set(),
    chapterOrder: { [CH.u1]: 1, [CH.u2]: 2, [CH.u3]: 3 },
    categoryWeights: {},
    rng: seeded(),
    ...extra,
  };
}

describe('defaults — decision 6 (JABT only) and decision 15 (English board shape)', () => {
  it('Physics defaults to the policy count, English to the 20-question board shape', () => {
    expect(defaultParams({ examKey: 'tn_hsc_physics', policyQuestionCount: 15 }).question_count).toBe(15);
    expect(defaultParams({ examKey: 'tn_hsc_english', policyQuestionCount: 15 }).question_count).toBe(20);
    expect(defaultParams({ examKey: 'tn_hsc_english', policyQuestionCount: 15 }).enforce_board_blueprint).toBe(true);
    expect(defaultParams({ examKey: 'tn_hsc_physics', policyQuestionCount: 15 }).enforce_board_blueprint).toBe(false);
  });

  it('the parameter object carries no difficulty field at all', () => {
    const p = defaultParams({ examKey: 'tn_hsc_physics', policyQuestionCount: 15 });
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

describe('option layout — PRD §4.5', () => {
  it('auto resolves from the longest option', () => {
    const short = [{ key: 'A', text: 'likely' }, { key: 'B', text: 'certain' }];
    const mid = [{ key: 'A', text: 'in reference to' }, { key: 'B', text: 'with reference to the' }];
    const long = [{ key: 'A', text: 'to wait for a situation to become clear before acting on it' }];
    expect(resolveOptionLayout('auto', short)).toBe('inline_4');
    expect(resolveOptionLayout('auto', mid)).toBe('inline_2x2');
    expect(resolveOptionLayout('auto', long)).toBe('stacked');
    expect(resolveOptionLayout('stacked', short)).toBe('stacked');
  });
});
