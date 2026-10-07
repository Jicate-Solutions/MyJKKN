// What a learner's profile change request carries (2026-10-07).
//
// The learner edit screen (my-profile -> EnquiryForm, student view) submits
// the whole form payload. This compares it with the stored learner and keeps
// only the fields that really changed AND that a learner may ask to change
// (EDITABLE_PROFILE_FIELDS). Everything else in the payload (academic
// assignment, roll and register numbers, the college email, fees) is left
// out, so a value the form merely re-formats (a re-resolved id) can never turn
// a request into one the server refuses.

import { EDITABLE_PROFILE_FIELDS } from '@/types/learner-profile-change';

type Change = { old: unknown; new: unknown };

const isEmpty = (v: unknown) => v === null || v === undefined || v === '';

// Empty string, null and undefined are the same; objects compare by their
// meaningful values; primitives compare as strings.
function deepEqual(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (isEmpty(a) !== isEmpty(b)) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object' && a !== null) {
    const ao = a as Record<string, unknown>;
    const bo = (b ?? {}) as Record<string, unknown>;
    for (const key of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
      if (isEmpty(ao[key]) && isEmpty(bo[key])) continue;
      if (!deepEqual(ao[key], bo[key])) return false;
    }
    return true;
  }
  return String(a) === String(b);
}

function hasMeaningfulValues(v: unknown): boolean {
  if (!v || typeof v !== 'object') return !isEmpty(v);
  return Object.values(v as Record<string, unknown>).some(hasMeaningfulValues);
}

export function computeLearnerProfileChanges(
  formData: Record<string, unknown>,
  learner: Record<string, unknown>
): Record<string, Change> {
  const editable = EDITABLE_PROFILE_FIELDS as readonly string[];
  const changes: Record<string, Change> = {};
  for (const key of Object.keys(formData)) {
    if (!editable.includes(key)) continue;
    const newValue = formData[key];
    const oldValue = learner[key];
    if (deepEqual(newValue, oldValue)) continue;
    if (typeof newValue === 'object' && newValue !== null
        && !hasMeaningfulValues(newValue) && !hasMeaningfulValues(oldValue)) continue;
    if (isEmpty(newValue) && isEmpty(oldValue)) continue;
    changes[key] = { old: oldValue, new: newValue };
  }
  return changes;
}
