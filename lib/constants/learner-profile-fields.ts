// ============================================
// LEARNER PROFILE FIELD CATALOGUE
// ============================================
// Created: 2026-07-30
// Purpose: The single source of truth for which learner-profile fields can be
//          "missing", what they are called, and what counts as blank.
//
// Consumed by:
//  - lib/db/learner-missing-fields-sql.ts     → generates the aggregate RPC
//  - lib/db/learner-missing-fields-filter.ts  → builds PostgREST row filters
//  - app/(routes)/learners/analytics/_components/*  → labels, groups, pickers
//
// WHY a catalogue: the four required fields used to be spelled out
// independently in five places (stats service, drill-down route, funnel, bar
// chart, filter bar) and had already drifted into three different notions of
// "missing". One list, generated everywhere.
// ============================================

export type ProfileFieldGroup =
  | 'admin_assignment'
  | 'basic_details'
  | 'academic_information'
  | 'contact_details'
  | 'accommodation';

/**
 * How absence is physically encoded for this column. Three rules, because
 * `learners_profiles` encodes it three ways:
 *
 *  - `uuid`  — nullable FK. Absent means NULL.
 *  - `text`  — most are declared NOT NULL and store '' for "not answered";
 *              a few (roll_number, permanent_address_taluk) use BOTH NULL and
 *              ''. So the rule must cover null, '' and whitespace.
 *  - `marks` — jsonb. Absent means NULL, '{}', or any listed sub-key blank.
 *
 * This is why a plain `IS NULL` filter reported 0 learners missing
 * `student_email` when 2,166 were.
 */
export type BlankRule = 'text' | 'uuid' | 'marks';

/**
 * When the field is required at all. Counting a conditional field against
 * everyone is not a rounding error: an unconditional `hostel_category_id IS
 * NULL` reports 6,350 learners missing a hostel room category when the real
 * figure — among the 989 hostellers — is 183.
 */
export type AppliesWhen = 'always' | 'hostel' | 'day_scholar_with_bus';

export interface LearnerProfileFieldDef {
  /** Stable id. Deliberately identical to `column`. */
  key: string;
  /** `learners_profiles` column name. */
  column: string;
  /** UI label and export header. */
  label: string;
  group: ProfileFieldGroup;
  blankRule: BlankRule;
  appliesWhen: AppliesWhen;
  /** jsonb sub-keys that must all be filled. Only for blankRule 'marks'. */
  marksKeys?: readonly string[];
}

/** Display order, matching the enquiry form's tab order. */
export const PROFILE_FIELD_GROUPS: readonly ProfileFieldGroup[] = [
  'admin_assignment',
  'basic_details',
  'academic_information',
  'contact_details',
  'accommodation',
] as const;

export const PROFILE_FIELD_GROUP_LABELS: Record<ProfileFieldGroup, string> = {
  admin_assignment: 'Admin Assignment',
  basic_details: 'Basic Details',
  academic_information: 'Academic Information',
  contact_details: 'Contact Details',
  accommodation: 'Accommodation',
};

