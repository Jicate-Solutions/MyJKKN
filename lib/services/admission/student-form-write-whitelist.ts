// lib/services/admission/student-form-write-whitelist.ts
//
// The single security boundary for the student-form write path. The PATCH
// handler iterates only these column names; any field name in the request
// body that is NOT in this list is silently ignored. Columns explicitly
// excluded: lifecycle_status, institution_id, is_profile_complete,
// created_by, created_at, application_id — even a valid token cannot
// flip these via the student form.

export const STUDENT_WRITABLE_COLUMNS = {
  basic: [
    'first_name', 'last_name', 'date_of_birth', 'gender',
    'religion', 'community', 'caste', 'student_photo_url',
    'father_name', 'father_occupation', 'father_mobile',
    'mother_name', 'mother_occupation', 'mother_mobile',
    'annual_income',
  ],
  academic: [
    'tenth_marks', 'twelfth_marks',
    'last_school', 'board_of_study',
    'neet_roll_number', 'neet_score',
    'counseling_applied', 'counseling_number',
    'scholarship_type', 'quota', 'entry_type',
  ],
  contact: [
    'student_mobile', 'student_email',
    'permanent_address_street', 'permanent_address_state',
    'permanent_address_district', 'permanent_address_taluk',
    'permanent_address_pin_code',
  ],
} as const;

export type StudentSection = keyof typeof STUDENT_WRITABLE_COLUMNS;

/**
 * Drop any keys in `payload` that aren't in the section's whitelist.
 * Returns a brand-new object — does not mutate input.
 */
export function filterToWhitelist(
  section: StudentSection,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = STUDENT_WRITABLE_COLUMNS[section] as readonly string[];
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    if (allowed.includes(key)) out[key] = payload[key];
  }
  return out;
}

/**
 * Throw if any of these forbidden keys appear anywhere across all sections —
 * defense in depth against the function being called with the wrong section
 * and a forbidden key slipping through. Never callable with the response.
 */
export const FORBIDDEN_COLUMNS = [
  'lifecycle_status', 'institution_id', 'is_profile_complete',
  'created_by', 'created_at', 'application_id', 'id',
] as const;

export function assertNoForbidden(payload: Record<string, unknown>): void {
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_COLUMNS.includes(key as (typeof FORBIDDEN_COLUMNS)[number])) {
      throw new Error(`Forbidden column in student-form payload: ${key}`);
    }
  }
}
