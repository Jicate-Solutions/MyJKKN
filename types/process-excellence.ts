// types/process-excellence.ts
// Process Excellence Module - TIMWOOD Waste Tracking & Value-Add Analysis

// =============================================
// Enums & Constants
// =============================================

export type WasteCategory = 'T' | 'I' | 'M' | 'W' | 'O1' | 'O2' | 'D' | 'TU';
export type ProcessCategory = 'admission' | 'billing' | 'academic' | 'staff' | 'grievance';
export type SLAStatus = 'on_track' | 'at_risk' | 'breached';
export type ABCDRating = 'A' | 'B' | 'C' | 'D';
export type WasteStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';
export type AuditStatus = 'draft' | 'in_review' | 'finalized';

export const WASTE_LABELS: Record<WasteCategory, string> = {
  T: 'Transportation',
  I: 'Inventory',
  M: 'Motion',
  W: 'Waiting',
  O1: 'Over-production',
  O2: 'Over-processing',
  D: 'Defects',
  TU: 'Talent Under-utilization'
};

export const WASTE_DESCRIPTIONS: Record<WasteCategory, string> = {
  T: 'Files movement, exam paper distribution, unnecessary physical transfers',
  I: 'Unused lab consumables, excess stationery, surplus printed materials',
  M: 'Excessive searching, back-and-forth communication, unnecessary steps',
  W: 'Approval delays, decision queues, waiting for information',
  O1: 'Extra brochures, exam papers, reports printed beyond need',
  O2: 'Multiple signatures, redundant checks, excessive documentation',
  D: 'Form errors, rework, reprocessing, corrections required',
  TU: 'Faculty doing admin work, senior staff on routine tasks'
};

export const WASTE_COLORS: Record<WasteCategory, string> = {
  T: '#3B82F6', // Blue
  I: '#10B981', // Green
  M: '#F59E0B', // Amber
  W: '#EF4444', // Red
  O1: '#8B5CF6', // Purple
  O2: '#EC4899', // Pink
  D: '#F97316', // Orange
  TU: '#6366F1'  // Indigo
};

export const PROCESS_CATEGORY_LABELS: Record<ProcessCategory, string> = {
  admission: 'Admission',
  billing: 'Billing',
  academic: 'Academic',
  staff: 'Staff',
  grievance: 'Grievance'
};

export const SLA_STATUS_LABELS: Record<SLAStatus, string> = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  breached: 'Breached'
};

export const ABCD_RATING_LABELS: Record<ABCDRating, string> = {
  A: 'Excellent',
  B: 'Good',
  C: 'Needs Improvement',
  D: 'Critical'
};

export const ABCD_RATING_COLORS: Record<ABCDRating, string> = {
  A: '#10B981', // Green
  B: '#3B82F6', // Blue
  C: '#F59E0B', // Amber
  D: '#EF4444'  // Red
};

// =============================================
// Core Types
// =============================================

export interface ProcessStage {
  name: string;
  expected_duration_hours: number;
  is_value_add: boolean;
  description?: string;
  order?: number;
}

export interface StageHistory {
  stage: string;
  started_at: string;
  completed_at: string | null;
  duration_hours: number | null;
  is_value_add?: boolean;
}

export interface ProcessDefinition {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  category: ProcessCategory;
  stages: ProcessStage[];
  target_cycle_time_hours: number | null;
  target_value_add_ratio: number | null;
  sla_hours: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  // Joined relations
  institution?: {
    id: string;
    name: string;
  };
}

export interface ProcessInstance {
  id: string;
  process_id: string;
  reference_type: string;
  reference_id: string;
  started_at: string;
  completed_at: string | null;
  current_stage: string | null;
  stage_history: StageHistory[];
  total_cycle_hours: number | null;
  value_add_hours: number | null;
  value_add_ratio: number | null;
  sla_status: SLAStatus;
  created_at: string;
  // Joined relations
  process?: ProcessDefinition;
}

export interface WasteIncident {
  id: string;
  institution_id: string;
  process_instance_id: string | null;
  process_id: string | null;
  waste_category: WasteCategory;
  description: string;
  estimated_time_lost_hours: number | null;
  estimated_cost_impact: number | null;
  root_cause: string | null;
  corrective_action: string | null;
  reported_by: string | null;
  reported_at: string;
  status: WasteStatus;
  resolved_at?: string | null;
  resolved_by?: string | null;
  // Joined relations
  process?: ProcessDefinition;
  process_instance?: ProcessInstance;
  reporter?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  institution?: {
    id: string;
    name: string;
  };
}

export interface ProcessAudit {
  id: string;
  institution_id: string;
  process_id: string;
  audit_period_start: string;
  audit_period_end: string;
  auditor_id: string | null;
  total_instances: number;
  avg_cycle_hours: number | null;
  avg_value_add_ratio: number | null;
  sla_compliance_rate: number | null;
  waste_breakdown: Record<WasteCategory, number>;
  findings: string | null;
  recommendations: string | null;
  abcd_rating: ABCDRating | null;
  status: AuditStatus;
  created_at: string;
  finalized_at: string | null;
  // Joined relations
  process?: ProcessDefinition;
  auditor?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  institution?: {
    id: string;
    name: string;
  };
}

