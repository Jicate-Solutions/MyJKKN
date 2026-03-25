/**
 * LTI (Learning Tools Interoperability) Type Definitions
 *
 * Types for LTI 1.3 integration with external tools (MATLAB Grader, MATLAB Online)
 * Created: 2026-01-12
 */

// ============================================================================
// LTI Tool Types
// ============================================================================

export type LtiToolType =
  | 'matlab_grader'
  | 'matlab_online'
  | 'matlab_academy'
  | 'matlab_production_server';

export interface LtiTool {
  id: string;
  name: string;
  tool_type: LtiToolType;

  // LTI 1.3 Configuration
  client_id: string;
  deployment_id: string;
  platform_id: string;

  // Endpoints
  launch_url: string;
  public_keyset_url: string;
  oidc_auth_url: string;
  redirect_uri: string;

  // Tool Capabilities
  supports_deep_linking: boolean;
  supports_grade_passback: boolean;
  supports_names_roles: boolean;

  // Status
  is_active: boolean;
  license_expiry_date?: string | null;

  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface LtiToolInsert {
  name: string;
  tool_type: LtiToolType;
  client_id: string;
  deployment_id: string;
  platform_id?: string;
  launch_url: string;
  public_keyset_url: string;
  oidc_auth_url: string;
  redirect_uri: string;
  supports_deep_linking?: boolean;
  supports_grade_passback?: boolean;
  supports_names_roles?: boolean;
  is_active?: boolean;
  license_expiry_date?: string;
}

export interface LtiToolUpdate {
  name?: string;
  tool_type?: LtiToolType;
  client_id?: string;
  deployment_id?: string;
  platform_id?: string;
  launch_url?: string;
  public_keyset_url?: string;
  oidc_auth_url?: string;
  redirect_uri?: string;
  supports_deep_linking?: boolean;
  supports_grade_passback?: boolean;
  supports_names_roles?: boolean;
  is_active?: boolean;
  license_expiry_date?: string | null;
  updated_by?: string;
}

// ============================================================================
// LTI Launch Types
// ============================================================================

export type LtiLaunchType =
  | 'assignment'
  | 'resource'
  | 'deep_link'
  | 'content_selection';

export interface LtiLaunch {
  id: string;

  // Tool & User
  tool_id: string;
  user_id: string;
  learner_profile_id?: string | null;

  // Multi-Tenancy
  institution_id: string;

  // Academic Context
  program_id?: string | null;
  semester_id?: string | null;
  section_id?: string | null;
  academic_year_id?: string | null;

  // LTI Context Claims
  context_id?: string | null;
  context_label?: string | null;
  context_title?: string | null;

  // Resource Link
  resource_link_id?: string | null;
  resource_link_title?: string | null;
  resource_link_description?: string | null;

  // Launch Metadata
  launch_type?: LtiLaunchType | null;
  lti_message_type?: string | null;
  lti_version?: string | null;

  // User Role
  user_role_sent?: string | null;
  myjkkn_role?: string | null;

  // Session Tracking
  launched_at: string;
  session_duration_seconds?: number | null;
  ip_address?: string | null;
  user_agent?: string | null;

  // JWT Details
  jwt_nonce?: string | null;
  jwt_expires_at?: string | null;

  // Audit
  created_by?: string | null;
}

export interface LtiLaunchInsert {
  tool_id: string;
  user_id: string;
  learner_profile_id?: string;
  institution_id: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  academic_year_id?: string;
  context_id?: string;
  context_label?: string;
  context_title?: string;
  resource_link_id?: string;
  resource_link_title?: string;
  resource_link_description?: string;
  launch_type?: LtiLaunchType;
  lti_message_type?: string;
  lti_version?: string;
  user_role_sent?: string;
  myjkkn_role?: string;
  session_duration_seconds?: number;
  ip_address?: string;
  user_agent?: string;
  jwt_nonce?: string;
  jwt_expires_at?: string;
  created_by?: string;
}

// ============================================================================
// LTI Grade Types
// ============================================================================

export type LtiActivityProgress =
  | 'Initialized'
  | 'Started'
  | 'InProgress'
  | 'Submitted'
  | 'Completed';

export type LtiGradingProgress =
  | 'FullyGraded'
  | 'Pending'
  | 'PendingManual'
  | 'Failed'
  | 'NotReady';

export interface LtiGrade {
  id: string;

