// Learner Leave Types + role-based approval flows.
// Schema: public.learner_leave_types / learner_leave_flows / learner_leave_flow_steps
// (20270415090000_learner_leave_types_and_role_flows.sql). One group-wide list;
// a flow per type with an optional per-institution override.

import type { LeaveOndutyCategory } from '@/types/leave-onduty';

export type LearnerLeaveResidency = 'hostel' | 'day_scholar' | 'both';
export type LearnerLeaveStepScope =
  | 'own_department'
  | 'own_institution'
  | 'all_institutions'
  | 'hostel_block';

export interface LearnerLeaveType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  color_code: string;
  category: LeaveOndutyCategory;
  residency: LearnerLeaveResidency;
  max_duration_days: number | null;
  advance_notice_hours: number;
  requires_attachment: boolean;
  allow_half_day: boolean;
  allow_periodwise: boolean;
  requires_sponsor_approval: boolean;
  sponsor_role_hint: string | null;
  affects_attendance: boolean;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type LearnerLeaveTypeInput = Omit<
  LearnerLeaveType,
  'id' | 'created_by' | 'updated_by' | 'created_at' | 'updated_at'
>;

export interface LearnerLeaveFlowStep {
  id?: string;
  step_order: number;
  role_id: string;
  scope: LearnerLeaveStepScope;
  role?: { id: string; role_key: string; role_name: string; institution_scope: string | null } | null;
}

export interface LearnerLeaveFlow {
  id: string;
  leave_type_id: string;
  /** NULL = group default; a value = that institution's override. */
  institution_id: string | null;
  is_active: boolean;
  steps: LearnerLeaveFlowStep[];
  institution?: { id: string; name: string } | null;
}

export interface LearnerLeaveTypeFilters {
  search?: string;
  category?: LeaveOndutyCategory | 'all';
  residency?: LearnerLeaveResidency | 'all';
  is_active?: boolean;
}

export const RESIDENCY_LABELS: Record<LearnerLeaveResidency, string> = {
  hostel: 'Hostel',
  day_scholar: 'Day Scholar',
  both: 'Both',
};

export const STEP_SCOPE_LABELS: Record<LearnerLeaveStepScope, string> = {
  own_department: "Learner's department",
  own_institution: "Learner's institution",
  all_institutions: 'All institutions',
  hostel_block: "Learner's hostel block",
};

export const STEP_SCOPE_HELP: Record<LearnerLeaveStepScope, string> = {
  own_department: 'Holders of this role in the same institution AND department as the learner (e.g. HOD).',
  own_institution: 'Holders of this role in the learner\'s institution (e.g. Principal).',
  all_institutions: 'Any holder of this role across the group (e.g. CAO).',
  hostel_block: 'Staff assigned to the block where the learner is allocated (e.g. Warden). Hostel learners only.',
};
