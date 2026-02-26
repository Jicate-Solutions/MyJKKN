// types/education-consultants.ts
// Types for the Education Consultants module within Admission Management

// ═══════════════════════════════════════════════════════════════════════════
// ENUMS & UNION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ConsultantType = 'external' | 'internal' | 'institutional' | 'alumni' | 'student';

export type ConsultantStatus = 'active' | 'inactive' | 'suspended' | 'pending_verification' | 'contract_expired';

export type ConsultantTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export type CommissionStatus = 'pending' | 'earned' | 'approved' | 'paid' | 'cancelled' | 'clawed_back';

export type AttributionType = 'primary' | 'secondary' | 'assist';

export type RateType = 'percentage' | 'flat' | 'tiered' | 'milestone';

export type PayoutBatchStatus = 'draft' | 'prepared' | 'approved' | 'processing' | 'completed' | 'failed';

export type RewardType = 'cash' | 'voucher' | 'discount' | 'scholarship' | 'gift' | 'points' | 'fee_discount' | 'cashback' | 'credit' | 'credits' | 'merchandise';

export type RewardStatus = 'pending' | 'earned' | 'approved' | 'redeemed' | 'expired' | 'cancelled';

// ═══════════════════════════════════════════════════════════════════════════
// CORE ENTITY: EDUCATION CONSULTANT
// ═══════════════════════════════════════════════════════════════════════════

export interface EducationConsultant {
  id: string;
  institution_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  consultant_type: ConsultantType;
  status: ConsultantStatus;
  tier: ConsultantTier;
  code: string | null;
  contact_person: string | null;
  website: string | null;

  // Tax & identity
  gst_number: string | null;
  pan_number: string | null;

  // Address
  address_line1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;

  // Banking
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  bank_ifsc: string | null;

  // Contract
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_document_url: string | null;

  // Profile
  profile_photo_url: string | null;
  internal_notes: string | null;
  tags: string[];

  // Coverage & specialization
  covered_states: string[];
  specialized_degrees: string[];
  specialized_programs: string[];

  // Performance (computed/aggregated)
  relationship_score: number | null;
  performance_rating: number | null;
  total_leads_referred: number;
  total_conversions: number;
  conversion_rate: number;
  total_commission_earned: number;
  pending_commission: number;

  // Timestamps
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;

  // Relationships (optional populated)
  institution?: { id: string; name: string };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSULTANT INPUT & FILTER TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateConsultantInput {
  institution_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  consultant_type: ConsultantType;
  status?: ConsultantStatus;
  tier?: ConsultantTier;
  contact_person?: string | null;
  website?: string | null;
  gst_number?: string | null;
  pan_number?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account_number?: string | null;
  bank_account_holder?: string | null;
  bank_ifsc?: string | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  covered_states?: string[];
  specialized_degrees?: string[];
  specialized_programs?: string[];
  internal_notes?: string | null;
  tags?: string[];
  profile_photo_url?: string | null;

  // Form aliases (remapped to DB columns in submit handler)
  address?: string | null;
  notes?: string | null;
  geographic_coverage?: string[];
  specializations?: string[];
  programs_handled?: string[];
}

export interface UpdateConsultantInput extends Partial<CreateConsultantInput> {
  id: string;
  profile_photo_url?: string | null;
  contract_document_url?: string | null;
  relationship_score?: number | null;
}

export interface ConsultantFilters {
  institution_id?: string;
  search?: string;
  consultant_type?: ConsultantType | ConsultantType[];
  status?: ConsultantStatus | ConsultantStatus[];
  tier?: ConsultantTier | ConsultantTier[];
  state?: string;
  has_active_contract?: boolean;
  min_total_leads?: number;
  max_conversion_rate?: number;
  min_conversion_rate?: number;
  city?: string;
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
// COMMISSION STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantCommissionStructure {
  id: string;
  institution_id: string;
  consultant_id: string;
  program_id: string | null;
  rate_type: RateType;
  rate_value: number;
  min_threshold: number | null;
  max_threshold: number | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;

