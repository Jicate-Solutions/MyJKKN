// lib/health/forms.ts
// Created: 2026-06-16 — Wellness Programs form builder (shared, framework-agnostic).
// Factories + legacy normalization + type-aware validation + graded scoring for
// the per-day FormSpec. Used by the admin builder AND the participant page, so it
// lives in lib/ (not the admin _components folder). Replaces quiz-helpers.ts.
//
// A "form" mixes GRADED choice fields (correct answers → quiz_score percent) and
// UNGRADED fields (text / scale → captured as survey responses only). quiz_score
// stays the single currency the impact dashboard reads, so scoring graded fields
// the same way keeps every existing metric working.

import type {
  FormField,
  FormFieldOption,
  FormFieldType,
  FormResponses,
  FormSpec,
} from '@/types/health-programs';

function genId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Field types that present options and can be graded. */
export const CHOICE_TYPES: FormFieldType[] = [
  'single_choice',
  'multi_choice',
  'dropdown',
];

export function isChoiceType(t: FormFieldType): boolean {
  return CHOICE_TYPES.includes(t);
}

/** Human labels for the field-type picker, in display order. */
export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  single_choice: 'Multiple choice (one answer)',
  multi_choice: 'Checkboxes (multiple answers)',
  dropdown: 'Dropdown',
  short_text: 'Short text',
  paragraph: 'Paragraph',
  scale: 'Rating scale',
  date: 'Date',
};

export const FIELD_TYPE_ORDER: FormFieldType[] = [
  'single_choice',
  'multi_choice',
  'dropdown',
  'short_text',
  'paragraph',
  'scale',
  'date',
];

export function makeBlankOption(isCorrect = false): FormFieldOption {
  return { id: genId('opt'), text: '', is_correct: isCorrect };
}

export function makeBlankField(
  type: FormFieldType = 'single_choice'
): FormField {
  const field: FormField = { id: genId('f'), type, label: '' };
  if (isChoiceType(type)) {
    // Seed 2 options; for single-answer types mark the first correct so a freshly
    // graded field is already valid once text is filled in.
    const seedFirstCorrect = type !== 'multi_choice';
    field.options = [makeBlankOption(seedFirstCorrect), makeBlankOption(false)];
    field.graded = false;
  }
  if (type === 'scale') {
    field.scale_min = 1;
    field.scale_max = 5;
  }
  return field;
}

export function emptyForm(): FormSpec {
  return { fields: [] };
}

function normalizeOption(o: unknown): FormFieldOption {
  const obj = (o ?? {}) as Record<string, unknown>;
  return {
    id: typeof obj.id === 'string' ? obj.id : genId('opt'),
    text: typeof obj.text === 'string' ? obj.text : '',
    is_correct: !!obj.is_correct,
  };
}

function normalizeField(f: unknown): FormField {
  const obj = (f ?? {}) as Record<string, unknown>;
  const type = (obj.type as FormFieldType) ?? 'single_choice';
  const field: FormField = {
    id: typeof obj.id === 'string' ? obj.id : genId('f'),
    type,
    // Legacy fields used `question`; new fields use `label`.
    label:
      typeof obj.label === 'string'
        ? obj.label
        : typeof obj.question === 'string'
          ? obj.question
          : '',
    required: typeof obj.required === 'boolean' ? obj.required : undefined,
  };
  if (typeof obj.description === 'string' && obj.description.trim()) {
    field.description = obj.description;
  }
  if (isChoiceType(type)) {
    field.graded = !!obj.graded;
    field.options = Array.isArray(obj.options)
      ? obj.options.map(normalizeOption)
      : [];
  }
  if (type === 'scale') {
    field.scale_min = typeof obj.scale_min === 'number' ? obj.scale_min : 1;
    field.scale_max = typeof obj.scale_max === 'number' ? obj.scale_max : 5;
    if (typeof obj.scale_min_label === 'string')
      field.scale_min_label = obj.scale_min_label;
    if (typeof obj.scale_max_label === 'string')
      field.scale_max_label = obj.scale_max_label;
  }
  return field;
}

/**
 * Read-shim: turn whatever is stored in `quiz` (new FormSpec OR legacy
 * {questions:[{question,options}]}) into a FormSpec. Idempotent. Legacy quiz
 * questions become graded single_choice fields so old quizzes keep scoring.
 */
export function normalizeForm(raw: unknown): FormSpec {
  if (!raw || typeof raw !== 'object') return emptyForm();
  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.fields)) {
    return { fields: obj.fields.map(normalizeField) };
  }
  if (Array.isArray(obj.questions)) {
    return {
      fields: obj.questions.map((q) => {
        const norm = normalizeField(q);
        // A legacy MCQ is graded by definition.
        norm.graded = true;
        return norm;
      }),
    };
  }
  return emptyForm();
}

export function formHasContent(form: FormSpec | null | undefined): boolean {
  return !!form && form.fields.length > 0;
}

export interface FormValidation {
  ok: boolean;
  errors: string[];
}

