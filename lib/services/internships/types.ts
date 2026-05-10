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
// internship_external_sites
// ---------------------------------------------------------------------------
export type SiteType = 'hospital' | 'clinic' | 'community' | 'industry' | 'other';

export interface InternshipExternalSite {
  id: string;
  institution_id: string;
  name: string;
  site_type: SiteType;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  mou_signed: boolean;
  mou_expiry_date: string | null;
  capacity: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateSiteInput = Omit<InternshipExternalSite, 'id' | 'created_at' | 'updated_at'>;
export type UpdateSiteInput = Partial<Omit<InternshipExternalSite, 'id' | 'created_at' | 'updated_at'>>;

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
// ---------------------------------------------------------------------------
export interface InternshipPreceptor {
  id: string;
  site_id: string;
  name: string;
  qualification: string | null;
  specialization: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  max_trainees: number | null;
  created_at: string;
  updated_at: string;
}

export type CreatePreceptorInput = Omit<InternshipPreceptor, 'id' | 'created_at' | 'updated_at'>;
export type UpdatePreceptorInput = Partial<Omit<InternshipPreceptor, 'id' | 'created_at' | 'updated_at'>>;

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
