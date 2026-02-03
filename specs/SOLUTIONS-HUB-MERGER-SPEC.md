# Solutions Hub → MyJKKN Merger Specification

> **Status:** DRAFT
> **Created:** 2026-02-03
> **Author:** Claude (with FST analysis)
> **Decision:** MERGE Solutions Hub into MyJKKN as modules

---

## 1. Executive Summary

### 1.1 What We're Doing

Merging JKKN Solutions Hub (standalone Supabase project) into MyJKKN ERP as integrated modules.

### 1.2 Why

| Factor | Separate (Current) | Merged (Target) |
|--------|-------------------|-----------------|
| Data duplication | `departments` table duplicated | Single source of truth |
| User sync | Manual webhook needed | Shared `users` table |
| Revenue reporting | ETL across projects | Direct joins |
| Staff/builder data | Duplicated | Shared entities |
| Maintenance | 2 codebases | 1 codebase |
| Client portal | Works | Works (RLS-protected) |

### 1.3 What's NOT Being Merged

**jkkn-recruit stays SEPARATE** — external applicants uploading files = security boundary.

---

## 2. Current State Inventory

### 2.1 Solutions Hub Database

| Category | Count | Notes |
|----------|-------|-------|
| Tables | 45+ | Software, Training, Content modules |
| Migrations | 19 | ~1,500 lines SQL |
| RLS Policies | 20+ | Role-based access |
| Enums | 20+ | Custom types |
| Functions | 10+ | Triggers, helpers |

### 2.2 Solutions Hub Application

| Category | Count | Notes |
|----------|-------|-------|
| Routes/Pages | 70+ | Admin + 4 portals |
| Components | 114 | Domain-organized |
| Services | 35+ | Data layer |
| Hooks | 30+ | Query integration |
| Types | 4 files | 50+ interfaces |

### 2.3 User Roles (8 types)

| Role | Access | Portal |
|------|--------|--------|
| md_caio | Full admin | `/` dashboard |
| department_head | Department scope | `/department` |
| department_staff | Department scope | `/department` |
| builder | Software talent | `/builder` |
| cohort_member | Training talent | `/cohort` |
| production_learner | Content talent | `/production` |
| jicate_staff | JICATE admin | `/` dashboard |
| client | External client | `/portal` |

---

## 3. MyJKKN Integration Points

### 3.1 Shared Entities (USE EXISTING)

| Entity | Solutions Hub | MyJKKN Equivalent | Action |
|--------|--------------|-------------------|--------|
| departments | `departments` table | `departments` table | **USE MyJKKN** |
| users | `users` table | `users` table | **USE MyJKKN** |
| institutions | Hardcoded | `institutions` table | **USE MyJKKN** |

### 3.2 New Entities (ADD TO MyJKKN)

| Entity | Purpose | Tables |
|--------|---------|--------|
| Clients | External companies | `clients`, `client_referrals` |
| Solutions | Work tracking | `solutions`, `solution_phases`, `solution_mous` |
| Builders | Software talent | `builders`, `builder_skills`, `builder_assignments` |
| Training | Training programs | `training_programs`, `training_sessions`, `cohort_members`, `cohort_assignments` |
| Content | Content production | `content_orders`, `content_deliverables`, `production_learners`, `production_assignments` |
| Financials | Revenue tracking | `payments`, `earnings_ledger`, `revenue_split_models` |
| Discovery | Client visits | `discovery_visits`, `client_communications` |
| Publications | Academic output | `publications`, `publication_contributors`, `accreditation_metrics` |
| JICATE | Facilitation | `jicate_sessions` |

### 3.3 Role Mapping

| Solutions Hub Role | MyJKKN Equivalent | Action |
|--------------------|-------------------|--------|
| md_caio | `super_admin` | Map to existing |
| department_head | `hod` | Map to existing |
| department_staff | `staff` | Map to existing |
| builder | NEW | Add role |
| cohort_member | NEW | Add role |
| production_learner | NEW | Add role |
| jicate_staff | NEW | Add role |
| client | NEW | Add role |

---

## 4. Database Migration Strategy

### 4.1 Phase 1: Schema Extension (No Data)

Create new migration in MyJKKN: `supabase/migrations/YYYYMMDD_solutions_hub_tables.sql`

