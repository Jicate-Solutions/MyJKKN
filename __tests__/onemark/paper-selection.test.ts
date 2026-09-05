// __tests__/onemark/paper-selection.test.ts
// The pure selection logic behind the OneMark paper wizard, pinned to the
// Director's rulings: decision 6 (JABT mix), 11 (never pad), 12 (locks
// survive), 14 (copy-on-write), 15 (English board shape; chapter-agnostic
// items are never chapter-filtered).

import { describe, expect, it } from 'vitest';
import {
  applyOverride,
  boardShapeBands,
  filterBank,
  generatePaper,
  lockedOutsideScope,
  mixTotal,
  proportionalMix,
  recentlyUsedIds,
  swapCandidates,
  swapDisabledReason,
  type BankItem,
  type PaperParams,
} from '@/lib/services/onemark/paper-service';

function item(id: string, over: Partial<BankItem> = {}): BankItem {
  return {
    id,
    topic_id: 't1',
    stem: `Stem ${id}`,
    stem_ta: null,
    options: ['a', 'b', 'c', 'd'],
    options_ta: null,
    bloom_level: 'K1',
    tags: [],
    source_key: 'internal',
    source_year: null,
    times_served: 0,
    option_layout: 'auto',
    explanation: null,
    explanation_ta: null,
    ...over,
  };
}

function params(over: Partial<PaperParams> = {}): PaperParams {
  return {
    selection_mode: 'generate',
    topic_ids: [],
    tag_keys: [],
    source_keys: [],
    year_from: null,
    year_to: null,
    exclude_recent_papers: 0,
    question_count: 5,
    level_mix: { K1: 5, K2: 0, K3: 0, K4: 0, K5: 0, K6: 0, unlevelled: 0 },
    distribution_mode: 'proportional',
    board_shape: false,
    series_count: 1,
    preview_language: 'both',
    ...over,
  };
}

const byIdOf = (items: BankItem[]) => new Map(items.map((i) => [i.id, i]));