export interface ProcessMetrics {
  process_id: string;
  process_name: string;
  category: ProcessCategory;
  total_instances: number;
  completed_instances: number;
  in_progress_instances: number;
  avg_cycle_time: number;
  value_add_ratio: number;
  sla_compliance: number;
  waste_count: number;
  abcd_distribution: Record<ABCDRating, number>;
  trend_cycle_time?: number; // % change from previous period
  trend_value_add?: number;
}

// =============================================
// DTOs (Data Transfer Objects)
// =============================================

export interface CreateProcessDefinitionDto {
  institution_id: string;
  name: string;
  description?: string | null;
  category: ProcessCategory;
  stages: ProcessStage[];
  target_cycle_time_hours?: number | null;
  target_value_add_ratio?: number | null;
  sla_hours?: number | null;
  is_active?: boolean;
}

export interface UpdateProcessDefinitionDto {
  name?: string;
  description?: string | null;
  category?: ProcessCategory;
  stages?: ProcessStage[];
  target_cycle_time_hours?: number | null;
  target_value_add_ratio?: number | null;
  sla_hours?: number | null;
  is_active?: boolean;
}

export interface StartProcessInstanceDto {
  process_id: string;
  reference_type: string;
  reference_id: string;
}

export interface AdvanceStageDto {
  new_stage: string;
  is_value_add?: boolean;
}

export interface CreateWasteIncidentDto {
  institution_id: string;
  process_instance_id?: string | null;
  process_id?: string | null;
  waste_category: WasteCategory;
  description: string;
  estimated_time_lost_hours?: number | null;
  estimated_cost_impact?: number | null;
  root_cause?: string | null;
  corrective_action?: string | null;
}

export interface UpdateWasteIncidentDto {
  waste_category?: WasteCategory;
  description?: string;
  estimated_time_lost_hours?: number | null;
  estimated_cost_impact?: number | null;
  root_cause?: string | null;
  corrective_action?: string | null;
  status?: WasteStatus;
}

export interface CreateProcessAuditDto {
  institution_id: string;
  process_id: string;
  audit_period_start: string;
  audit_period_end: string;
  auditor_id?: string | null;
  findings?: string | null;
  recommendations?: string | null;
}

export interface UpdateProcessAuditDto {
  findings?: string | null;
  recommendations?: string | null;
  abcd_rating?: ABCDRating | null;
  status?: AuditStatus;
}

// =============================================
// Filter Types
// =============================================

export interface ProcessDefinitionFilters {
  search?: string;
  institution_id: string; // REQUIRED for security - prevents cross-institution access
  category?: ProcessCategory;
  is_active?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface ProcessInstanceFilters {
  search?: string;
  institution_id: string; // REQUIRED for security - prevents cross-institution access
  process_id?: string;
  reference_type?: string;
  sla_status?: SLAStatus;
  is_completed?: boolean;
  started_from?: string;
  started_to?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface WasteIncidentFilters {
  search?: string;
  institution_id: string; // REQUIRED for security - prevents cross-institution access
  process_id?: string;
  process_instance_id?: string;
  waste_category?: WasteCategory;
  status?: WasteStatus;
  reported_from?: string;
  reported_to?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface ProcessAuditFilters {
  search?: string;
  institution_id: string; // REQUIRED for security - prevents cross-institution access
  process_id?: string;
  auditor_id?: string;
  abcd_rating?: ABCDRating;
  status?: AuditStatus;
  period_from?: string;
  period_to?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface ProcessMetricsFilters {
  institution_id: string;
  process_id?: string;
  category?: ProcessCategory;
  period_start?: string;
  period_end?: string;
}

// =============================================
// Response Types
// =============================================

export interface PaginationMetadata {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProcessDefinitionListResponse {
  data: ProcessDefinition[];
  metadata: PaginationMetadata;
}

export interface ProcessInstanceListResponse {
  data: ProcessInstance[];
  metadata: PaginationMetadata;
}

export interface WasteIncidentListResponse {
  data: WasteIncident[];
  metadata: PaginationMetadata;
}

export interface ProcessAuditListResponse {
  data: ProcessAudit[];
  metadata: PaginationMetadata;
}

// =============================================
// Dashboard Types
// =============================================

export interface ProcessExcellenceDashboard {
  summary: {
    total_processes: number;
    active_instances: number;
    sla_compliance_rate: number;
    avg_value_add_ratio: number;
    total_waste_incidents: number;
    open_waste_incidents: number;
  };
  process_metrics: ProcessMetrics[];
  waste_breakdown: {
    category: WasteCategory;
    label: string;
    count: number;
    total_hours_lost: number;
    total_cost_impact: number;
  }[];
  sla_distribution: {
    on_track: number;
    at_risk: number;
    breached: number;
  };
  recent_audits: ProcessAudit[];
  trending_processes: {
    process_id: string;
    process_name: string;
    trend: 'improving' | 'declining' | 'stable';
    change_percentage: number;
  }[];
}

export interface WasteAnalytics {
  total_incidents: number;
  resolved_incidents: number;
  resolution_rate: number;
  total_time_lost: number;
  total_cost_impact: number;
  by_category: Record<WasteCategory, {
    count: number;
    time_lost: number;
    cost_impact: number;
    percentage: number;
  }>;
  by_process: {
    process_id: string;
    process_name: string;
    incident_count: number;
    time_lost: number;
  }[];
  trend_data: {
    period: string;
    count: number;
    time_lost: number;
  }[];
}
