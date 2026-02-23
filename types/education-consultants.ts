// types/education-consultants.ts
// Comprehensive types for the Education Consultants / Referral Partners module

// ═══════════════════════════════════════════════════════════════════════════
// ENUMS & UNION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ConsultantType = 'external' | 'internal' | 'institutional' | 'alumni' | 'student';

export type ConsultantStatus = 'active' | 'inactive' | 'suspended' | 'pending_verification' | 'contract_expired';

export type ConsultantTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export type CommissionCalculationMethod = 'percentage' | 'flat' | 'tiered' | 'milestone';

export type CommissionStatus = 'pending' | 'earned' | 'approved' | 'paid' | 'cancelled' | 'clawed_back';

export type PayoutStatus = 'draft' | 'pending_approval' | 'approved' | 'processing' | 'completed' | 'failed';

export type AttributionType = 'primary' | 'secondary' | 'assist';

export type CommunicationType = 'email' | 'phone' | 'meeting' | 'whatsapp' | 'note';

export type QueryStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'escalated';

export type QueryPriority = 'low' | 'medium' | 'high' | 'urgent';

export type DocumentType = 'contract' | 'agreement' | 'pan_card' | 'gst_certificate' | 'bank_proof' | 'identity' | 'other';

export type RewardType = 'discount' | 'fee_discount' | 'cashback' | 'cash' | 'credit' | 'credits' | 'voucher' | 'merchandise';

export type RewardStatus = 'pending' | 'earned' | 'approved' | 'redeemed' | 'expired' | 'cancelled';

// ═══════════════════════════════════════════════════════════════════════════
// EDUCATION CONSULTANTS (Main CRM Table)
// ═══════════════════════════════════════════════════════════════════════════

export interface EducationConsultant {
  id: string;
  institution_id: string;
  consultant_type: ConsultantType;
  code: string | null;

  // Basic Info
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string;
  alternate_phone: string | null;

  // Company
  company_name: string | null;
  company_registration_no: string | null;

  // Address (DB columns)
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;

  // Banking Details (DB columns)
  bank_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  upi_id: string | null;
  payment_preference: string | null;
  pan_number: string | null;
  gst_number: string | null;

  // Coverage & Specializations (DB columns)
  covered_states: any;
  covered_cities: any;
  covered_regions: any;
  specialized_degrees: string[] | null;
  specialized_departments: string[] | null;
  specialized_programs: string[] | null;

  // Scoring & Performance
  relationship_score: number;
  performance_rating: number | null;
  tier: ConsultantTier;
  total_leads_referred: number;
  total_conversions: number;
  conversion_rate: number;
  total_commission_earned: number;
  total_commission_paid: number;
  pending_commission: number;

  // Contract Info
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_status: string | null;
  contract_document_url: string | null;
  contract_terms: any;

  // Profile
  profile_photo_url: string | null;
  learner_profile_id: string | null;
  website: string | null;

  // Banking
  bank_account_holder: string | null;

  // Status
  status: ConsultantStatus;
  onboarded_at: string | null;
  onboarded_by: string | null;

  // For internal referrers (students/alumni)
  referrer_user_id: string | null;

  // Metadata
  internal_notes: string | null;
  tags: any;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;

  // Relationships (optional populated)
  institution?: { id: string; name: string } | null;
  commission_structures?: ConsultantCommissionStructure[];
  communications?: ConsultantCommunication[];
  documents?: ConsultantDocument[];

  // Allow dynamic DB fields
  [key: string]: any;
}

// CreateConsultantInput accepts both form field names and DB column names
// The form pages transform form names → DB names in their onSubmit handlers
export interface CreateConsultantInput {
  institution_id: string;
  consultant_type: ConsultantType;
  name: string;
  phone: string;
  email?: string | null;
  contact_person?: string | null;
  alternate_phone?: string | null;
  // DB columns for address
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  // Banking (DB columns)
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_branch?: string | null;
  pan_number?: string | null;
  gst_number?: string | null;
  // Coverage (DB columns)
  covered_states?: any;
  covered_cities?: any;
  covered_regions?: any;
  specialized_degrees?: string[] | null;
  specialized_departments?: string[] | null;
  specialized_programs?: string[] | null;
  // Contract
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  // Metadata (DB columns)
  internal_notes?: string | null;
  tags?: any;
  // For internal referrers
  referrer_user_id?: string | null;
  learner_profile_id?: string | null;
  // Allow additional DB fields
  [key: string]: any;
}