```sql
-- ============================================
-- SOLUTIONS HUB TABLES
-- Merged from JKKN-Solutions-Hub project
-- ============================================

-- Enum Types
CREATE TYPE solution_type AS ENUM ('software', 'training', 'content');
CREATE TYPE solution_status AS ENUM ('active', 'on_hold', 'completed', 'cancelled', 'in_amc');
CREATE TYPE phase_status AS ENUM (
  'prospecting', 'discovery', 'prd_writing', 'prototype_building',
  'client_demo', 'revisions', 'approved', 'deploying', 'training',
  'live', 'in_amc', 'completed', 'on_hold', 'cancelled'
);
CREATE TYPE source_type AS ENUM ('placement', 'alumni', 'clinical', 'referral', 'direct', 'yi', 'intent');
CREATE TYPE partner_status AS ENUM ('standard', 'yi', 'alumni', 'mou', 'referral');
CREATE TYPE payment_type AS ENUM ('advance', 'milestone', 'completion', 'amc', 'mou_signing', 'deployment', 'acceptance');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded');
CREATE TYPE recipient_type AS ENUM ('builder', 'cohort_member', 'production_learner', 'department', 'jicate', 'institution', 'council', 'infrastructure', 'referral_bonus');

-- ============================================
-- CLIENTS MODULE
-- ============================================

CREATE TABLE IF NOT EXISTS sh_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  source_type source_type NOT NULL DEFAULT 'direct',
  source_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  partner_status partner_status NOT NULL DEFAULT 'standard',
  referral_count INTEGER DEFAULT 0,
  intent_agency_id TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- SOLUTIONS MODULE
-- ============================================

CREATE TABLE IF NOT EXISTS sh_solutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_code TEXT NOT NULL UNIQUE, -- JKKN-SOL-YYYY-NNN
  solution_type solution_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  client_id UUID REFERENCES sh_clients(id) ON DELETE CASCADE,
  lead_department_id UUID REFERENCES departments(id) ON DELETE SET NULL NOT NULL,
  status solution_status NOT NULL DEFAULT 'active',
  base_price DECIMAL(12,2),
  final_price DECIMAL(12,2),
  start_date DATE,
  target_date DATE,
  completion_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sh_solution_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id UUID REFERENCES sh_solutions(id) ON DELETE CASCADE NOT NULL,
  phase_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status phase_status NOT NULL DEFAULT 'prospecting',
  owner_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  estimated_value DECIMAL(12,2),
  start_date DATE,
  due_date DATE,
  completion_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(solution_id, phase_number)
);

CREATE TABLE IF NOT EXISTS sh_solution_mous (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id UUID REFERENCES sh_solutions(id) ON DELETE CASCADE NOT NULL,
  deal_value DECIMAL(12,2) NOT NULL,
  amc_value DECIMAL(12,2),
  payment_terms JSONB,
  status TEXT DEFAULT 'draft',
  mou_document_url TEXT,
  signed_date DATE,
  expiry_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BUILDERS MODULE (Software Talent)
-- ============================================

CREATE TABLE IF NOT EXISTS sh_builders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  trained_date DATE,
  specialization TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sh_builder_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_id UUID REFERENCES sh_builders(id) ON DELETE CASCADE NOT NULL,
  skill_name TEXT NOT NULL,
  proficiency_level INTEGER CHECK (proficiency_level BETWEEN 1 AND 5),
  version INTEGER DEFAULT 1,
  assessed_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sh_builder_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID REFERENCES sh_solution_phases(id) ON DELETE CASCADE NOT NULL,
  builder_id UUID REFERENCES sh_builders(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'contributor', -- lead, contributor
  status TEXT NOT NULL DEFAULT 'requested', -- requested, approved, active, completed, withdrawn
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS sh_prototype_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID REFERENCES sh_solution_phases(id) ON DELETE CASCADE NOT NULL,
  version INTEGER NOT NULL,
  prototype_url TEXT,
  client_approved BOOLEAN DEFAULT false,
  changes_made TEXT,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sh_bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iteration_id UUID REFERENCES sh_prototype_iterations(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  status TEXT NOT NULL DEFAULT 'open', -- open, in_progress, resolved, closed
  resolution_notes TEXT,
  reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sh_phase_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID REFERENCES sh_solution_phases(id) ON DELETE CASCADE NOT NULL,
  environment TEXT NOT NULL, -- development, staging, production
  vercel_url TEXT,
  supabase_project_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  deployed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS sh_implementation_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID REFERENCES sh_solution_phases(id) ON DELETE CASCADE NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,
  trained_date DATE,
  usage_status TEXT DEFAULT 'pending', -- pending, active, inactive
  notes TEXT
);

-- ============================================
-- TRAINING MODULE
-- ============================================

CREATE TABLE IF NOT EXISTS sh_training_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id UUID REFERENCES sh_solutions(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  program_type TEXT NOT NULL, -- workshop, bootcamp, certification, custom, faculty_development, corporate, academic
  track TEXT,
  participant_count INTEGER,
  location_preference TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'planned',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sh_training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID REFERENCES sh_training_programs(id) ON DELETE CASCADE NOT NULL,
  session_number INTEGER NOT NULL,
  title TEXT,
  session_date DATE,
  start_time TIME,
  end_time TIME,
  location TEXT,
  status TEXT DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled
  google_calendar_event_id TEXT,
  attendance_count INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sh_cohort_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  level TEXT DEFAULT 'observer', -- observer, co_lead, lead, master
  track TEXT,
  sessions_observed INTEGER DEFAULT 0,
  sessions_co_led INTEGER DEFAULT 0,
  sessions_led INTEGER DEFAULT 0,
  total_earnings DECIMAL(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sh_cohort_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sh_training_sessions(id) ON DELETE CASCADE NOT NULL,
  cohort_member_id UUID REFERENCES sh_cohort_members(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL, -- observer, co_lead, lead, support
  earnings DECIMAL(10,2),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CONTENT MODULE
-- ============================================

CREATE TABLE IF NOT EXISTS sh_content_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id UUID REFERENCES sh_solutions(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  order_type TEXT NOT NULL, -- video, graphic, document, presentation, animation, social_media, other
  division TEXT NOT NULL, -- video, design, writing, animation, social, other
  quantity INTEGER DEFAULT 1,
  revision_rounds INTEGER DEFAULT 2,
  due_date DATE,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sh_content_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES sh_content_orders(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  file_url TEXT,
  status TEXT DEFAULT 'pending', -- pending, in_progress, review, revision, approved, delivered
  revision_count INTEGER DEFAULT 0,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sh_production_learners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  division TEXT NOT NULL,
  skill_level TEXT DEFAULT 'beginner', -- beginner, intermediate, advanced, expert
  orders_completed INTEGER DEFAULT 0,
  total_earnings DECIMAL(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sh_production_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id UUID REFERENCES sh_content_deliverables(id) ON DELETE CASCADE NOT NULL,
  learner_id UUID REFERENCES sh_production_learners(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'creator', -- creator, reviewer, lead
  earnings DECIMAL(10,2),
  quality_rating INTEGER CHECK (quality_rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DISCOVERY & COMMUNICATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS sh_discovery_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES sh_clients(id) ON DELETE CASCADE NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  visit_date DATE NOT NULL,
  visitors JSONB, -- Array of {name, role}
  observations TEXT,
  pain_points TEXT,
  opportunities TEXT,
  photos_urls TEXT[],
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sh_client_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES sh_clients(id) ON DELETE CASCADE NOT NULL,
  solution_id UUID REFERENCES sh_solutions(id) ON DELETE SET NULL,
  communication_type TEXT NOT NULL, -- email, call, meeting, whatsapp, other
  source TEXT DEFAULT 'manual', -- manual, gmail_sync, whatsapp_sync
  direction TEXT NOT NULL, -- inbound, outbound
  subject TEXT,
  content TEXT,
  participants TEXT[],
  communication_date TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- FINANCIALS
-- ============================================

CREATE TABLE IF NOT EXISTS sh_revenue_split_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_type solution_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  split_config JSONB NOT NULL, -- {builder: 40, department: 30, jicate: 15, institution: 15}
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sh_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id UUID REFERENCES sh_solutions(id) ON DELETE SET NULL,
  phase_id UUID REFERENCES sh_solution_phases(id) ON DELETE SET NULL,
  order_id UUID REFERENCES sh_content_orders(id) ON DELETE SET NULL,
  program_id UUID REFERENCES sh_training_programs(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_type payment_type NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  payment_date DATE,
  reference_number TEXT,
  split_model_id UUID REFERENCES sh_revenue_split_models(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sh_earnings_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES sh_payments(id) ON DELETE CASCADE NOT NULL,
  recipient_type recipient_type NOT NULL,
  recipient_id UUID, -- References builder, cohort_member, production_learner, or department
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL,
  percentage DECIMAL(5,2),
  status TEXT DEFAULT 'pending', -- pending, processed, paid
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sh_client_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES sh_clients(id) ON DELETE CASCADE NOT NULL,
  referring_dept_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  executing_dept_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  bonus_percentage DECIMAL(5,2) DEFAULT 5,
  bonus_amount DECIMAL(12,2),
  bonus_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ACCREDITATION & PUBLICATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS sh_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id UUID REFERENCES sh_solutions(id) ON DELETE SET NULL,
  phase_id UUID REFERENCES sh_solution_phases(id) ON DELETE SET NULL,
  paper_type TEXT NOT NULL, -- journal, conference, patent, book_chapter, case_study
  title TEXT NOT NULL,
  authors TEXT[],
  abstract TEXT,
  journal_name TEXT,
  journal_type TEXT, -- scopus, wos, ugc, other
  status TEXT DEFAULT 'draft', -- draft, submitted, under_review, accepted, published, rejected
  submission_date DATE,
  acceptance_date DATE,
  publication_date DATE,
  doi TEXT,
  nirf_category TEXT,
  naac_criterion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sh_publication_contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID REFERENCES sh_publications(id) ON DELETE CASCADE NOT NULL,
  builder_id UUID REFERENCES sh_builders(id) ON DELETE SET NULL,
  cohort_member_id UUID REFERENCES sh_cohort_members(id) ON DELETE SET NULL,
  learner_id UUID REFERENCES sh_production_learners(id) ON DELETE SET NULL,
  credit_type TEXT DEFAULT 'coauthor', -- coauthor, acknowledgment
  contribution_description TEXT
);

CREATE TABLE IF NOT EXISTS sh_accreditation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL, -- nirf, naac
  metric_code TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  max_score DECIMAL(5,2),
  calculation_method TEXT,
  is_active BOOLEAN DEFAULT true
);

-- ============================================
-- JICATE & SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS sh_jicate_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id UUID REFERENCES sh_solutions(id) ON DELETE SET NULL,
  phase_id UUID REFERENCES sh_solution_phases(id) ON DELETE SET NULL,
  session_date DATE NOT NULL,
  booked_by_dept_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  attendees TEXT[],
  jicate_facilitator TEXT,
  agenda TEXT,
  outcome TEXT, -- successful, needs_followup, escalated, cancelled
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sh_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  related_entity_type TEXT,
  related_entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sh_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_sh_clients_source_type ON sh_clients(source_type);
CREATE INDEX idx_sh_clients_partner_status ON sh_clients(partner_status);
CREATE INDEX idx_sh_solutions_type ON sh_solutions(solution_type);
CREATE INDEX idx_sh_solutions_status ON sh_solutions(status);
CREATE INDEX idx_sh_solutions_client ON sh_solutions(client_id);
CREATE INDEX idx_sh_solutions_department ON sh_solutions(lead_department_id);
CREATE INDEX idx_sh_phases_solution ON sh_solution_phases(solution_id);
CREATE INDEX idx_sh_phases_status ON sh_solution_phases(status);
CREATE INDEX idx_sh_builders_department ON sh_builders(department_id);
CREATE INDEX idx_sh_builder_assignments_phase ON sh_builder_assignments(phase_id);
CREATE INDEX idx_sh_builder_assignments_builder ON sh_builder_assignments(builder_id);
CREATE INDEX idx_sh_cohort_members_department ON sh_cohort_members(department_id);
CREATE INDEX idx_sh_production_learners_division ON sh_production_learners(division);
CREATE INDEX idx_sh_payments_solution ON sh_payments(solution_id);
CREATE INDEX idx_sh_payments_status ON sh_payments(status);
CREATE INDEX idx_sh_earnings_payment ON sh_earnings_ledger(payment_id);
CREATE INDEX idx_sh_earnings_recipient ON sh_earnings_ledger(recipient_type, recipient_id);
CREATE INDEX idx_sh_notifications_user ON sh_notifications(user_id, is_read);
CREATE INDEX idx_sh_audit_logs_user ON sh_audit_logs(user_id);
CREATE INDEX idx_sh_audit_logs_entity ON sh_audit_logs(entity_type, entity_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION sh_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_sh_clients_updated_at BEFORE UPDATE ON sh_clients FOR EACH ROW EXECUTE FUNCTION sh_update_updated_at();
CREATE TRIGGER tr_sh_solutions_updated_at BEFORE UPDATE ON sh_solutions FOR EACH ROW EXECUTE FUNCTION sh_update_updated_at();
CREATE TRIGGER tr_sh_phases_updated_at BEFORE UPDATE ON sh_solution_phases FOR EACH ROW EXECUTE FUNCTION sh_update_updated_at();
CREATE TRIGGER tr_sh_builders_updated_at BEFORE UPDATE ON sh_builders FOR EACH ROW EXECUTE FUNCTION sh_update_updated_at();
CREATE TRIGGER tr_sh_cohort_members_updated_at BEFORE UPDATE ON sh_cohort_members FOR EACH ROW EXECUTE FUNCTION sh_update_updated_at();
CREATE TRIGGER tr_sh_production_learners_updated_at BEFORE UPDATE ON sh_production_learners FOR EACH ROW EXECUTE FUNCTION sh_update_updated_at();
CREATE TRIGGER tr_sh_training_programs_updated_at BEFORE UPDATE ON sh_training_programs FOR EACH ROW EXECUTE FUNCTION sh_update_updated_at();
CREATE TRIGGER tr_sh_content_orders_updated_at BEFORE UPDATE ON sh_content_orders FOR EACH ROW EXECUTE FUNCTION sh_update_updated_at();
CREATE TRIGGER tr_sh_content_deliverables_updated_at BEFORE UPDATE ON sh_content_deliverables FOR EACH ROW EXECUTE FUNCTION sh_update_updated_at();
CREATE TRIGGER tr_sh_publications_updated_at BEFORE UPDATE ON sh_publications FOR EACH ROW EXECUTE FUNCTION sh_update_updated_at();

-- Auto-generate solution code
CREATE OR REPLACE FUNCTION sh_generate_solution_code()
RETURNS TRIGGER AS $$
DECLARE
  year_part TEXT;
  seq_num INTEGER;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(solution_code FROM 'JKKN-SOL-\d{4}-(\d+)') AS INTEGER)), 0) + 1
  INTO seq_num
  FROM sh_solutions
  WHERE solution_code LIKE 'JKKN-SOL-' || year_part || '-%';

  NEW.solution_code := 'JKKN-SOL-' || year_part || '-' || LPAD(seq_num::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_sh_solutions_code BEFORE INSERT ON sh_solutions FOR EACH ROW WHEN (NEW.solution_code IS NULL) EXECUTE FUNCTION sh_generate_solution_code();
```

