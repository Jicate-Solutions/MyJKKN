/**
 * lib/services/onemark/draft-contract — what an AI draft must carry before it
 * becomes an fp_items row. Pure functions; no Supabase.
 */
import { describe, it, expect } from 'vitest';
import {
  parseDraftOutput,
  buildDraftPayload,
  parsePayload,
  toDraftRow,
  validateBatch,
  validateDraftItem,
  type DraftJobPayload,
} from '@/lib/services/onemark/draft-contract';

const EXAM = '11111111-1111-4111-8111-111111111111';
const TOPIC = '22222222-2222-4222-8222-222222222222';

const physics: DraftJobPayload = {
  exam_definition_id: EXAM,
  exam_key: 'tn_hsc_physics',
  topic_id: TOPIC,
  tag_keys: ['numerical', 'concept'],
  count: 2,
  bloom_level: 'K2',
};
const english: DraftJobPayload = { ...physics, exam_key: 'tn_hsc_english', topic_id: null, tag_keys: ['synonym'] };

/** The fp_items table shape the prompt asks for. */
function good(over: Record<string, unknown> = {}) {
  return {
    stem: 'The SI unit of electric charge is',
    stem_ta: 'மின்னூட்டத்தின் SI அலகு',
    options: ['coulomb', 'ampere', 'volt', 'ohm'],
    options_ta: ['கூலும்', 'ஆம்பியர்', 'வோல்ட்', 'ஓம்'],
    answer: { correct: 'A' },
    explanation: 'Charge is measured in coulomb.',
    explanation_ta: 'மின்னூட்டம் கூலும் அலகில் அளக்கப்படுகிறது.',
    bloom_level: 'K1',
    tags: ['concept'],
    option_layout: 'inline_4',
    ...over,
  };
}

describe('buildDraftPayload', () => {
  // The Max seat runner substitutes ONE slot, {{prompt}}, from payload.prompt,
  // and validates input_schema keys at the top level. Two production failures
  // taught this: a flat payload left {{payload}} empty (ai_jobs 1096542b), and
  // an _ctx-only payload was refused as "missing required input(s)"
  // (ai_jobs bbbf0cbc). The data must therefore be IN the prompt text.
  it('puts the run data in prompt, where the runner actually substitutes', () => {
    const built = buildDraftPayload(physics);
    expect(typeof built.prompt).toBe('string');
    const echoed = JSON.parse(built.prompt);
    expect(echoed).toEqual(physics);
  });

  it('keeps the fields under _ctx so the collect pass can read them', () => {
    const built = buildDraftPayload(physics);
    expect(built._ctx).toEqual(physics);
    expect(parsePayload(built)).toEqual(physics);
  });

  it('round-trips a null topic_id (chapter-agnostic English tag sets)', () => {
    const built = buildDraftPayload({ ...physics, topic_id: null });
    expect(JSON.parse(built.prompt).topic_id).toBeNull();
    expect(parsePayload(built)!.topic_id).toBeNull();
  });
});