describe('filterBank', () => {
  it('never excludes a chapter-agnostic item (topic_id NULL) by a chapter filter', () => {
    const items = [item('a', { topic_id: 't1' }), item('b', { topic_id: 't2' }), item('g', { topic_id: null })];
    const out = filterBank(items, params({ topic_ids: ['t1'] }), new Set());
    expect(out.map((i) => i.id)).toEqual(['a', 'g']);
  });

  it('applies tag, source, year and recent-use filters', () => {
    const items = [
      item('a', { tags: ['synonyms'], source_key: 'past_board_exam', source_year: 2019 }),
      item('b', { tags: ['antonyms'], source_key: 'past_board_exam', source_year: 2023 }),
      item('c', { tags: ['synonyms'], source_key: 'internal', source_year: null }),
    ];
    expect(filterBank(items, params({ tag_keys: ['synonyms'] }), new Set()).map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterBank(items, params({ source_keys: ['internal'] }), new Set()).map((i) => i.id)).toEqual(['c']);
    // A year range only bites on items that carry a year.
    expect(filterBank(items, params({ year_from: 2020 }), new Set()).map((i) => i.id)).toEqual(['b', 'c']);
    expect(filterBank(items, params(), new Set(['a'])).map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('recentlyUsedIds takes only the last N finalized papers', () => {
    const recent = [
      { id: 'p1', title: '', finalized_at: '2026-09-03', item_ids: ['a'] },
      { id: 'p2', title: '', finalized_at: '2026-09-02', item_ids: ['b'] },
    ];
    expect(Array.from(recentlyUsedIds(recent, 1))).toEqual(['a']);
    expect(recentlyUsedIds(recent, 0).size).toBe(0);
  });
});

describe('proportionalMix', () => {
  it('scales the pool shape to the count and never exceeds what a level holds', () => {
    const items = [
      ...Array.from({ length: 6 }, (_, i) => item(`k1-${i}`, { bloom_level: 'K1' })),
      ...Array.from({ length: 3 }, (_, i) => item(`k3-${i}`, { bloom_level: 'K3' })),
      item('u', { bloom_level: null }),
    ];
    const mix = proportionalMix(items, 5);
    expect(mixTotal(mix)).toBe(5);
    expect(mix.K1).toBe(3);
    expect(mix.K3).toBeGreaterThanOrEqual(1);
    expect(mix.unlevelled).toBeLessThanOrEqual(1);
  });
});

describe('generatePaper', () => {
  it('decision 11 — reports the exact shortfall and never pads', () => {
    const pool = [item('a'), item('b'), item('c')];
    const res = generatePaper({ pool, byId: byIdOf(pool), params: params({ question_count: 5 }), lockedIds: [], weights: [], seed: 's' });
    expect(res.selected_ids).toHaveLength(3);
    expect(res.shortfall).toEqual({ requested: 5, available: 3 });
  });

  it('is deterministic under a seed and changes with a new one', () => {
    const pool = Array.from({ length: 30 }, (_, i) => item(`i${i}`, { topic_id: `t${i % 3}` }));
    const p = params({ question_count: 10, level_mix: { K1: 10, K2: 0, K3: 0, K4: 0, K5: 0, K6: 0, unlevelled: 0 } });
    const one = generatePaper({ pool, byId: byIdOf(pool), params: p, lockedIds: [], weights: [], seed: 'seed-1' });
    const two = generatePaper({ pool, byId: byIdOf(pool), params: p, lockedIds: [], weights: [], seed: 'seed-1' });
    const three = generatePaper({ pool, byId: byIdOf(pool), params: p, lockedIds: [], weights: [], seed: 'seed-2' });
    expect(one.selected_ids).toEqual(two.selected_ids);
    expect(one.selected_ids).toHaveLength(10);
    expect(three.selected_ids).not.toEqual(one.selected_ids);
  });

  it('decision 6 — honours the JABT level mix when the pool allows it', () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => item(`k1-${i}`, { bloom_level: 'K1' })),
      ...Array.from({ length: 10 }, (_, i) => item(`k4-${i}`, { bloom_level: 'K4' })),
    ];
    const p = params({ question_count: 6, level_mix: { K1: 2, K2: 0, K3: 0, K4: 4, K5: 0, K6: 0, unlevelled: 0 } });
    const res = generatePaper({ pool, byId: byIdOf(pool), params: p, lockedIds: [], weights: [], seed: 'x' });
    const levels = res.selected_ids.map((id) => byIdOf(pool).get(id)!.bloom_level);
    expect(levels.filter((l) => l === 'K1')).toHaveLength(2);
    expect(levels.filter((l) => l === 'K4')).toHaveLength(4);
  });

  it('decision 12 — a locked item survives even when it fell out of the scope', () => {
    const all = [item('locked', { topic_id: 't9' }), item('a'), item('b'), item('c')];
    const p = params({ topic_ids: ['t1'], question_count: 3 });
    const pool = filterBank(all, p, new Set());
    expect(pool.map((i) => i.id)).not.toContain('locked');
    const res = generatePaper({ pool, byId: byIdOf(all), params: p, lockedIds: ['locked'], weights: [], seed: 'x' });
    expect(res.selected_ids[0]).toBe('locked');
    expect(res.selected_ids).toHaveLength(3);
    expect(Array.from(lockedOutsideScope(['locked'], pool))).toEqual(['locked']);
  });

  it('decision 15 — English board shape fills Q1–3 synonyms, Q4–6 antonyms, then the weighted pool', () => {
    const pool = [
      ...Array.from({ length: 4 }, (_, i) => item(`syn-${i}`, { tags: ['synonyms'], topic_id: 'u1' })),
      ...Array.from({ length: 4 }, (_, i) => item(`ant-${i}`, { tags: ['antonyms'], topic_id: 'u1' })),
      ...Array.from({ length: 20 }, (_, i) => item(`idi-${i}`, { tags: ['idioms'], topic_id: null })),
      ...Array.from({ length: 20 }, (_, i) => item(`pv-${i}`, { tags: ['phrasal_verbs'], topic_id: null })),
    ];
    const p = params({ board_shape: true, question_count: 20, level_mix: { K1: 20, K2: 0, K3: 0, K4: 0, K5: 0, K6: 0, unlevelled: 0 } });
    const res = generatePaper({
      pool,
      byId: byIdOf(pool),
      params: p,
      lockedIds: [],
      weights: [
        { tag_key: 'idioms', weight: 8 },
        { tag_key: 'phrasal_verbs', weight: 8 },
      ],
      seed: 'board',
    });
    expect(res.selected_ids).toHaveLength(20);
    expect(res.shortfall).toBeNull();
    expect(res.selected_ids.slice(0, 3).every((id) => id.startsWith('syn-'))).toBe(true);
    expect(res.selected_ids.slice(3, 6).every((id) => id.startsWith('ant-'))).toBe(true);
    expect(res.selected_ids.slice(6).every((id) => id.startsWith('idi-') || id.startsWith('pv-'))).toBe(true);
  });

  it('board shape reports a shortfall when a reserved slot cannot be filled', () => {
    const pool = [item('syn-0', { tags: ['synonyms'] }), ...Array.from({ length: 30 }, (_, i) => item(`idi-${i}`, { tags: ['idioms'] }))];
    const p = params({ board_shape: true, question_count: 20, level_mix: { K1: 20, K2: 0, K3: 0, K4: 0, K5: 0, K6: 0, unlevelled: 0 } });
    const res = generatePaper({ pool, byId: byIdOf(pool), params: p, lockedIds: [], weights: [{ tag_key: 'idioms', weight: 8 }], seed: 'b' });
    expect(res.selected_ids.length).toBeLessThan(20);
    expect(res.shortfall?.requested).toBe(20);
  });
});