  // Extended commission calculation fields
  base_rate: number;
  calculation_method: 'percentage' | 'flat' | 'milestone' | string;
  milestone_config: { stage: string; percentage: number }[] | null;
  volume_tiers: {
    min_count: number;
    max_count: number | null;
    rate: number;
    rate_type: 'percentage' | 'flat';
  }[] | null;
  max_commission_per_student: number | null;
}

export interface CreateCommissionStructureInput {
  institution_id: string;
  consultant_id: string;
  program_id?: string | null;
  rate_type: RateType;
  rate_value: number;
  min_threshold?: number | null;
  max_threshold?: number | null;
  effective_from: string;
  effective_to?: string | null;
  is_active?: boolean;
  notes?: string | null;
}

export interface UpdateCommissionStructureInput extends Partial<CreateCommissionStructureInput> {
  id: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAD ATTRIBUTION
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantLeadAttribution {
  id: string;
  institution_id: string;
  consultant_id: string;
  lead_id: string;
  attribution_type: AttributionType;
  attribution_percentage: number;
  referral_code_used: string | null;
  is_verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  verification_notes: string | null;
  estimated_commission: number | null;
  created_at: string;

  // Relationships (optional populated)
  consultant?: { id: string; name: string; code: string | null };
  lead?: { id: string; full_name: string; phone: string; email: string | null };
}

export interface CreateLeadAttributionInput {
  institution_id: string;
  consultant_id: string;
  lead_id: string;
  attribution_type?: AttributionType;
  attribution_percentage?: number;
  referral_code_used?: string | null;
}

export interface LeadAttributionFilters {
  institution_id?: string;
  consultant_id?: string;
  lead_id?: string;
  attribution_type?: AttributionType;
  is_verified?: boolean;
  search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMISSION TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantCommissionTransaction {
  id: string;
  institution_id: string;
  consultant_id: string;
  lead_id: string | null;
  status: CommissionStatus;
  fee_amount: number;
  commission_rate: number;
  rate_type: RateType;
  calculated_amount: number;
  final_amount: number;
  tds_amount: number;
  net_amount: number;
  milestone_stage: string | null;
  payout_batch_id: string | null;
  transaction_code: string | null;
  notes: string | null;
  status_changed_at: string | null;
  status_changed_by: string | null;
  clawback_reason: string | null;
  clawback_at: string | null;
  created_at: string;
  updated_at: string;

  // Relationships (optional populated)
  consultant?: { id: string; name: string; code: string | null };
  lead?: { id: string; full_name: string };
}

export interface CreateCommissionTransactionInput {
  institution_id: string;
  consultant_id: string;
  lead_id?: string | null;
  fee_amount: number;
  commission_rate: number;
  rate_type?: RateType;
  milestone_stage?: string | null;
  notes?: string | null;
}

export interface CommissionTransactionFilters {
  institution_id?: string;
  consultant_id?: string;
  status?: CommissionStatus | CommissionStatus[];
  search?: string;
  date_from?: string;
  date_to?: string;
  lead_id?: string;
  milestone_stage?: string;
  min_amount?: number;
  max_amount?: number;
  payout_batch_id?: string;
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
  batch_name: string;
  payout_period_start: string;
  payout_period_end: string;
  total_gross_amount: number;
  total_tds_amount: number;
  total_net_amount: number;
  total_transactions: number;
  status: PayoutBatchStatus;
  generated_at: string | null;
  generated_by: string | null;
  processed_at: string | null;
  processed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePayoutBatchInput {
  institution_id: string;
  batch_name: string;
  payout_period_start: string;
  payout_period_end: string;
  consultant_ids?: string[];
  min_amount?: number;
  notes?: string | null;
}

export interface ProcessPayoutBatchInput {
  batch_id: string;
  payment_reference?: string;
  payment_mode?: string;
  payment_file_url?: string;
  notes?: string;
}

export interface PayoutBatchFilters {
  institution_id?: string;
  status?: PayoutBatchStatus | PayoutBatchStatus[];
  search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// ═══════════════════════════════════════════════════════════════════════════
// REWARDS
// ═══════════════════════════════════════════════════════════════════════════

export interface ReferralRewardConfig {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  reward_type: RewardType;
  reward_value: number;
  currency: string;
  min_referrals: number;
  max_rewards: number | null;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
  terms_conditions: string | null;
  eligible_consultant_types: ConsultantType[];
  eligible_tiers: ConsultantTier[];
  created_at: string;
  updated_at: string;

  // Extended reward config fields
  reward_value_type: 'percentage' | 'flat';
  max_rewards_per_referrer: number | null;
  referrer_types: string[] | null;
  trigger_conditions: Record<string, unknown> | null;
}

export interface CreateRewardConfigInput {
  institution_id: string;
  name: string;
  description?: string | null;
  reward_type: RewardType;
  reward_value: number;
  currency?: string;
  min_referrals?: number;
  max_rewards?: number | null;
  valid_from: string;
  valid_to?: string | null;
  is_active?: boolean;
  terms_conditions?: string | null;
  eligible_consultant_types?: ConsultantType[];
  eligible_tiers?: ConsultantTier[];
}

export interface ReferralReward {
  id: string;
  institution_id: string;
  consultant_id: string;
  reward_config_id: string;
  status: RewardStatus;
  reward_value: number;
  referral_count: number;
  earned_at: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;

  // Extended reward fields
  reward_description: string | null;
  reward_type: RewardType;

