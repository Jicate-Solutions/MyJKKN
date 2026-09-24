// Foundation service — the reads and the write behind the shared console's
// authoring path, for OneMark exams (BUG-006062 / BUG-006063) and for every
// other Foundation exam, whose payloads must not change.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = [string, string, ...unknown[]];
const calls: Call[] = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };
// Per-table overrides (createItem reads exam_definitions / exam_topic_map
// before it writes fp_items); a table not listed here answers with `result`.
let byTable: Record<string, { data: unknown; error: unknown }> = {};

function builder(table: string) {
  const b: any = {};
  for (const m of ['select', 'eq', 'order', 'insert', 'single', 'maybeSingle', 'in', 'or']) {
    b[m] = (...args: unknown[]) => {
      calls.push([table, m, ...args]);
      return b;
    };
  }
  b.then = (res: any, rej: any) =>
    Promise.resolve(byTable[table] ?? result).then(res, rej);
  return b;
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ from: (t: string) => builder(t) }),
}));
vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { error: vi.fn(), dev: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  FoundationService,
  isOneMarkExam,
} from '@/lib/services/foundation/foundation-service';

beforeEach(() => {
  calls.length = 0;
  result = { data: [], error: null };
  byTable = {};
});

describe('isOneMarkExam', () => {
  it('is true only for the two OneMark subject rows', () => {
    expect(isOneMarkExam('tn_hsc_physics')).toBe(true);
    expect(isOneMarkExam('tn_hsc_english')).toBe(true);
    expect(isOneMarkExam('neet_ug')).toBe(false);
    expect(isOneMarkExam('tn_hsc')).toBe(false);
    expect(isOneMarkExam(null)).toBe(false);
    expect(isOneMarkExam(undefined)).toBe(false);
  });
});