describe('boardShapeBands', () => {
  it('reads the bands off the paper, so an under-filled reserved slot does not borrow the next number', () => {
    const paper = [
      item('s1', { tags: ['synonyms'] }),
      item('s2', { tags: ['synonyms'] }),
      item('a1', { tags: ['antonyms'] }),
      item('p1', { tags: ['idioms'] }),
      item('p2', { tags: ['spelling'] }),
    ];
    expect(boardShapeBands(paper, 20)).toEqual([
      { tag: 'synonyms', from: 1, to: 2, want: 3 },
      { tag: 'antonyms', from: 3, to: 3, want: 3 },
      { tag: 'pool', from: 4, to: 5, want: 14 },
    ]);
    // A full paper: the classic Q1–3 / Q4–6 / Q7–20 frame.
    const full = [
      ...Array.from({ length: 3 }, (_, i) => item(`s${i}`, { tags: ['synonyms'] })),
      ...Array.from({ length: 3 }, (_, i) => item(`a${i}`, { tags: ['antonyms'] })),
      ...Array.from({ length: 14 }, (_, i) => item(`p${i}`, { tags: ['idioms'] })),
    ];
    expect(boardShapeBands(full, 20).map((b) => [b.from, b.to])).toEqual([[1, 3], [4, 6], [7, 20]]);
  });
});

describe('swap', () => {
  it('holds chapter, tag and level constant and excludes items already on the paper', () => {
    const target = item('x', { topic_id: 't1', tags: ['idioms'], bloom_level: 'K2' });
    const pool = [
      target,
      item('same', { topic_id: 't1', tags: ['idioms'], bloom_level: 'K2' }),
      item('onpaper', { topic_id: 't1', tags: ['idioms'], bloom_level: 'K2' }),
      item('otherchapter', { topic_id: 't2', tags: ['idioms'], bloom_level: 'K2' }),
      item('otherlevel', { topic_id: 't1', tags: ['idioms'], bloom_level: 'K3' }),
      item('othertag', { topic_id: 't1', tags: ['spelling'], bloom_level: 'K2' }),
    ];
    expect(swapCandidates(target, pool, ['x', 'onpaper']).map((i) => i.id)).toEqual(['same']);
    expect(swapDisabledReason(target, pool, ['x', 'onpaper'])).toBeNull();
    expect(swapDisabledReason(target, pool, ['x', 'onpaper', 'same'])).toMatch(/No other K2/);
  });
});

describe('applyOverride (decision 14)', () => {
  it('lays the paper edit over the master row without touching the master object', () => {
    const master = item('m', { stem: 'original', options: ['a', 'b', 'c', 'd'] });
    const shown = applyOverride(master, { stem: 'edited', options: ['w', 'x', 'y', 'z'] });
    expect(shown.stem).toBe('edited');
    expect(shown.options).toEqual(['w', 'x', 'y', 'z']);
    expect(master.stem).toBe('original');
    expect(applyOverride(master, undefined)).toBe(master);
  });
});
