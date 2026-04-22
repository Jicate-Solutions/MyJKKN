// Types for hostel_residents — Campus Living Allocations Path 2 (PR-2 of 4)
// Mirrors schema from 20260422_hostel_residents_master.sql
// Residents are always existing MyJKKN users (profile_id is NOT NULL).

export type HostelResidentType =
  | 'learner'
  | 'staff'
  | 'international'
  | 'married'
  | 'visitor'
  | 'other';

export const HOSTEL_RESIDENT_TYPES: ReadonlyArray<HostelResidentType> = [
  'learner',
  'staff',
  'international',
  'married',
  'visitor',
  'other',
] as const;

export interface HostelResident {
  id: string;
  institution_id: string;
  profile_id: string;
  resident_type: HostelResidentType;
  id_proof_type: string | null;
  id_proof_number: string | null;
  is_active: boolean;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// Row with profiles join (SELECT * with profile:profiles(id, full_name, email))
export interface HostelResidentWithProfile extends HostelResident {
  profile?: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
}

export interface CreateHostelResidentDTO {
  institution_id: string;
  profile_id: string;
  resident_type: HostelResidentType;
  id_proof_type?: string | null;
  id_proof_number?: string | null;
  is_active?: boolean;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateHostelResidentDTO {
  resident_type?: HostelResidentType;
  id_proof_type?: string | null;
  id_proof_number?: string | null;
  is_active?: boolean;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ResidentFilters {
  resident_type?: HostelResidentType;
  is_active?: boolean;
  search?: string;  // matches profile.full_name / email / id_proof_number
}
