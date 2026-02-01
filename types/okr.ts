// ============================================================================
// MyJKKN OKR Management Module - TypeScript Types
// Version: 1.1
// Created: 2026-01-15
// Updated: 2026-02-01 - Deprecated individual level and tier_3 per Workshop Transformation
// ============================================================================

// ============================================================================
// ENUMS
// ============================================================================

/**
 * OKR Tier determines the complexity and number of sections in the form
 * - tier_1: Full (11 sections) - For major initiatives, organization/institution level
 * - tier_2: Core (6 sections) - For department-level quarterly objectives
 * - tier_3: Simple (3 sections) - DEPRECATED: Was for individual goals, now handled by Competency module
 *
 * @deprecated tier_3 is deprecated as of 2026-02-01. Individual goals are now tracked
 * via the Competency module (learner_competencies table). Kept for historical data compatibility.
 */
export type OKRTier = 'tier_1' | 'tier_2' | 'tier_3';

/**
 * OKR Level determines the organizational scope
 * - organization: Group-wide OKRs (JKKN Institutions level, above individual institutions)
 * - institution: Institution-level strategic objectives
 * - department: Department-level quarterly objectives
 * - individual: DEPRECATED - Was for personal goals, now handled by Competency module
 *
 * @deprecated individual level is deprecated as of 2026-02-01. Learner goals are now
 * tracked via the Competency module. Kept for historical data compatibility.
 */
export type OKRLevel = 'organization' | 'institution' | 'department' | 'individual';

/**
 * Allowed OKR levels for NEW objectives (excludes deprecated 'individual')
 * Use this type for UI dropdowns and validation of new OKR creation
 */
export type OKRLevelAllowed = 'organization' | 'institution' | 'department';

/**
 * Allowed OKR tiers for NEW objectives (excludes deprecated 'tier_3')
 * Use this type for UI dropdowns and validation of new OKR creation
 */
export type OKRTierAllowed = 'tier_1' | 'tier_2';
export type OKRCycleType = 'annual' | 'quarterly' | 'semester';
export type OKRStatus = 'draft' | 'active' | 'completed' | 'archived';
export type KRStatus = 'not_started' | 'on_track' | 'at_risk' | 'behind' | 'blocked' | 'completed';
export type KRDataSource = 'manual' | 'auto';
export type DependencyType = 'external' | 'internal' | 'resource' | 'budget';
export type DependencyStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';
export type UpdateSource = 'auto' | 'manual';
export type UserBadge = 'green' | 'yellow' | 'red' | 'blocked';
export type RiskLevel = 'high' | 'medium' | 'low';
export type MilestoneType = '50_percent' | '75_percent' | '100_percent' | 'exceeded';

// ============================================================================
// A/B/C/D MATRIX TYPES
// ============================================================================

/**
 * A/B/C/D Category for process vs. result analysis
 * - A: Good Process (4-5) + Good Result (>=70%) - "Sustainable Success"
 * - B: Good Process (4-5) + Poor Result (<70%) - "Learning Opportunity"
 * - C: Poor Process (1-3) + Poor Result (<70%) - "Expected Failure"
 * - D: Poor Process (1-3) + Good Result (>=70%) - "False Security" (DANGER!)
 */
export type ABCDCategory = 'A' | 'B' | 'C' | 'D' | null;

/**
 * Process rating labels for UI display
 */
export const PROCESS_RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Below Average',
  3: 'Average',
  4: 'Good',
  5: 'Excellent'
};

/**
 * ABCD Category display configuration
 */
export const ABCD_CATEGORY_CONFIG: Record<string, {
  label: string;
  description: string;
  action: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  priority: number;
}> = {
  A: {
    label: 'Sustainable Success',
    description: 'Good Process + Good Result',
    action: 'Replicate this approach',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: 'CheckCircle2',
    priority: 4
  },
  B: {
    label: 'Learning Opportunity',
    description: 'Good Process + Poor Result',
    action: 'Investigate external factors',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: 'Search',
    priority: 3
  },
  C: {
    label: 'Expected Failure',
    description: 'Poor Process + Poor Result',
    action: 'Improve both process and execution',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    icon: 'AlertTriangle',
    priority: 2
  },
  D: {
    label: 'FALSE SECURITY',
    description: 'Poor Process + Good Result',
    action: 'DANGER! Fix process immediately',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: 'AlertOctagon',
    priority: 1
  }
};