describe('parsePayload', () => {
  // Regression guard, 2026-09-06. The Max-lane seat runner substitutes
  // payload._ctx into the template's {{payload}} slot. Lane I first sent its
  // fields at the top level, so the model received an empty slot and replied
  // "I don't see the actual input payload" (ai_jobs 1096542b). The route now
  // nests under _ctx; both shapes must parse, because a job queued before the
  // change still has to file.
  it('reads the fields from _ctx (the Max-lane payload convention)', () => {
    const p = parsePayload({ _ctx: { ...physics }, prompt: 'draft them' });
    expect(p).not.toBeNull();
    expect(p!.exam_definition_id).toBe(physics.exam_definition_id);
    expect(p!.count).toBe(physics.count);
    expect(p!.bloom_level).toBe(physics.bloom_level);
  });

  it('still reads a flat payload queued before the _ctx change', () => {
    const p = parsePayload({ ...physics });
    expect(p).not.toBeNull();
    expect(p!.exam_definition_id).toBe(physics.exam_definition_id);
  });

  it('rejects an _ctx that is not an object rather than reading around it', () => {
    expect(parsePayload({ _ctx: 'nope', prompt: 'x' })).toBeNull();
    expect(parsePayload({ _ctx: [1, 2, 3] })).toBeNull();
  });

  it('accepts the shape Lane I enqueues and dedupes tag keys', () => {
    const p = parsePayload({ ...physics, tag_keys: ['a', 'a', 'b'] });
    expect(p?.tag_keys).toEqual(['a', 'b']);
    expect(p?.topic_id).toBe(TOPIC);
  });
  it('allows a null topic (chapter-agnostic English tags)', () => {
    expect(parsePayload(english)?.topic_id).toBeNull();
  });
  it('refuses a bad uuid, an empty tag list, a non-K level', () => {
    expect(parsePayload({ ...physics, exam_definition_id: 'nope' })).toBeNull();
    expect(parsePayload({ ...physics, tag_keys: [] })).toBeNull();
    expect(parsePayload({ ...physics, bloom_level: 'A1' })).toBeNull();
  });
});

describe('parseDraftOutput', () => {
  it('reads strict JSON, a fenced block, and prose-wrapped JSON', () => {
    const body = JSON.stringify({ items: [good()] });
    expect(parseDraftOutput(body)).toMatchObject({ ok: true });
    expect(parseDraftOutput('```json\n' + body + '\n```')).toMatchObject({ ok: true });
    expect(parseDraftOutput('Here you go:\n' + body + '\nDone.')).toMatchObject({ ok: true });
  });
  it('surfaces the shortfall reason', () => {
    const r = parseDraftOutput(JSON.stringify({ items: [], shortfall_reason: 'unit has 3 facts only' }));
    expect(r).toMatchObject({ ok: true, shortfall_reason: 'unit has 3 facts only' });
  });
  it('rejects output with no items array', () => {
    expect(parseDraftOutput('{"answer":"A"}')).toMatchObject({ ok: false });
    expect(parseDraftOutput('not json at all')).toMatchObject({ ok: false });
  });
});

describe('validateDraftItem', () => {
  it('accepts a complete physics item in the table shape', () => {
    const v = validateDraftItem(good(), physics);
    expect(v.ok).toBe(true);
    expect(v.item?.answer).toEqual({ correct: 'A' });
    expect(v.item?.tags).toEqual(['concept']);
  });
  it('also reads keyed options [{key,text}] (the fp_items column shape)', () => {
    const keyed = good({
      options: [
        { key: 'A', text: 'coulomb' },
        { key: 'B', text: 'ampere' },
        { key: 'C', text: 'volt' },
        { key: 'D', text: 'ohm' },
      ],
    });
    expect(validateDraftItem(keyed, physics).item?.options).toEqual(['coulomb', 'ampere', 'volt', 'ohm']);
  });
  it('REJECTS a bare-string answer and any non-A–D correct key', () => {
    expect(validateDraftItem(good({ answer: 'A' }), physics)).toMatchObject({ ok: false });
    expect(validateDraftItem(good({ answer: { correct: 'E' } }), physics)).toMatchObject({ ok: false });
    expect(validateDraftItem(good({ answer: { correct: null } }), physics)).toMatchObject({ ok: false });
    expect(validateDraftItem(good({ answer: { correct: 'd' } }), physics).item?.answer).toEqual({ correct: 'D' });
  });
  it('requires the Tamil block for physics but not for English', () => {
    expect(validateDraftItem(good({ stem_ta: '' }), physics)).toMatchObject({ ok: false });
    expect(validateDraftItem(good({ options_ta: null }), physics)).toMatchObject({ ok: false });
    expect(
      validateDraftItem(good({ stem_ta: null, options_ta: null, tags: ['synonym'] }), english),
    ).toMatchObject({ ok: true });
  });
  it('drops "all/none of the above", repeated options, and fewer than four', () => {
    expect(validateDraftItem(good({ options: ['a', 'b', 'c', 'All of the above'] }), physics)).toMatchObject({ ok: false });
    expect(validateDraftItem(good({ options: ['a', 'a', 'c', 'd'] }), physics)).toMatchObject({ ok: false });
    expect(validateDraftItem(good({ options: ['a', 'b', 'c'] }), physics)).toMatchObject({ ok: false });
    expect(validateDraftItem(good({ options: ['a', 'b', 'c', 'd', 'e'] }), physics)).toMatchObject({ ok: false });
  });
  it('enforces decision 6 — JABT K-levels only', () => {
    expect(validateDraftItem(good({ bloom_level: 'A3' }), physics)).toMatchObject({ ok: false });
    expect(validateDraftItem(good({ bloom_level: 'K7' }), physics)).toMatchObject({ ok: false });
    expect(validateDraftItem(good({ bloom_level: 'k4' }), physics)).toMatchObject({ ok: true });
  });
  it('refuses tags that were not requested and defaults an unknown layout to auto', () => {
    expect(validateDraftItem(good({ tags: ['diagram'] }), physics)).toMatchObject({ ok: false });
    expect(validateDraftItem(good({ tags: ['concept', 'diagram'] }), physics)).toMatchObject({ ok: false });
    expect(validateDraftItem(good({ tags: [] }), physics)).toMatchObject({ ok: false });
    expect(validateDraftItem(good({ tags: 'numerical' }), physics).item?.tags).toEqual(['numerical']);
    const v = validateDraftItem(good({ option_layout: 'grid' }), physics);
    expect(v.item?.option_layout).toBe('auto');
  });
});

