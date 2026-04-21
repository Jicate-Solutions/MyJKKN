// Types for campus-living hostel leave type CRUD master.
// Schema: public.hostel_leave_types (created 2026-04-21 migration
// 20260421000005_hostel_leave_types_crudable.sql). Institution-scoped.
// is_system=true rows are seeded defaults and cannot be deleted via UI.

export interface HostelLeaveType {
  id: string;
  institution_id: string;
  leave_type_code: string;           // e.g. 'home_visit', 'festival' (uppercase-or-snake)
  leave_type_name: string;           // Display label, e.g. "Home Visit"
  description: string | null;
  color_code: string;                // Hex, e.g. '#3B82F6'
  default_max_duration_days: number | null;  // NULL = no cap; can be overridden per-college in hostel_leave_type_config
  requires_parent_consent: boolean;
  requires_chief_warden: boolean;
  requires_attachment: boolean;
  advance_notice_hours: number | null;
  sort_order: number;
  is_system: boolean;                // TRUE for seeded defaults — UI blocks delete
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateHostelLeaveTypeDto {
  institution_id: string;
  leave_type_code: string;
  leave_type_name: string;
  description?: string | null;
  color_code?: string;
  default_max_duration_days?: number | null;
  requires_parent_consent?: boolean;
  requires_chief_warden?: boolean;
  requires_attachment?: boolean;
  advance_notice_hours?: number | null;
  sort_order?: number;
  is_active?: boolean;
  created_by?: string | null;
}

export interface UpdateHostelLeaveTypeDto {
  leave_type_code?: string;
  leave_type_name?: string;
  description?: string | null;
  color_code?: string;
  default_max_duration_days?: number | null;
  requires_parent_consent?: boolean;
  requires_chief_warden?: boolean;
  requires_attachment?: boolean;
  advance_notice_hours?: number | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface HostelLeaveTypeFilters {
  institution_id?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface HostelLeaveTypeListResponse {
  data: HostelLeaveType[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Preset colors for the form dialog — mirrors the academic pattern but tuned
// for hostel leave semantics (home = blue, emergency = red, festival = orange).
export const HOSTEL_LEAVE_TYPE_COLORS = {
  HOME: '#3B82F6',       // Blue — routine home visits
  WEEKEND: '#22C55E',    // Green — weekend, positive
  VACATION: '#F97316',   // Orange — extended breaks
  EMERGENCY: '#EF4444',  // Red — urgent
  MEDICAL: '#DC2626',    // Dark red — medical
  ACADEMIC: '#8B5CF6',   // Purple — academic
  NIGHT: '#6366F1',      // Indigo — overnight
  FESTIVAL: '#F59E0B',   // Amber — celebrations
  CUSTOM: '#6B7280'      // Gray — default/custom
} as const;