/**
 * ABCD Analysis view row - from okr_abcd_analysis view
 */
export interface ABCDAnalysis {
  objective_id: string;
  objective_title: string;
  owner_type: OKRLevel;
  owner_id: string;
  institution_id: string | null;
  department_id: string | null;
  objective_status: OKRStatus;
  key_result_id: string;
  key_result_title: string;
  progress: number;
  process_rating: number | null;
  process_notes: string | null;
  abcd_category: ABCDCategory;
  analysis: string;
  priority_order: number;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * ABCD Distribution for pie charts
 */
export interface ABCDDistribution {
  category: ABCDCategory;
  count: number;
  percentage: number;
}

/**
 * D-Category Alert - items requiring immediate attention
 */
export interface DCategoryAlert {
  key_result_id: string;
  key_result_title: string;
  objective_id: string;
  objective_title: string;
  owner_id: string;
  progress: number;
  process_rating: number;
  process_notes: string | null;
  deadline: string | null;
  days_until_deadline: number | null;
}

/**
 * Update process rating DTO
 */
export interface UpdateProcessRatingDTO {
  process_rating: number;
  process_notes?: string;
}

// ============================================================================
// TIER SECTION MAPPING
// ============================================================================

/**
 * Maps OKR tiers to their required form sections
 * - tier_1: Full complexity (11 sections) for organization/institution level initiatives
 * - tier_2: Core complexity (6 sections) for department-level objectives
 * - tier_3: DEPRECATED - Simple (3 sections) was for individual goals
 *
 * @deprecated tier_3 sections are deprecated. Individual goals now use the Competency module.
 */
export const TIER_SECTIONS = {
  tier_1: ['basic', 'strategic', 'kpis', 'keyResults', 'stakeholders', 'dependencies', 'tasks', 'risks', 'resources', 'milestones', 'contingency'],
  tier_2: ['basic', 'goals', 'keyResults', 'parentAlignment', 'team', 'successCriteria'],
  /** @deprecated tier_3 is deprecated - use Competency module for individual goals */
  tier_3: ['basic', 'keyResults', 'notes']
} as const;

/**
 * Allowed tier sections for NEW objectives (excludes deprecated tier_3)
 * Use this for UI when creating new OKRs
 */
export const TIER_SECTIONS_ALLOWED = {
  tier_1: TIER_SECTIONS.tier_1,
  tier_2: TIER_SECTIONS.tier_2
} as const;

export type TierSectionKey = keyof typeof TIER_SECTIONS;
export type TierSections = typeof TIER_SECTIONS[TierSectionKey][number];

// ============================================================================
// EXTENDED DATA TYPES (for ai_integration_notes JSON structure)
// ============================================================================

/**
 * Extended OKR data stored in ai_integration_notes JSON field
 * Contains tier-specific fields beyond the base OKRObjective columns
 */
export interface OKRExtendedData {
  // Tier 1 & 2 common fields
  vision_alignment?: string;
  mission_alignment?: string;
  stakeholder_impact?: string;

  // Tier 1 specific
  success_kpis?: Array<{
    metric_name: string;
    target: string;
    measurement_frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  }>;
  stakeholders?: Array<{
    name: string;
    role: string;
    involvement_type: 'sponsor' | 'owner' | 'contributor' | 'consulted' | 'informed';
  }>;
  dependencies?: Array<{
    title: string;
    description: string;
    dependency_type: 'external' | 'internal' | 'resource' | 'budget';
    required_by_date?: string;
  }>;
  tasks?: Array<{
    title: string;
    description?: string;
    deadline?: string;
    responsible?: string;
    accountable?: string;
  }>;
  risks?: Array<{
    description: string;
    likelihood: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
    mitigation_strategy: string;
  }>;
  resources?: {
    budget?: string;
    people?: string;
    tools?: string;
    external_support?: string;
  };
  milestones?: Array<{
    title: string;
    target_date: string;
    description?: string;
  }>;
  contingency?: {
    plan: string;
    alternative?: string;
    escalation?: string;
  };

