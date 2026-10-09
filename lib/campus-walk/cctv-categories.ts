/**
 * The CCTV report kinds — kept apart from lib/campus-walk/cctv.ts so the
 * browser form can import them without pulling in server code.
 */

/**
 * Four kinds, each with its own routing rule. A code constant, not a master
 * table: adding a kind means adding a routing rule, which is code anyway, and
 * the walk screen's own CATEGORIES list is a constant for the same reason.
 */
export const CCTV_CATEGORIES = [
  { key: 'learner_conduct', label: 'Learners — conduct in class or library' },
  { key: 'power_left_on', label: 'Fans or lights left on in an empty room' },
  { key: 'staff_conduct', label: 'Team members — conduct on duty' },
  { key: 'exam_copying', label: 'Exam copying' }
] as const;

export type CctvCategory = (typeof CCTV_CATEGORIES)[number]['key'];

export function isCctvCategory(v: unknown): v is CctvCategory {
  return CCTV_CATEGORIES.some((c) => c.key === v);
}

export function cctvCategoryLabel(key: string | null | undefined): string {
  return CCTV_CATEGORIES.find((c) => c.key === key)?.label ?? 'CCTV report';
}