  // Link to Launch
  launch_id?: string | null;
  tool_id: string;

  // User
  user_id: string;
  learner_profile_id: string;

  // Multi-Tenancy
  institution_id: string;

  // Resource Link
  resource_link_id: string;
  resource_link_title?: string | null;

  // Grade Data
  score: number;
  score_maximum: number;
  score_percentage: number; // Computed column

  // LTI AGS Status
  activity_progress?: LtiActivityProgress | null;
  grading_progress?: LtiGradingProgress | null;

  // Timestamps
  graded_at?: string | null;
  received_at: string;

  // Gradebook Sync
  synced_to_gradebook: boolean;
  gradebook_entry_id?: string | null;
  sync_error?: string | null;
  synced_at?: string | null;

  // Idempotency
  idempotency_key: string; // Computed column

  // Audit
  created_at: string;
  updated_at: string;
}

export interface LtiGradeInsert {
  launch_id?: string;
  tool_id: string;
  user_id: string;
  learner_profile_id: string;
  institution_id: string;
  resource_link_id: string;
  resource_link_title?: string;
  score: number;
  score_maximum: number;
  activity_progress?: LtiActivityProgress;
  grading_progress?: LtiGradingProgress;
  graded_at?: string;
  synced_to_gradebook?: boolean;
  gradebook_entry_id?: string;
  sync_error?: string;
  synced_at?: string;
}

export interface LtiGradeUpdate {
  synced_to_gradebook?: boolean;
  gradebook_entry_id?: string;
  sync_error?: string;
  synced_at?: string;
}

// ============================================================================
// LTI JWT Claims (LTI 1.3 Standard)
// ============================================================================

export interface LtiContext {
  id: string;
  label?: string;
  title?: string;
  type?: string[];
}

export interface LtiResourceLink {
  id: string;
  title?: string;
  description?: string;
}

export interface LtiRolesClaim {
  roles: string[];
}

export interface LtiCustomClaims {
  institution?: {
    id: string;
    name: string;
    code: string;
  };
  learner?: {
    id: string;
    program_id: string;
    semester_id: string;
    section_id: string;
    lifecycle_status: string;
  };
  academic?: {
    program_id: string;
    program_name: string;
    semester_id: string;
    semester_name: string;
    section_id: string;
    section_name: string;
    academic_year_id: string;
  };
}

export interface LtiJwtPayload {
  // Standard JWT Claims
  iss: string; // Issuer (MyJKKN platform URL)
  sub: string; // Subject (user_id)
  aud: string | string[]; // Audience (MATLAB tool URL)
  exp: number; // Expiration timestamp
  iat: number; // Issued at timestamp
  nonce: string; // One-time random string

  // LTI 1.3 Required Claims
  'https://purl.imsglobal.org/spec/lti/claim/message_type': string;
  'https://purl.imsglobal.org/spec/lti/claim/version': string;
  'https://purl.imsglobal.org/spec/lti/claim/deployment_id': string;
  'https://purl.imsglobal.org/spec/lti/claim/target_link_uri': string;
  'https://purl.imsglobal.org/spec/lti/claim/roles': string[];

  // LTI 1.3 Optional Claims
  'https://purl.imsglobal.org/spec/lti/claim/context'?: LtiContext;
  'https://purl.imsglobal.org/spec/lti/claim/resource_link'?: LtiResourceLink;

  // User Information
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;