export const LEARNER_PROFILE_FIELDS: readonly LearnerProfileFieldDef[] = [
  // ── Admin Assignment (5) ────────────────────────────────────────────────
  // The first four are the frozen completeness definition (spec D4).
  { key: 'college_email', column: 'college_email', label: 'College Email', group: 'admin_assignment', blankRule: 'text', appliesWhen: 'always' },
  { key: 'academic_year_id', column: 'academic_year_id', label: 'Academic Year', group: 'admin_assignment', blankRule: 'uuid', appliesWhen: 'always' },
  { key: 'admission_year_id', column: 'admission_year_id', label: 'Admission Year', group: 'admin_assignment', blankRule: 'uuid', appliesWhen: 'always' },
  { key: 'semester_id', column: 'semester_id', label: 'Semester', group: 'admin_assignment', blankRule: 'uuid', appliesWhen: 'always' },
  { key: 'section_id', column: 'section_id', label: 'Section', group: 'admin_assignment', blankRule: 'uuid', appliesWhen: 'always' },

  // ── Basic Details (12) ──────────────────────────────────────────────────
  { key: 'roll_number', column: 'roll_number', label: 'Roll Number', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'register_number', column: 'register_number', label: 'Register Number', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'first_name', column: 'first_name', label: 'First Name', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'last_name', column: 'last_name', label: 'Last Name', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'date_of_birth', column: 'date_of_birth', label: 'Date of Birth', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'gender', column: 'gender', label: 'Gender', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'religion', column: 'religion', label: 'Religion', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'community_category_id', column: 'community_category_id', label: 'Community', group: 'basic_details', blankRule: 'uuid', appliesWhen: 'always' },
  { key: 'caste_id', column: 'caste_id', label: 'Caste', group: 'basic_details', blankRule: 'uuid', appliesWhen: 'always' },
  { key: 'father_name', column: 'father_name', label: "Father's Name", group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'mother_name', column: 'mother_name', label: "Mother's Name", group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'blood_group', column: 'blood_group', label: 'Blood Group', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },

  // ── Academic Information (4) ────────────────────────────────────────────
  { key: 'last_school', column: 'last_school', label: 'Last School', group: 'academic_information', blankRule: 'text', appliesWhen: 'always' },
  { key: 'board_of_study', column: 'board_of_study', label: 'Board of Study', group: 'academic_information', blankRule: 'text', appliesWhen: 'always' },
  { key: 'tenth_marks', column: 'tenth_marks', label: '10th Marks', group: 'academic_information', blankRule: 'marks', appliesWhen: 'always', marksKeys: ['max_marks', 'obtained_marks', 'percentage'] },
  { key: 'twelfth_marks', column: 'twelfth_marks', label: '12th Marks', group: 'academic_information', blankRule: 'marks', appliesWhen: 'always', marksKeys: ['group', 'max_marks', 'obtained_marks', 'percentage'] },

  // ── Contact Details (7) ─────────────────────────────────────────────────
  { key: 'student_mobile', column: 'student_mobile', label: 'Student Mobile', group: 'contact_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'student_email', column: 'student_email', label: 'Student Email', group: 'contact_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'permanent_address_street', column: 'permanent_address_street', label: 'Address Street', group: 'contact_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'permanent_address_taluk', column: 'permanent_address_taluk', label: 'Taluk', group: 'contact_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'permanent_address_district', column: 'permanent_address_district', label: 'District', group: 'contact_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'permanent_address_pin_code', column: 'permanent_address_pin_code', label: 'PIN Code', group: 'contact_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'permanent_address_state', column: 'permanent_address_state', label: 'State', group: 'contact_details', blankRule: 'text', appliesWhen: 'always' },

  // ── Accommodation (5) ───────────────────────────────────────────────────
  { key: 'accommodation_type_id', column: 'accommodation_type_id', label: 'Accommodation Type', group: 'accommodation', blankRule: 'uuid', appliesWhen: 'always' },
  { key: 'hostel_category_id', column: 'hostel_category_id', label: 'Hostel Room Category', group: 'accommodation', blankRule: 'uuid', appliesWhen: 'hostel' },
  { key: 'mess_category_id', column: 'mess_category_id', label: 'Mess Category', group: 'accommodation', blankRule: 'uuid', appliesWhen: 'hostel' },
  { key: 'transport_route_id', column: 'transport_route_id', label: 'Route', group: 'accommodation', blankRule: 'uuid', appliesWhen: 'day_scholar_with_bus' },
  { key: 'transport_stop_id', column: 'transport_stop_id', label: 'Boarding Point', group: 'accommodation', blankRule: 'uuid', appliesWhen: 'day_scholar_with_bus' },
] as const;

export const LEARNER_PROFILE_FIELD_KEYS: readonly string[] =
  LEARNER_PROFILE_FIELDS.map((field) => field.key);

export const FIELD_BY_KEY: ReadonlyMap<string, LearnerProfileFieldDef> = new Map(
  LEARNER_PROFILE_FIELDS.map((field) => [field.key, field])
);

export function fieldsInGroup(group: ProfileFieldGroup): LearnerProfileFieldDef[] {
  return LEARNER_PROFILE_FIELDS.filter((field) => field.group === group);
}

/**
 * Namespace for the per-group "missing at least one field in this group" rows
 * the RPC emits alongside the per-field rows. Prefixed so a rollup key can
 * never be mistaken for a column name by the filter allowlist.
 */
export const GROUP_ROLLUP_PREFIX = 'group:';

export function groupRollupKey(group: ProfileFieldGroup): string {
  return `${GROUP_ROLLUP_PREFIX}${group}`;
}

export function isGroupRollupKey(key: string): boolean {
  return parseGroupRollupKey(key) !== null;
}

export function parseGroupRollupKey(key: string): ProfileFieldGroup | null {
  if (!key.startsWith(GROUP_ROLLUP_PREFIX)) return null;
  const candidate = key.slice(GROUP_ROLLUP_PREFIX.length) as ProfileFieldGroup;
  return PROFILE_FIELD_GROUPS.includes(candidate) ? candidate : null;
}

/** True only for real catalogue field keys — never for a group rollup. */
export function isKnownFieldKey(key: string): boolean {
  return FIELD_BY_KEY.has(key);
}

/**
 * The four fields that define completeness (spec D4). Picking one of these
 * alongside the "Complete profiles" scope can only ever return zero rows, so the
 * filter bar disables them there.
 *
 * Admission year is deliberately absent: a complete profile can legitimately
 * lack one, and most do.
 */
export const PROFILE_REQUIRED_FIELD_KEYS: ReadonlySet<string> = new Set([
  'college_email',
  'academic_year_id',
  'semester_id',
  'section_id',
]);
