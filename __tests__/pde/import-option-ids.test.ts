// __tests__/pde/import-option-ids.test.ts
// ============================================================================
// Guards the PMS-import option-id stamping. Verified on production 2026-07-27:
// 3 of 3 mcq_warmup questions across 3 of 3 published clinical cases had
// id-less options — a 100% failure rate for everything this path had produced.
// An id-less option makes the question unanswerable (MCQWarmupQuestion compares
// `selectedId === o.id`, so undefined matches every option and Submit stays
// disabled) and ungradeable (fn_pde_mark_objective resolves the correct answer
// by the is_correct option's id when correct_answer is null).
// ============================================================================

import { describe, expect, it } from 'vitest';
import { stampQuestionOptionIds } from '@/app/api/pde/cases/import-from-pms/route';

const mcq = (options: unknown) => ({
  question_type: 'mcq_warmup' as const,
  question_text: 'Which finding best supports the provisional diagnosis?',
  options,
});

describe('stampQuestionOptionIds', () => {
  it('(a) stamps opt1..optN in array order when no option has an id', () => {
    const { questions, warnings } = stampQuestionOptionIds([
      mcq([
        { text: 'Periapical radiolucency', is_correct: true, feedback: 'Matches the diagnosis.' },
        { text: 'Generalised attrition', is_correct: false },
        { text: 'Gingival recession', is_correct: false },
      ]),
    ]);

    const options = questions[0].options as { id: string; text: string; is_correct: boolean }[];
    expect(options.map((o) => o.id)).toEqual(['opt1', 'opt2', 'opt3']);
    // text / is_correct / feedback are never altered
    expect(options[0].text).toBe('Periapical radiolucency');
    expect(options[0].is_correct).toBe(true);
    expect(options[1].is_correct).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('(b) preserves ids already supplied and never collides when filling gaps', () => {
    const { questions, warnings } = stampQuestionOptionIds([
      mcq([
        { id: 'opt2', text: 'Supplied second-slot id', is_correct: false },
        { text: 'No id', is_correct: true },
        { id: '   ', text: 'Blank id counts as missing', is_correct: false },
      ]),
    ]);

    const ids = (questions[0].options as { id: string }[]).map((o) => o.id);
    // the supplied id is kept as-is, and generated ids skip it
    expect(ids[0]).toBe('opt2');
    expect(ids).toEqual(['opt2', 'opt1', 'opt3']);
    expect(new Set(ids).size).toBe(3);
    expect(warnings).toEqual([]);
  });

  it('(b2) reports duplicate ids supplied by the source rather than silently importing', () => {
    const { questions, warnings } = stampQuestionOptionIds([
      mcq([
        { id: 'a', text: 'First', is_correct: true },
        { id: 'a', text: 'Second', is_correct: false },
      ]),
    ]);

    expect((questions[0].options as { id: string }[]).map((o) => o.id)).toEqual(['a', 'a']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('duplicate option id "a"');
  });

  it('(c) clears an empty options array, warns, and degrades an unanswerable MCQ', () => {
    const { questions, warnings } = stampQuestionOptionIds([mcq([])]);

    expect(questions[0].options).toBeNull();
    expect(questions[0].question_type).toBe('free_text_socratic');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('empty');
  });

  it('(c2) clears an options value that is not an array', () => {
    const { questions, warnings } = stampQuestionOptionIds([mcq('A) one B) two')]);

    expect(questions[0].options).toBeNull();
    expect(questions[0].question_type).toBe('free_text_socratic');
    expect(warnings[0]).toContain('not an array');
  });

  it('(d) leaves a question with no options untouched and raises no warning', () => {
    const freeText = {
      question_type: 'free_text_socratic' as const,
      question_text: 'Outline your management plan.',
      options: null,
    };
    const noKey = { question_type: 'free_text_socratic' as const, question_text: 'Why?' };

    const { questions, warnings } = stampQuestionOptionIds([freeText, noKey]);

    expect(questions[0]).toEqual(freeText);
    expect(questions[1]).toEqual(noKey);
    expect(warnings).toEqual([]);
  });

  it('stamps every question type that carries options, not only mcq_warmup', () => {
    const { questions, warnings } = stampQuestionOptionIds([
      { question_type: 'image_tag', question_text: 'Tag the lesion.', options: [{ text: 'Apex' }] },
      mcq([{ text: 'One', is_correct: true }, { text: 'Two', is_correct: false }]),
    ]);

    expect((questions[0].options as { id: string }[])[0].id).toBe('opt1');
    expect((questions[1].options as { id: string }[]).map((o) => o.id)).toEqual(['opt1', 'opt2']);
    expect(warnings).toEqual([]);
  });

  it('does not mutate the questions it was given', () => {
    const input = [mcq([{ text: 'One', is_correct: true }])];
    stampQuestionOptionIds(input);
    expect((input[0].options as { id?: string }[])[0].id).toBeUndefined();
  });
});