describe('listCohorts', () => {
  it('embeds the exam config_key, so the console can tell a OneMark exam apart', async () => {
    await FoundationService.listCohorts();
    const select = calls.find((c) => c[0] === 'fp_cohorts' && c[1] === 'select');
    expect(String(select?.[2])).toMatch(
      /exam_definitions!fp_cohorts_exam_definition_id_fkey\(id, config_key,/,
    );
  });
});

describe('listTopicsForExam (BUG-006062)', () => {
  it('reads exam_topic_map for that exam only and drops retired topics', async () => {
    result = {
      data: [
        {
          sort_order: 1,
          topic: { id: 't1', config_key: 'phy_u1', display_name: 'Unit 1: Electrostatics', is_shared: false, is_active: true, sort_order: 1 },
        },
        {
          sort_order: 2,
          topic: { id: 't2', config_key: 'phy_u2', display_name: 'Unit 2: Retired', is_shared: false, is_active: false, sort_order: 2 },
        },
      ],
      error: null,
    };
    const topics = await FoundationService.listTopicsForExam('exam-physics');

    expect(calls[0]).toEqual([
      'exam_topic_map',
      'select',
      expect.stringContaining('cdc_exam_syllabus_topics!inner'),
    ]);
    expect(calls).toContainEqual(['exam_topic_map', 'eq', 'exam_definition_id', 'exam-physics']);
    expect(topics.map((t) => t.display_name)).toEqual(['Unit 1: Electrostatics']);
  });
});

describe('listItems', () => {
  it('selects bloom_level so a OneMark item can show its JABT level', async () => {
    await FoundationService.listItems('exam-physics');
    const select = calls.find((c) => c[0] === 'fp_items' && c[1] === 'select');
    expect(String(select?.[2])).toMatch(/\bbloom_level\b/);
    expect(String(select?.[2])).toMatch(/\bdifficulty\b/);
  });
});

describe('createItem', () => {
  const base = {
    exam_definition_id: 'exam-x',
    topic_id: null,
    q_type: 'mcq',
    stem: 'Q?',
    options: [{ key: 'A', text: 'a' }],
    answer: { correct: 'A' },
  };

  it('a non-OneMark payload still carries its difficulty, unchanged', async () => {
    result = { data: { id: 'i1' }, error: null };
    await FoundationService.createItem({ ...base, difficulty: 4 });
    const insert = calls.find((c) => c[1] === 'insert');
    expect(insert?.[2]).toMatchObject({ difficulty: 4, is_active: true });
  });

  it('a payload without difficulty (OneMark) sends no difficulty key', async () => {
    result = { data: { id: 'i2' }, error: null };
    await FoundationService.createItem(base);
    const insert = calls.find((c) => c[1] === 'insert');
    expect(insert?.[2]).not.toHaveProperty('difficulty');
  });
});

describe('createItem — OneMark rules on the write path (review of #4008)', () => {
  const four = [
    { key: 'A', text: 'a' },
    { key: 'B', text: 'b' },
    { key: 'C', text: 'c' },
    { key: 'D', text: 'd' },
  ];
  const oneMark = {
    exam_definition_id: 'exam-physics',
    topic_id: 't-phy',
    q_type: 'mcq',
    stem: 'Q?',
    options: four,
    answer: { correct: 'A' },
  };
  const inserted = () => calls.some((c) => c[0] === 'fp_items' && c[1] === 'insert');

  it('refuses a OneMark question with fewer than four filled options, and writes nothing', async () => {
    byTable.exam_definitions = { data: { config_key: 'tn_hsc_physics' }, error: null };
    byTable.exam_topic_map = { data: { topic_id: 't-phy' }, error: null };
    await expect(
      FoundationService.createItem({
        ...oneMark,
        options: [...four.slice(0, 3), { key: 'D', text: '   ' }],
      }),
    ).rejects.toThrow(/needs all four options \(A–D\)\. 3 of 4 filled/);
    expect(inserted()).toBe(false);
  });

  it('refuses a OneMark question filed under a topic not mapped to that exam', async () => {
    byTable.exam_definitions = { data: { config_key: 'tn_hsc_physics' }, error: null };
    byTable.exam_topic_map = { data: null, error: null };
    await expect(
      FoundationService.createItem({ ...oneMark, topic_id: 't-english-chapter' }),
    ).rejects.toThrow(/does not belong to this OneMark subject/);
    expect(calls).toContainEqual(['exam_topic_map', 'eq', 'exam_definition_id', 'exam-physics']);
    expect(calls).toContainEqual(['exam_topic_map', 'eq', 'topic_id', 't-english-chapter']);
    expect(inserted()).toBe(false);
  });

  it('accepts a OneMark question with four options and a mapped topic', async () => {
    byTable.exam_definitions = { data: { config_key: 'tn_hsc_english' }, error: null };
    byTable.exam_topic_map = { data: { topic_id: 't-phy' }, error: null };
    byTable.fp_items = { data: { id: 'i3' }, error: null };
    await FoundationService.createItem(oneMark);
    expect(inserted()).toBe(true);
  });

  it('a non-OneMark exam is untouched: two options and any topic still insert, same payload', async () => {
    byTable.exam_definitions = { data: { config_key: 'neet_ug' }, error: null };
    byTable.fp_items = { data: { id: 'i4' }, error: null };
    await FoundationService.createItem({
      exam_definition_id: 'exam-neet',
      topic_id: 't-anything',
      difficulty: 3,
      q_type: 'mcq',
      stem: 'Q?',
      options: [
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
      ],
      answer: { correct: 'A' },
    });
    expect(calls.some((c) => c[0] === 'exam_topic_map')).toBe(false);
    const insert = calls.find((c) => c[0] === 'fp_items' && c[1] === 'insert');
    expect(insert?.[2]).toEqual({
      exam_definition_id: 'exam-neet',
      topic_id: 't-anything',
      difficulty: 3,
      q_type: 'mcq',
      stem: 'Q?',
      options: [
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
      ],
      answer: { correct: 'A' },
      explanation: null,
      source: null,
      is_active: true,
    });
  });
});