  // Tier 2 specific
  department_goals?: string;
  team_members?: Array<{
    name: string;
    role: string;
  }>;
  success_criteria?: string[];

  // Tier 3 specific
  notes?: string;
}

// ============================================================================
// CORE TYPES
// ============================================================================

export interface OKRObjective {
  id: string;
  title: string;
  description: string | null;
  rationale: string | null;
  tier: OKRTier;
  level: OKRLevel;
  owner_id: string;
  parent_objective_id: string | null;
  institution_id: string | null; // null for organization-level OKRs
  department_id: string | null;
  cycle_type: OKRCycleType;
  start_date: string;
  end_date: string;
  status: OKRStatus;
  overall_progress: number;
  ai_integration_notes: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  owner?: OKRUser;
  parent_objective?: OKRObjective;
  key_results?: OKRKeyResult[];
  dependencies?: OKRDependency[];
  tasks?: OKRTask[];
  risks?: OKRRisk[];
  institution?: { id: string; name: string };
  department?: { id: string; department_name: string };
}

export interface OKRKeyResult {
  id: string;
  objective_id: string;
  title: string;
  description: string | null;
  start_value: number;  // Database column name
  target_value: number;
  current_value: number;
  unit: string;
  deadline: string;
  data_source: KRDataSource;
  data_source_config: Record<string, unknown> | null;  // Database column name
  progress_percentage: number;  // Database column name
  status: KRStatus;
  measured_by: string | null;
  last_synced_at: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
  // A/B/C/D Matrix fields
  process_rating: number | null;  // 1-5 rating
  process_notes: string | null;
  abcd_category: ABCDCategory;  // Computed from process_rating + progress
  // Relations
  objective?: OKRObjective;
  updates?: OKRKRUpdate[];
}

export interface OKRCheckIn {
  id: string;
  user_id: string;
  week_number: number;
  year: number;
  check_in_date: string | null;
  due_date: string;
  is_completed: boolean;
  is_overdue: boolean;
  days_overdue: number;
  overall_notes: string | null;
  blocker_flagged: boolean;
  blocker_description: string | null;
  blocker_assigned_to: string | null;
  blocker_resolved: boolean;
  blocker_resolved_at: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  user?: OKRUser;
  kr_updates?: OKRKRUpdate[];
}

export interface OKRKRUpdate {
  id: string;
  key_result_id: string;
  check_in_id: string;
  previous_value: number;
  new_value: number;
  source: UpdateSource;
  exception_flagged: boolean;
  exception_note: string | null;
  auto_calculated: boolean;
  created_at: string;
  // Relations
  key_result?: OKRKeyResult;
  check_in?: OKRCheckIn;
}

// Simplified KR update history for display
export interface OKRKRUpdateHistory {
  id: string;
  check_in_date: string;
  check_in_value: number;
  previous_value: number;
  notes?: string | null;
  source: UpdateSource;
}

export interface OKRDependency {
  id: string;
  objective_id: string;
  title: string;
  description: string | null;
  dependency_type: DependencyType;
  owner_user_id: string | null;
  owner_department_id: string | null;
  required_by_date: string | null;
  status: DependencyStatus;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  owner_user?: OKRUser;
  owner_department?: { id: string; department_name: string };
}

export interface OKRTask {
  id: string;
  objective_id: string;
  key_result_id: string | null;
  title: string;
  description: string | null;
  deadline: string | null;
  responsible_id: string | null;
  accountable_id: string | null;
  consulted_ids: string[];
  informed_ids: string[];
  status: string;
  order_index: number;
  created_at: string;
  updated_at: string;
  // Relations
  responsible?: OKRUser;
  accountable?: OKRUser;
}

export interface OKRRisk {
  id: string;
  objective_id: string;
  description: string;
  likelihood: RiskLevel;
  impact: RiskLevel;
  mitigation_strategy: string;
  owner_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  // Relations
  owner?: OKRUser;
}

export interface OKRCompliance {
  id: string;
  user_id: string;
  week_number: number;
  year: number;
  check_in_required: boolean;
  check_in_completed: boolean;
  completion_date: string | null;
  is_blocked: boolean;
  blocked_at: string | null;
  blocked_reason: string | null;
  escalation_sent: boolean;
  escalation_date: string | null;
  escalation_to: string | null;
  unblocked_at: string | null;
  grace_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface OKRUserStatus {
  id: string;
  user_id: string;
  current_badge: UserBadge;
  consecutive_on_track_weeks: number;
  consecutive_missed_weeks: number;
  last_check_in_date: string | null;
  next_check_in_due: string | null;
  total_objectives: number;
  on_track_count: number;
  at_risk_count: number;
  behind_count: number;
  blocked_count: number;
  updated_at: string;
}

// ============================================================================
// LEARNER-SPECIFIC TYPES
// ============================================================================
// DEPRECATED as of 2026-02-01 per Workshop Transformation Plan
// These types are kept for historical data compatibility.
// New learner goal tracking should use the Competency module (types/competency.ts)
// See: learner_competencies table for tracking individual learner skills
// ============================================================================

/**
 * @deprecated Use Competency module instead. This type is kept for historical data.
 * Core OKRs defined by institution for learners - replaced by competency_program_mapping
 */
export interface LearnerCoreOKR {
  id: string;
  institution_id: string;
  department_id: string | null;
  program_id: string | null;
  semester: string | null;
  kr_title: string;
  kr_description: string | null;
  baseline_value: number;
  target_value: number;
  unit: string;
  auto_source_module: string;
  auto_source_query: string;
  auto_source_config: Record<string, unknown> | null;
  is_active: boolean;
  order_index: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * @deprecated Use Competency module instead. This type is kept for historical data.
 * Learner OKR assignments - replaced by learner_competencies table
 */
export interface LearnerOKRAssignment {
  id: string;
  learner_id: string;
  core_okr_id: string;
  academic_year: string;
  semester: string;
  current_value: number;
  progress: number;
  status: KRStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  core_okr?: LearnerCoreOKR;
  learner?: OKRUser;
}

/**
 * @deprecated Use Competency module instead. This type is kept for historical data.
 * Learner elective OKRs - replaced by learning_paths module
 */
export interface LearnerElectiveOKR {
  id: string;
  learner_id: string;
  title: string;
  description: string | null;
  why_matters: string | null;
  baseline_value: number | null;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  deadline: string;
  progress: number;
  status: KRStatus;
  is_active: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// MILESTONE & CELEBRATION TYPES
// ============================================================================

export interface OKRMilestone {
  id: string;
  objective_id: string | null;
  key_result_id: string | null;
  user_id: string;
  milestone_type: MilestoneType;
  achieved_at: string;
  celebration_type: string | null;
  recognition_notes: string | null;
  is_announced: boolean;
  announced_at: string | null;
  created_at: string;
  // Relations
  objective?: OKRObjective;
  key_result?: OKRKeyResult;
  user?: OKRUser;
}

// ============================================================================
// AUTO-TRACKING TYPES
// ============================================================================

export interface OKRAutoTrackSource {
  id: string;
  source_module: string;
  metric_name: string;
  metric_key: string;
  description: string | null;
  query_template: string;
  default_unit: string;
  refresh_frequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
  is_active: boolean;
  created_at: string;
}

// ============================================================================
// USER TYPE (Minimal for OKR context)
// ============================================================================

export interface OKRUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  avatar_url?: string;
}

// ============================================================================
// DTO TYPES (Data Transfer Objects)
// ============================================================================

export interface CreateOKRObjectiveDTO {
  title: string;
  description?: string;
  rationale?: string;
  tier: OKRTier;
  level: OKRLevel;
  parent_objective_id?: string;
  institution_id?: string; // Optional - null for organization-level OKRs
  department_id?: string;
  cycle_type: OKRCycleType;
  start_date: string;
  end_date: string;
  ai_integration_notes?: string;
}

export interface UpdateOKRObjectiveDTO {
  title?: string;
  description?: string;
  rationale?: string;
  status?: OKRStatus;
  ai_integration_notes?: string;
}

export interface CreateOKRKeyResultDTO {
  objective_id: string;
  title: string;
  description?: string;
  start_value: number;
  target_value: number;
  unit: string;
  deadline: string;
  data_source: KRDataSource;
  data_source_config?: Record<string, unknown>;
  measured_by?: string;
  order_index?: number;
}

export interface UpdateOKRKeyResultDTO {
  title?: string;
  description?: string;
  current_value?: number;
  target_value?: number;
  deadline?: string;
  measured_by?: string;
}

export interface CreateOKRCheckInDTO {
  objective_ids?: string[];
  kr_updates: {
    key_result_id: string;
    new_value: number;
    exception_flagged?: boolean;
    exception_note?: string;
  }[];
  overall_notes?: string;
  blocker_flagged?: boolean;
  blocker_description?: string;
  blocker_assigned_to?: string;
}

/**
 * @deprecated Use Competency module instead. Learner elective OKRs replaced by learning_paths.
 */
export interface CreateLearnerElectiveOKRDTO {
  title: string;
  description?: string;
  why_matters?: string;
  baseline_value?: number;
  target_value?: number;
  unit?: string;
  deadline: string;
}

export interface CreateOKRDependencyDTO {
  objective_id: string;
  title: string;
  description?: string;
  dependency_type: DependencyType;
  owner_user_id?: string;
  owner_department_id?: string;
  required_by_date?: string;
}

export interface CreateOKRTaskDTO {
  objective_id: string;
  key_result_id?: string;
  title: string;
  description?: string;
  deadline?: string;
  responsible_id?: string;
  accountable_id?: string;
  consulted_ids?: string[];
  informed_ids?: string[];
}

export interface CreateOKRRiskDTO {
  objective_id: string;
  description: string;
  likelihood: RiskLevel;
  impact: RiskLevel;
  mitigation_strategy: string;
  owner_id?: string;
}

// ============================================================================
// FILTER TYPES
// ============================================================================

export interface OKRObjectiveFilters {
  owner_id?: string;
  institution_id?: string;
  department_id?: string;
  tier?: OKRTier;
  level?: OKRLevel;
  status?: OKRStatus;
  cycle_type?: OKRCycleType;
  parent_objective_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface OKRCheckInFilters {
  user_id?: string;
  week_number?: number;
  year?: number;
  is_completed?: boolean;
  is_overdue?: boolean;
  page?: number;
  limit?: number;
}

export interface OKRTeamFilters {
  manager_id?: string;
  institution_id?: string;
  department_id?: string;
  include_blocked?: boolean;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface OKRListResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface OKRTeamSummary {
  manager_id: string;
  total_objectives: number;
  on_track: number;
  at_risk: number;
  behind: number;
  blocked_users: number;
  overdue_checkins: number;
  team_members: OKRTeamMember[];
}

export interface OKRTeamMember {
  user_id: string;
  user: OKRUser;
  objectives_count: number;
  average_progress: number;
  last_check_in_date: string | null;
  badge: UserBadge;
  is_blocked: boolean;
}

export interface OKRNeedsAttention {
  type: 'overdue_checkin' | 'at_risk_okr' | 'blocked_dependency' | 'missed_deadline';
  user?: OKRUser;
  objective?: OKRObjective;
  key_result?: OKRKeyResult;
  dependency?: OKRDependency;
  message: string;
  days_overdue?: number;
  progress?: number;
}

export interface OKRCascadeNode {
  id: string;
  title: string;
  tier: OKRTier;
  level: OKRLevel;
  overall_progress: number;
  owner_id: string;
  owner?: OKRUser;
  parent_objective_id: string | null;
  depth: number;
  path: string[];
  key_results?: OKRKeyResult[];
  children?: OKRCascadeNode[];
}

export interface OKRDashboardStats {
  total_objectives: number;
  active_objectives: number;
  completed_objectives: number;
  on_track_count: number;
  at_risk_count: number;
  behind_count: number;
  blocked_count: number;
  avg_progress: number;
  check_in_completion_rate: number;
  auto_tracked_krs: number;
  manual_krs: number;
}

export interface OKRAvailableKPI {
  source_module: string;
  metric_name: string;
  metric_key: string;
  description: string | null;
  default_unit: string;
}

// ============================================================================
// WIDGET TYPES (for Dashboard)
// ============================================================================

export interface OKRDashboardWidget {
  type: 'team_summary' | 'my_okrs' | 'needs_attention' | 'cascade_tree' | 'compliance_status';
  data: unknown;
}

export interface OKRComplianceWidget {
  user_id: string;
  current_week: number;
  is_blocked: boolean;
  last_check_in: string | null;
  next_due: string | null;
  consecutive_completed: number;
  consecutive_missed: number;
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export type OKRNotificationType =
  | 'weekly_reminder'        // Friday 9 AM - Time to check-in
  | 'deadline_warning'       // Sunday 3 PM - 2 hours left
  | 'overdue_alert'          // Monday 9 AM - Check-in overdue
  | 'manager_escalation'     // Team member blocked
  | 'milestone_celebration'  // 50%, 75%, 100% milestone
  | 'badge_change'           // Green -> Yellow, etc.
  | 'blocker_resolved'       // Your blocker was resolved
  | 'dependency_update'      // Dependency status changed
  | 'kr_auto_updated';       // Auto-tracked KR updated

export interface OKRNotification {
  type: OKRNotificationType;
  user_id: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface OKRNotificationPayload {
  type: OKRNotificationType;
  user_id: string;
  title: string;
  body: string;
  url?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  metadata?: {
    okr_notification_type?: OKRNotificationType;
    week_number?: number;
    year?: number;
    objective_id?: string;
    key_result_id?: string;
    milestone_type?: MilestoneType;
    old_badge?: UserBadge;
    new_badge?: UserBadge;
    consecutive_missed?: number;
    [key: string]: any;
  };
}

export interface OKRUserNotification {
  id: string;
  notification_id: string;
  user_id: string;
  read_at: string | null;
  created_at: string;
  notification: {
    id: string;
    title: string;
    body: string;
    url: string | null;
    icon: string | null;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    category: string;
    metadata: Record<string, any> | null;
    sent_at: string;
  };
}

// ============================================================================
// SOCIAL FEATURES TYPES (Comments, Reactions, Attachments)
// ============================================================================

export type OKREntityType = 'objective' | 'key_result' | 'check_in';
export type OKRReactionType = 'like' | 'celebrate' | 'support' | 'insightful' | 'concern' | 'question';

export interface OKRComment {
  id: string;
  entity_type: OKREntityType;
  entity_id: string;
  content: string;
  parent_comment_id: string | null;
  author_id: string;
  mentioned_user_ids: string[];
  is_edited: boolean;
  edited_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  author?: OKRUser;
  replies?: OKRComment[];
}

export interface OKRReaction {
  id: string;
  entity_type: OKREntityType | 'comment';
  entity_id: string;
  reaction_type: OKRReactionType;
  user_id: string;
  created_at: string;
}

export interface OKRReactionSummary {
  reaction_type: OKRReactionType;
  count: number;
  user_has_reacted: boolean;
  user_ids: string[];
}

export interface OKRAttachment {
  id: string;
  entity_type: OKREntityType | 'comment';
  entity_id: string;
  file_name: string;
  file_type: string;
  file_size: number | null;
  storage_path: string | null;
  external_url: string | null;
  description: string | null;
  thumbnail_path: string | null;
  uploaded_by: string;
  created_at: string;
  // Relations
  uploader?: OKRUser;
}

export interface CreateOKRCommentDTO {
  entity_type: OKREntityType;
  entity_id: string;
  content: string;
  parent_comment_id?: string;
}

export interface CreateOKRAttachmentDTO {
  entity_type: OKREntityType | 'comment';
  entity_id: string;
  file_name: string;
  external_url: string;
  description?: string;
}

// ============================================================================
// ANALYTICS & DASHBOARD CHART TYPES
// ============================================================================

export interface OKRTrendDataPoint {
  date: string;
  week: number;
  progress: number;
  on_track: number;
  at_risk: number;
  behind: number;
  blocked: number;
}

export interface OKRDepartmentComparison {
  department_id: string;
  department_name: string;
  total_objectives: number;
  avg_progress: number;
  on_track_percentage: number;
  check_in_rate: number;
  blocked_users: number;
}

export interface OKRProjection {
  objective_id: string;
  title: string;
  current_progress: number;
  projected_progress: number;
  days_remaining: number;
  daily_rate_needed: number;
  current_daily_rate: number;
  status: 'on_track' | 'at_risk' | 'unlikely';
}

export interface OKRAnalyticsSummary {
  total_objectives: number;
  active_objectives: number;
  avg_progress: number;
  check_in_compliance_rate: number;
  blocked_users_count: number;
  milestones_achieved_this_week: number;
  at_risk_objectives: number;
  trend_direction: 'up' | 'down' | 'stable';
  trend_percentage: number;
}

// ============================================================================
// METRIC REGISTRY TYPES (v2 - Universal Auto-Metrics)
// ============================================================================

/**
 * Source type for metric data
 * - db_query: Direct SQL query against Supabase tables
 * - db_function: Stored procedure/function call
 * - edge_function: Supabase Edge Function
 * - external_api: External HTTP endpoint
 * - computed: Computed from other metrics
 */
export type MetricSourceType = 'db_query' | 'db_function' | 'edge_function' | 'external_api' | 'computed';

/**
 * Value type for metrics
 */
export type MetricValueType = 'number' | 'percentage' | 'currency' | 'count' | 'ratio' | 'duration' | 'score';

/**
 * Scope at which a metric operates
 */
export type MetricScope = 'individual' | 'section' | 'department' | 'program' | 'institution' | 'organization';

/**
 * How often a metric should be refreshed
 */
export type MetricRefreshFrequency = 'realtime' | 'minute_5' | 'minute_15' | 'hourly' | 'daily' | 'weekly' | 'on_demand';

/**
 * Metric registry entry - defines a single auto-trackable metric
 */
export interface MetricRegistryEntry {
  id: string;
  metric_key: string;                            // Unique key: 'module.metric_name'
  display_name: string;                          // Human-readable name
  description: string | null;
  module: string;                                // Source module: 'attendance', 'billing', etc.
  category: string;                              // 'academic', 'financial', 'operational', etc.