### 4.2 Phase 2: RLS Policies

Create: `supabase/migrations/YYYYMMDD_solutions_hub_rls.sql`

```sql
-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- Solutions Hub Tables
-- ============================================

-- Enable RLS on all tables
ALTER TABLE sh_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_solution_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_solution_mous ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_builders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_builder_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_builder_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_prototype_iterations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_phase_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_implementation_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_training_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_cohort_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_cohort_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_content_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_content_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_production_learners ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_production_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_discovery_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_client_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_revenue_split_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_earnings_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_client_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_publication_contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_accreditation_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_jicate_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION sh_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin', 'jicate_staff')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION sh_is_hod()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'hod'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION sh_user_department_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT department_id FROM users WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION sh_is_builder()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sh_builders WHERE user_id = auth.uid() AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION sh_is_cohort_member()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sh_cohort_members WHERE user_id = auth.uid() AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION sh_is_production_learner()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sh_production_learners WHERE user_id = auth.uid() AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION sh_is_client()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'client'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION sh_client_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT c.id FROM sh_clients c
    JOIN users u ON u.email = c.contact_email
    WHERE u.id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- CLIENT POLICIES
-- Clients can only see their own data
-- ============================================

-- Solutions: Clients see their solutions only
CREATE POLICY "clients_view_own_solutions" ON sh_solutions
  FOR SELECT USING (
    sh_is_admin() OR sh_is_hod() OR
    (sh_is_client() AND client_id = sh_client_id())
  );

-- Phases: Clients see phases of their solutions
CREATE POLICY "clients_view_own_phases" ON sh_solution_phases
  FOR SELECT USING (
    sh_is_admin() OR sh_is_hod() OR
    (sh_is_client() AND solution_id IN (
      SELECT id FROM sh_solutions WHERE client_id = sh_client_id()
    ))
  );

-- Deliverables: Clients see their content deliverables
CREATE POLICY "clients_view_own_deliverables" ON sh_content_deliverables
  FOR SELECT USING (
    sh_is_admin() OR sh_is_hod() OR
    (sh_is_client() AND order_id IN (
      SELECT co.id FROM sh_content_orders co
      JOIN sh_solutions s ON co.solution_id = s.id
      WHERE s.client_id = sh_client_id()
    ))
  );

-- Payments: Clients see their payments
CREATE POLICY "clients_view_own_payments" ON sh_payments
  FOR SELECT USING (
    sh_is_admin() OR
    (sh_is_client() AND solution_id IN (
      SELECT id FROM sh_solutions WHERE client_id = sh_client_id()
    ))
  );

-- ============================================
-- BUILDER POLICIES
-- Builders see their assignments
-- ============================================

CREATE POLICY "builders_view_assignments" ON sh_builder_assignments
  FOR SELECT USING (
    sh_is_admin() OR sh_is_hod() OR
    (sh_is_builder() AND builder_id IN (
      SELECT id FROM sh_builders WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "builders_view_own_profile" ON sh_builders
  FOR SELECT USING (
    sh_is_admin() OR sh_is_hod() OR user_id = auth.uid()
  );

-- ============================================
-- COHORT MEMBER POLICIES
-- ============================================

CREATE POLICY "cohort_view_assignments" ON sh_cohort_assignments
  FOR SELECT USING (
    sh_is_admin() OR sh_is_hod() OR
    (sh_is_cohort_member() AND cohort_member_id IN (
      SELECT id FROM sh_cohort_members WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "cohort_view_own_profile" ON sh_cohort_members
  FOR SELECT USING (
    sh_is_admin() OR sh_is_hod() OR user_id = auth.uid()
  );

-- ============================================
-- PRODUCTION LEARNER POLICIES
-- ============================================

CREATE POLICY "production_view_assignments" ON sh_production_assignments
  FOR SELECT USING (
    sh_is_admin() OR sh_is_hod() OR
    (sh_is_production_learner() AND learner_id IN (
      SELECT id FROM sh_production_learners WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "production_view_own_profile" ON sh_production_learners
  FOR SELECT USING (
    sh_is_admin() OR sh_is_hod() OR user_id = auth.uid()
  );

-- ============================================
-- ADMIN/HOD POLICIES
-- Full access for admins, department-scoped for HODs
-- ============================================

-- Admins can do everything
CREATE POLICY "admins_full_access_clients" ON sh_clients FOR ALL USING (sh_is_admin());
CREATE POLICY "admins_full_access_solutions" ON sh_solutions FOR ALL USING (sh_is_admin());
CREATE POLICY "admins_full_access_phases" ON sh_solution_phases FOR ALL USING (sh_is_admin());
CREATE POLICY "admins_full_access_mous" ON sh_solution_mous FOR ALL USING (sh_is_admin());
CREATE POLICY "admins_full_access_builders" ON sh_builders FOR ALL USING (sh_is_admin());
CREATE POLICY "admins_full_access_training" ON sh_training_programs FOR ALL USING (sh_is_admin());
CREATE POLICY "admins_full_access_content" ON sh_content_orders FOR ALL USING (sh_is_admin());
CREATE POLICY "admins_full_access_payments" ON sh_payments FOR ALL USING (sh_is_admin());

-- HODs see department-scoped data
CREATE POLICY "hod_view_dept_solutions" ON sh_solutions
  FOR SELECT USING (sh_is_hod() AND lead_department_id = sh_user_department_id());

CREATE POLICY "hod_view_dept_builders" ON sh_builders
  FOR SELECT USING (sh_is_hod() AND department_id = sh_user_department_id());

CREATE POLICY "hod_view_dept_cohort" ON sh_cohort_members
  FOR SELECT USING (sh_is_hod() AND department_id = sh_user_department_id());

-- Notifications: Users see their own
CREATE POLICY "users_own_notifications" ON sh_notifications
  FOR ALL USING (user_id = auth.uid());

-- Audit logs: Admins only
CREATE POLICY "admins_view_audit_logs" ON sh_audit_logs
  FOR SELECT USING (sh_is_admin());
```