/** Validates a form. An EMPTY form is valid — the day form is optional. */
export function validateForm(form: FormSpec): FormValidation {
  const errors: string[] = [];
  form.fields.forEach((f, i) => {
    const tag = `Field ${i + 1}`;
    if (!f.label.trim()) errors.push(`${tag}: question/label is empty.`);

    if (isChoiceType(f.type)) {
      const opts = f.options ?? [];
      if (opts.length < 2) errors.push(`${tag}: needs at least 2 options.`);
      opts.forEach((o, oi) => {
        if (!o.text.trim()) {
          errors.push(`${tag} option ${String.fromCharCode(65 + oi)}: text is empty.`);
        }
      });
      if (f.graded) {
        const correct = opts.filter((o) => o.is_correct).length;
        if (correct === 0)
          errors.push(`${tag}: select the correct answer, or turn off grading.`);
        if (f.type !== 'multi_choice' && correct > 1)
          errors.push(`${tag}: only one answer can be correct.`);
      }
    }

    if (f.type === 'scale') {
      const lo = f.scale_min ?? 1;
      const hi = f.scale_max ?? 5;
      if (hi <= lo) errors.push(`${tag}: scale max must be greater than min.`);
      if (hi - lo > 10) errors.push(`${tag}: scale range too large (max 10 steps).`);
    }
  });
  return { ok: errors.length === 0, errors };
}

/** A graded field = a choice field marked graded that has ≥1 correct option. */
function gradedFields(form: FormSpec): FormField[] {
  return form.fields.filter(
    (f) =>
      isChoiceType(f.type) &&
      f.graded &&
      (f.options ?? []).some((o) => o.is_correct)
  );
}

/** True when the form has at least one graded field (→ produces a quiz_score). */
export function formIsGraded(form: FormSpec): boolean {
  return gradedFields(form).length > 0;
}

/**
 * Score responses against the graded fields → percent (0–100), or null when the
 * form has no graded fields (a pure survey). multi_choice is correct only on an
 * exact set match. This percent is written to participation.quiz_score, so every
 * existing impact metric keeps working unchanged.
 */
export function scoreForm(
  form: FormSpec,
  responses: FormResponses
): number | null {
  const graded = gradedFields(form);
  if (graded.length === 0) return null;

  let correct = 0;
  for (const f of graded) {
    const correctIds = (f.options ?? [])
      .filter((o) => o.is_correct)
      .map((o) => o.id)
      .sort();
    const ans = responses[f.id];

    if (f.type === 'multi_choice') {
      const sel = Array.isArray(ans) ? [...ans].sort() : [];
      if (
        sel.length === correctIds.length &&
        sel.every((v, i) => v === correctIds[i])
      ) {
        correct += 1;
      }
    } else {
      // single_choice | dropdown
      if (typeof ans === 'string' && correctIds.length === 1 && ans === correctIds[0]) {
        correct += 1;
      }
    }
  }
  return Math.round((correct / graded.length) * 100);
}

// ---------------------------------------------------------------------------
// Reading responses back (admin response-viewer).
// resolveResponses → one participant's answers, labeled + option-IDs-resolved.
// summarizeResponses → per-question tallies across all participants.
// Both reuse the SAME field model + correctness rule as scoreForm, so the
// viewer can never drift from how answers are stored and scored.
// ---------------------------------------------------------------------------

function optionText(field: FormField, id: string): string {
  const opt = (field.options ?? []).find((o) => o.id === id);
  return opt ? opt.text || '(blank option)' : '(removed option)';
}

/** True when the participant actually answered. Numeric 0 counts; ''/[] don't. */
function isAnswered(field: FormField, raw: FormResponses[string] | undefined): boolean {
  void field;
  if (raw === undefined || raw === null) return false;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'string') return raw.trim().length > 0;
  return true; // number (incl. 0)
}

/** Human-readable answer pieces for one field. */
function answerValues(field: FormField, raw: FormResponses[string] | undefined): string[] {
  if (raw === undefined || raw === null) return [];
  if (isChoiceType(field.type)) {
    if (field.type === 'multi_choice') {
      return Array.isArray(raw) ? raw.map((id) => optionText(field, String(id))) : [];
    }
    return typeof raw === 'string' ? [optionText(field, raw)] : [];
  }
  if (field.type === 'scale') {
    return typeof raw === 'number' ? [String(raw)] : [];
  }
  // short_text | paragraph
  const s = typeof raw === 'string' ? raw : String(raw);
  return s.trim() ? [s] : [];
}

/** Graded choice fields only — same rule as scoreForm. undefined = not graded. */
function answerIsCorrect(
  field: FormField,
  raw: FormResponses[string] | undefined
): boolean | undefined {
  if (!isChoiceType(field.type) || !field.graded) return undefined;
  const correctIds = (field.options ?? [])
    .filter((o) => o.is_correct)
    .map((o) => o.id)
    .sort();
  if (correctIds.length === 0) return undefined;
  if (field.type === 'multi_choice') {
    const sel = Array.isArray(raw) ? [...raw].map(String).sort() : [];
    return (
      sel.length === correctIds.length && sel.every((v, i) => v === correctIds[i])
    );
  }
  return typeof raw === 'string' && correctIds.length === 1 && raw === correctIds[0];
}

