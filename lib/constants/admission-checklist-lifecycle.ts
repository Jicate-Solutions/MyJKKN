// lib/constants/admission-checklist-lifecycle.ts
//
// The learner lifecycle stages an admission checklist can apply to.
// get_learner_checklist() shows a checklist only when the learner's
// learners_profiles.lifecycle_status is in the checklist's applies_to_lifecycle,
// so these MUST be real lifecycle_status codes (types/learner-profile.ts).
//
// BUG-006182 (2026-09-19): the settings screen offered 'lead', 'admitted' and
// 'enrolled'. 'lead' and 'enrolled' are not lifecycle codes at all, and the
// stages a newly admitted candidate is actually in ('account', 'reserved')
// were not offered, so a checklist such as "Certificate Submitted" could never
// reach them.

import type { LifecycleStatus } from '@/types/learner-profile';

/** Admission-funnel stages, in the order a learner moves through them. */
export const ADMISSION_CHECKLIST_LIFECYCLE_OPTIONS: ReadonlyArray<{
  value: LifecycleStatus;
  label: string;
}> = [
  { value: 'enquiry', label: 'Enquiry' },
  { value: 'enquiry_submitted', label: 'Form submitted' },
  { value: 'account', label: 'Account' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'admitted', label: 'Admitted' },
  { value: 'active', label: 'Active' },
];

/** A new checklist applies to the whole admission funnel until narrowed. */
export const DEFAULT_ADMISSION_CHECKLIST_LIFECYCLE: LifecycleStatus[] =
  ADMISSION_CHECKLIST_LIFECYCLE_OPTIONS.map((o) => o.value);

/** Display label for a stored stage code (older checklists may hold retired codes). */
export function admissionChecklistLifecycleLabel(code: string): string {
  return ADMISSION_CHECKLIST_LIFECYCLE_OPTIONS.find((o) => o.value === code)?.label ?? code;
}