### 4.3 Phase 3: Role Updates

Add new roles to MyJKKN `custom_roles` table:

```sql
-- Add Solutions Hub roles
INSERT INTO custom_roles (role_name, description, permissions) VALUES
('builder', 'Software builder talent', '{"solutions_hub": ["view_assignments", "claim_phases", "submit_work"]}'),
('cohort_member', 'Training cohort talent', '{"solutions_hub": ["view_sessions", "claim_sessions", "view_earnings"]}'),
('production_learner', 'Content production talent', '{"solutions_hub": ["view_orders", "submit_deliverables", "view_earnings"]}'),
('jicate_staff', 'JICATE facilitator', '{"solutions_hub": ["full_access"]}'),
('client', 'External client', '{"solutions_hub": ["view_own_solutions", "view_own_invoices", "view_own_deliverables"]}')
ON CONFLICT (role_name) DO NOTHING;
```

---

## 5. Code Migration Strategy

### 5.1 File Structure in MyJKKN

```
app/(routes)/
├── solutions/                    # NEW: Admin views
│   ├── page.tsx                  # Solutions list
│   ├── new/page.tsx              # Create solution
│   ├── [id]/
│   │   ├── page.tsx              # Solution detail
│   │   └── mou/page.tsx          # MOU management
│   ├── software/
│   │   ├── page.tsx              # Software overview
│   │   ├── builders/page.tsx     # Builder talent pool
│   │   └── phases/page.tsx       # Phase management
│   ├── training/
│   │   ├── page.tsx              # Training overview
│   │   ├── cohort/page.tsx       # Cohort management
│   │   └── sessions/page.tsx     # Sessions
│   ├── content/
│   │   ├── page.tsx              # Content overview
│   │   ├── production/page.tsx   # Production learners
│   │   └── queue/page.tsx        # Deliverable queue
│   ├── discovery/page.tsx        # Site visits
│   ├── payments/page.tsx         # Payments
│   ├── earnings/page.tsx         # Earnings ledger
│   └── publications/page.tsx     # Publications
│
├── portal/                       # EXTEND: Add client portal
│   ├── client/                   # NEW: Client portal
│   │   ├── page.tsx              # Dashboard
│   │   ├── projects/page.tsx     # Their solutions
│   │   ├── deliverables/page.tsx # Their content
│   │   └── invoices/page.tsx     # Their invoices
│
├── talent/                       # NEW: Talent portals
│   ├── builder/
│   │   ├── page.tsx              # Builder dashboard
│   │   ├── assignments/page.tsx  # My assignments
│   │   ├── available/page.tsx    # Available phases
│   │   └── earnings/page.tsx     # My earnings
│   ├── cohort/
│   │   ├── page.tsx              # Cohort dashboard
│   │   ├── sessions/page.tsx     # Available sessions
│   │   └── earnings/page.tsx     # My earnings
│   └── production/
│       ├── page.tsx              # Production dashboard
│       ├── queue/page.tsx        # Work queue
│       └── earnings/page.tsx     # My earnings

lib/services/
├── solutions/                    # NEW: All solutions services
│   ├── solutions-service.ts
│   ├── phases-service.ts
│   ├── clients-service.ts
│   ├── builders-service.ts
│   ├── training-service.ts
│   ├── content-service.ts
│   ├── payments-service.ts
│   ├── earnings-service.ts
│   ├── discovery-service.ts
│   ├── publications-service.ts
│   └── index.ts

hooks/
├── solutions/                    # NEW: All solutions hooks
│   ├── use-solutions.ts
│   ├── use-phases.ts
│   ├── use-clients.ts
│   ├── use-builders.ts
│   ├── use-builder-portal.ts
│   ├── use-training.ts
│   ├── use-cohort-portal.ts
│   ├── use-content.ts
│   ├── use-production-portal.ts
│   ├── use-payments.ts
│   ├── use-earnings.ts
│   └── index.ts

components/
├── solutions/                    # NEW: All solutions components
│   ├── clients/
│   ├── solutions/
│   ├── phases/
│   ├── builders/
│   ├── training/
│   ├── content/
│   ├── financials/
│   ├── discovery/
│   └── publications/

types/
├── solutions.ts                  # NEW: All solutions types
```

