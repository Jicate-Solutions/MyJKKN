// types/admission.ts
// Types for the Admission Management module
// Only includes types actively used by existing features

// ═══════════════════════════════════════════════════════════════════════════
// ENUMS & UNION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type LeadSource =
  | 'website'
  | 'admission_form'
  | 'walk_in'
  | 'referral'
  | 'social_media'
  | 'newspaper'
  | 'education_fair'
  | 'agent'
  | 'publisher'
  | 'google_ads'
  | 'facebook_ads'
  | 'gate_entry'
  | 'other';

/**
 * Gate Entry capture input — used by the kiosk form at /admission/gate-entry.
 * The DB-level lead.source stays 'walk_in' (the channel category); the per-touch
 * source on the source-capture row is 'gate_entry' (the specific touch).
 */
export interface GateEntryInput {
  first_name: string;
  phone: string;
  institution_id: string;
  last_name?: string | null;
  program_id?: string | null;
  /** UI radio: 'walk_in' = direct, 'referral' = show consultant picker. */
  source: 'walk_in' | 'referral';
  /** Only when source='referral' and a referrer was picked. */
  referral_type?: ReferralType | null;
  referred_by_id?: string | null;
  /** Free-text fallback when the referrer wasn't in the consultant list. */
  referred_by_name?: string | null;
}

/**
 * Return shape from capture_gate_entry_lead RPC. Mirrors capture_admission_lead
 * — `action: 'merged'` indicates a returning visitor (existing lead row was
 * reused; the gate UI shows "Welcome back").
 */
export interface GateEntryResult {
  lead_id: string;
  capture_id: string;
  action: 'created' | 'merged';
  reactivated?: boolean;
}

export type FunnelStage =
  | 'new'
  | 'contacted'
  | 'not_reachable'
  | 'interested'
  | 'follow_up_scheduled'
  | 'engaged'
  | 'qualified'
  | 'application_started'
  | 'application_submitted'
  | 'documents_pending'
  | 'documents_verified'
  | 'interview_scheduled'
  | 'interview_completed'
  | 'offer_sent'
  | 'offer_accepted'
  | 'token_paid'
  | 'applied'
  | 'interviewed'
  | 'offered'
  | 'enrolled'
  | 'confirmed'
  | 'declined'
  | 'withdrew'
  | 'expired'
  | 'lost'
  | 'dormant';

export type ReferralType = 'consultant' | 'student' | 'faculty' | 'learner_ambassador';

export type LeadPriority = 'hot' | 'warm' | 'cold';

export type Gender = 'male' | 'female' | 'other';

export type DocumentType =
  | 'photo'
  | 'id_proof'
  | 'address_proof'
  | 'marksheet_10th'
  | 'marksheet_12th'
  | 'degree_certificate'
  | 'transfer_certificate'
  | 'migration_certificate'
  | 'income_certificate'
  | 'caste_certificate'
  | 'medical_certificate'
  | 'other';

export type DocumentStatus = 'pending' | 'approved' | 'rejected' | 'reupload_requested';

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'documents_pending'
  | 'approved'
  | 'rejected'
  | 'waitlisted'
  | 'offer_sent'
  | 'offer_accepted'
  | 'enrolled'
  | 'withdrawn';

export type TemplateType = 'sms' | 'email' | 'whatsapp';

// ═══════════════════════════════════════════════════════════════════════════
// LEAD MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface AdmissionLead {
  id: string;
  institution_id: string;
  first_name: string;
  last_name: string | null;
  // Generated column (computed in DB as first_name + ' ' + last_name)
  // Still present on SELECT results — do not write this field on INSERT/UPDATE
  readonly full_name: string;
  email: string | null;
  phone: string;
  // Personal details
  alternate_phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  district: string | null;
  pincode: string | null;

  // Academic details
  // DEPRECATED 2026-04-21 — replaced by program_id (primary) + alternative_programs.
  // Kept for 350 historical rows' read-path fallback.
  interested_programs: string[] | null;
  // Resolved program names for legacy `interested_programs` IDs.
  interested_program_names?: string[];
  // 2026-04-21 — alternative / backup programs the lead is considering
  alternative_programs: string[] | null;
  alternative_program_names?: string[];
  preferred_campus: string | null;
  // DEPRECATED 2026-04-21 — replaced by admission_year_id. Kept on the type
  // for backward compat with reads against historical rows (319 existing).
  academic_year: string | null;
  // 2026-04-21 — FK to admission_years (per-program cohort window)
  admission_year_id: string | null;
  admission_year?: {
    id: string;
    admission_year_name: string;
    program_start_year: number;
    program_end_year: number;
  } | null;

  // Application fields (merged from admission_applications)
  degree_id?: string | null;
  department_id?: string | null;
  program_id?: string | null;
  program?: { id: string; program_name: string } | null;
  application_number?: string | null;

  // Source & Attribution
  source: LeadSource;
  referral_type: ReferralType | null;
  referred_by_id: string | null;
  referred_by_name: string | null;

  // Expo Bridge — links lead to exhibition event + team member who captured it
  expo_event_id: string | null;
  captured_by: string | null;
  // BUG-003146: stall attribution (optional, nullable for legacy + non-expo leads)
  stall_id: string | null;

  // Status & Scoring
  funnel_stage: FunnelStage;
  is_hot_lead: boolean;
  is_priority: boolean;
  // Virtual/computed field: populated by LeadService.normalizeLead() from is_hot_lead/is_priority
  priority: LeadPriority;
  score: number;
  score_category: string | null;
  score_updated_at: string | null;
  engagement_score: number | null;
  quality_score: number | null;
  combined_score: number | null;
  score_breakdown: Record<string, unknown> | null;
  conversion_probability: number | null;

  // JKKN Tier-1 fields
  student_interest_level: string | null;
  parent_decision_status: string | null;

  // Assignment
  counselor_id: string | null;
  assigned_at: string | null;
  assigned_counselor_id: string | null;
  ownership_mode: string | null;
  last_contact_at: string | null;
  next_followup_at: string | null;
  last_activity_at: string | null;

  // Communication
  preferred_channel: string | null;
  total_messages_sent: number | null;
  messages_this_week: number | null;
  last_message_at: string | null;

  // Parent/Guardian
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  parent_opted_in: boolean | null;

  // Notes
  notes: string | null;

  // Metadata
  learner_profile_id: string | null;
  tags: string[];
  is_active: boolean;
  is_dormant: boolean | null;
  dormant_at: string | null;
  is_lost: boolean | null;
  lost_reason: string | null;
  lost_at: string | null;
  entry_date: string | null;
  // BUG-003222: captured at expo rapid-capture (e.g. "Biology",
  // "Computer Science", "Commerce"). Free-text so counselors can segment
  // leads by 12th stream without being boxed into a pre-defined list.
  twelfth_group: string | null;
  stage: string | null;
  stage_changed_at: string | null;
  previous_stage: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;

  // Gate Entry (2026-05-07) — denormalized columns maintained by trigger on
  // admission_lead_source_captures with source='gate_entry'. See migration
  // 20260507100017. first_* preserves the *earliest* visit; count is total.
  first_gate_entry_at?: string | null;
  first_gate_entry_by?: string | null;
  gate_entry_count?: number;

  // Relationships (optional populated)
  counselor?: Counselor;
  institution?: { id: string; name: string } | null;
}

