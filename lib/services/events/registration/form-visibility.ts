// lib/services/events/registration/form-visibility.ts
//
// The ONE evaluator for "show only when" rules on registration forms — used by
// the builder preview, both public forms (client) AND the public-register API
// routes (server). It used to live only in a 'use client' component, so the
// server validated required fields as if every rule were true: a "Parent name"
// hidden for a Learner still came back as "is required". Pure module: no React.
//
// Ops:
//   eq / neq    — the answer equals / differs from `value`
//   in          — the answer is ANY of the comma-separated `value` list
//                 ("is any of": industry, mou_partners, ngo). A multi-select
//                 answer matches when any chosen option is in the list.
//   contains    — the answer text contains `value` (a single substring; for a
//                 multi-select answer, any chosen option equals `value`). A
//                 comma-separated `value` is treated exactly like `in`.
//   not_empty / empty

import type { FormFieldCondition } from '@/types/tournament';

const norm = (v: unknown): string => (v == null ? '' : String(v).trim());

/** The answer as a list of atoms: a multi-select is its options, else one string. */
function answerAtoms(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(norm).filter(Boolean);
  const s = norm(v);
  return s ? [s] : [];
}

/** "a, b ,c" → ['a','b','c']; also accepts | and newline separators. */
export function parseConditionList(value: string): string[] {
  return value
    .split(/[,|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function conditionHolds(
  condition: FormFieldCondition | null | undefined,
  allValues: Record<string, unknown>,
): boolean {
  if (!condition) return true;
  const raw = allValues[condition.field];
  const atoms = answerAtoms(raw);
  const asString = atoms.join(', ');
  const wanted = norm(condition.value);
  const eqAny = (needle: string) =>
    atoms.some((a) => a.toLowerCase() === needle.toLowerCase());

  switch (condition.op) {
    case 'eq':
      return eqAny(wanted) || asString === wanted;
    case 'neq':
      return !(eqAny(wanted) || asString === wanted);
    case 'in': {
      const list = parseConditionList(condition.value);
      return list.some((item) => eqAny(item));
    }
    case 'contains': {
      // Organizers type "industry, ngo, mou_partners" here expecting "any of
      // these" (the 360° Townhall form did). A comma / pipe list is therefore
      // read as `in`; a single value stays a substring test.
      const list = parseConditionList(condition.value);
      if (list.length > 1) return list.some((item) => eqAny(item));
      return eqAny(wanted) || asString.toLowerCase().includes(wanted.toLowerCase());
    }
    case 'not_empty':
      return atoms.length > 0;
    case 'empty':
      return atoms.length === 0;
    default:
      return true;
  }
}

export function isFieldVisible(
  field: { condition?: FormFieldCondition | null },
  allValues: Record<string, unknown>,
): boolean {
  return conditionHolds(field.condition ?? null, allValues);
}

/**
 * A section's own rule gates every field in it — "Category is Parent" on the
 * Parent section hides all of its questions at once.
 */
export function isSectionVisible(
  section: { condition?: FormFieldCondition | null },
  allValues: Record<string, unknown>,
): boolean {
  return conditionHolds(section.condition ?? null, allValues);
}

/**
 * The fields a registrant can actually see, given their answers: section rule
 * first, then each field's own rule. Sections are optional (older callers
 * only have fields); a field whose section is unknown is treated as in a
 * visible section.
 */
export function visibleFields<F extends { section_id?: string | null; condition?: FormFieldCondition | null }>(
  fields: F[],
  allValues: Record<string, unknown>,
  sections?: { id: string; condition?: FormFieldCondition | null }[] | null,
): F[] {
  const hiddenSections = new Set(
    (sections ?? []).filter((s) => !isSectionVisible(s, allValues)).map((s) => s.id),
  );
  return fields.filter(
    (f) => !(f.section_id && hiddenSections.has(f.section_id)) && isFieldVisible(f, allValues),
  );
}
