// Which columns an EDIT of a team-member record sends: only what the person
// changed (2026-10-03).
//
// The form fills defaults for empty columns (gender 'male', marital status
// 'single', re-normalised names and places), so sending every field made a
// phone-only edit on someone with admin powers look like a change of gender
// and marital status, and the Director's small-fields ruling (photo, phone
// numbers, attendance machine code) refused it. Creating a record still sends
// everything.

// A form field whose column(s) must travel together with others.
const LINKED: Record<string, string[]> = {
  biometric_id: ['biometric_id', 'biometric_institution_id'],
  biometric_institution_id: ['biometric_id', 'biometric_institution_id'],
  emergency_contact_relationship_other: ['emergency_contact_relationship'],
  state: ['state', 'district'],
  district: ['state', 'district'],
  category_id: ['category_id', 'department_id'],
  department_id: ['category_id', 'department_id'],
  // A college move clears the department; the cleared value must travel too.
  institution_id: ['institution_id', 'department_id']
};

// react-hook-form marks a changed field `true`; for arrays and objects it
// mirrors their shape, so any `true` inside means the field changed.
function isDirty(value: unknown): boolean {
  if (value === true) return true;
  if (Array.isArray(value)) return value.some(isDirty);
  if (value && typeof value === 'object') return Object.values(value).some(isDirty);
  return false;
}

/**
 * Keep only the columns of `payload` whose form fields are dirty, plus any
 * named in `alsoSend` (e.g. `status` set by the Publish button).
 */
export function pickChangedStaffFields(
  payload: Record<string, unknown>,
  dirtyFields: Record<string, unknown>,
  alsoSend: string[] = []
): Record<string, unknown> {
  const keys = new Set<string>(alsoSend);
  for (const [field, value] of Object.entries(dirtyFields)) {
    if (!isDirty(value)) continue;
    for (const column of LINKED[field] ?? [field]) keys.add(column);
  }
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) out[key] = payload[key];
  }
  return out;
}