export interface CreateLeadInput {
  institution_id: string;
  first_name: string;
  last_name?: string | null;
  phone: string;
  email?: string | null;
  alternate_phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  district?: string | null;
  pincode?: string | null;
  // Primary interested program (single). Already existed on the DB; now surfaced through the UI.
  program_id?: string | null;
  // Backup / alternative programs (multi). Replaces the legacy `interested_programs` multi-select.
  alternative_programs?: string[] | null;
  preferred_campus?: string | null;
  admission_year_id?: string | null;
  source: LeadSource;
  referral_type?: ReferralType | null;
  referred_by_id?: string | null;
  referred_by_name?: string | null;
  tags?: string[];
  counselor_id?: string | null;
  preferred_channel?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_email?: string | null;
  entry_date?: string | null;
  // BUG-003222: 12th group / stream captured at expo
  twelfth_group?: string | null;
  notes?: string | null;
  // JKKN Tier-1 fields
  student_interest_level?: string | null;
  parent_decision_status?: string | null;
  // Expo Bridge — optional, set when lead is captured at an exhibition event
  expo_event_id?: string | null;
  captured_by?: string | null;
  // BUG-003146: stall attribution — set when lead is captured at a specific stall
  stall_id?: string | null;
  // Expo visit classification — 'expo_visit' (main floor) | 'stall_visit' (at our stall)
  visit_type?: 'expo_visit' | 'stall_visit' | null;
  // WhatsApp consent — set during lead capture when visitor opts in
  wa_opt_in?: boolean;
  wa_opt_in_source?: string | null;
}

export interface UpdateLeadInput extends Partial<CreateLeadInput> {
  id: string;
  funnel_stage?: FunnelStage;
  is_hot_lead?: boolean;
  is_priority?: boolean;
  counselor_id?: string | null;
  next_followup_at?: string | null;
  last_contact_at?: string | null;
  student_interest_level?: string | null;
  parent_decision_status?: string | null;
  admission_year_id?: string | null;
}

// ─── Multi-source capture (added 2026-04-27) ────────────────────────────────
// Append-only history of every source-channel touch on a lead. The lead
// row's primary `source` field stays singular (first capture wins); the
// captures table records the full timeline.
export interface LeadSourceCapture {
  id: string;
  lead_id: string;
  institution_id: string;
  source: LeadSource;
  source_detail: string | null;
  captured_at: string;
  captured_by: string | null;
  expo_event_id: string | null;
  stall_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer_id: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
}

// Optional override fields for the capture row itself. Most callers will
// pass nothing — the RPC defaults to the lead's source/captured_by/expo_event_id.
export interface CaptureMetaInput {
  source?: LeadSource;
  source_detail?: string | null;
  captured_at?: string | null;
  captured_by?: string | null;
  expo_event_id?: string | null;
  stall_id?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer_id?: string | null;
  raw_payload?: Record<string, unknown> | null;
}

export type CaptureAction = 'created' | 'merged';

export interface CaptureLeadResult {
  lead: AdmissionLead;
  action: CaptureAction;
  reactivated: boolean;
  capture_id: string;
}

