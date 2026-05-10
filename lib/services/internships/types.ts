// lib/services/internships/types.ts
// Shared TypeScript types for the internship module service layer.
// TODO: Replace these hand-authored types with generated types from
//       @/types/database.types after Agent A's migration is applied and
//       `npm run supabase:types` is run. All field names mirror the schema
//       defined in specs/myjkkn-internship-module-spec.md.

// ---------------------------------------------------------------------------
// Envelope type — ALL service functions return this shape.
// Per feedback_agent_fanout_lock_response_envelope.md: NEVER return raw arrays.
// ---------------------------------------------------------------------------
export type ServiceResult<T> = {
  data: T | null;
  error: Error | null;
};

export type ServiceListResult<T> = {
  data: T[];
  error: Error | null;
};

// ---------------------------------------------------------------------------
// internship_posting_cycles
// ---------------------------------------------------------------------------
export type CycleStatus = 'draft' | 'open' | 'closed' | 'archived';

export interface InternshipCycle {
  id: string;
  institution_id: string;
  name: string;
  academic_year: string;
  start_date: string;
  end_date: string;
  status: CycleStatus;
  total_seats: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateCycleInput = Omit<InternshipCycle, 'id' | 'created_at' | 'updated_at'>;
export type UpdateCycleInput = Partial<Omit<InternshipCycle, 'id' | 'created_at' | 'updated_at'>>;

// ---------------------------------------------------------------------------
// internship_assignments
// ---------------------------------------------------------------------------
export type AssignmentStatus = 'pending' | 'active' | 'completed' | 'withdrawn';

export interface InternshipAssignment {
  id: string;
  cycle_id: string;
  learner_id: string;
  site_id: string | null;
  preceptor_id: string | null;
  department: string | null;
  start_date: string;
  end_date: string;
  status: AssignmentStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateAssignmentInput = Omit<InternshipAssignment, 'id' | 'created_at' | 'updated_at'>;
export type UpdateAssignmentInput = Partial<Omit<InternshipAssignment, 'id' | 'created_at' | 'updated_at'>>;

export interface AssignmentFilters {
  cycleId?: string;
  learnerId?: string;
  siteId?: string;
  status?: AssignmentStatus;
}

// ---------------------------------------------------------------------------
// internship_logbook_entries
// ---------------------------------------------------------------------------
export type LogbookEntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface InternshipLogbookEntry {
  id: string;
  assignment_id: string;
  learner_id: string;
  entry_date: string;
  procedures: string | null;
  observations: string | null;
  learning_outcomes: string | null;
  supervisor_notes: string | null;
  status: LogbookEntryStatus;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateLogbookEntryInput = Omit<InternshipLogbookEntry, 'id' | 'created_at' | 'updated_at'>;
export type UpdateLogbookEntryInput = Partial<Omit<InternshipLogbookEntry, 'id' | 'created_at' | 'updated_at'>>;

// ---------------------------------------------------------------------------
// internship_evaluations
// ---------------------------------------------------------------------------
export type EvaluatorRole = 'preceptor' | 'faculty';
export type EvaluationStatus = 'pending' | 'completed';

export interface InternshipEvaluation {
  id: string;
  assignment_id: string;
  evaluator_id: string;
  evaluator_role: EvaluatorRole;
  evaluation_date: string;
  scores: Record<string, number> | null;
  comments: string | null;
  overall_grade: string | null;
  status: EvaluationStatus;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateEvaluationInput = Omit<InternshipEvaluation, 'id' | 'created_at' | 'updated_at'>;
export type UpdateEvaluationInput = Partial<Omit<InternshipEvaluation, 'id' | 'created_at' | 'updated_at'>>;

// ---------------------------------------------------------------------------
// internship_site_types — lookup table for site_type_id FK (config-driven).
// Hand-authored spec-time SiteType enum {hospital|clinic|community|industry|other}
// was a fictional placeholder; substrate v3 ships a proper lookup table. Kept
// the SiteType alias only as a deprecation hook for any straggler imports.
// ---------------------------------------------------------------------------
export interface InternshipSiteType {
  id: string;
  institution_id: string | null;
  config_key: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** @deprecated The substrate ships a lookup table; use site_type_id + InternshipSiteType. */
export type SiteType = string;

// ---------------------------------------------------------------------------
// internship_external_sites
// Live schema columns (substrate v3, migration 20260509). The recovered thin
// types declared name/address/site_type/mou_signed/capacity which never existed
// on the shipped table. Reconciled 2026-05-10.
// ---------------------------------------------------------------------------
export type SiteOwnershipType =
  | 'private'
  | 'government'
  | 'university_affiliated'
  | 'trust'
  | 'corporate'
  | 'ngo';

export interface InternshipExternalSite {
  id: string;
  institution_id: string;
  site_type_id: string | null;
  site_name: string;
  hospital_code: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  district: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
  geofence_radius_meters: number;
  max_learners_per_cycle: number | null;
  departments_available: string[];
  posting_fee_per_learner: number | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  operates_weekends: boolean;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_role: string | null;
  nearest_emergency_ward: string | null;
  ambulance_number: string | null;
  ownership_type: SiteOwnershipType;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// Required-on-create per live schema NOT-NULL columns without DB defaults:
//   institution_id, site_name, hospital_code, address_line1, city, district,
//   pincode, latitude, longitude.
// All other fields are either NULLABLE or carry a DB default — modelled as
// optional so callers can omit them.
export type CreateExternalSiteInput = {
  institution_id: string;
  site_name: string;
  hospital_code: string;
  address_line1: string;
  city: string;
  district: string;
  pincode: string;
  latitude: number;
  longitude: number;
} & Partial<Omit<InternshipExternalSite,
  | 'id'
  | 'institution_id'
  | 'site_name'
  | 'hospital_code'
  | 'address_line1'
  | 'city'
  | 'district'
  | 'pincode'
  | 'latitude'
  | 'longitude'
  | 'created_at'
  | 'updated_at'
  | 'created_by'
  | 'updated_by'
>>;

export type UpdateExternalSiteInput = Partial<Omit<InternshipExternalSite,
  'id' | 'institution_id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
>>;

/** @deprecated Old aliases kept while consumers migrate; prefer the External-prefixed names. */
export type CreateSiteInput = CreateExternalSiteInput;
/** @deprecated */
export type UpdateSiteInput = UpdateExternalSiteInput;

// ---------------------------------------------------------------------------
// internship_site_contacts
// ---------------------------------------------------------------------------
export interface InternshipSiteContact {
  id: string;
  site_id: string;
  name: string;
  designation: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateSiteContactInput = Omit<InternshipSiteContact, 'id' | 'created_at' | 'updated_at'>;
export type UpdateSiteContactInput = Partial<Omit<InternshipSiteContact, 'id' | 'created_at' | 'updated_at'>>;

// ---------------------------------------------------------------------------
// internship_preceptors
// Live schema columns (substrate v3). Recovered types used name/phone/max_trainees
// which all renamed on shipped substrate. Reconciled 2026-05-10.
// ---------------------------------------------------------------------------
export type PreceptorScopeType = 'cycle' | 'site' | 'institution';

export interface InternshipPreceptor {
  id: string;
  institution_id: string;
  site_id: string;
  profile_id: string | null;
  full_name: string;
  designation: string | null;
  qualification: string | null;
  specialization: string | null;
  mobile: string | null;
  email: string | null;
  max_students: number;
  is_active: boolean;
  scope_type: PreceptorScopeType;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// Required-on-create per live schema NOT-NULL columns without defaults:
//   institution_id, site_id, full_name. Everything else has either NULL
//   or a DB default (max_students=6, is_active=true, scope_type='cycle').
export type CreatePreceptorInput = {
  institution_id: string;
  site_id: string;
  full_name: string;
} & Partial<Omit<InternshipPreceptor,
  | 'id'
  | 'institution_id'
  | 'site_id'
  | 'full_name'
  | 'created_at'
  | 'updated_at'
  | 'created_by'
  | 'updated_by'
>>;

export type UpdatePreceptorInput = Partial<Omit<InternshipPreceptor,
  'id' | 'institution_id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
>>;

// ---------------------------------------------------------------------------
// internship_incidents
// ---------------------------------------------------------------------------
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'under_review' | 'resolved' | 'closed';

export interface InternshipIncident {
  id: string;
  assignment_id: string;
  reported_by: string;
  incident_date: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateIncidentInput = Omit<InternshipIncident, 'id' | 'created_at' | 'updated_at'>;
export type UpdateIncidentInput = Partial<Omit<InternshipIncident, 'id' | 'created_at' | 'updated_at'>>;

// ---------------------------------------------------------------------------
// internship_certificates
// ---------------------------------------------------------------------------
export type CertificateStatus = 'pending' | 'issued' | 'revoked';

export interface InternshipCertificate {
  id: string;
  assignment_id: string;
  learner_id: string;
  issued_by: string | null;
  certificate_number: string | null;
  issued_date: string | null;
  status: CertificateStatus;
  file_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateCertificateInput = Omit<InternshipCertificate, 'id' | 'created_at' | 'updated_at'>;
export type UpdateCertificateInput = Partial<Omit<InternshipCertificate, 'id' | 'created_at' | 'updated_at'>>;

// ---------------------------------------------------------------------------
// internship_vehicles
// ---------------------------------------------------------------------------
export type VehicleStatus = 'available' | 'in_use' | 'maintenance' | 'retired';

export interface InternshipVehicle {
  id: string;
  institution_id: string;
  vehicle_number: string;
  vehicle_type: string | null;
  capacity: number | null;
  driver_name: string | null;
  driver_phone: string | null;
  status: VehicleStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateVehicleInput = Omit<InternshipVehicle, 'id' | 'created_at' | 'updated_at'>;
export type UpdateVehicleInput = Partial<Omit<InternshipVehicle, 'id' | 'created_at' | 'updated_at'>>;

// ---------------------------------------------------------------------------
// Policy / cascade preview types
// ---------------------------------------------------------------------------
export interface InternshipPolicyValue {
  key: string;
  value: string | null;
  college_id: string | null;
  source: 'global' | 'college_override';
  audit_trail: PolicyAuditEntry[];
}

export interface PolicyAuditEntry {
  level: string;
  value: string | null;
  applied: boolean;
}

export interface CascadePreviewChange {
  key: string;
  new_value: string;
  college_id?: string;
}

export interface CascadePreviewResult {
  consequences: string[];
  affected_rows: number | null;
}

// ---------------------------------------------------------------------------
// Admin policy types (for lib/services/admin/internship-policy-service.ts)
// ---------------------------------------------------------------------------
export interface InternshipPolicyRow {
  key: string;
  value: string | null;
  description: string | null;
  college_id: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface InternshipCollegeNotificationOverride {
  id: string;
  college_id: string;
  key: string;
  value: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface InternshipConfigTableInfo {
  table_name: string;
  row_count: number;
}
