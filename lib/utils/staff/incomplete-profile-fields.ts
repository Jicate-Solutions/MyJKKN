// ============================================
// STAFF INCOMPLETE-PROFILE FIELD DEFINITION
// ============================================
// Created: 2026-08-10
// Extracted from app/api/staff/incomplete-profiles/route.ts so the definition
// of "complete" can be unit-tested without a Supabase client.
//
// LOCK-STEP CONTRACT: this list must stay identical to the aggregate in
// lib/services/staff/staff-service.ts (~1206, ~1705) and the per-employee bar
// in lib/utils/staff-profile-completion.ts. Adding a field here moves the
// dashboard's headline completion percentage. Department and the biometric
// columns are deliberately NOT tracked here — they are filter dimensions only
// (see the 2026-08-10 design doc, section 3.1).
// ============================================

export type StaffFieldScope = 'all' | 'required' | 'optional';

export const STAFF_REQUIRED_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'designation',
  'date_of_birth',
  'date_of_joining',
] as const;

export const STAFF_OPTIONAL_FIELDS = [
  'staff_id',
  'profile_picture',
  'address',
  'state',
  'district',
  'pincode',
  'institution_email',
  'blood_group',
] as const;

export const STAFF_ALL_FIELDS: readonly string[] = [
  ...STAFF_REQUIRED_FIELDS,
  ...STAFF_OPTIONAL_FIELDS,
];

/** Human-readable labels — these strings are what the UI badges render. */
export const STAFF_FIELD_LABELS: Record<string, string> = {
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  designation: 'Designation',
  date_of_birth: 'Date of Birth',
  date_of_joining: 'Date of Joining',
  staff_id: 'Staff ID',
  profile_picture: 'Profile Picture',
  address: 'Address',
  state: 'State',
  district: 'District',
  // 'Pincode', not 'PIN Code' — this is the string the drill-down badge already
  // renders and the string the API already emits. lib/utils/staff-profile-completion.ts
  // says 'PIN Code' for the per-employee bar; that pre-existing inconsistency is
  // cosmetic (labels play no part in the completion maths) and out of scope here.
  pincode: 'Pincode',
  institution_email: 'Institution Email',
  blood_group: 'Blood Group',
};

export function fieldsForScope(scope: StaffFieldScope): readonly string[] {
  if (scope === 'required') return STAFF_REQUIRED_FIELDS;
  if (scope === 'optional') return STAFF_OPTIONAL_FIELDS;
  return STAFF_ALL_FIELDS;
}

/**
 * A field is missing when it is null/undefined or a blank string.
 *
 * Trimming matters: the API's old inline check compared to '' exactly, while
 * lib/utils/staff-profile-completion.ts trimmed. The two disagreed on a
 * whitespace-only cell, so the drill-down table could list someone the progress
 * bar called complete. This is the trimming version, and it is now the only one.
 */
export function isFieldMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

/** Labels of every tracked field this row is missing, in field-list order. */
export function computeMissingFields(
  row: Record<string, unknown>,
  scope: StaffFieldScope = 'all'
): string[] {
  const missing: string[] = [];
  for (const field of fieldsForScope(scope)) {
    if (isFieldMissing(row[field])) {
      missing.push(STAFF_FIELD_LABELS[field] ?? field);
    }
  }
  return missing;
}