### 5.2 Service Migration Pattern

Original Solutions Hub service:
```typescript
// JKKN-Solutions-Hub/src/services/solutions.ts
import { createClient } from '@/lib/supabase/client';

export async function getSolutions() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('solutions')
    .select('*, client:clients(*), department:departments(*)');
  // ...
}
```

Migrated to MyJKKN pattern:
```typescript
// MyJKKN/lib/services/solutions/solutions-service.ts
import { BaseService } from '../base-service';

export class SolutionsService extends BaseService {
  async getSolutions(params?: PaginationParams) {
    return this.withTimeout(async () => {
      const query = this.supabase
        .from('sh_solutions')  // Note: sh_ prefix
        .select('*, client:sh_clients(*), department:departments(*)');

      return this.paginate(query, params);
    });
  }
  // ...
}

export const solutionsService = new SolutionsService();
```

### 5.3 Hook Migration Pattern

Original:
```typescript
// JKKN-Solutions-Hub/src/hooks/use-solutions.ts
export function useSolutions() {
  return useQuery({
    queryKey: ['solutions'],
    queryFn: () => getSolutions(),
  });
}
```

Migrated:
```typescript
// MyJKKN/hooks/solutions/use-solutions.ts
import { solutionsService } from '@/lib/services/solutions';
import { QUERY_KEYS } from '@/lib/query-keys';

export function useSolutions(params?: PaginationParams) {
  return useQuery({
    queryKey: [...QUERY_KEYS.solutions.list, params],
    queryFn: () => solutionsService.getSolutions(params),
  });
}
```