  // Custom MyJKKN Claims
  'https://myjkkn.jkkn.ac.in/claims/institution'?: LtiCustomClaims['institution'];
  'https://myjkkn.jkkn.ac.in/claims/learner'?: LtiCustomClaims['learner'];
  'https://myjkkn.jkkn.ac.in/claims/academic'?: LtiCustomClaims['academic'];
}

// ============================================================================
// LTI API Request/Response Types
// ============================================================================

export interface LtiLaunchRequest {
  tool_id: string;
  resource_link_id?: string;
  resource_link_title?: string;
  resource_link_description?: string;
}

export interface LtiLaunchResponse {
  launch_url: string;
  id_token: string;
  state: string;
}

export interface LtiGradePassbackRequest {
  userId: string;
  scoreGiven: number;
  scoreMaximum: number;
  activityProgress: LtiActivityProgress;
  gradingProgress: LtiGradingProgress;
  timestamp: string;
  resourceLinkId: string;
  comment?: string;
}

export interface LtiGradePassbackResponse {
  success: boolean;
  gradeId?: string;
  message?: string;
}

export interface LtiRosterRequest {
  context_id: string;
  limit?: number;
  page?: number;
}

export interface LtiRosterMember {
  status: 'Active' | 'Inactive' | 'Deleted';
  name: string;
  email: string;
  user_id: string;
  roles: string[];
  given_name?: string;
  family_name?: string;
}

export interface LtiRosterResponse {
  context: {
    id: string;
    label: string;
    title?: string;
  };
  members: LtiRosterMember[];
  next?: string;
}

// ============================================================================
// LTI Service Response Types
// ============================================================================

export interface LtiLaunchStats {
  tool_name: string;
  total_launches: number;
  unique_users: number;
  student_launches: number;
  faculty_launches: number;
}

export interface LtiRosterMemberDb {
  user_id: string;
  learner_profile_id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
}

// ============================================================================
// LTI Role Mappings
// ============================================================================

export const LTI_ROLE_URIS = {
  // Core Roles
  LEARNER: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
  INSTRUCTOR: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
  CONTENT_DEVELOPER: 'http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper',
  ADMINISTRATOR: 'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator',
  MENTOR: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Mentor',
  MANAGER: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Manager',

  // Sub-Roles
  STUDENT: 'http://purl.imsglobal.org/vocab/lis/v2/membership/Learner#Learner',
  TEACHING_ASSISTANT: 'http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant',
} as const;

export type LtiRoleUri = typeof LTI_ROLE_URIS[keyof typeof LTI_ROLE_URIS];

// MyJKKN Role to LTI Role Mapping
export const MYJKKN_TO_LTI_ROLE_MAP: Record<string, LtiRoleUri[]> = {
  student: [LTI_ROLE_URIS.LEARNER, LTI_ROLE_URIS.STUDENT],
  faculty: [LTI_ROLE_URIS.INSTRUCTOR, LTI_ROLE_URIS.CONTENT_DEVELOPER],
  hod: [LTI_ROLE_URIS.INSTRUCTOR, LTI_ROLE_URIS.CONTENT_DEVELOPER, LTI_ROLE_URIS.ADMINISTRATOR],
  principal: [LTI_ROLE_URIS.ADMINISTRATOR, LTI_ROLE_URIS.INSTRUCTOR],
  administrator: [LTI_ROLE_URIS.ADMINISTRATOR],
  super_admin: [LTI_ROLE_URIS.ADMINISTRATOR],
  staff: [LTI_ROLE_URIS.LEARNER],
};

// ============================================================================
// LTI Error Types
// ============================================================================

export class LtiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message);
    this.name = 'LtiError';
  }
}

export const LTI_ERROR_CODES = {
  INVALID_TOKEN: 'invalid_token',
  EXPIRED_TOKEN: 'expired_token',
  INVALID_NONCE: 'invalid_nonce',
  TOOL_NOT_FOUND: 'tool_not_found',
  TOOL_INACTIVE: 'tool_inactive',
  USER_NOT_FOUND: 'user_not_found',
  USER_INACTIVE: 'user_inactive',
  LEARNER_NOT_FOUND: 'learner_not_found',
  INVALID_GRADE: 'invalid_grade',
  DUPLICATE_GRADE: 'duplicate_grade',
  INVALID_CONTEXT: 'invalid_context',
  UNAUTHORIZED: 'unauthorized',
  LAUNCH_FAILED: 'launch_failed',
  GRADE_PASSBACK_FAILED: 'grade_passback_failed',
  ROSTER_SYNC_FAILED: 'roster_sync_failed',
  DATABASE_ERROR: 'database_error',
} as const;
