// types/events-marathon.ts
// Marathon-specific type definitions

import type { EventRegistration } from './events';

// ============================================================================
// Marathon-Specific Enums
// ============================================================================

export type SponsorTier = 'prospect' | 'contacted' | 'negotiating' | 'committed' | 'platinum' | 'gold' | 'silver' | 'bronze' | 'in_kind';

export type SponsorPipelineStage = 'lead' | 'contacted' | 'proposal_sent' | 'negotiating' | 'committed' | 'declined' | 'churned';

export type IncidentType = 'medical' | 'logistics' | 'security' | 'weather' | 'technical' | 'other';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentStatus = 'reported' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';

export type CheckpointType = 'start' | 'finish' | 'water' | 'medical' | 'waypoint' | 'km_marker';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'blocked';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export type BudgetItemType = 'income' | 'expense';

export type BudgetItemStatus = 'planned' | 'approved' | 'spent' | 'cancelled';

// ============================================================================
// Marathon Entities
// ============================================================================

export interface MarathonSponsor {
  id: string;
  event_id: string;
  company_name: string;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  logo_url: string | null;
  tier: SponsorTier;
  amount_pledged: number;
  amount_received: number;
  benefits: string | null;
  expectations: string | null;
  notes: string | null;
  pipeline_stage: SponsorPipelineStage;
  signed_date: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  deliverables?: MarathonSponsorDeliverable[];
  activity_log?: MarathonSponsorActivityLog[];
}

export interface MarathonSponsorDeliverable {
  id: string;
  sponsor_id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  due_date: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  created_at: string;
}

export interface MarathonSponsorActivityLog {
  id: string;
  sponsor_id: string;
  activity_type: 'call' | 'email' | 'meeting' | 'payment' | 'note';
  description: string;
  performed_by: string | null;
  created_at: string;
}

export interface MarathonCommittee {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  lead_id: string | null;
  lead_name: string | null;
  member_ids: string[];
  member_names: string[];
  status: string;
  created_at: string;
  updated_at: string;
  // Joined
  tasks?: MarathonTask[];
}

export interface MarathonTask {
  id: string;
  committee_id: string;
  event_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarathonBudgetItem {
  id: string;
  event_id: string;
  category: string;
  description: string;
  type: BudgetItemType;
  estimated_amount: number;
  actual_amount: number;
  status: BudgetItemStatus;
  approved_by: string | null;
  vendor: string | null;
  receipt_url: string | null;
  notes: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarathonCheckpoint {
  id: string;
  event_id: string;
  name: string;
  type: CheckpointType;
  distance_from_start_km: number | null;
  lat: number | null;
  lng: number | null;
  qr_code_data: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface MarathonCheckpointScan {
  id: string;
  checkpoint_id: string;
  event_id: string;
  registration_id: string | null;
  bib_number: string;
  scanned_at: string;
  scanned_by: string | null;
  lat: number | null;
  lng: number | null;
  // Joined
  checkpoint?: MarathonCheckpoint;
}

export interface MarathonResult {
  id: string;
  registration_id: string;
  event_id: string;
  bib_number: string;
  finish_time: string | null;
  finish_time_seconds: number | null;
  pace_per_km_seconds: number | null;
  rank_overall: number | null;
  rank_category: number | null;
  rank_gender: number | null;
  rank_institution: number | null;
  certificate_id: string | null;
  certificate_url: string | null;
  certificate_generated_at: string | null;
  is_dnf: boolean;
  is_disqualified: boolean;
  disqualification_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  registration?: EventRegistration;
}

export interface MarathonIncident {
  id: string;
  event_id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  title: string;
  description: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  reported_by: string | null;
  reported_by_name: string | null;
  status: IncidentStatus;
  resolved_at: string | null;
  resolution_notes: string | null;
  bib_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarathonVolunteerCheckin {
  id: string;
  event_id: string;
  checkpoint_id: string | null;
  volunteer_name: string;
  volunteer_phone: string | null;
  station: string;
  role: string | null;
  checked_in_at: string;
  checked_out_at: string | null;
  notes: string | null;
}

export interface MarathonRaceTrack {
  id: string;
  event_id: string;
  bib: string;
  lat: number;
  lng: number;
  distance_km: number;
  pace_per_km: number;
  elapsed_seconds: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  created_at: string;
  updated_at: string;
}

export interface MarathonRaceTrackPoint {
  id: string;
  event_id: string;
  bib: string;
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  altitude: number | null;
  timestamp: string;
}

// ============================================================================
// Marathon Dashboard Types
// ============================================================================

export interface MarathonDashboardStats {
  total_registrations: number;
  registrations_today: number;
  registrations_by_category: { category_name: string; count: number }[];
  registrations_by_institution: { institution_name: string; count: number }[];
  payment_collected: number;
  payment_pending: number;
  internal_count: number;
  external_count: number;
  checked_in_count: number;
  male_count: number;
  female_count: number;
  sponsor_total_pledged: number;
  sponsor_total_received: number;
  sponsor_count: number;
  tasks_total: number;
  tasks_completed: number;
  tasks_overdue: number;
  budget_estimated: number;
  budget_actual: number;
}

export interface MarathonLiveOpsData {
  runners: MarathonRaceTrack[];
  checkpoint_throughput: {
    checkpoint_id: string;
    checkpoint_name: string;
    scan_count: number;
    last_scan_at: string | null;
  }[];
  active_incidents: MarathonIncident[];
  volunteer_status: MarathonVolunteerCheckin[];
  stats: {
    total_tracking: number;
    on_course: number;
    finished: number;
    avg_pace: number;
    /** Runners with no GPS update for more than 3 minutes */
    stationary_alerts: MarathonRaceTrack[];
  };
}

// ============================================================================
// Marathon DTOs
// ============================================================================

export interface CreateMarathonSponsorDto {
  event_id: string;
  company_name: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  tier?: SponsorTier;
  amount_pledged?: number;
  benefits?: string;
  pipeline_stage?: SponsorPipelineStage;
}

export interface CreateMarathonCommitteeDto {
  event_id: string;
  name: string;
  description?: string;
  lead_id?: string;
  lead_name?: string;
  member_ids?: string[];
  member_names?: string[];
}

export interface CreateMarathonTaskDto {
  committee_id: string;
  event_id: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  assigned_to?: string;
  assigned_to_name?: string;
  due_date?: string;
}

export interface CreateMarathonBudgetItemDto {
  event_id: string;
  category: string;
  description: string;
  type: BudgetItemType;
  estimated_amount: number;
  vendor?: string;
  notes?: string;
}

export interface CreateMarathonIncidentDto {
  event_id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  title: string;
  description?: string;
  location?: string;
  lat?: number;
  lng?: number;
  bib_number?: string;
}

export interface GPSSyncPayload {
  event_id: string;
  bib: string;
  lat: number;
  lng: number;
  distance_km: number;
  pace_per_km: number;
  elapsed_seconds: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  points?: {
    lat: number;
    lng: number;
    speed?: number;
    accuracy?: number;
    altitude?: number;
    timestamp: string;
  }[];
}

export interface CheckpointScanPayload {
  event_id: string;
  bib_number: string;
  checkpoint_id: string;
  lat?: number;
  lng?: number;
}

export interface MarathonRegistrationCustomData {
  tshirt_size?: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  blood_group?: string;
  medical_conditions?: string;
  previous_marathon_experience?: string;
}

export interface ImportGPSResultsResponse {
  imported: number;
  skipped: number;
  errors: string[];
}
