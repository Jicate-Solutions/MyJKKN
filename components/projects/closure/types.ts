/**
 * Shared local types for the closure UI components.
 * All domain types are imported from @/types/projects.
 */

/** The structured checklist stored in project_closure_reports.checklist (JSONB). */
export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

/** Well-known closure types displayed in the form. */
export const CLOSURE_TYPES = [
  { value: 'planned', label: 'Planned closure' },
  { value: 'early', label: 'Early closure' },
  { value: 'cancelled', label: 'Cancelled / abandoned' },
  { value: 'phase-gate', label: 'Phase-gate exit' },
] as const;

export type ClosureTypeValue = (typeof CLOSURE_TYPES)[number]['value'];

/** Default PIR checklist items used when creating a new report. */
export const DEFAULT_CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'objectives-met', label: 'All stated objectives were met', checked: false },
  { id: 'deliverables-accepted', label: 'Deliverables formally accepted by stakeholders', checked: false },
  { id: 'resources-released', label: 'Team resources formally released', checked: false },
  { id: 'budget-reconciled', label: 'Budget reconciled and signed off', checked: false },
  { id: 'documentation-archived', label: 'Project documentation archived', checked: false },
  { id: 'risks-closed', label: 'All open risks/issues resolved or transferred', checked: false },
  { id: 'lessons-captured', label: 'Lessons learned captured', checked: false },
  { id: 'handover-complete', label: 'Handover to operations / next team complete', checked: false },
];

/** Lesson category options. */
export const LESSON_CATEGORIES = [
  'Planning',
  'Execution',
  'Communication',
  'Stakeholder Management',
  'Risk Management',
  'Technology',
  'People / Team',
  'Process',
  'Other',
] as const;

export type LessonCategory = (typeof LESSON_CATEGORIES)[number];
