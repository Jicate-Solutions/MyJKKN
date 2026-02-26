-- ============================================================================
-- ADMISSION MODULE: CONSULTANT TABLES
-- Generated from live database schema - 2026-02-25
-- ============================================================================

-- ============================================================================
-- 1. CONSULTANT COMMISSION STRUCTURES (28 columns)
-- ============================================================================
CREATE TABLE IF NOT EXISTS consultant_commission_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  consultant_id uuid NOT NULL REFERENCES education_consultants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  applies_to_all_programs boolean DEFAULT true,
  program_id uuid REFERENCES programs(id),
  degree_id uuid REFERENCES degrees(id),
  department_id uuid REFERENCES departments(id),
  commission_type varchar(20) NOT NULL DEFAULT 'percentage',
  base_rate numeric CHECK (base_rate >= 0 AND base_rate <= 100),
  base_amount numeric CHECK (base_amount >= 0),
  milestones jsonb DEFAULT '[]',
  volume_tiers_enabled boolean DEFAULT false,
  volume_tiers jsonb DEFAULT '[]',
  clawback_enabled boolean DEFAULT false,
  clawback_period_days integer DEFAULT 90,
  clawback_percentage numeric DEFAULT 100 CHECK (clawback_percentage >= 0 AND clawback_percentage <= 100),
  clawback_conditions jsonb DEFAULT '[]',
  commission_basis varchar(20) DEFAULT 'total_fees',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean DEFAULT true,
  priority integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id)
);
ALTER TABLE consultant_commission_structures ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. CONSULTANT LEAD ATTRIBUTIONS (26 columns)
-- ============================================================================
CREATE TABLE IF NOT EXISTS consultant_lead_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  learner_profile_id uuid REFERENCES learners_profiles(id),
  admission_id uuid REFERENCES admission_leads(id),
  consultant_id uuid NOT NULL REFERENCES education_consultants(id),
  attribution_type varchar(20) DEFAULT 'primary',
  attribution_percentage numeric NOT NULL CHECK (attribution_percentage > 0 AND attribution_percentage <= 100),
  commission_structure_id uuid REFERENCES consultant_commission_structures(id),
  referral_code text,
  referral_source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referral_url text,
  current_stage varchar(50) DEFAULT 'lead_registered',
  stage_history jsonb DEFAULT '[]',
  is_verified boolean DEFAULT false,
  verified_at timestamptz,
  verified_by uuid REFERENCES profiles(id),
  verification_notes text,
  is_disputed boolean DEFAULT false,
  dispute_reason text,
  dispute_resolved_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (learner_profile_id IS NOT NULL OR admission_id IS NOT NULL)
);
ALTER TABLE consultant_lead_attributions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_attributions_consultant ON consultant_lead_attributions(consultant_id);
CREATE INDEX IF NOT EXISTS idx_attributions_institution ON consultant_lead_attributions(institution_id);
CREATE INDEX IF NOT EXISTS idx_attributions_admission ON consultant_lead_attributions(admission_id);

-- ============================================================================
-- 3. CONSULTANT COMMISSION TRANSACTIONS (31 columns)
-- ============================================================================
CREATE TABLE IF NOT EXISTS consultant_commission_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  consultant_id uuid NOT NULL REFERENCES education_consultants(id),
  transaction_number text UNIQUE,
  attribution_id uuid REFERENCES consultant_lead_attributions(id),
  learner_profile_id uuid REFERENCES learners_profiles(id),
  admission_id uuid REFERENCES admission_leads(id),
  transaction_type varchar(20) NOT NULL,
  milestone_stage text,
  milestone_description text,
  commission_basis_amount numeric,
  commission_rate numeric,
  gross_amount numeric NOT NULL,
  tds_percentage numeric DEFAULT 0,
  tds_amount numeric DEFAULT 0,
  other_deductions numeric DEFAULT 0,
  net_amount numeric NOT NULL,
  volume_tier_multiplier numeric DEFAULT 1,
  payout_batch_id uuid,
  payment_reference text,
  payment_mode text,
  payment_date date,
  status varchar(20) DEFAULT 'pending',
  status_history jsonb DEFAULT '[]',
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  rejection_reason text,
  original_transaction_id uuid REFERENCES consultant_commission_transactions(id),
  clawback_reason text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);
ALTER TABLE consultant_commission_transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. CONSULTANT PAYOUT BATCHES (26 columns)
-- ============================================================================
CREATE TABLE IF NOT EXISTS consultant_payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  batch_number text UNIQUE,
  batch_name text,
  batch_period_start date,
  batch_period_end date,
  total_consultants integer DEFAULT 0,
  total_transactions integer DEFAULT 0,
  total_gross_amount numeric DEFAULT 0,
  total_tds_amount numeric DEFAULT 0,
  total_deductions numeric DEFAULT 0,
  total_net_amount numeric DEFAULT 0,
  status varchar(20) DEFAULT 'draft',
  status_history jsonb DEFAULT '[]',
  prepared_by uuid REFERENCES profiles(id),
  prepared_at timestamptz,
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  processed_by uuid REFERENCES profiles(id),
  processed_at timestamptz,
  completed_at timestamptz,
  payment_mode text,
  bank_reference text,
  notes text,
  rejection_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE consultant_payout_batches ENABLE ROW LEVEL SECURITY;

