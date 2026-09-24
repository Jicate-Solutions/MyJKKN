/**
 * Authoring-time gates for the three progressive-vignette question formats.
 *
 * These matter more than ordinary input validation because of how the database
 * marks. fn_pde_score_clinical_answer returns NULL — "not objectively markable"
 * — for a question whose key is missing or malformed, and fn_pde_submit_stage
 * drops NULL-scoring questions from the stage denominator rather than scoring
 * them zero. So a `matching` question with a typo'd key does not fail loudly:
 * it quietly stops counting, and the stage gate it was supposed to help enforce
 * gets weaker. Catching it at authoring time is what keeps that from happening.
 */

import { describe, expect, it } from 'vitest';
import {
  validateClinicalQuestion,
  validateStages,
} from '@/lib/services/pde/clinical-question-validation';

const base = {
  question_text: 'Q',
  metadata: { q_number: 1, osce_domain: 'hypothesis_generation', ground_truth: 'g', key_concepts: [] as string[] },
};

describe('validateClinicalQuestion — the original three types still pass', () => {
  it('accepts free_text_socratic', () => {
    expect(validateClinicalQuestion({ ...base, question_type: 'free_text_socratic' }, 'Q1')).toBeNull();
  });

  it('accepts mcq_warmup', () => {
    expect(validateClinicalQuestion({ ...base, question_type: 'mcq_warmup' }, 'Q1')).toBeNull();
  });

  it('accepts image_tag', () => {
    expect(validateClinicalQuestion({ ...base, question_type: 'image_tag' }, 'Q1')).toBeNull();
  });

  it('rejects a type that is not a clinical question type', () => {
    expect(validateClinicalQuestion({ ...base, question_type: 'essay' }, 'Q1')).toMatch(/invalid/);
  });
});

describe('validateClinicalQuestion — multi_select', () => {
  const opts = [
    { id: 'a', text: 'Pemphigus vulgaris', is_correct: true },
    { id: 'b', text: 'Mucous membrane pemphigoid', is_correct: true },
    { id: 'd', text: 'Recurrent aphthous stomatitis', is_correct: false },
  ];

  it('accepts a question with at least one correct option', () => {
    expect(
      validateClinicalQuestion({ ...base, question_type: 'multi_select', options: opts }, 'Q1'),
    ).toBeNull();
  });

  it('rejects fewer than two options', () => {
    expect(
      validateClinicalQuestion(
        { ...base, question_type: 'multi_select', options: [opts[0]] },
        'Q1',
      ),
    ).toMatch(/at least 2 options/);
  });

  it('rejects a question where nothing is marked correct', () => {
    expect(
      validateClinicalQuestion(
        {
          ...base,
          question_type: 'multi_select',
          options: opts.map((o) => ({ ...o, is_correct: false })),
        },
        'Q1',
      ),
    ).toMatch(/at least one option as correct/);
  });
});

describe('validateClinicalQuestion — matching', () => {
  const pairs = [
    { id: 'p1', left: 'Autoantibody target', options: ['Desmoglein 3', 'BP180', 'Type IV collagen'] },
    { id: 'p2', left: 'Antibody class', options: ['IgG', 'IgA', 'IgM'] },
  ];
  const key = JSON.stringify({ p1: 'Desmoglein 3', p2: 'IgG' });

  it('accepts pairs whose answers come from their own option lists', () => {
    expect(
      validateClinicalQuestion(
        { ...base, question_type: 'matching', correct_answer: key, metadata: { ...base.metadata, match_pairs: pairs } },
        'Q1',
      ),
    ).toBeNull();
  });

  it('is case- and whitespace-insensitive, matching how the database marks', () => {
    expect(
      validateClinicalQuestion(
        {
          ...base,
          question_type: 'matching',
          correct_answer: JSON.stringify({ p1: ' desmoglein 3 ', p2: 'igg' }),
          metadata: { ...base.metadata, match_pairs: pairs },
        },
        'Q1',
      ),
    ).toBeNull();
  });

  it('rejects an answer that is not in that pair’s own option list', () => {
    // The whole point of matching-with-per-item-lists: "IgG" is a valid answer
    // somewhere in this question, but not for the autoantibody target.
    expect(
      validateClinicalQuestion(
        {
          ...base,
          question_type: 'matching',
          correct_answer: JSON.stringify({ p1: 'IgG', p2: 'IgG' }),
          metadata: { ...base.metadata, match_pairs: pairs },
        },
        'Q1',
      ),
    ).toMatch(/not in its own option list/);
  });

  it('rejects a pair with no answer chosen', () => {
    expect(
      validateClinicalQuestion(
        {
          ...base,
          question_type: 'matching',
          correct_answer: JSON.stringify({ p1: 'Desmoglein 3' }),
          metadata: { ...base.metadata, match_pairs: pairs },
        },
        'Q1',
      ),
    ).toMatch(/choose the correct option/);
  });

  it('rejects a malformed key rather than treating it as empty', () => {
    expect(
      validateClinicalQuestion(
        {
          ...base,
          question_type: 'matching',
          correct_answer: '{not json',
          metadata: { ...base.metadata, match_pairs: pairs },
        },
        'Q1',
      ),
    ).toMatch(/not valid JSON/);
  });

  it('rejects a question with no pairs at all', () => {
    expect(
      validateClinicalQuestion(
        { ...base, question_type: 'matching', correct_answer: '{}', metadata: { ...base.metadata, match_pairs: [] } },
        'Q1',
      ),
    ).toMatch(/at least one item/);
  });
});