### 5.4 Component Migration

- Move components from `JKKN-Solutions-Hub/src/components/` to `MyJKKN/components/solutions/`
- Update imports to use MyJKKN patterns
- Replace direct Supabase calls with service layer calls
- Update type imports to use `types/solutions.ts`

---

## 6. Menu Integration

### 6.1 Add to sidebarMenuLink.ts

```typescript
// In lib/sidebarMenuLink.ts

// Solutions Hub Section
{
  title: 'Solutions Hub',
  icon: Briefcase,
  roles: ['super_admin', 'admin', 'hod', 'jicate_staff'],
  children: [
    { title: 'Dashboard', href: '/solutions', icon: LayoutDashboard },
    { title: 'Clients', href: '/solutions/clients', icon: Users },
    { title: 'All Solutions', href: '/solutions/list', icon: FileStack },
    { title: 'Software', href: '/solutions/software', icon: Code },
    { title: 'Training', href: '/solutions/training', icon: GraduationCap },
    { title: 'Content', href: '/solutions/content', icon: Palette },
    { title: 'Discovery', href: '/solutions/discovery', icon: Search },
    { title: 'Payments', href: '/solutions/payments', icon: CreditCard },
    { title: 'Earnings', href: '/solutions/earnings', icon: TrendingUp },
    { title: 'Publications', href: '/solutions/publications', icon: BookOpen },
  ]
},

// Talent Portals (role-specific)
{
  title: 'Builder Portal',
  href: '/talent/builder',
  icon: Hammer,
  roles: ['builder'],
},
{
  title: 'Cohort Portal',
  href: '/talent/cohort',
  icon: Users,
  roles: ['cohort_member'],
},
{
  title: 'Production Portal',
  href: '/talent/production',
  icon: Palette,
  roles: ['production_learner'],
},

// Client Portal (external)
{
  title: 'Client Portal',
  href: '/portal/client',
  icon: Building,
  roles: ['client'],
},
```