export interface LeadFilters {
  search?: string;
  institution_id?: string;
  funnel_stage?: FunnelStage | FunnelStage[];
  // Service layer maps priority to is_hot_lead/is_priority booleans
  priority?: LeadPriority | LeadPriority[];
  source?: LeadSource | LeadSource[];
  counselor_id?: string;
  interested_programs?: string;
  // Course/Program tab filter — matches rows whose interested_programs
  // uuid[] column contains this program_id.
  program_id?: string;
  // Expo Bridge — filter leads by exhibition event
  expo_event_id?: string;
  captured_by?: string;
  date_from?: string;
  date_to?: string;
  is_hot_lead?: boolean;
  is_priority?: boolean;
  // Stale filter — show leads with no contact in N+ days, falling back to
  // last_activity_at / created_at when last_contact_at is null. Driven by
  // ?stale_min_days=N on /admission/leads (e.g. dashboard:rescue digest deep-link).
  stale_min_days?: number;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface LeadListResponse {
  data: AdmissionLead[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COUNSELORS
// ═══════════════════════════════════════════════════════════════════════════

export interface Counselor {
  id: string;
  user_id: string | null;
  institution_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  is_active: boolean | null;
  created_at: string | null;

  // Performance metrics (optional, joined from separate table)
  performance?: CounselorPerformance;
}

export interface CounselorPerformance {
  counselor_id: string;
  period: string;
  total_leads: number;
  contacted_leads: number;
  converted_leads: number;
  conversion_rate: number;
  avg_response_time: number;
  avg_followup_count: number;
  rating: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// APPLICATIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface AdmissionApplication {
  id: string;
  institution_id: string;
  lead_id: string;
  application_number: string;
  status: ApplicationStatus;
  program_id: string;
  batch_id: string | null;

  // Personal details (may differ from lead)
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  gender: Gender | null;

  // Address
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;

  // Academic
  previous_qualification: string | null;
  percentage: number | null;
  board: string | null;
  passing_year: number | null;

  // Parent/Guardian
  father_name: string | null;
  mother_name: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;

  // Fees
  total_fees: number | null;
  paid_amount: number | null;
  discount_amount: number | null;
  scholarship_amount: number | null;

  // Metadata
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;

  // Relationships
  lead?: AdmissionLead;
  documents?: ApplicationDocument[];

  // Extended admission fields (from database)
  religion?: string | null;
  community?: string | null;
  first_graduate?: boolean | null;
  entry_type?: string | null;
  application_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  student_email?: string | null;
  student_mobile?: string | null;
  tenth_percentage?: number | null;
  twelfth_percentage?: number | null;
  neet_score?: number | string | null;
  reference_source?: string | null;
  reference_type?: string | null;
  counsellor_id?: string | null;
  [key: string]: any; // Allow additional fields
}

export interface CreateApplicationInput {
  lead_id: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
}

export interface UpdateApplicationInput extends Partial<CreateApplicationInput> {
  id: string;
  funnel_stage?: FunnelStage;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════

export interface ApplicationDocument {
  id: string;
  application_id: string;
  document_type: DocumentType;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  status: DocumentStatus;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD ANALYTICS (used by admission-ai-service)
// ═══════════════════════════════════════════════════════════════════════════

export interface AdmissionDashboardAnalytics {
  overview: {
    combinedTotal: number;
    totalAdmissions: number;
    totalStudents: number;
    onboarded: number;
    onboardingRate: number;
    directStudents: number;
    pending: number;
    approved: number;
    rejected: number;
    waitlisted: number;
    enrolled: number;
    conversionRate: number;
    avgProcessingDays: number;
  };
  statusBreakdown: {
    admissionStatuses: { status: string; count: number; percentage: number }[];
    studentStatuses: { status: string; count: number; percentage: number }[];
    totalAdmissions: number;
    totalStudents: number;
  };
  demographics: {
    gender: { label: string; count: number }[];
    religion: { label: string; count: number }[];
    community: { label: string; count: number }[];
    firstGraduate: { label: string; count: number }[];
  };
  academicPerformance: {
    tenthMarksDistribution: { range: string; count: number }[];
    twelfthMarksDistribution: { range: string; count: number }[];
    neetScoreDistribution: { range: string; count: number }[];
    averageMarks: {
      tenth: number;
      twelfth: number;
      neet: number | null;
    };
  };
  institutionDistribution: {
    institutions: { name: string; count: number; percentage: number }[];
    degrees: { name: string; count: number }[];
    departments: { name: string; count: number }[];
    programs: { name: string; count: number }[];
  };
  geographic: {
    states: { state: string; count: number }[];
    districts: { district: string; count: number }[];
  };
  referenceSources: {
    type: string;
    count: number;
    percentage: number;
  }[];
  timeTrends: {
    daily: { date: string; count: number; approved: number; rejected: number }[];
    monthly: { month: string; count: number }[];
    peakPeriods: { period: string; count: number }[];
  };
  metadata: {
    totalRecords: number;
    dateRange: {
      from: string;
      to: string;
    };
    lastUpdated: string;
  };
}

export interface AdmissionAIInsights {
  summary: string;
  generatedAt: string;
  keyFindings: {
    title: string;
    description: string;
    severity: 'critical' | 'warning' | 'info' | 'success';
  }[];
  recommendations: {
    category: string;
    priority: 'high' | 'medium' | 'low';
    insight: string;
    action: string;
    expectedImpact: string;
    implementationSteps: string[];
  }[];
  predictions: {
    metric: string;
    prediction: string;
    confidence: 'high' | 'medium' | 'low';
    timeline: string;
    reasoning: string;
  }[];
  trends: {
    trend: string;
    direction: 'up' | 'down' | 'stable';
    impact: string;
    significance: 'high' | 'medium' | 'low';
  }[];
  riskAssessment: {
    risk: string;
    severity: 'high' | 'medium' | 'low';
    likelihood: 'high' | 'medium' | 'low';
    mitigation: string;
  }[];
  opportunities: {
    opportunity: string;
    potential: 'high' | 'medium' | 'low';
    actionPlan: string;
  }[];
  competitiveInsights: {
    insight: string;
    comparison: string;
    recommendation: string;
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPOS (Education Fairs & Exhibition Events)
// ═══════════════════════════════════════════════════════════════════════════

export type ExpoEventStatus = 'planned' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type ExpoFrequency = 'annual' | 'biannual' | 'quarterly' | 'one_time';
export type ExpoTeamMemberType = 'staff' | 'student' | 'external';
export type ExpoTeamMemberRole = 'team_leader' | 'counselor' | 'volunteer' | 'support';
export type TravelMode = 'bus' | 'train' | 'flight' | 'own_vehicle' | 'other';

// ─── Expo Master (Reusable Event Catalog) ─────────────────────────────────

export interface ExpoMaster {
  id: string;
  institution_id: string | null;
  event_name: string;
  organizer_name: string | null;
  city: string | null;
  venue_name: string | null;
  description: string | null;
  frequency: ExpoFrequency | null;
  tags: string[] | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpoMasterInput {
  institution_id?: string | null;
  event_name: string;
  organizer_name?: string;
  city?: string;
  venue_name?: string;
  description?: string;
  frequency?: ExpoFrequency;
  tags?: string[];
}

export interface UpdateExpoMasterInput {
  event_name?: string;
  organizer_name?: string;
  city?: string;
  venue_name?: string;
  description?: string;
  frequency?: ExpoFrequency;
  tags?: string[];
  is_active?: boolean;
}

export interface ExpoMasterFilters {
  institution_id?: string;
  search?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

// ─── Expo Event (Specific Instance) ───────────────────────────────────────

export interface ExpoEvent {
  id: string;
  institution_id: string | null;
  expo_master_id: string | null;
  expo_master?: ExpoMaster | null;
  event_name: string;
  organizer_name: string | null;
  city: string;
  venue_name: string | null;
  start_date: string;
  end_date: string;
  travel_mode: TravelMode | null;
  accommodation_details: string | null;
  team_leader_id: string | null;
  team_leader?: { id: string; full_name: string } | null;
  approved_by_id: string | null;
  approved_by?: { id: string; full_name: string } | null;
  event_status: ExpoEventStatus;
  notes: string | null;
  total_team_members: number;
  total_expenses: number;
  total_leads_collected: number;
  wa_channel_preference: 'personal' | 'meta_waba' | 'both' | 'none';
  wa_personal_template_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  team_members?: ExpoEventTeamMember[];
  daily_reports?: ExpoDailyReport[];
}

export interface CreateExpoEventInput {
  institution_id?: string | null;
  expo_master_id?: string;
  event_name: string;
  organizer_name?: string;
  city: string;
  venue_name?: string;
  start_date: string;
  end_date: string;
  travel_mode?: TravelMode;
  accommodation_details?: string;
  team_leader_id?: string;
  approved_by_id?: string;
  event_status?: ExpoEventStatus;
  notes?: string;
  wa_channel_preference?: 'personal' | 'meta_waba' | 'both' | 'none';
  wa_personal_template_id?: string;
  team_members?: CreateExpoTeamMemberInput[];
}

export interface UpdateExpoEventInput {
  event_name?: string;
  organizer_name?: string;
  city?: string;
  venue_name?: string;
  start_date?: string;
  end_date?: string;
  travel_mode?: TravelMode;
  accommodation_details?: string;
  team_leader_id?: string;
  approved_by_id?: string;
  event_status?: ExpoEventStatus;
  notes?: string;
  wa_channel_preference?: 'personal' | 'meta_waba' | 'both' | 'none';
  wa_personal_template_id?: string | null;
}

export interface ExpoEventFilters {
  institution_id?: string;
  status?: ExpoEventStatus;
  city?: string;
  date_from?: string;
  date_to?: string;
  expo_master_id?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  /** Filter to specific event IDs (used for team member scoped view) */
  event_ids?: string[];
}

export interface ExpoEventListResponse {
  data: ExpoEvent[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ─── Team Members ─────────────────────────────────────────────────────────

export interface ExpoEventTeamMember {
  id: string;
  expo_event_id: string;
  member_type: ExpoTeamMemberType;
  staff_id: string | null;
  student_id: string | null;
  name: string;
  phone: string | null;
  role: ExpoTeamMemberRole;
  created_at: string;
}

export interface CreateExpoTeamMemberInput {
  member_type: ExpoTeamMemberType;
  staff_id?: string;
  student_id?: string;
  name: string;
  phone?: string;
  role: ExpoTeamMemberRole;
}

// ─── Daily Reports ────────────────────────────────────────────────────────

export interface ExpoDailyReport {
  id: string;
  expo_event_id: string;
  institution_id: string | null;
  report_date: string;
  stall_fee: number;
  travel_expense: number;
  accommodation_expense: number;
  food_expense: number;
  printing_materials: number;
  miscellaneous_expense: number;
  total_expense: number;
  total_visitors: number;
  counselling_done: number;
  brochures_distributed: number;
  interested_students: number;
  leads_collected: number;
  stall_photos: string[];
  event_photos: string[];
  visitor_photos: string[];
  notes: string | null;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDailyReportInput {
  expo_event_id: string;
  institution_id?: string | null;
  report_date: string;
  stall_fee?: number;
  travel_expense?: number;
  accommodation_expense?: number;
  food_expense?: number;
  printing_materials?: number;
  miscellaneous_expense?: number;
  total_visitors?: number;
  counselling_done?: number;
  brochures_distributed?: number;
  interested_students?: number;
  leads_collected?: number;
  stall_photos?: string[];
  event_photos?: string[];
  visitor_photos?: string[];
  notes?: string;
}

export interface UpdateDailyReportInput {
  stall_fee?: number;
  travel_expense?: number;
  accommodation_expense?: number;
  food_expense?: number;
  printing_materials?: number;
  miscellaneous_expense?: number;
  total_visitors?: number;
  counselling_done?: number;
  brochures_distributed?: number;
  interested_students?: number;
  leads_collected?: number;
  stall_photos?: string[];
  event_photos?: string[];
  visitor_photos?: string[];
  notes?: string;
}

// ─── Analytics ────────────────────────────────────────────────────────────

export interface ExpoSummaryStats {
  total_expos: number;
  active_expos: number;
  total_leads: number;
  total_expenses: number;
  avg_cost_per_lead: number;
  total_visitors: number;
  conversion_rate: number;
}

export interface ExpoExpenseBreakdown {
  category: string;
  amount: number;
  percentage: number;
}

export interface ExpoLeadFunnel {
  total_visitors: number;
  counselling_done: number;
  interested_students: number;
  leads_collected: number;
}

export interface ExpoComparisonItem {
  id: string;
  event_name: string;
  city: string;
  total_leads: number;
  total_expenses: number;
  total_visitors: number;
  cost_per_lead: number;
  conversion_rate: number;
}

export interface ExpoTeamPerformanceItem {
  member_name: string;
  role: string;
  leads_attributed: number;
  days_present: number;
}

export interface ExpoDailyTrend {
  date: string;
  visitors: number;
  leads: number;
  expense: number;
  counselling: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// MARKETING LEADS DATABASE
// ═══════════════════════════════════════════════════════════════════════════

export interface MarketingLeadDatabase {
  id: string;
  institution_id: string;
  district: string | null;
  sub_district: string | null;
  student_name: string;
  father_name: string | null;
  gender: string | null;
  community: string | null;
  mobile_number: string | null;
  group_detail: string | null;
  address: string | null;
  pincode: string | null;
  school_name: string | null;
  upload_batch_id: string;
  uploaded_by: string | null;
  upload_file_name: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface MarketingLeadDatabaseFilters {
  search?: string;
  institution_id?: string;
  district?: string;
  gender?: string;
  school_name?: string;
  upload_batch_id?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface MarketingLeadDatabaseListResponse {
  data: MarketingLeadDatabase[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface BulkLeadUploadResult {
  success: boolean;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  inserted: number;
  failed: number;
  errors: Array<{ row: number; field?: string; message: string }>;
  upload_batch_id: string;
}

export interface UploadBatch {
  upload_batch_id: string;
  upload_file_name: string | null;
  uploaded_by: string | null;
  created_at: string;
  total_records: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// GD-PI (GROUP DISCUSSION & PERSONAL INTERVIEW)
// ═══════════════════════════════════════════════════════════════════════════

export type GDPISessionType = 'gd' | 'pi' | 'gd_pi';
export type GDPISessionStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type GDPICandidateStatus = 'registered' | 'present' | 'absent' | 'evaluated' | 'disqualified';
export type GDPIRecommendation = 'strongly_recommend' | 'recommend' | 'consider' | 'not_recommend';

export interface GDPIScoringCriterion {
  name: string;
  max_score: number;
  weight: number;
  description?: string;
}

export interface GDPISession {
  id: string;
  institution_id: string;
  session_name: string;
  session_type: GDPISessionType;
  status: GDPISessionStatus;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  program_ids: string[];
  max_candidates: number;
  scoring_criteria: GDPIScoringCriterion[];
  notes: string | null;
  academic_year: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  candidates_count?: number;
  evaluators_count?: number;
  evaluated_count?: number;
}

export interface GDPICandidate {
  id: string;
  session_id: string;
  lead_id: string;
  institution_id: string;
  status: GDPICandidateStatus;
  total_score: number;
  max_possible_score: number;
  percentage: number;
  rank: number | null;
  attendance_marked_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined lead fields
  lead?: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    funnel_stage: string;
    score: number;
    source: string | null;
  };
  // Joined scores
  scores?: GDPIScore[];
}

export interface GDPIEvaluator {
  id: string;
  session_id: string;
  evaluator_id: string;
  institution_id: string;
  is_lead_evaluator: boolean;
  evaluation_count: number;
  created_at: string;
  // Joined profile
  evaluator?: {
    id: string;
    full_name: string;
    email: string | null;
    role: string;
  };
}

export interface GDPIScore {
  id: string;
  session_id: string;
  candidate_id: string;
  evaluator_id: string;
  institution_id: string;
  scores: Record<string, number>;
  total_score: number;
  max_possible_score: number;
  recommendation: GDPIRecommendation | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  evaluator?: {
    id: string;
    full_name: string;
  };
}

export interface GDPISessionDetail extends GDPISession {
  candidates: GDPICandidate[];
  evaluators: GDPIEvaluator[];
}

export interface CreateGDPISessionInput {
  session_name: string;
  session_type: GDPISessionType;
  scheduled_date: string;
  start_time?: string;
  end_time?: string;
  venue?: string;
  program_ids?: string[];
  max_candidates?: number;
  scoring_criteria: GDPIScoringCriterion[];
  notes?: string;
  academic_year?: string;
}

export interface SubmitGDPIScoreInput {
  candidate_id: string;
  scores: Record<string, number>;
  recommendation?: GDPIRecommendation;
  feedback?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM BUILDER TYPES (Added 2026-04-08)
// ═══════════════════════════════════════════════════════════════════════════

export type FormFieldType =
  | 'text'
  | 'number'
  | 'phone'
  | 'email'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'textarea'
  | 'file'
  | 'checkbox'
  | 'radio'
  | 'institution_program_selector';

export type FormStatus = 'draft' | 'published' | 'archived';

export type FormEventType =
  | 'form_viewed'
  | 'form_started'
  | 'field_focused'
  | 'field_completed'
  | 'form_submitted'
  | 'form_abandoned';

export interface FormFieldCondition {
  field: string; // field_key of the dependent field
  op: 'eq' | 'neq' | 'contains' | 'not_empty' | 'empty' | 'program_category';
  value: string;
}

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface AdmissionFormField {
  id: string;
  form_id: string;
  section_id: string | null;
  field_key: string;
  field_label: string;
  field_type: FormFieldType;
  placeholder: string | null;
  help_text: string | null;
  is_required: boolean;
  display_order: number;
  min_length: number | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  pattern: string | null;
  options: FormFieldOption[] | null;
  condition: FormFieldCondition | null;
  lead_field_map: string | null;
  created_at: string;
}

export interface AdmissionFormSection {
  id: string;
  form_id: string;
  title: string;
  description: string | null;
  display_order: number;
  is_collapsible: boolean;
  condition: FormFieldCondition | null;
  created_at: string;
  fields?: AdmissionFormField[];
}

export interface AdmissionForm {
  id: string;
  institution_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: FormStatus;
  form_type: string;
  institution_ids: string[];
  program_ids: string[];
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string;
  thank_you_title: string;
  thank_you_message: string;
  is_active: boolean;
  allow_duplicate: boolean;
  auto_whatsapp: boolean;
  wa_template_id: string | null;
  max_submissions: number | null;
  starts_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sections?: AdmissionFormSection[];
}

export interface CreateAdmissionFormInput {
  institution_id: string;
  name: string;
  slug: string;
  description?: string | null;
  form_type?: string;
  institution_ids?: string[];
  program_ids?: string[];
  logo_url?: string | null;
  banner_url?: string | null;
  primary_color?: string;
  thank_you_title?: string;
  thank_you_message?: string;
  allow_duplicate?: boolean;
  auto_whatsapp?: boolean;
  wa_template_id?: string | null;
  max_submissions?: number | null;
  starts_at?: string | null;
  expires_at?: string | null;
}

export interface AdmissionFormSubmission {
  id: string;
  form_id: string;
  lead_id: string | null;
  institution_id: string | null;
  submission_data: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer_url: string | null;
  device_type: string | null;
  submitted_at: string;
}

export interface AdmissionFormEvent {
  id: string;
  form_id: string;
  event_type: FormEventType;
  field_key: string | null;
  session_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdmissionFormTemplate {
  id: string;
  name: string;
  description: string | null;
  form_type: string;
  template_data: {
    sections: Array<{
      title: string;
      description?: string;
      fields: Array<Omit<AdmissionFormField, 'id' | 'form_id' | 'section_id' | 'created_at'>>;
    }>;
  };
  is_system: boolean;
  created_at: string;
}

// Analytics aggregation types
export interface FormAnalyticsSummary {
  form_id: string;
  total_views: number;
  total_starts: number;
  total_submissions: number;
  view_to_start_rate: number;
  start_to_submit_rate: number;
  overall_conversion_rate: number;
  avg_completion_time_seconds: number | null;
  submissions_today: number;
  submissions_this_week: number;
}

export interface FieldDropOff {
  field_key: string;
  field_label: string;
  started: number;
  completed: number;
  drop_off_rate: number;
}

export interface FormTrafficSource {
  source: string;
  count: number;
  percentage: number;
}

export interface FormDeviceBreakdown {
  device_type: string;
  count: number;
  percentage: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMISSION YEARS (Settings → Admission Years)
// Added: 2026-04-21 — per-program admission year metadata
// ═══════════════════════════════════════════════════════════════════════════

export interface AdmissionYear {
  id: string;
  institution_id: string;
  program_id: string;
  admission_year_name: string;
  program_start_year: number;
  program_end_year: number;
  sanctioned_intake: number;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  program?: {
    id: string;
    program_id: string;
    program_name: string;
    program_duration_yrs?: number | null;
  };
}

export interface CreateAdmissionYearDto {
  institution_id: string;
  program_id: string;
  admission_year_name: string;
  program_start_year: number;
  program_end_year: number;
  sanctioned_intake?: number;
  is_active?: boolean;
}

export interface UpdateAdmissionYearDto extends Partial<CreateAdmissionYearDto> {}

export interface AdmissionYearFilters {
  search?: string;
  institution_id?: string;
  program_id?: string;
  program_start_year?: number;
  isActive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AdmissionYearListResponse {
  data: AdmissionYear[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BUG-003146: Expo event stalls — per-stall accountability + operations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single promotional material carried/distributed at a stall.
 * e.g., { name: "Brochure - Engineering", quantity: 200, notes: "A4, colour" }
 */
export interface PromotionalMaterial {
  name: string;
  quantity: number;
  notes?: string;
}

/**
 * A stall staffed by a specific team at an expo event. JKKN frequently runs
 * MULTIPLE stalls at the same event (Engineering + Nursing + Dental etc).
 * Each stall has its own staff accountability, expenses, photos, materials.
 */
export interface ExpoEventStall {
  id: string;
  expo_event_id: string;
  institution_id: string;
  stall_name: string;
  assigned_staff_id: string | null;
  /** Optional joined profile for display */
  assigned_staff?: { id: string; full_name: string } | null;
  total_expenses: number;
  photos: string[];
  promotional_materials: PromotionalMaterial[];
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpoStallInput {
  expo_event_id: string;
  institution_id: string;
  stall_name: string;
  assigned_staff_id?: string | null;
  total_expenses?: number;
  photos?: string[];
  promotional_materials?: PromotionalMaterial[];
  notes?: string | null;
}

export interface UpdateExpoStallInput {
  stall_name?: string;
  institution_id?: string;
  assigned_staff_id?: string | null;
  total_expenses?: number;
  photos?: string[];
  promotional_materials?: PromotionalMaterial[];
  notes?: string | null;
}

// ============================================================================
// Admission Fee Structure module — Foundation types
// ============================================================================
// Spec: docs/superpowers/specs/2026-05-05-admission-fee-structure-automation-design.md §6.1, §6.6
// Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-01-foundation.md Task 7
//
// NOTE: Names are prefixed with `AdmissionFee` because `Quota` and
// `AccommodationType` are already exported from
// `lib/constants/learner-dropdown-values.ts` (TEXT-union legacy values).
// Tasks 8 and 9 must reference these prefixed names accordingly.

export interface AdmissionFeeQuota {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type CreateAdmissionFeeQuotaInput = Pick<AdmissionFeeQuota, 'code' | 'name'> & Partial<Pick<AdmissionFeeQuota, 'sort_order' | 'is_active'>>;
export type UpdateAdmissionFeeQuotaInput = Partial<Pick<AdmissionFeeQuota, 'code' | 'name' | 'sort_order' | 'is_active'>>;

export interface AdmissionFeeCommunityCategory {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type CreateAdmissionFeeCommunityCategoryInput = Pick<AdmissionFeeCommunityCategory, 'code' | 'name'> &
  Partial<Pick<AdmissionFeeCommunityCategory, 'sort_order' | 'is_active'>>;
export type UpdateAdmissionFeeCommunityCategoryInput = Partial<Pick<AdmissionFeeCommunityCategory, 'code' | 'name' | 'sort_order' | 'is_active'>>;

export interface AdmissionFeeAccommodationType {
  id: string;
  institution_id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type CreateAdmissionFeeAccommodationTypeInput = Pick<AdmissionFeeAccommodationType, 'institution_id' | 'code' | 'name'> &
  Partial<Pick<AdmissionFeeAccommodationType, 'sort_order' | 'is_active'>>;
export type UpdateAdmissionFeeAccommodationTypeInput = Partial<
  Pick<AdmissionFeeAccommodationType, 'code' | 'name' | 'sort_order' | 'is_active'>
>;

export interface AdmissionFeeAdmissionSettingsPerInstitution {
  id: string;
  institution_id: string;
  use_fee_structures: boolean;
  required_documents_for_account_transition: string[];
  pre_submit_dialog_enabled: boolean;
  status_change_dialog_enabled: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type UpsertAdmissionFeeAdmissionSettingsInput = Partial<
  Pick<
    AdmissionFeeAdmissionSettingsPerInstitution,
    | 'use_fee_structures'
    | 'required_documents_for_account_transition'
    | 'pre_submit_dialog_enabled'
    | 'status_change_dialog_enabled'
  >
> & {
  institution_id: string;
};


// ============================================================================
// Admission Fee Structure module — Plan 2 types
// ============================================================================
// Spec: §6.2
// Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-02-fee-structure-module.md Task 5

export type AdmissionFeeStructureStatus = 'draft' | 'active' | 'archived';

export interface AdmissionFeeStructure {
  id: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  programme_id: string;
  quota_id: string;
  // Communities live in the admission_fee_structure_communities junction
  // (migration 20260507120001). One structure → N communities. The list is
  // surfaced on read shapes via `community_category_ids`. No single-community
  // FK lives on this table any more.
  accommodation_type_id: string;
  admission_year_id: string;
  name: string;
  status: AdmissionFeeStructureStatus;
  notes: string | null;
  // Date-bounded applicability within an admission year. NULL on either
  // side means "no specific bound" (always applicable from start / until
  // end). Resolution RPC picks the latest effective_from that contains
  // today's date when multiple structures overlap.
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  /**
   * Communities this structure applies to (from the junction table).
   * Always populated by the read-side service queries; non-null & may be
   * empty if the structure is mid-creation.
   */
  community_category_ids: string[];
}

export interface AdmissionFeeStructureItem {
  id: string;
  fee_structure_id: string;
  billing_category_id: string;
  amount: number;
  is_optional: boolean;
  sort_order: number;
}

export interface AdmissionFeeStructureWithItems extends AdmissionFeeStructure {
  items: AdmissionFeeStructureItem[];
}

export type CreateAdmissionFeeStructureInput =
  Pick<
    AdmissionFeeStructure,
    | 'institution_id'
    | 'degree_id'
    | 'department_id'
    | 'programme_id'
    | 'quota_id'
    | 'accommodation_type_id'
    | 'admission_year_id'
    | 'name'
  > &
  Partial<Pick<AdmissionFeeStructure, 'status' | 'notes' | 'effective_from' | 'effective_to'>> & {
    /** N communities this structure applies to. Must contain at least one. */
    community_category_ids: string[];
    items: Array<Pick<AdmissionFeeStructureItem, 'billing_category_id' | 'amount'> &
      Partial<Pick<AdmissionFeeStructureItem, 'is_optional' | 'sort_order'>>>;
  };

export type UpdateAdmissionFeeStructureInput =
  Partial<Pick<
    AdmissionFeeStructure,
    | 'name' | 'status' | 'notes' | 'effective_from' | 'effective_to'
    // 7 matrix dimensions — editing them is supported but risky. The
    // overlap-prevention trigger on the junction will reject conflicting
    // moves; the UI layer warns the admin before submit.
    | 'institution_id' | 'degree_id' | 'department_id' | 'programme_id'
    | 'quota_id' | 'accommodation_type_id' | 'admission_year_id'
  >> & {
    /** When provided, replaces the community set for this structure. */
    community_category_ids?: string[];
  };

/**
 * 7-dim matrix key. Community is no longer part of the matrix — it lives on
 * the junction (admission_fee_structure_communities). The form's "find or
 * create" lookup uses these 7 dims plus a list of communities.
 */
export interface FeeStructureMatrixDimensions {
  institution_id: string;
  degree_id: string;
  department_id: string;
  programme_id: string;
  quota_id: string;
  accommodation_type_id: string;
  admission_year_id: string;
}

/** Coverage report row — one per (institution, academic_year) leaf in the tree */
export interface FeeStructureCoverageReportRow {
  institution_id: string;
  degree_id: string;
  department_id: string;
  programme_id: string;
  quota_id: string;
  community_category_id: string;
  accommodation_type_id: string;
  admission_year_id: string;
  has_structure: boolean;
  item_count: number;
}

// ============================================================================
// Admission Fee Adjustments + Resolution — Plan 3 types
// ============================================================================
// Spec §6.3, §7
// Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-03-resolution-engine-finance-tab.md Task 5

export type AdmissionFeeAdjustmentReasonCode =
  | 'scholarship_merit'
  | 'donor_seat'
  | 'sibling_rebate'
  | 'management_waiver'
  | 'fee_concession'
  | 'staff_ward'
  | 'financial_hardship'
  | 'other';

export type AdmissionFeeAdjustmentStatus = 'active' | 'reversed';

export interface AdmissionFeeAdjustment {
  id: string;
  learner_id: string;
  billing_category_id: string | null;
  reason_code: AdmissionFeeAdjustmentReasonCode;
  reason_notes: string | null;
  delta_amount: number;
  applied_at: string;
  approved_by: string | null;
  evidence_documents: unknown[];
  status: AdmissionFeeAdjustmentStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type CreateAdmissionFeeAdjustmentInput = Pick<
  AdmissionFeeAdjustment,
  'learner_id' | 'reason_code' | 'delta_amount'
> &
  Partial<
    Pick<
      AdmissionFeeAdjustment,
      'billing_category_id' | 'reason_notes' | 'evidence_documents' | 'approved_by'
    >
  >;

export type UpdateAdmissionFeeAdjustmentInput = Partial<
  Pick<
    AdmissionFeeAdjustment,
    'reason_code' | 'reason_notes' | 'delta_amount' | 'evidence_documents' | 'approved_by' | 'status'
  >
>;

/** Shape of a single resolved fee_items[] entry (after RPC merge) */
export interface ResolvedFeeItem {
  category_id: string | null;
  category_name: string;
  amount: number;
  source: 'structure' | 'adjustment_global';
}

/** RPC return wrapper for UI consumers */
export interface ResolveFeeItemsResult {
  items: ResolvedFeeItem[];
  matched: boolean;
  total: number;
}

// ============================================================================
// Atomic Account Transition — Plan 4 types
// ============================================================================
// Spec §6.6, §8.3.1
// Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-04-atomic-account-transition.md Task 5

export interface LearnerAdmissionDocument {
  id: string;
  learner_id: string;
  doc_type: string;
  is_received: boolean;
  received_at: string | null;
  received_by: string | null;
  received_via: 'physical' | 'email' | 'upload' | null;
  document_ref: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type AccountTransitionDocumentEntry = {
  doc_type: string;
  received_via: 'physical' | 'email' | 'upload';
  document_ref?: string;
};

export interface AccountTransitionPayload {
  learner_id: string;
  required_documents: string[];                          // doc_types from settings
  received_documents: AccountTransitionDocumentEntry[];  // user-provided
}

export interface AccountTransitionResult {
  success: boolean;
  learner_id: string;
  lifecycle_status: 'account';
  documents_recorded: number;
  bills_existing: number;
  bills_generated: number;
  fee_items_count: number;
}

// ============================================================================
// Fee-Change Reconciliation — Plan 5 types
// ============================================================================
// Spec §6.4, §8.3.2
// Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-05-fee-change-reconciliation.md Task 8

export type AdmissionFeeChangeEventStatus = 'pending_review' | 'approved' | 'rejected';
export type AdmissionFeeChangeEventTriggerField =
  | 'program_id' | 'quota_id' | 'community_category_id'
  | 'accommodation_type_id' | 'admission_year_id' | 'manual';
export type AdmissionFeeChangeEventLineDecision =
  | 'apply_supplemental' | 'issue_credit_note' | 'refund_payment'
  | 'reallocate_payment' | 'waive_delta' | 'do_nothing';

export interface AdmissionFeeChangeEvent {
  id: string;
  learner_id: string;
  trigger_field: AdmissionFeeChangeEventTriggerField;
  old_program_id: string | null;
  old_quota_id: string | null;
  old_community_category_id: string | null;
  old_accommodation_type_id: string | null;
  old_admission_year_id: string | null;
  old_fee_structure_id: string | null;
  new_fee_structure_id: string | null;
  status: AdmissionFeeChangeEventStatus;
  reason_notes: string | null;
  requested_by: string | null;
  decided_by: string | null;
  requested_at: string;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdmissionFeeChangeEventLine {
  id: string;
  event_id: string;
  billing_category_id: string;
  old_amount: number | null;
  new_amount: number | null;
  paid_amount_so_far: number;
  decision: AdmissionFeeChangeEventLineDecision | null;
  generated_artifact_id: string | null;
  decision_notes: string | null;
}

export interface AdmissionFeeChangeEventWithLines extends AdmissionFeeChangeEvent {
  lines: AdmissionFeeChangeEventLine[];
}

export interface ApproveFeeChangeEventDecisionInput {
  billing_category_id: string;
  decision: AdmissionFeeChangeEventLineDecision;
  reallocation_amount?: number;
  decision_notes?: string;
}

export interface ApproveFeeChangeEventResult {
  success: boolean;
  event_id: string;
  summary: {
    new_bills: number;
    superseded_bills: number;
    credit_balances: number;
    reallocations: number;
  };
}

export type StudentCreditBalanceSource =
  | 'fee_structure_change' | 'overpayment' | 'refund_reversal' | 'manual';

export interface StudentCreditBalance {
  id: string;
  student_id: string;
  amount: number;
  source: StudentCreditBalanceSource;
  source_event_id: string | null;
  is_consumed: boolean;
  consumed_against_bill_id: string | null;
  consumed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}
