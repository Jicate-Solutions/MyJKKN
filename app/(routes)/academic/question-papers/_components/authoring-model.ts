// The authoring screen's local edit model, and the two conversions around it:
// server question → working copy, and working copy → save payload.
//
// Kept out of the component so the save contract can be read (and reasoned about)
// on its own — it is the part that can silently lose an author's work.

import { readSubQuestions, readQuestionImage } from '@/lib/utils/question-papers/sub-questions';
import type {
  IaPaperQuestion,
  IaPaperQuestionOption,
  IaQuestionImage,
  IaSubQuestion,
  QuestionEditDto,
} from '@/types/ia-question-paper';

/**
 * One question as the author is editing it.
 *
 * Nullable server fields are normalised to '' / [] / null so every control is
 * CONTROLLED from the first render — a field that starts `undefined` and later
 * becomes a string makes React swap the input to controlled mid-edit and warn.
 */
export interface EditableQuestion {
  id: string;
  question_text: string;
  marks: number | null;
  options: IaPaperQuestionOption[] | null;
  option_font: string | null;
  image: IaQuestionImage | null;
  correct_option: string;
  co_code: string;
  k_level: string;
  /** `[]` = not split. Never null, so callers can map without a guard. */
  sub_questions: IaSubQuestion[];
}

/** Server question → working copy. */
export function seedQuestion(q: IaPaperQuestion): EditableQuestion {
  return {
    id: q.id,
    question_text: q.question_text ?? '',
    marks: q.marks ?? null,
    options: q.options ?? null,
    option_font: q.option_font ?? null,
    image: readQuestionImage(q.image),
    correct_option: q.correct_option ?? '',
    co_code: q.co_code ?? '',
    k_level: q.k_level ?? '',
    // readSubQuestions re-sorts by display_order and re-labels i, ii, iii… so a
    // paper hand-edited elsewhere still opens with clean labels.
    sub_questions: readSubQuestions(q),
  };
}

export function seedQuestions(questions: IaPaperQuestion[]): Record<string, EditableQuestion> {
  const seed: Record<string, EditableQuestion> = {};
  for (const q of questions) seed[q.id] = seedQuestion(q);
  return seed;
}

/**
 * Working copy → the shape the pure validators and label helpers expect.
 *
 * They read `part_label`, `question_number` and `sub_label` to build messages like
 * "Q12a i: select CO", so the immutable slot fields must be carried through — the
 * edit state alone cannot produce a correct message.
 */
export function mergeForValidation(
  slots: IaPaperQuestion[],
  edits: Record<string, EditableQuestion>
): IaPaperQuestion[] {
  return slots.map((slot) => {
    const e = edits[slot.id];
    if (!e) return slot;
    return {
      ...slot,
      question_text: e.question_text,
      marks: e.marks ?? undefined,
      options: e.options,
      option_font: e.option_font,
      image: e.image,
      correct_option: e.correct_option,
      co_code: e.co_code,
      k_level: e.k_level,
      sub_questions: e.sub_questions,
    };
  });
}

/**
 * Working copy → save payload.
 *
 * Every field is stated EXPLICITLY. Under COE's merge rule an omitted key is
 * preserved and an explicit one is written, so a payload that names every field is
 * the honest representation of "this is the whole question as the author left it".
 * Half-stated payloads are how the original Part B data loss happened.
 *
 * A split question's own CO/K are nulled here as well as server-side — each
 * sub-division carries its own, and leaving a stale parent value in the JSONB
 * would resurface if the split were ever undone.
 */
export function toDto(e: EditableQuestion): QuestionEditDto {
  const isSplit = e.sub_questions.length > 0;
  return {
    id: e.id,
    question_text: e.question_text || null,
    marks: e.marks ?? null,
    options: e.options ?? null,
    option_font: e.option_font || null,
    image: e.image ?? null,
    correct_option: e.correct_option || null,
    co_code: isSplit ? null : e.co_code || null,
    k_level: isSplit ? null : e.k_level || null,
    // An objective question can never be split; send [] rather than null so the
    // stored value is normalised either way.
    sub_questions: e.options && e.options.length > 0 ? [] : e.sub_questions,
  };
}

/** Ordered save payload for the whole paper. */
export function toPayload(
  slots: IaPaperQuestion[],
  edits: Record<string, EditableQuestion>
): QuestionEditDto[] {
  return slots.map((s) => edits[s.id]).filter(Boolean).map(toDto);
}

/**
 * How many questions carry authored content — what the header chip reports after
 * a save ("✓ Saved N answer(s)"). Counts a split question once, when any of its
 * sub-divisions has text: the author wrote one question, not three.
 */
export function countAuthored(edits: Record<string, EditableQuestion>): number {
  const plain = (v: string | null | undefined) =>
    String(v ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  return Object.values(edits).filter(
    (e) =>
      plain(e.question_text) !== '' ||
      e.sub_questions.some((s) => plain(s.question_text) !== '')
  ).length;
}
