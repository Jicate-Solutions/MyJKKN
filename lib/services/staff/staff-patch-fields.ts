// The columns PATCH /api/staff/[id] and POST /api/staff may write (2026-10-01).
//
// That route writes with the service-role client, so it skips RLS and the
// staff guard trigger alike. It used to pass the whole request body into the
// update, which let a caller set any column — institution_id, profile_id,
// created_by. Now only the fields the staff form edits get through
// (app/(routes)/staff/list/_components/staff-form-schema.ts: basicStaffSchema
// + extendedStaffSchema; the form strips emergency_contact_relationship_other
// and office before it sends).
//
// institution_id moves a person to another college: allowed for ordinary
// records (the route checks the caller can reach the new college); on the
// record of someone with admin powers it is super admin only, like every
// field but the photo, phone numbers and attendance machine code. profile_id
// is not a form field, so nobody writes it through PATCH.

export const STAFF_PATCH_FIELDS = [
  // basicStaffSchema
  'first_name',
  'last_name',
  'gender',
  'date_of_birth',
  'marital_status',
  'blood_group',
  'email',
  'institution_email',
  'phone',
  'staff_id',
  'biometric_id',
  'biometric_institution_id',
  'profile_picture',
  'address',
  'state',
  'district',
  'pincode',
  'emergency_contact_name',
  'emergency_contact_relationship',
  'emergency_contact_phone',
  'date_of_joining',
  'designation',
  'category_id',
  'institution_id',
  'role_key',
  'department_id',
  'is_active',
  'login_enabled',
  'tags',
  // extendedStaffSchema
  'has_extended_profile',
  'slug',
  'status',
  'display_order',
  'experience_years',
  'research_papers',
  'phd_scholars',
  'awards_won',
  'pg_dissertations_guided',
  'ug_projects_guided',
  'qualification_summary',
  'professional_summary',
  'mentoring_description',
  'google_scholar_url',
  'researchgate_url',
  'orcid_url',
  'badges',
  'qualifications',
  'specialisations',
  'experience_entries',
  'research_focus_areas',
  'publications',
  'funded_projects',
  'certifications',
  'awards',
  'memberships',
  'phd_scholars_list',
  'faqs',
  'achievements'
] as const;

/** Keep only the columns the PATCH route may write. */
export function pickStaffPatchFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of STAFF_PATCH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

/**
 * Keep only the columns POST /api/staff may write (2026-10-01): the same form
 * fields (institution_id included; the route checks the caller's access to
 * it). profile_id links the row to an existing person, so only a super admin
 * may set it.
 */
export function pickStaffCreateFields(
  body: Record<string, unknown>,
  opts: { isSuperAdmin: boolean }
): Record<string, unknown> {
  const allowed: readonly string[] = opts.isSuperAdmin
    ? [...STAFF_PATCH_FIELDS, 'profile_id']
    : STAFF_PATCH_FIELDS;
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}
