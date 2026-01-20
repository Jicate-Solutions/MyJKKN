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
 * Editable fields whitelist
 * Students can only edit these fields
 */
export const EDITABLE_PROFILE_FIELDS = [
  // Contact Details
  'student_mobile',
  'student_email',
  'alternate_mobile',

  // Parent/Guardian Information
  'father_name',
  'father_mobile',
  'father_occupation',
  'mother_name',
  'mother_mobile',
  'mother_occupation',
  'guardian_name',
  'guardian_mobile',
  'guardian_occupation',
  'annual_income',

  // Address Information
  'permanent_address',
  'permanent_city',
  'permanent_state',
  'permanent_pincode',
  'present_address',
  'present_city',
  'present_state',
  'present_pincode',

  // Other Personal Details
  'blood_group',
  'religion',
  'community',
  'caste',
  'hostel_required',
  'transport_required',
  'accommodation_type',
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

  // Identity fields
  'first_name',
  'last_name',
  'date_of_birth',
  'gender',
  'aadhar_number',

  // Application details
  'application_id',
  'lifecycle_status',
  'is_profile_complete',
] as const;

export type ReadOnlyProfileField = typeof READ_ONLY_PROFILE_FIELDS[number];