---

## 7. Data Migration (Existing Data)

### 7.1 Export from Solutions Hub

```bash
# Export existing data from Solutions Hub Supabase
~/bin/supabase db dump --project-ref izrhjeopgphbsueulnck --data-only > solutions_hub_data.sql
```

### 7.2 Transform and Import

```sql
-- Transform table names (add sh_ prefix)
-- Update foreign keys to reference MyJKKN tables

-- Example: Import clients
INSERT INTO sh_clients (id, name, contact_person, ...)
SELECT id, name, contact_person, ...
FROM solutions_hub_export.clients;

-- Update department references to use MyJKKN department IDs
UPDATE sh_clients
SET source_department_id = (
  SELECT d.id FROM departments d
  WHERE d.code = (
    SELECT old.code FROM solutions_hub_export.departments old
    WHERE old.id = sh_clients.source_department_id
  )
);
```

### 7.3 User Migration

```sql
-- Link Solutions Hub users to MyJKKN users by email
UPDATE sh_builders b
SET user_id = (SELECT u.id FROM users u WHERE u.email = b.email)
WHERE b.email IS NOT NULL;

UPDATE sh_cohort_members c
SET user_id = (SELECT u.id FROM users u WHERE u.email = c.email)
WHERE c.email IS NOT NULL;

UPDATE sh_production_learners p
SET user_id = (SELECT u.id FROM users u WHERE u.email = p.email)
WHERE p.email IS NOT NULL;
```