  // Relationships
  consultant?: { id: string; name: string };
  reward_config?: { id: string; name: string; reward_type: RewardType };
  referrer?: { id: string; name: string; code?: string | null; type?: string };
  config?: { id: string; name: string; reward_type?: RewardType; reward_value_type?: string; description?: string | null };
}

export interface RewardFilters {
  institution_id?: string;
  consultant_id?: string;
  referrer_consultant_id?: string;
  status?: RewardStatus | RewardStatus[];
  reward_type?: RewardType;
  search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNICATION & DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantCommunication {
  id: string;
  institution_id: string;
  consultant_id: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'phone' | 'in_person';
  subject: string | null;
  content: string;
  sent_at: string;
  sent_by: string | null;
  created_at: string;
}

export interface CreateCommunicationInput {
  institution_id: string;
  consultant_id: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'phone' | 'in_person';
  subject?: string | null;
  content: string;
  communicated_at?: string | null;
}

export interface ConsultantDocument {
  id: string;
  consultant_id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  file_size: number;
  uploaded_at: string;
  uploaded_by: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT QUERIES
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantPaymentQuery {
  id: string;
  institution_id: string;
  consultant_id: string;
  query_type: 'payment_delay' | 'amount_dispute' | 'missing_commission' | 'other';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  resolution: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;

  // Relationships
  consultant?: { id: string; name: string };
}

export interface CreatePaymentQueryInput {
  institution_id: string;
  consultant_id: string;
  query_type: 'payment_delay' | 'amount_dispute' | 'missing_commission' | 'other';
  subject: string;
  description: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface UpdatePaymentQueryInput {
  id: string;
  status?: 'open' | 'in_progress' | 'resolved' | 'closed';
  resolution?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface PaymentQueryFilters {
  institution_id?: string;
  consultant_id?: string;
  status?: string;
  query_type?: string;
  priority?: string;
  search?: string;
  assigned_to?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS & DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsultantDashboardStats {
  total_consultants: number;
  active_consultants: number;
  total_leads_referred: number;
  total_conversions: number;
  overall_conversion_rate: number;
  total_commission_earned?: number;
  pending_commission: number;
  top_performers?: {
    id: string;
    name: string;
    leads_referred: number;
    conversions: number;
    commission_earned: number;
  }[];
  by_type?: Record<ConsultantType, number>;
  by_tier?: Record<ConsultantTier, number>;

  // Extended dashboard fields
  consultants_by_tier: Record<ConsultantTier | string, number>;
  consultants_by_type: Record<ConsultantType | string, number>;
  leads_this_month: number;
  total_commission_paid: number;
  commission_paid_this_month: number;
  average_commission_per_conversion: number;
  conversions_this_month: number;
  top_consultants: ConsultantPerformanceMetrics[];
  leads_by_stage: Record<string, number>;
  commission_by_status: Record<string, number>;
}

export interface ConsultantPerformanceMetrics {
  consultant_id: string;
  period?: string;
  leads_referred?: number;
  conversions?: number;
  conversion_rate: number;
  commission_earned?: number;
  avg_deal_size?: number;
  response_time_hours?: number;
  active_leads?: number;

  // Extended performance fields
  consultant_name: string;
  consultant_code: string | null;
  tier: ConsultantTier;
  total_leads: number;
  leads_this_month: number;
  leads_this_quarter: number;
  total_conversions: number;
  conversions_this_month: number;
  total_commission_earned: number;
  commission_this_month: number;
  pending_commission: number;
  average_commission_per_lead: number;
  performance_trend: 'up' | 'down' | 'stable' | string;
  trend_percentage: number;
}

export interface ConsultantPortalDashboard {
  consultant: EducationConsultant;
  recent_referrals?: ConsultantLeadAttribution[] | { id: string; name: string; stage: string; submitted_at: string }[];
  pending_commissions?: ConsultantCommissionTransaction[];
  performance?: ConsultantPerformanceMetrics;
  rewards?: ReferralReward[];

  // Extended portal dashboard fields
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
  recent_leads: { id: string; name: string; stage: string; submitted_at: string }[];
  recent_transactions: { id: string; lead_name: string; amount: number; status: string; date: string }[];
  notifications: unknown[];
}

export interface ConsultantLeadSubmission {
  consultant_id: string;
  institution_id: string;
  lead_name?: string;
  lead_phone?: string;
  lead_email?: string | null;
  interested_programs?: string[];
  notes?: string | null;
  referral_code?: string | null;

  // Extended submission fields (used by service for DB insert)
  full_name: string;
  phone: string;
  email?: string | null;
  program_interest?: string | null;
}

export interface CommissionLiabilityReport {
  total_liability?: number;
  pending_amount?: number;
  earned_amount?: number;
  approved_amount?: number;
  by_consultant?: {
    consultant_id: string;
    consultant_name: string;
    pending: number;
    earned: number;
    approved: number;
    total: number;
  }[];
  by_period?: {
    period: string;
    amount: number;
    count: number;
  }[];

  // Extended liability report fields
  institution_id: string | undefined;
  as_of_date: string;
  total_pending: number;
  total_earned: number;
  total_approved: number;
  grand_total_liability: number;
  liability_by_consultant: {
    consultant_id: string;
    consultant_name: string;
    pending_amount: number;
    earned_amount: number;
    approved_amount: number;
    total_liability: number;
  }[];
  liability_by_month: {
    month: string;
    amount: number;
  }[];
}