-- Add FK from transactions to batches
ALTER TABLE consultant_commission_transactions
  ADD CONSTRAINT fk_transactions_batch FOREIGN KEY (payout_batch_id)
  REFERENCES consultant_payout_batches(id);

-- ============================================================================
-- 5. CONSULTANT COMMUNICATIONS (31 columns)
-- ============================================================================
CREATE TABLE IF NOT EXISTS consultant_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  consultant_id uuid NOT NULL REFERENCES education_consultants(id),
  communication_type varchar(20) NOT NULL,
  direction varchar(10) DEFAULT 'outbound',
  subject text,
  content text,
  content_html text,
  meeting_date timestamptz,
  meeting_end_date timestamptz,
  meeting_location text,
  meeting_type text,
  meeting_attendees jsonb DEFAULT '[]',
  meeting_outcome text,
  call_duration_seconds integer,
  call_outcome text,
  call_recording_url text,
  email_thread_id text,
  email_message_id text,
  attachments jsonb DEFAULT '[]',
  follow_up_required boolean DEFAULT false,
  follow_up_date date,
  follow_up_type text,
  follow_up_notes text,
  follow_up_completed boolean DEFAULT false,
  follow_up_completed_at timestamptz,
  linked_lead_id uuid REFERENCES admission_leads(id),
  linked_transaction_id uuid REFERENCES consultant_commission_transactions(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);
ALTER TABLE consultant_communications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. CONSULTANT DOCUMENTS (23 columns)
-- ============================================================================
CREATE TABLE IF NOT EXISTS consultant_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  consultant_id uuid NOT NULL REFERENCES education_consultants(id),
  document_type varchar(50) NOT NULL,
  document_name text NOT NULL,
  document_description text,
  document_url text NOT NULL,
  file_size_bytes bigint,
  mime_type text,
  version integer DEFAULT 1,
  previous_version_id uuid REFERENCES consultant_documents(id),
  valid_from date,
  valid_to date,
  is_mandatory boolean DEFAULT false,
  status varchar(20) DEFAULT 'active',
  requires_verification boolean DEFAULT false,
  is_verified boolean DEFAULT false,
  verified_by uuid REFERENCES profiles(id),
  verified_at timestamptz,
  verification_notes text,
  expiry_notification_days integer DEFAULT 30,
  expiry_notification_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  uploaded_by uuid REFERENCES profiles(id)
);
ALTER TABLE consultant_documents ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. CONSULTANT PAYMENT QUERIES (27 columns)
-- ============================================================================
CREATE TABLE IF NOT EXISTS consultant_payment_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  consultant_id uuid NOT NULL REFERENCES education_consultants(id),
  query_number text UNIQUE,
  query_type varchar(50) NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  transaction_id uuid REFERENCES consultant_commission_transactions(id),
  payout_batch_id uuid REFERENCES consultant_payout_batches(id),
  status varchar(20) DEFAULT 'open',
  priority varchar(20) DEFAULT 'normal',
  assigned_to uuid REFERENCES profiles(id),
  assigned_at timestamptz,
  resolution_notes text,
  resolved_by uuid REFERENCES profiles(id),
  resolved_at timestamptz,
  is_escalated boolean DEFAULT false,
  escalated_to uuid REFERENCES profiles(id),
  escalated_at timestamptz,
  escalation_reason text,
  messages jsonb DEFAULT '[]',
  attachments jsonb DEFAULT '[]',
  expected_resolution_date date,
  sla_breached boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE consultant_payment_queries ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 8. CONSULTANT INSTITUTIONS (junction table)
-- Updated: 2026-02-26 - Refactored education_consultants to be a global entity.
--   institution_id, status, tier, contract_start_date, contract_end_date,
--   and contract_document_url were removed from education_consultants and moved here.
--   One consultant row can now be linked to multiple institutions.
-- ============================================================================
CREATE TABLE IF NOT EXISTS consultant_institutions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id         uuid        NOT NULL REFERENCES education_consultants(id) ON DELETE CASCADE,
  institution_id        uuid        NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  status                text        NOT NULL DEFAULT 'active',
  tier                  text        NOT NULL DEFAULT 'bronze',
  contract_start_date   date,
  contract_end_date     date,
  contract_document_url text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  created_by            uuid        REFERENCES profiles(id),
  CONSTRAINT consultant_institutions_unique UNIQUE(consultant_id, institution_id)
);
COMMENT ON TABLE consultant_institutions IS
  'Junction table linking consultants (global) to institutions. Per-institution: status, tier, contract.';

CREATE INDEX IF NOT EXISTS idx_ci_consultant  ON consultant_institutions(consultant_id);
CREATE INDEX IF NOT EXISTS idx_ci_institution ON consultant_institutions(institution_id);
CREATE INDEX IF NOT EXISTS idx_ci_status      ON consultant_institutions(status);
ALTER TABLE consultant_institutions ENABLE ROW LEVEL SECURITY;