---

## 8. Phased Rollout Plan

### Phase 1: Schema Only (Week 1)
- [ ] Create database migrations
- [ ] Apply to staging environment
- [ ] Verify all tables created
- [ ] Test RLS policies

### Phase 2: Service Layer (Week 2)
- [ ] Create solutions service files
- [ ] Create hooks
- [ ] Create types
- [ ] Unit test services

### Phase 3: UI Components (Week 3)
- [ ] Migrate components
- [ ] Create routes
- [ ] Update menu
- [ ] Test all pages load

### Phase 4: Data Migration (Week 4)
- [ ] Export Solutions Hub data
- [ ] Transform and import
- [ ] Verify data integrity
- [ ] Test with real data

### Phase 5: Portal Testing (Week 5)
- [ ] Test admin dashboard
- [ ] Test builder portal
- [ ] Test cohort portal
- [ ] Test production portal
- [ ] Test client portal

### Phase 6: Go Live (Week 6)
- [ ] Final data sync
- [ ] DNS/redirect setup
- [ ] Monitor for issues
- [ ] Deprecate old project

---

## 9. Rollback Plan

If issues arise:

1. **Database:** Keep Solutions Hub Supabase project active for 30 days post-migration
2. **Code:** Feature flag to disable Solutions Hub routes
3. **Data:** Nightly backups of both systems during transition
4. **Users:** Redirect URLs to old system if needed

---

## 10. Success Criteria

| Metric | Target |
|--------|--------|
| All 8 roles can login | 100% |
| All portals accessible | 100% |
| Data integrity verified | 100% |
| No duplicate departments | 0 duplicates |
| Client portal RLS working | Clients see only their data |
| Build time | < 5 minutes |
| No regression in MyJKKN | All existing features work |

---

## 11. Open Questions

1. **File storage:** Move Solutions Hub files to MyJKKN storage bucket?
2. **Notifications:** Merge notification systems or keep separate?
3. **Audit logs:** Unified audit log or separate?
4. **Demo accounts:** Create new or migrate existing?

---

## 12. References

- MyJKKN Architecture: `/Users/omm/PROJECTS/MyJKKN/CLAUDE.md`
- Solutions Hub Source: `/Users/omm/PROJECTS/JKKN-Solutions-Hub/`
- FST Analysis: This conversation (2026-02-03)

---

*Last Updated: 2026-02-03*
