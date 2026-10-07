// types/learner-profile-change.ts
import { LearnerProfile } from './learner-profile';

export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type AuditActionType = 'approved' | 'rejected' | 'cancelled';

/**
 * Profile Change Request
 * Stores student-submitted profile edit requests pending approval
 */
export interface ProfileChangeRequest {
  id: string;
  learner_id: string;
  request_status: ChangeRequestStatus;
  changed_fields: Record<string, { old: any; new: any }>;
  fields_summary: string[];
  submitted_by: string;
  submitted_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_comments?: string;
  created_at: string;
  updated_at: string;

  // Relations (from joins)
  learner?: LearnerProfile;
  submitter?: {
    id: string;
    full_name: string;
    email: string;
  };
  reviewer?: {
    id: string;
    full_name: string;
    email: string;
  };
}

/**
 * Profile Change Audit Log Entry
 * Permanent history of all profile changes
 */
export interface ProfileChangeAuditLog {
  id: string;
  learner_id: string;
  change_request_id?: string;
  action_type: AuditActionType;
  changed_fields: Record<string, { old: any; new: any }>;
  performed_by: string;
  performed_at: string;
  comments?: string;
  created_at: string;

  // Relations
  learner?: LearnerProfile;
  performer?: {
    id: string;
    full_name: string;
    email: string;
  };
}

/**
 * DTO for creating change request
 */
export interface CreateChangeRequestDto {
  learner_id: string;
  changed_fields: Record<string, { old: any; new: any }>;
  fields_summary: string[];
}

/**
 * DTO for approving request
 */
export interface ApproveRequestDto {
  review_comments?: string;
}

/**
 * DTO for rejecting request
 */
export interface RejectRequestDto {
  review_comments: string; // Required
}

/**
 * Filters for querying change requests
 */
export interface ChangeRequestFilters {
  status?: ChangeRequestStatus;
  institution_id?: string;
  department_id?: string;
  learner_id?: string;
  submitted_after?: string;
  submitted_before?: string;
  page?: number;
  limit?: number;
}

/**
 * Editable fields whitelist: the learners_profiles columns a learner may ask
 * to change through a profile change request (2026-10-07). These are the
 * columns the learner edit screen (my-profile -> EnquiryForm with
 * isStudentView) really sends and shows as editable, identity corrections
 * included (an approver decides). The academic assignment (college, programme,
 * semester, section, quota, admission year...), roll and register numbers,
 * the college email, fees and lifecycle are not here: they are changed by the
 * office. Enforced on the server when a request is created and again when it
 * is approved, so a key not on this list never reaches the service-role write.
 */
export const EDITABLE_PROFILE_FIELDS = [
  // Identity: a learner may REQUEST a correction; a human approver decides
  // (2026-10-07, default taken, overrule here: kept as before round 12; none
  // of these links an account).
  'first_name',
  'last_name',
  'date_of_birth',
  'gender',
  'aadhar_number',

  // Personal (Basic Details tab)
  'religion',
  'community_category_id',
  'caste_id',
  'blood_group',
  'student_photo_url',

  // Parent/Guardian Information
  'father_name',
  'father_occupation',
  'father_mobile',
  'mother_name',
  'mother_occupation',
  'mother_mobile',
  'annual_income',

  // Contact Details (the college email is not shown to learners)
  'student_mobile',
  'student_email',
  'permanent_address_street',
  'permanent_address_taluk',
  'permanent_address_district',
  'permanent_address_pin_code',
  'permanent_address_state',
  'post_office_id',

  // Academic Information (marks and previous schooling)
  'last_school',
  'last_school_id',
  'school_district',
  'board_of_study',
  'tenth_marks',
  'twelfth_marks',
  'previous_degree',
  'medical_cutoff_marks',
  'engineering_cutoff_marks',
  'neet_roll_number',
  'neet_score',
  'counseling_applied',
  'counseling_number',
  'scholarship_type',

  // Accommodation Preferences
  'accommodation_type_id',
  'bus_required',
  'transport_route_id',
  'transport_stop_id',
] as const;

export type EditableProfileField = typeof EDITABLE_PROFILE_FIELDS[number];

/**
 * Read-only fields (blocked from editing)
 */
export const READ_ONLY_PROFILE_FIELDS = [
  // Academic assignments
  'institution_id',
  'degree_id',
  'department_id',
  'program_id',
  'semester_id',
  'section_id',
  'academic_year_id',

  // Student credentials
  'roll_number',
  'register_number',
  'college_email',

  // Identity fields (first_name, last_name, date_of_birth, gender,
  // aadhar_number) are requestable corrections: see EDITABLE_PROFILE_FIELDS.

  // Application details
  'application_id',
  'lifecycle_status',
  'is_profile_complete',
] as const;

export type ReadOnlyProfileField = typeof READ_ONLY_PROFILE_FIELDS[number];

/**
 * The keys of a change request that are not on the editable list (2026-10-07).
 * Enforced on the server when a request is created and again when it is
 * approved: approval writes every key with the service role, so a request
 * carrying college_email (read-only) turned whoever held that email into a
 * learner's account.
 */
export function disallowedChangeFields(changedFields: Record<string, unknown> | null | undefined): string[] {
  return Object.keys(changedFields ?? {}).filter(
    (key) => !(EDITABLE_PROFILE_FIELDS as readonly string[]).includes(key)
  );
}

export function disallowedChangeFieldsMessage(fields: string[]): string {
  return `These fields cannot be changed through a profile change request: ${fields.join(', ')}.`;
}
