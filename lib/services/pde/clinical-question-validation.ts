// lib/services/pde/clinical-question-validation.ts
//
// Shared authoring-time validation for clinical-case questions and stages.
//
// Lives here rather than in a route file because BOTH /api/pde/cases (create)
// and /api/pde/cases/[id] (edit) need it, and a Next.js route module may only
// export HTTP handlers — exporting helpers from one route so the other can
// import them fails the build's route-type check.

export const CLINICAL_QUESTION_TYPES = [
  'free_text_socratic',
  'mcq_warmup',
  'image_tag',
  'multi_select',
  'matching',
  'sequencing',
] as const;

/**
 * Per-type answer-key checks, shared by POST (create) and PATCH (edit).
 *
 * These are not decoration. A `matching` question whose correct_answer is
 * missing marks as "not objectively markable" in the database, which silently
 * removes it from its stage's pass calculation — a faculty typo would quietly
 * weaken the gate instead of failing loudly. Catch it at authoring time.
 *
 * Returns an error string, or null when the question is well-formed.
 */
export function validateClinicalQuestion(q: any, label: string): string | null {
  if (!q.question_text) return `${label}.question_text required`;
  if (!q.question_type) return `${label}.question_type required`;
  if (!CLINICAL_QUESTION_TYPES.includes(q.question_type)) {
    return `${label}.question_type invalid`;
  }
  if (!q.metadata || typeof q.metadata !== 'object') return `${label}.metadata required`;
  if (!q.metadata.osce_domain) return `${label}.metadata.osce_domain required`;

  if (q.question_type === 'multi_select') {
    if (!Array.isArray(q.options) || q.options.length < 2) {
      return `${label}: multi-select needs at least 2 options`;
    }
    if (!q.options.some((o: any) => o?.is_correct)) {
      return `${label}: mark at least one option as correct`;
    }
  }

  if (q.question_type === 'matching') {
    const pairs = q.metadata.match_pairs;
    if (!Array.isArray(pairs) || pairs.length === 0) {
      return `${label}: matching needs at least one item to match`;
    }
    let key: Record<string, unknown>;
    try {
      key = q.correct_answer ? JSON.parse(q.correct_answer) : {};
    } catch {
      return `${label}: matching answer key is not valid JSON`;
    }
    for (const p of pairs) {
      if (!p?.id || !p?.left) return `${label}: every matching item needs a label`;
      if (!Array.isArray(p.options) || p.options.length < 2) {
        return `${label}: "${p.left}" needs at least 2 options to choose from`;
      }
      const correct = key[p.id];
      if (typeof correct !== 'string' || !correct.trim()) {
        return `${label}: choose the correct option for "${p.left}"`;
      }
      if (!p.options.some((o: string) => o?.trim().toLowerCase() === correct.trim().toLowerCase())) {
        return `${label}: the correct option for "${p.left}" is not in its own option list`;
      }
    }
  }

  if (q.question_type === 'sequencing') {
    const items = q.metadata.sequence_items;
    if (!Array.isArray(items) || items.length < 2) {
      return `${label}: sequencing needs at least 2 steps`;
    }
    let order: unknown;
    try {
      order = q.correct_answer ? JSON.parse(q.correct_answer) : null;
    } catch {
      return `${label}: sequencing answer key is not valid JSON`;
    }
    if (!Array.isArray(order) || order.length !== items.length) {
      return `${label}: the correct order must list every step exactly once`;
    }
    const ids = new Set(items.map((it: any) => it?.id));
    const seen = new Set<string>();
    for (const id of order as string[]) {
      if (!ids.has(id)) return `${label}: the correct order references an unknown step`;
      if (seen.has(id)) return `${label}: the correct order repeats a step`;
      seen.add(id);
    }
  }

  return null;
}

/** Stage shape check, shared by create and edit. */
export function validateStages(stages: any): string | null {
  if (stages === undefined || stages === null) return null;
  if (!Array.isArray(stages)) return 'stages must be an array';
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    if (!s || typeof s !== 'object') return `stages[${i}] invalid`;
    if (!s.title || typeof s.title !== 'string' || !s.title.trim()) {
      return `stages[${i}].title required`;
    }
    if (s.scenario_text !== undefined && typeof s.scenario_text !== 'string') {
      return `stages[${i}].scenario_text must be text`;
    }
  }
  return null;
}