/** One field's resolved answer for a single participant. */
export interface ResolvedAnswer {
  fieldId: string;
  label: string;
  type: FormFieldType;
  /** Whether this participant answered the field. */
  answered: boolean;
  /** Option text(s), the typed text, or the scale number — display-ready. */
  values: string[];
  /** Graded choice fields only: true when fully correct. */
  correct?: boolean;
  /** True when the answer's field no longer exists in the form. */
  orphan?: boolean;
}

/**
 * Resolve ONE participant's answers against the form, in question order.
 * Choice option IDs become option text; graded fields carry a correct flag;
 * answers whose field was removed/edited out are appended as `orphan` rows so
 * nothing the participant submitted is silently dropped.
 */
export function resolveResponses(
  form: FormSpec,
  responses: FormResponses | null | undefined
): ResolvedAnswer[] {
  const r = responses ?? {};
  const out: ResolvedAnswer[] = [];
  const seen = new Set<string>();

  for (const f of form.fields) {
    seen.add(f.id);
    const raw = r[f.id];
    out.push({
      fieldId: f.id,
      label: f.label.trim() || '(untitled question)',
      type: f.type,
      answered: isAnswered(f, raw),
      values: answerValues(f, raw),
      correct: answerIsCorrect(f, raw),
    });
  }

  for (const [key, raw] of Object.entries(r)) {
    if (seen.has(key)) continue;
    const values = Array.isArray(raw)
      ? raw.map((v) => String(v))
      : raw === null || raw === undefined
        ? []
        : [String(raw)];
    out.push({
      fieldId: key,
      label: '(question removed)',
      type: 'short_text',
      answered: values.length > 0,
      values,
      orphan: true,
    });
  }

  return out;
}

export interface FieldSummaryOption {
  /** Option id, or the scale value as a string. */
  key: string;
  /** Option text, or the scale number. */
  label: string;
  count: number;
  /** Graded choice fields only: this is a correct option. */
  isCorrect?: boolean;
}

/** Per-question aggregate across all participants (Summary tab). */
export interface FieldSummary {
  fieldId: string;
  label: string;
  type: FormFieldType;
  graded: boolean;
  /** How many participants answered this field. */
  answeredCount: number;
  /** Choice + scale: counts per option/value, in natural order. */
  options?: FieldSummaryOption[];
  /** Text types: the free-text answers. */
  textAnswers?: string[];
  /** Scale: numeric average over answered rows (null when none). */
  average?: number | null;
}

/**
 * Aggregate a list of participants' responses into per-question summaries.
 * Choice/scale → counts per option/value (option order preserved, correct
 * option flagged); text → the list of answers; scale → numeric average.
 */
export function summarizeResponses(
  form: FormSpec,
  list: (FormResponses | null | undefined)[]
): FieldSummary[] {
  const rows = list.map((r) => r ?? {});

  return form.fields.map((f) => {
    const raws = rows.map((r) => r[f.id]);
    const answeredCount = raws.filter((raw) => isAnswered(f, raw)).length;
    const label = f.label.trim() || '(untitled question)';

    if (isChoiceType(f.type)) {
      const opts = f.options ?? [];
      const counts = new Map<string, number>();
      for (const raw of raws) {
        const ids =
          f.type === 'multi_choice'
            ? Array.isArray(raw)
              ? raw.map((v) => String(v))
              : []
            : typeof raw === 'string'
              ? [raw]
              : [];
        for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      const options: FieldSummaryOption[] = opts.map((o) => ({
        key: o.id,
        label: o.text.trim() || '(blank option)',
        count: counts.get(o.id) ?? 0,
        isCorrect: f.graded ? !!o.is_correct : undefined,
      }));
      // selected-but-removed options
      for (const [id, count] of counts) {
        if (!opts.some((o) => o.id === id)) {
          options.push({ key: id, label: '(removed option)', count });
        }
      }
      return { fieldId: f.id, label, type: f.type, graded: !!f.graded, answeredCount, options };
    }

    if (f.type === 'scale') {
      const lo = f.scale_min ?? 1;
      const hi = f.scale_max ?? 5;
      const nums = raws.filter((raw): raw is number => typeof raw === 'number');
      const counts = new Map<number, number>();
      for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
      const options: FieldSummaryOption[] = [];
      for (let v = lo; v <= hi; v += 1) {
        options.push({ key: String(v), label: String(v), count: counts.get(v) ?? 0 });
      }
      const average = nums.length
        ? nums.reduce((a, b) => a + b, 0) / nums.length
        : null;
      return { fieldId: f.id, label, type: f.type, graded: false, answeredCount, options, average };
    }

    // short_text | paragraph
    const textAnswers = raws.filter(
      (raw): raw is string => typeof raw === 'string' && raw.trim().length > 0
    );
    return { fieldId: f.id, label, type: f.type, graded: false, answeredCount, textAnswers };
  });
}