describe('toDraftRow', () => {
  it('sets identity and state from the payload, never the model', () => {
    const v = validateDraftItem(
      good({ exam_definition_id: 'model-supplied', topic_id: 'model-supplied', is_active: true, created_by: 'x' }),
      physics,
    );
    if (!v.ok || !v.item) throw new Error('fixture invalid');
    const row = toDraftRow(v.item, physics, 'user-1');
    expect(row).toMatchObject({
      exam_definition_id: EXAM,
      topic_id: TOPIC,
      q_type: 'mcq_single',
      is_active: false,
      source_key: 'internal',
      source: 'ai_generated',
      tags: ['concept'],
      bloom_level: 'K1',
      advanced_dimension: null,
      created_by: 'user-1',
      updated_by: 'user-1',
      answer: { correct: 'A' },
    });
    expect(row.options).toEqual([
      { key: 'A', text: 'coulomb' },
      { key: 'B', text: 'ampere' },
      { key: 'C', text: 'volt' },
      { key: 'D', text: 'ohm' },
    ]);
    expect(row.options_ta?.[0]).toEqual({ key: 'A', text: 'கூலும்' });
  });
});

describe('validateBatch', () => {
  it('drops invalid items, duplicates, and anything over the requested count — with reasons', () => {
    const items = [
      good(),
      good({ stem: 'the si unit of ELECTRIC charge is!' }), // duplicate by normalised stem
      good({ stem: 'Already in the bank' }), // duplicate against the bank
      good({ stem: 'Second good one', answer: { correct: 'B' } }),
      good({ stem: 'Third good one' }), // over count (count=2)
      { stem: 'Broken', options: ['x'] },
    ];
    const bank = new Set(['already in the bank']);
    const { rows, rejected } = validateBatch(items, physics, 'user-1', bank);
    expect(rows.map((r) => r.stem)).toEqual(['The SI unit of electric charge is', 'Second good one']);
    expect(rejected.map((r) => r.index)).toEqual([1, 2, 4, 5]);
    expect(rejected[0].why).toMatch(/duplicate/);
    expect(rejected[2].why).toMatch(/over the requested count/);
    expect(rejected[3].why).toMatch(/options/);
    expect(rejected[3].stem_preview).toBe('Broken');
  });
});