  // Applicability
  applicable_roles: string[];                    // ['learner', 'faculty', 'admin', etc.]
  applicable_scopes: MetricScope[];
  requires_context: Record<string, boolean>;     // Required context params

  // Source configuration
  source_type: MetricSourceType;
  source_config: MetricSourceConfig;             // Type-specific configuration

  // Value configuration
  value_type: MetricValueType;
  unit: string;                                  // '%', 'INR', 'count', etc.
  precision: number;                             // Decimal places
  min_value: number | null;
  max_value: number | null;
  default_baseline: number;
  default_target: number | null;

  // Sync configuration
  refresh_frequency: MetricRefreshFrequency;
  cache_duration_seconds: number;
  last_global_sync_at: string | null;

  // Display
  icon: string | null;
  color: string | null;
  display_format: string | null;                 // '{value}%', '₹{value}', etc.
  chart_type: string;

  // Metadata
  is_active: boolean;
  is_system: boolean;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Source configuration for database functions
 */
export interface DbFunctionSourceConfig {
  function_name: string;
  params?: Record<string, string>;               // Param mapping: {p_profile_id: "{{profile_id}}"}
}

/**
 * Source configuration for database queries
 */
export interface DbQuerySourceConfig {
  query: string;                                 // SQL with {{variable}} placeholders
  params?: string[];                             // List of context params used
}

/**
 * Source configuration for Edge Functions
 */
export interface EdgeFunctionSourceConfig {
  function_name: string;
  method?: 'GET' | 'POST';
  params?: Record<string, unknown>;
}

/**
 * Source configuration for External APIs
 */
export interface ExternalApiSourceConfig {
  endpoint: string;                              // URL with {{variable}} placeholders
  method?: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  params?: Record<string, unknown>;              // Query params or body
  body?: Record<string, unknown>;
  response_path?: string;                        // JSONPath to extract value: 'data.value'
  auth_ref?: string;                             // Reference to okr_external_api_credentials
}

/**
 * Source configuration for computed metrics
 */
export interface ComputedSourceConfig {
  formula: string;                               // 'metric_a + metric_b'
  dependencies: string[];                        // ['metric_a', 'metric_b']
}

/**
 * Union type for all source configurations
 */
export type MetricSourceConfig =
  | DbFunctionSourceConfig
  | DbQuerySourceConfig
  | EdgeFunctionSourceConfig
  | ExternalApiSourceConfig
  | ComputedSourceConfig
  | Record<string, unknown>;

/**
 * Context passed to metric execution
 */
export interface MetricContext {
  profile_id?: string;
  institution_id?: string;
  department_id?: string;
  section_id?: string;
  program_id?: string;
  semester_id?: string;
  scope?: MetricScope;
  start_date?: string;
  end_date?: string;
  [key: string]: unknown;                        // Extensible for future needs
}

/**
 * Result of metric execution
 */
export interface MetricResult {
  value: number | null;
  raw_data?: Record<string, unknown>;
  source_type: MetricSourceType;
  executed_at: string;
  was_cached: boolean;
  execution_duration_ms?: number;
  error?: string;
}

/**
 * Filter for querying metrics from registry
 */
export interface MetricFilter {
  module?: string;
  category?: string;
  roles?: string[];
  scopes?: MetricScope[];
  tags?: string[];
  search?: string;
  is_active?: boolean;
}

/**
 * External API credentials for metric fetching
 */
export interface ExternalApiCredentials {
  id: string;
  api_name: string;
  display_name: string;
  description: string | null;
  auth_type: 'api_key' | 'oauth2' | 'basic' | 'bearer' | 'custom';
  auth_config: Record<string, unknown>;
  base_url: string;
  default_headers: Record<string, string>;
  rate_limit_per_minute: number;
  timeout_seconds: number;
  is_active: boolean;
  last_validated_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Result of bulk metric sync operation
 */
export interface BulkMetricSyncResult {
  total: number;
  synced: number;
  failed: number;
  cached: number;
  results: Array<{
    metric_key: string;
    value: number | null;
    error?: string;
    was_cached: boolean;
  }>;
}

/**
 * Metric execution log entry
 */
export interface MetricExecutionLog {
  id: string;
  metric_key: string;
  profile_id: string | null;
  institution_id: string | null;
  scope: MetricScope;
  context_params: MetricContext;
  executed_at: string;
  execution_duration_ms: number;
  source_type: MetricSourceType;
  raw_result: Record<string, unknown> | null;
  computed_value: number | null;
  is_success: boolean;
  error_message: string | null;
  was_cached: boolean;
  cache_key: string | null;
}

/**
 * Cached metric value
 */
export interface MetricCache {
  id: string;
  metric_key: string;
  cache_key: string;
  profile_id: string | null;
  institution_id: string | null;
  scope: MetricScope;
  context_hash: string;
  value: number;
  raw_data: Record<string, unknown> | null;
  computed_at: string;
  expires_at: string;
  hit_count: number;
  last_accessed_at: string;
}

/**
 * DTO for creating a new metric in the registry
 */
export interface CreateMetricDTO {
  metric_key: string;
  display_name: string;
  description?: string;
  module: string;
  category: string;
  applicable_roles: string[];
  applicable_scopes: MetricScope[];
  requires_context?: Record<string, boolean>;
  source_type: MetricSourceType;
  source_config: MetricSourceConfig;
  value_type?: MetricValueType;
  unit?: string;
  precision?: number;
  min_value?: number;
  max_value?: number;
  default_baseline?: number;
  default_target?: number;
  refresh_frequency?: MetricRefreshFrequency;
  cache_duration_seconds?: number;
  icon?: string;
  color?: string;
  display_format?: string;
  chart_type?: string;
  tags?: string[];
}

/**
 * Key Result with auto-metric configuration
 */
export interface AutoTrackedKeyResult extends OKRKeyResult {
  data_source: 'auto';
  data_source_config: {
    metric_key: string;                          // Reference to metric registry
    context_overrides?: Record<string, unknown>; // Override default context
  };
}

/**
 * Metric picker option for UI
 */
export interface MetricPickerOption {
  metric_key: string;
  display_name: string;
  description: string | null;
  module: string;
  category: string;
  unit: string;
  default_target: number | null;
  icon: string | null;
  tags: string[];
}