export interface UpdateConsultantInput extends Partial<CreateConsultantInput> {
  id: string;
  status?: ConsultantStatus;
  tier?: ConsultantTier;
  relationship_score?: number;
}

export interface ConsultantFilters {
  search?: string;
  institution_id?: string;
  consultant_type?: ConsultantType | ConsultantType[];
  status?: ConsultantStatus | ConsultantStatus[];
  tier?: ConsultantTier | ConsultantTier[];
  city?: string;
  state?: string;
  min_conversion_rate?: number;
  max_conversion_rate?: number;
  min_total_leads?: number;
  has_active_contract?: boolean;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface ConsultantListResponse {
  data: EducationConsultant[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMISSION STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════

export interface MilestoneConfig {
  stage: string;
  percentage: number;
  description?: string;
}

export interface VolumeTier {
  min_count: number;
  max_count: number | null;
  rate: number;
  rate_type: 'percentage' | 'flat';
}

export interface ConsultantCommissionStructure {
  id: string;
  institution_id: string;
  consultant_id: string;
  program_id: string | null;
  degree_id: string | null;
  department_id: string | null;

  // Structure identity
  name: string;
  description: string | null;
  priority: number | null;

  // Commission Settings — uses DB column names
  commission_type: string;  // 'percentage' | 'flat' | 'tiered' | 'milestone'
  commission_basis: string | null;
  base_rate: number | null;
  base_amount: number | null;
  applies_to_all_programs: boolean | null;

  // Milestone Configuration (for milestone method)
  milestones: any;  // Json array []

  // Volume Tiers
  volume_tiers: any | null;
  volume_tiers_enabled: boolean | null;

  // Clawback Rules
  clawback_enabled: boolean | null;
  clawback_period_days: number | null;
  clawback_percentage: number | null;
  clawback_conditions: Record<string, unknown> | null;

  // Validity
  effective_from: string;
  effective_to: string | null;
  is_active: boolean | null;

  // Metadata
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  updated_by: string | null;

  // Relationships (optional populated)
  consultant?: EducationConsultant;

  // Allow dynamic DB fields
  [key: string]: any;
}

export interface CreateCommissionStructureInput {
  institution_id: string;
  consultant_id: string;
  name: string;
  commission_type: string;
  base_rate?: number | null;
  base_amount?: number | null;
  program_id?: string | null;
  degree_id?: string | null;
  department_id?: string | null;
  description?: string | null;
  applies_to_all_programs?: boolean | null;
  milestones?: any;
  volume_tiers?: any | null;
  volume_tiers_enabled?: boolean | null;
  clawback_enabled?: boolean | null;
  clawback_period_days?: number | null;
  clawback_percentage?: number | null;
  clawback_conditions?: Record<string, unknown> | null;
  effective_from?: string;
  effective_to?: string | null;
  is_active?: boolean | null;
  priority?: number | null;
  commission_basis?: string | null;
  created_by?: string | null;
}

export interface UpdateCommissionStructureInput extends Partial<CreateCommissionStructureInput> {
  id: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAD ATTRIBUTIONS (Split Credit)
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantLeadAttribution {
  id: string;
  institution_id: string;
  lead_id: string;
  consultant_id: string;

  // Attribution Details
  attribution_type: AttributionType;
  attribution_percentage: number;
  referral_code_used: string | null;
  referral_link_used: string | null;

  // Source Tracking
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;

  // Commission Tracking
  commission_structure_id: string | null;
  estimated_commission: number | null;
  actual_commission: number | null;

  // Status
  is_verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  verification_notes: string | null;

  // Metadata
  notes: string | null;
  created_at: string;
  updated_at: string;

  // Relationships
  consultant?: EducationConsultant;
  lead?: { id: string; full_name: string; phone: string; email: string | null };
}

export interface CreateLeadAttributionInput {
  institution_id: string;
  lead_id: string;
  consultant_id: string;
  attribution_type: AttributionType;
  attribution_percentage: number;
  referral_code_used?: string | null;
  referral_link_used?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  commission_structure_id?: string | null;
  estimated_commission?: number | null;
  notes?: string | null;
}

export interface LeadAttributionFilters {
  institution_id?: string;
  consultant_id?: string;
  lead_id?: string;
  attribution_type?: AttributionType;
  is_verified?: boolean;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMISSION TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantCommissionTransaction {
  id: string;
  institution_id: string;
  transaction_code: string | null;
  consultant_id: string;
  lead_id: string;
  attribution_id: string | null;
  commission_structure_id: string | null;

  // Commission Details
  milestone_stage: string | null;
  base_amount: number;
  fee_amount: number;
  commission_rate: number;
  rate_type: 'percentage' | 'flat';
  calculated_amount: number;

  // Adjustments
  volume_bonus: number;
  adjustment_amount: number;
  adjustment_reason: string | null;
  final_amount: number;

  // Tax
  tds_rate: number | null;
  tds_amount: number | null;
  net_amount: number;

  // Status
  status: CommissionStatus;
  status_changed_at: string | null;
  status_changed_by: string | null;

  // Clawback
  clawback_eligible_until: string | null;
  clawback_amount: number | null;
  clawback_reason: string | null;
  clawback_at: string | null;

  // Payment
  payout_batch_id: string | null;
  paid_at: string | null;
  payment_reference: string | null;

  // Metadata
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;

  // Relationships
  consultant?: EducationConsultant;
  lead?: { id: string; full_name: string };
  payout_batch?: ConsultantPayoutBatch;
}

export interface CreateCommissionTransactionInput {
  institution_id: string;
  consultant_id: string;
  lead_id: string;
  attribution_id?: string | null;
  commission_structure_id?: string | null;
  milestone_stage?: string | null;
  base_amount: number;
  fee_amount: number;
  commission_rate: number;
  rate_type: 'percentage' | 'flat';
  calculated_amount: number;
  volume_bonus?: number;
  adjustment_amount?: number;
  adjustment_reason?: string | null;
  final_amount: number;
  tds_rate?: number | null;
  tds_amount?: number | null;
  net_amount: number;
  status?: CommissionStatus;
  clawback_eligible_until?: string | null;
  notes?: string | null;
}

export interface CommissionTransactionFilters {
  institution_id?: string;
  consultant_id?: string;
  lead_id?: string;
  status?: CommissionStatus | CommissionStatus[];
  milestone_stage?: string;
  date_from?: string;
  date_to?: string;
  min_amount?: number;
  max_amount?: number;
  payout_batch_id?: string | null;
  unpaid_only?: boolean;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYOUT BATCHES
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantPayoutBatch {
  id: string;
  institution_id: string;
  batch_code: string | null;

  // Batch Details
  batch_name: string;
  payout_period_start: string;
  payout_period_end: string;

  // Amounts
  total_gross_amount: number;
  total_tds_amount: number;
  total_net_amount: number;
  total_transactions: number;

  // Status
  status: PayoutStatus;

  // Approval Workflow
  generated_at: string | null;
  generated_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;

  // Processing
  processed_at: string | null;
  processed_by: string | null;
  payment_mode: string | null;
  payment_reference: string | null;
  payment_file_url: string | null;

  // Metadata
  notes: string | null;
  created_at: string;
  updated_at: string;

  // Relationships
  transactions?: ConsultantCommissionTransaction[];
}

export interface CreatePayoutBatchInput {
  institution_id: string;
  batch_name: string;
  payout_period_start: string;
  payout_period_end: string;
  consultant_ids?: string[]; // Optional filter
  min_amount?: number; // Minimum payout threshold
  notes?: string | null;
}

export interface ProcessPayoutBatchInput {
  batch_id: string;
  payment_mode: string;
  payment_reference: string;
  payment_file_url?: string | null;
}

export interface PayoutBatchFilters {
  institution_id?: string;
  status?: PayoutStatus | PayoutStatus[];
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNICATIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantCommunication {
  id: string;
  institution_id: string;
  consultant_id: string;

  // Communication Details
  communication_type: CommunicationType;
  subject: string | null;
  content: string;

  // Direction
  direction: 'inbound' | 'outbound';

  // Metadata
  contact_person: string | null;
  phone_number: string | null;
  email_address: string | null;

  // Attachments
  attachments: string[];

  // Timestamps
  communicated_at: string;
  created_at: string;
  created_by: string | null;

  // Relationships
  consultant?: EducationConsultant;
}

export interface CreateCommunicationInput {
  institution_id: string;
  consultant_id: string;
  communication_type: CommunicationType;
  subject?: string | null;
  content: string;
  direction: 'inbound' | 'outbound';
  contact_person?: string | null;
  phone_number?: string | null;
  email_address?: string | null;
  attachments?: string[];
  communicated_at?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantDocument {
  id: string;
  institution_id: string;
  consultant_id: string;

  // Document Details
  document_type: DocumentType;
  document_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;

  // Validity
  valid_from: string | null;
  valid_to: string | null;
  is_verified: boolean;
  verified_at: string | null;
  verified_by: string | null;

  // Metadata
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface UploadConsultantDocumentInput {
  institution_id: string;
  consultant_id: string;
  document_type: DocumentType;
  document_name: string;
  file: File;
  valid_from?: string | null;
  valid_to?: string | null;
  notes?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// REFERRAL REWARDS (For Students/Alumni)
// ═══════════════════════════════════════════════════════════════════════════

export interface ReferralRewardConfig {
  id: string;
  institution_id: string;

  // Config Details
  name: string;
  description: string | null;
  reward_type: RewardType;
  reward_value: number;
  reward_value_type: 'percentage' | 'flat';

  // Eligibility
  referrer_type: string;
  min_referrals_required: number;

  // Triggers
  trigger_stage: string;
  trigger_conditions: Record<string, unknown> | null;

  // Limits
  max_referrals_per_year: number | null;
  max_reward_amount: number | null;
  min_reward_amount: number | null;

  // Programs
  applicable_programs: string[] | null;
  applicable_degrees: string[] | null;

  // Stacking
  stackable: boolean;
  max_stacking_count: number | null;

  // Validity
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;

  // Metadata
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;

  [key: string]: any;
}

export interface CreateRewardConfigInput {
  institution_id: string;
  name: string;
  description?: string | null;
  reward_type: RewardType;
  reward_value: number;
  reward_value_type: 'percentage' | 'flat';
  referrer_type: string;
  min_referrals_required?: number;
  trigger_stage: string;
  trigger_conditions?: Record<string, unknown> | null;
  max_referrals_per_year?: number | null;
  max_reward_amount?: number | null;
  min_reward_amount?: number | null;
  valid_from?: string;
  valid_to?: string | null;
  is_active?: boolean;
}

export interface ReferralReward {
  id: string;
  institution_id: string;
  reward_config_id: string;
  referrer_consultant_id: string;
  referred_lead_id: string;

  // Reward Details
  reward_type: RewardType;
  reward_value: number;
  reward_description: string | null;

  // Status
  status: RewardStatus;
  status_changed_at: string | null;
  status_changed_by: string | null;

  // Redemption
  redeemed_at: string | null;
  redemption_reference: string | null;
  redemption_notes: string | null;

  // Expiry
  expires_at: string | null;

  // Metadata
  notes: string | null;
  created_at: string;

  // Relationships
  referrer?: EducationConsultant;
  config?: ReferralRewardConfig;
}

export interface RewardFilters {
  institution_id?: string;
  referrer_consultant_id?: string;
  reward_type?: RewardType;
  status?: RewardStatus | RewardStatus[];
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT QUERIES (Support)
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantPaymentQuery {
  id: string;
  institution_id: string;
  query_code: string | null;
  consultant_id: string;

  // Query Details
  subject: string;
  description: string;
  related_transaction_id: string | null;
  related_payout_batch_id: string | null;

  // Status
  status: QueryStatus;
  priority: QueryPriority;

  // Assignment
  assigned_to: string | null;
  assigned_at: string | null;

  // Resolution
  resolution: string | null;
  resolved_at: string | null;
  resolved_by: string | null;

  // Metadata
  created_at: string;
  updated_at: string;

  // Relationships
  consultant?: EducationConsultant;
  transaction?: ConsultantCommissionTransaction;
}

export interface CreatePaymentQueryInput {
  institution_id: string;
  consultant_id: string;
  subject: string;
  description: string;
  related_transaction_id?: string | null;
  related_payout_batch_id?: string | null;
  priority?: QueryPriority;
}

export interface UpdatePaymentQueryInput {
  id: string;
  status?: QueryStatus;
  priority?: QueryPriority;
  assigned_to?: string | null;
  resolution?: string | null;
}

export interface PaymentQueryFilters {
  institution_id?: string;
  consultant_id?: string;
  status?: QueryStatus | QueryStatus[];
  priority?: QueryPriority | QueryPriority[];
  assigned_to?: string | null;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS & DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantPerformanceMetrics {
  consultant_id: string;
  consultant_name: string;
  consultant_code: string | null;
  tier: ConsultantTier;

  // Lead Metrics
  total_leads: number;
  leads_this_month: number;
  leads_this_quarter: number;

  // Conversion Metrics
  total_conversions: number;
  conversions_this_month: number;
  conversion_rate: number;

  // Financial Metrics
  total_commission_earned: number;
  commission_this_month: number;
  pending_commission: number;
  average_commission_per_lead: number;

  // Performance Trends
  performance_trend: 'up' | 'down' | 'stable';
  trend_percentage: number;
}

export interface ConsultantDashboardStats {
  // Overview
  total_consultants: number;
  active_consultants: number;
  consultants_by_tier: Record<ConsultantTier, number>;
  consultants_by_type: Record<ConsultantType, number>;

  // Lead Metrics
  total_leads_referred: number;
  leads_this_month: number;
  total_conversions: number;
  conversions_this_month: number;
  overall_conversion_rate: number;

  // Financial Metrics
  total_commission_paid: number;
  commission_paid_this_month: number;
  pending_commission: number;
  average_commission_per_conversion: number;

  // Top Performers
  top_consultants: ConsultantPerformanceMetrics[];

  // Pipeline
  leads_by_stage: Record<string, number>;
  commission_by_status: Record<CommissionStatus, number>;
}

export interface ConsultantAnalytics {
  institution_id: string;
  period: {
    start: string;
    end: string;
  };

  // Trends
  lead_trends: {
    date: string;
    leads: number;
    conversions: number;
    commission: number;
  }[];

  // By Consultant Type
  metrics_by_type: {
    type: ConsultantType;
    leads: number;
    conversions: number;
    conversion_rate: number;
    commission: number;
  }[];

  // By Program
  metrics_by_program: {
    program_id: string;
    program_name: string;
    leads: number;
    conversions: number;
    commission: number;
  }[];

  // Geographic Distribution
  metrics_by_region: {
    state: string;
    city: string | null;
    leads: number;
    conversions: number;
  }[];

  // ROI Analysis
  roi_metrics: {
    total_commission_paid: number;
    total_revenue_generated: number;
    roi_percentage: number;
    cost_per_acquisition: number;
  };
}

export interface CommissionLiabilityReport {
  institution_id: string;
  as_of_date: string;

  // Summary
  total_pending: number;
  total_earned: number;
  total_approved: number;
  grand_total_liability: number;

  // By Consultant
  liability_by_consultant: {
    consultant_id: string;
    consultant_name: string;
    pending_amount: number;
    earned_amount: number;
    approved_amount: number;
    total_liability: number;
  }[];

  // By Month
  liability_by_month: {
    month: string;
    amount: number;
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSULTANT PORTAL TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantPortalDashboard {
  consultant: EducationConsultant;

  // Stats
  stats: {
    total_leads: number;
    leads_this_month: number;
    total_conversions: number;
    conversion_rate: number;
    total_earnings: number;
    pending_earnings: number;
    current_tier: ConsultantTier;
    next_tier_threshold: number | null;
    leads_to_next_tier: number | null;
  };

  // Recent Activity
  recent_leads: {
    id: string;
    name: string;
    stage: string;
    submitted_at: string;
  }[];

  recent_transactions: {
    id: string;
    lead_name: string;
    amount: number;
    status: CommissionStatus;
    date: string;
  }[];

  // Notifications
  notifications: {
    id: string;
    type: string;
    message: string;
    created_at: string;
    is_read: boolean;
  }[];
}

export interface ConsultantLeadSubmission {
  institution_id: string;
  consultant_id: string;

  // Lead Details
  full_name: string;
  phone: string;
  email?: string | null;
  alternate_phone?: string | null;

  // Academic Interest
  program_interest?: string | null;
  preferred_batch?: string | null;

  // Location
  city?: string | null;
  state?: string | null;

  // Additional
  notes?: string | null;
  referral_code?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT/EXPORT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantImportRow {
  name: string;
  consultant_type: string;
  phone: string;
  email?: string;
  contact_person?: string;
  city?: string;
  state?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  pan_number?: string;
  gst_number?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  base_commission_rate?: number;
  commission_type?: string;
  notes?: string;
}

export interface ConsultantImportResult {
  success_count: number;
  error_count: number;
  errors: {
    row: number;
    field: string;
    message: string;
    data: ConsultantImportRow;
  }[];
  imported_consultants: EducationConsultant[];
}

export interface ConsultantExportOptions {
  institution_id: string;
  format: 'excel' | 'csv' | 'json';
  include_fields: string[];
  filters?: ConsultantFilters;
  include_commission_summary?: boolean;
  include_lead_summary?: boolean;
}