describe('validateClinicalQuestion — sequencing', () => {
  const items = [
    { id: 's1', text: 'Topical lidocaine' },
    { id: 's2', text: 'Systemic prednisolone' },
    { id: 's3', text: 'Steroid-sparing agent' },
    { id: 's4', text: 'Taper steroids' },
  ];

  it('accepts a key that lists every step exactly once', () => {
    expect(
      validateClinicalQuestion(
        {
          ...base,
          question_type: 'sequencing',
          correct_answer: JSON.stringify(['s1', 's2', 's3', 's4']),
          metadata: { ...base.metadata, sequence_items: items },
        },
        'Q1',
      ),
    ).toBeNull();
  });

  it('rejects a key that omits a step', () => {
    expect(
      validateClinicalQuestion(
        {
          ...base,
          question_type: 'sequencing',
          correct_answer: JSON.stringify(['s1', 's2', 's3']),
          metadata: { ...base.metadata, sequence_items: items },
        },
        'Q1',
      ),
    ).toMatch(/every step exactly once/);
  });

  it('rejects a key that repeats a step', () => {
    expect(
      validateClinicalQuestion(
        {
          ...base,
          question_type: 'sequencing',
          correct_answer: JSON.stringify(['s1', 's1', 's3', 's4']),
          metadata: { ...base.metadata, sequence_items: items },
        },
        'Q1',
      ),
    ).toMatch(/repeats a step/);
  });

  it('rejects a key referencing a step that does not exist', () => {
    expect(
      validateClinicalQuestion(
        {
          ...base,
          question_type: 'sequencing',
          correct_answer: JSON.stringify(['s1', 's2', 's3', 'ghost']),
          metadata: { ...base.metadata, sequence_items: items },
        },
        'Q1',
      ),
    ).toMatch(/unknown step/);
  });

  it('rejects fewer than two steps', () => {
    expect(
      validateClinicalQuestion(
        {
          ...base,
          question_type: 'sequencing',
          correct_answer: JSON.stringify(['s1']),
          metadata: { ...base.metadata, sequence_items: [items[0]] },
        },
        'Q1',
      ),
    ).toMatch(/at least 2 steps/);
  });
});

describe('validateStages', () => {
  it('treats "no stages" as valid — a flat case is still a supported shape', () => {
    expect(validateStages(undefined)).toBeNull();
    expect(validateStages([])).toBeNull();
  });

  it('accepts well-formed stages', () => {
    expect(
      validateStages([
        { title: 'Presentation', scenario_text: 'A 48-year-old presents with…' },
        { title: 'Histopathology', scenario_text: 'Tzanck smear reveals…' },
      ]),
    ).toBeNull();
  });

  it('rejects a stage with no title', () => {
    expect(validateStages([{ title: '   ', scenario_text: 'x' }])).toMatch(/title required/);
  });

  it('rejects a non-array', () => {
    expect(validateStages({ title: 'x' })).toMatch(/must be an array/);
  });
});
