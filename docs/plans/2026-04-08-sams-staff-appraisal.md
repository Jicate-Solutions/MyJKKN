# SAMS Staff Appraisal Module — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a 16-metric facilitator grading system that auto-measures 12 metrics from existing MyJKKN data, lets facilitators supplement + declare, and flows through HoD → Principal approval with salary projection.

**Architecture:** Hybrid auto-measurement. Services query 15+ existing tables (sh_solutions, sh_publications, okr_objectives, etc.) to pre-calculate scores. Faculty reviews, supplements, writes narratives, and submits. HoD validates, Principal approves. IQAC compiles reports.

**Tech Stack:** Next.js 15 App Router, Supabase (23 new tables, RLS, edge functions), React Query v5, shadcn/ui, Claude API for AI alignment.

**Source Spec:** `specs/SAMS-STAFF-APPRAISAL-SPEC.md` v4.0 + `specs/JKKN-Facilitator-Grading-Benchmarks-v2.md`

---

## Phase Dependency Map

```
Phase 1: Database (SEQUENTIAL — everything depends on this)
Phase 2: Types + Sidebar (SEQUENTIAL — services depend on types)
Phase 3: Auto-Measure Engine (SEQUENTIAL — core brain, dashboard depends on this)
Phase 4: Services + Hooks (SEQUENTIAL — pages depend on these)
Phase 5: Dashboard Page (SEQUENTIAL — first page, sets patterns)
─── dependency boundary ───
Phase 6A: Faculty Appraisal Form  → PARALLEL (own files)
Phase 6B: New Trackers (M03, M07) → PARALLEL (own files)
Phase 6C: Team Evaluation         → PARALLEL (own files)
─── merge boundary ───
Phase 7A: Review Flow (HoD + Principal) → PARALLEL (own files)
Phase 7B: Feedback + Appeals            → PARALLEL (own files)
─── merge boundary ───
Phase 8: Salary + Reports + Executive (SEQUENTIAL — needs all data)
Phase 9: AI Alignment + Automation (SEQUENTIAL — final enhancement)
```

---

## Phase 1: Database Migration (SEQUENTIAL)

### T01: Create SAMS migration file with core tables

**Files:**
- Create: `supabase/migrations/20260408000001_sams_staff_appraisal_module.sql`

**Step 1: Write the migration SQL**

```sql
-- ============================================================
-- SAMS: Staff Appraisal Management System
-- 23 tables, RLS policies, indexes, storage bucket
-- Spec: specs/SAMS-STAFF-APPRAISAL-SPEC.md v4.0
-- ============================================================

-- ==================== CORE TABLES ====================

-- 1. Appraisal Cycles
CREATE TABLE IF NOT EXISTS sams_appraisal_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
    quarter TEXT NOT NULL CHECK (quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
    calendar_year INT NOT NULL,
    state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'open', 'under_review', 'closed', 'archived')),
    start_date DATE,
    submission_deadline DATE,
    grace_period_end DATE,
    review_deadline DATE,
    close_date DATE,
    baseline_targets JSONB DEFAULT '{}',
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active cycle per institution
CREATE UNIQUE INDEX IF NOT EXISTS idx_sams_one_active_cycle
    ON sams_appraisal_cycles(institution_id) WHERE state = 'open';

CREATE INDEX IF NOT EXISTS idx_sams_cycles_institution ON sams_appraisal_cycles(institution_id);
CREATE INDEX IF NOT EXISTS idx_sams_cycles_state ON sams_appraisal_cycles(state);

-- 2. Appraisals (one per facilitator per cycle)
CREATE TABLE IF NOT EXISTS sams_appraisals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES sams_appraisal_cycles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    calendar_year INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN (
        'not_started', 'in_progress', 'submitted', 'under_review',
        'returned', 'resubmitted', 'hod_approved', 'approved', 'closed'
    )),
    total_points NUMERIC(5,2) DEFAULT 0 CHECK (total_points BETWEEN 0 AND 48),
    overall_grade TEXT CHECK (overall_grade IN ('A++', 'A+', 'A', 'B')),
    inst_vision_text TEXT,
    inst_mission_text TEXT,
    inst_coe_text TEXT,
    dept_vision_text TEXT,
    dept_mission_text TEXT,
    dept_coe_text TEXT,
    vision_acknowledged BOOLEAN DEFAULT false,
    vision_ack_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    return_reason TEXT,
    return_metric_code TEXT,
    returned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    returned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sams_one_appraisal_per_cycle UNIQUE (cycle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sams_appraisals_user ON sams_appraisals(user_id);
CREATE INDEX IF NOT EXISTS idx_sams_appraisals_institution ON sams_appraisals(institution_id);
CREATE INDEX IF NOT EXISTS idx_sams_appraisals_status ON sams_appraisals(status);
CREATE INDEX IF NOT EXISTS idx_sams_appraisals_cycle ON sams_appraisals(cycle_id);

-- 3. Metric Scores (16 per appraisal)
CREATE TABLE IF NOT EXISTS sams_metric_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appraisal_id UUID NOT NULL REFERENCES sams_appraisals(id) ON DELETE CASCADE,
    metric_code TEXT NOT NULL CHECK (metric_code IN (
        'M01','M02','M03','M04','M05','M06','M07','M08',
        'M09','M10','M11','M12','M13','M14','M15','M16'
    )),
    auto_count INT DEFAULT 0,
    auto_score NUMERIC(3,1) DEFAULT 0 CHECK (auto_score BETWEEN 0 AND 3),
    supplement_count INT DEFAULT 0,
    supplement_score NUMERIC(3,1) DEFAULT 0,
    final_score NUMERIC(3,1) DEFAULT 0 CHECK (final_score BETWEEN 0 AND 3),
    grade TEXT CHECK (grade IN ('A++', 'A+', 'A', 'B')),
    is_team_metric BOOLEAN DEFAULT false,
    hod_validated BOOLEAN DEFAULT false,
    hod_validated_at TIMESTAMPTZ,
    reviewed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sams_one_score_per_metric UNIQUE (appraisal_id, metric_code)
);

CREATE INDEX IF NOT EXISTS idx_sams_scores_appraisal ON sams_metric_scores(appraisal_id);

-- 4. Supplement Entries (faculty-added entries not captured by auto)
CREATE TABLE IF NOT EXISTS sams_supplement_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appraisal_id UUID NOT NULL REFERENCES sams_appraisals(id) ON DELETE CASCADE,
    metric_code TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    data_json JSONB NOT NULL DEFAULT '{}',
    evidence_url TEXT,
    quarter_added TEXT NOT NULL CHECK (quarter_added IN ('Q1', 'Q2', 'Q3', 'Q4')),
    calendar_year INT NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sams_supplements_appraisal ON sams_supplement_entries(appraisal_id);
CREATE INDEX IF NOT EXISTS idx_sams_supplements_metric ON sams_supplement_entries(metric_code);

-- 5. Narratives (self-assessment text per metric)
CREATE TABLE IF NOT EXISTS sams_narratives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appraisal_id UUID NOT NULL REFERENCES sams_appraisals(id) ON DELETE CASCADE,
    metric_code TEXT NOT NULL,
    narrative_text TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sams_one_narrative_per_metric UNIQUE (appraisal_id, metric_code)
);

-- 6. Declarations
CREATE TABLE IF NOT EXISTS sams_declarations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appraisal_id UUID NOT NULL REFERENCES sams_appraisals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    declaration_text TEXT NOT NULL DEFAULT 'I hereby declare that the information provided in this self-assessment report is true and accurate to the best of my knowledge.',
    declared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address TEXT,
    CONSTRAINT sams_one_declaration_per_appraisal UNIQUE (appraisal_id)
);

-- ==================== NEW TRACKERS ====================

-- 7. International Engagements (M03)
CREATE TABLE IF NOT EXISTS sams_international_engagements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    engagement_type TEXT NOT NULL CHECK (engagement_type IN ('keynote', 'organizer', 'participant', 'attendee', 'collaborator')),
    engagement_mode TEXT NOT NULL DEFAULT 'in_person' CHECK (engagement_mode IN ('in_person', 'virtual', 'hybrid')),
    event_name TEXT NOT NULL,
    country TEXT NOT NULL,
    organization TEXT,
    event_date DATE NOT NULL,
    end_date DATE,
    description TEXT,
    evidence_url TEXT,
    quarter TEXT NOT NULL CHECK (quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
    calendar_year INT NOT NULL,
    verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sams_intl_staff ON sams_international_engagements(staff_id);
CREATE INDEX IF NOT EXISTS idx_sams_intl_institution ON sams_international_engagements(institution_id);

-- 8. AI Impact Records (M07)
CREATE TABLE IF NOT EXISTS sams_ai_impact_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    course_name TEXT NOT NULL,
    course_id UUID,
    ai_tools_used TEXT[] DEFAULT '{}',
    baseline_pass_rate NUMERIC(5,2),
    current_pass_rate NUMERIC(5,2),
    baseline_attendance_pct NUMERIC(5,2),
    current_attendance_pct NUMERIC(5,2),
    improvement_pct NUMERIC(5,2),
    description TEXT,
    evidence_url TEXT,
    quarter TEXT NOT NULL CHECK (quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
    calendar_year INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sams_ai_impact_staff ON sams_ai_impact_records(staff_id);

-- 9. Platform Usage Snapshots (M15)
CREATE TABLE IF NOT EXISTS sams_platform_usage_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    login_count INT DEFAULT 0,
    modules_used TEXT[] DEFAULT '{}',
    distinct_module_count INT DEFAULT 0,
    actions_taken INT DEFAULT 0,
    snapshot_date DATE NOT NULL,
    quarter TEXT NOT NULL CHECK (quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
    calendar_year INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sams_usage_user ON sams_platform_usage_snapshots(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sams_usage_user_date ON sams_platform_usage_snapshots(user_id, snapshot_date);

-- ==================== TEAM EVALUATION ====================

-- 10. Team Projects
CREATE TABLE IF NOT EXISTS sams_team_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    metric_code TEXT NOT NULL CHECK (metric_code IN ('M01', 'M02', 'M05', 'M06', 'M10')),
    project_name TEXT NOT NULL,
    description TEXT,
    quarter TEXT NOT NULL CHECK (quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
    calendar_year INT NOT NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sams_team_institution ON sams_team_projects(institution_id);

-- 11. Team Members
CREATE TABLE IF NOT EXISTS sams_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_project_id UUID NOT NULL REFERENCES sams_team_projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    contribution_pct NUMERIC(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sams_unique_team_member UNIQUE (team_project_id, user_id)
);

-- 12. Peer Evaluations (anonymous: evaluator stored, hidden from evaluated)
CREATE TABLE IF NOT EXISTS sams_peer_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_project_id UUID NOT NULL REFERENCES sams_team_projects(id) ON DELETE CASCADE,
    evaluator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    evaluated_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    alignment_score INT NOT NULL CHECK (alignment_score BETWEEN 1 AND 5),
    quality_score INT NOT NULL CHECK (quality_score BETWEEN 1 AND 5),
    initiative_score INT NOT NULL CHECK (initiative_score BETWEEN 1 AND 5),
    communication_score INT NOT NULL CHECK (communication_score BETWEEN 1 AND 5),
    collaboration_score INT NOT NULL CHECK (collaboration_score BETWEEN 1 AND 5),
    contribution_pct NUMERIC(5,2) DEFAULT 0,
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sams_unique_peer_eval UNIQUE (team_project_id, evaluator_id, evaluated_id)
);

-- ==================== REVIEW & APPEALS ====================

-- 13. Approvals (audit trail)
CREATE TABLE IF NOT EXISTS sams_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appraisal_id UUID NOT NULL REFERENCES sams_appraisals(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reviewer_role TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('approve', 'return', 'validate', 'flag')),
    comments TEXT,
    flagged_metric TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sams_approvals_appraisal ON sams_approvals(appraisal_id);

-- 14. Appeals
CREATE TABLE IF NOT EXISTS sams_appeals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appraisal_id UUID NOT NULL REFERENCES sams_appraisals(id) ON DELETE CASCADE,
    metric_code TEXT NOT NULL,
    faculty_reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'resolved', 'dismissed')),
    hod_remarks TEXT,
    resolution TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    sla_deadline DATE NOT NULL,
    is_overdue BOOLEAN DEFAULT false,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sams_appeals_appraisal ON sams_appeals(appraisal_id);
CREATE INDEX IF NOT EXISTS idx_sams_appeals_overdue ON sams_appeals(is_overdue) WHERE is_overdue = true;

-- ==================== FEEDBACK (M12 FALLBACK) ====================

-- 15. Feedback Tokens
CREATE TABLE IF NOT EXISTS sams_feedback_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appraisal_id UUID REFERENCES sams_appraisals(id) ON DELETE SET NULL,
    faculty_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    class_section TEXT NOT NULL,
    token_string TEXT NOT NULL UNIQUE,
    generated_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    responses_collected INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sams_tokens_faculty ON sams_feedback_tokens(faculty_id);
CREATE INDEX IF NOT EXISTS idx_sams_tokens_token ON sams_feedback_tokens(token_string);

-- 16. Student Feedback (anonymized)
CREATE TABLE IF NOT EXISTS sams_student_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id UUID NOT NULL REFERENCES sams_feedback_tokens(id) ON DELETE CASCADE,
    q1_score INT NOT NULL CHECK (q1_score BETWEEN 1 AND 5),
    q2_score INT NOT NULL CHECK (q2_score BETWEEN 1 AND 5),
    q3_score INT NOT NULL CHECK (q3_score BETWEEN 1 AND 5),
    q4_score INT NOT NULL CHECK (q4_score BETWEEN 1 AND 5),
    q5_score INT NOT NULL CHECK (q5_score BETWEEN 1 AND 5),
    average_score NUMERIC(3,2) NOT NULL,
    qualitative_comment TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== AI & SALARY ====================

-- 17. AI Evaluation Log
CREATE TABLE IF NOT EXISTS sams_ai_evaluation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appraisal_id UUID NOT NULL REFERENCES sams_appraisals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    ai_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250514',
    overall_alignment_pct NUMERIC(5,2),
    parsed_scores JSONB DEFAULT '{}',
    raw_response JSONB DEFAULT '{}',
    justification TEXT,
    vision_context_used JSONB DEFAULT '{}',
    prompt_snapshot TEXT,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. Salary Config
CREATE TABLE IF NOT EXISTS sams_salary_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    grade TEXT NOT NULL CHECK (grade IN ('A++', 'A+', 'A', 'B')),
    increment_cap_pct NUMERIC(5,2) NOT NULL,
    min_points_for_increment INT NOT NULL DEFAULT 2,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sams_salary_config_unique UNIQUE (institution_id, grade)
);

-- 19. Salary Projections
CREATE TABLE IF NOT EXISTS sams_salary_projections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appraisal_id UUID NOT NULL REFERENCES sams_appraisals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    base_salary NUMERIC(12,2),
    total_points NUMERIC(5,2),
    grade TEXT CHECK (grade IN ('A++', 'A+', 'A', 'B')),
    increment_pct NUMERIC(5,2),
    projected_salary NUMERIC(12,2),
    benefits_unlocked JSONB DEFAULT '{}',
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sams_one_projection_per_appraisal UNIQUE (appraisal_id)
);

-- 20. Benefits Config
CREATE TABLE IF NOT EXISTS sams_benefits_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    grade TEXT NOT NULL CHECK (grade IN ('A++', 'A+', 'A', 'B')),
    category TEXT NOT NULL CHECK (category IN (
        'salary', 'prof_dev', 'recognition', 'promotion',
        'research_funding', 'leadership', 'resources', 'flexibility'
    )),
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sams_benefits_unique UNIQUE (institution_id, grade, category)
);

-- ==================== SYSTEM ====================

-- 21. Documents (evidence files)
CREATE TABLE IF NOT EXISTS sams_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appraisal_id UUID NOT NULL REFERENCES sams_appraisals(id) ON DELETE CASCADE,
    metric_code TEXT,
    entry_id UUID,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size BIGINT,
    mime_type TEXT,
    file_hash TEXT,
    uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    scan_result TEXT DEFAULT 'pending' CHECK (scan_result IN ('pending', 'clean', 'infected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sams_docs_appraisal ON sams_documents(appraisal_id);

-- 22. Comments (threaded)
CREATE TABLE IF NOT EXISTS sams_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appraisal_id UUID NOT NULL REFERENCES sams_appraisals(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    author_role TEXT NOT NULL,
    message TEXT NOT NULL,
    section_tag TEXT,
    parent_id UUID REFERENCES sams_comments(id) ON DELETE CASCADE,
    is_actionable BOOLEAN DEFAULT false,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sams_comments_appraisal ON sams_comments(appraisal_id);

-- 23. Audit Log
CREATE TABLE IF NOT EXISTS sams_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appraisal_id UUID REFERENCES sams_appraisals(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    role TEXT,
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    meta_json JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sams_audit_appraisal ON sams_audit_log(appraisal_id);
CREATE INDEX IF NOT EXISTS idx_sams_audit_user ON sams_audit_log(user_id);

-- ==================== STORAGE BUCKET ====================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'sams-evidence',
    'sams-evidence',
    false,
    10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY "sams_upload_evidence"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'sams-evidence'
    AND (storage.foldername(name))[1] IN (
        SELECT institution_id::text FROM profiles WHERE id = auth.uid()
    )
);

CREATE POLICY "sams_view_evidence"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'sams-evidence'
    AND (storage.foldername(name))[1] IN (
        SELECT institution_id::text FROM profiles WHERE id = auth.uid()
    )
);

-- ==================== RLS POLICIES ====================

ALTER TABLE sams_appraisal_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_appraisals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_metric_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_supplement_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_international_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_ai_impact_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_platform_usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_team_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_peer_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_feedback_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_student_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_ai_evaluation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_salary_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_salary_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_benefits_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sams_audit_log ENABLE ROW LEVEL SECURITY;

-- Institution-scoped SELECT for all SAMS tables
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'sams_appraisal_cycles', 'sams_appraisals', 'sams_international_engagements',
        'sams_ai_impact_records', 'sams_team_projects', 'sams_appeals',
        'sams_feedback_tokens', 'sams_salary_config', 'sams_benefits_config',
        'sams_audit_log'
    ] LOOP
        EXECUTE format(
            'CREATE POLICY "sams_%s_institution_select" ON %I FOR SELECT TO authenticated USING (
                institution_id = get_my_institution_id()
                OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ''super_admin'')
            )', replace(tbl, 'sams_', ''), tbl
        );
    END LOOP;
END $$;

-- User-scoped SELECT for personal data
CREATE POLICY "sams_appraisals_own_select" ON sams_appraisals FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
    OR institution_id = get_my_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- Scores follow appraisal access
CREATE POLICY "sams_scores_select" ON sams_metric_scores FOR SELECT TO authenticated
USING (
    appraisal_id IN (SELECT id FROM sams_appraisals WHERE user_id = auth.uid() OR institution_id = get_my_institution_id())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- INSERT policies for authenticated users (service-layer validates permissions)
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'sams_appraisals', 'sams_metric_scores', 'sams_supplement_entries',
        'sams_narratives', 'sams_declarations', 'sams_international_engagements',
        'sams_ai_impact_records', 'sams_team_projects', 'sams_team_members',
        'sams_peer_evaluations', 'sams_approvals', 'sams_appeals',
        'sams_feedback_tokens', 'sams_student_feedback', 'sams_ai_evaluation_log',
        'sams_salary_projections', 'sams_documents', 'sams_comments', 'sams_audit_log'
    ] LOOP
        EXECUTE format(
            'CREATE POLICY "sams_%s_insert" ON %I FOR INSERT TO authenticated WITH CHECK (true)',
            replace(tbl, 'sams_', ''), tbl
        );
    END LOOP;
END $$;

-- UPDATE policies
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'sams_appraisal_cycles', 'sams_appraisals', 'sams_metric_scores',
        'sams_supplement_entries', 'sams_narratives', 'sams_international_engagements',
        'sams_ai_impact_records', 'sams_team_members', 'sams_appeals',
        'sams_feedback_tokens', 'sams_comments'
    ] LOOP
        EXECUTE format(
            'CREATE POLICY "sams_%s_update" ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
            replace(tbl, 'sams_', ''), tbl
        );
    END LOOP;
END $$;

-- Public access for student feedback (token-based, no auth)
CREATE POLICY "sams_student_feedback_public_insert" ON sams_student_feedback
FOR INSERT TO anon WITH CHECK (true);

-- Timestamp trigger function
CREATE OR REPLACE FUNCTION sams_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp triggers to tables with updated_at
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'sams_appraisal_cycles', 'sams_appraisals', 'sams_metric_scores',
        'sams_supplement_entries', 'sams_international_engagements',
        'sams_ai_impact_records', 'sams_team_projects', 'sams_salary_config'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION sams_update_timestamp()',
            replace(tbl, 'sams_', ''), tbl
        );
    END LOOP;
END $$;

-- ==================== SEED: SALARY CONFIG (default for all institutions) ====================

INSERT INTO sams_salary_config (institution_id, grade, increment_cap_pct, min_points_for_increment)
SELECT i.id, g.grade, g.cap, 2
FROM institutions i
CROSS JOIN (VALUES ('A++', 15.0), ('A+', 10.0), ('A', 5.0), ('B', 0.0)) AS g(grade, cap)
ON CONFLICT (institution_id, grade) DO NOTHING;

-- ==================== SEED: BENEFITS CONFIG ====================

INSERT INTO sams_benefits_config (institution_id, grade, category, description)
SELECT i.id, v.grade, v.category, v.description
FROM institutions i
CROSS JOIN (VALUES
    ('A++', 'salary', 'Up to 15% increase'),
    ('A++', 'prof_dev', 'Global programs, all expenses covered'),
    ('A++', 'recognition', 'Top performer awards at institutional events'),
    ('A++', 'promotion', 'Priority consideration'),
    ('A++', 'research_funding', 'Privileged access, +20% additional funds'),
    ('A++', 'leadership', 'Major institutional committee roles'),
    ('A++', 'resources', 'Premium tools, admin support'),
    ('A++', 'flexibility', 'Remote work, flexible scheduling'),
    ('A+', 'salary', 'Up to 10% increase'),
    ('A+', 'prof_dev', 'National programs, costs covered'),
    ('A+', 'recognition', 'Institutional acknowledgment and awards'),
    ('A+', 'promotion', 'Strong consideration'),
    ('A+', 'research_funding', 'Priority access to grants'),
    ('A+', 'leadership', 'Department leadership roles'),
    ('A+', 'resources', 'Upgraded software and databases'),
    ('A+', 'flexibility', 'Standard'),
    ('A', 'salary', 'Standard increment'),
    ('A', 'prof_dev', 'Standard institutional programs'),
    ('A', 'recognition', 'Department-level recognition'),
    ('A', 'promotion', 'Normal review consideration'),
    ('A', 'research_funding', 'Standard access'),
    ('A', 'leadership', 'Small team leads'),
    ('A', 'resources', 'Standard level'),
    ('A', 'flexibility', 'Standard'),
    ('B', 'salary', 'No performance-based increment'),
    ('B', 'prof_dev', 'Base level programs only'),
    ('B', 'recognition', 'No performance-based recognition'),
    ('B', 'promotion', 'Not considered for performance-based promotion'),
    ('B', 'research_funding', 'Not eligible'),
    ('B', 'leadership', 'Not assigned'),
    ('B', 'resources', 'Basic level only'),
    ('B', 'flexibility', 'Standard')
) AS v(grade, category, description)
ON CONFLICT (institution_id, grade, category) DO NOTHING;

-- ==================== SEED: SAMS PERMISSIONS ON EXISTING ROLES ====================

-- Add sams.* permissions to faculty role
UPDATE custom_roles SET permissions = permissions || '{
    "sams.dashboard.view": true,
    "sams.appraisal.submit": true,
    "sams.appraisal.view_own": true,
    "sams.appeal.file": true,
    "sams.team.evaluate": true,
    "sams.tracker.manage": true,
    "sams.salary.view": true
}'::jsonb
WHERE role_key = 'faculty';

-- Add sams.* permissions to hod role
UPDATE custom_roles SET permissions = permissions || '{
    "sams.dashboard.view": true,
    "sams.appraisal.submit": true,
    "sams.appraisal.view_own": true,
    "sams.appraisal.review": true,
    "sams.appraisal.return": true,
    "sams.appeal.file": true,
    "sams.appeal.resolve": true,
    "sams.feedback.generate_token": true,
    "sams.coe.approve": true,
    "sams.staff_mapping.view": true,
    "sams.team.evaluate": true,
    "sams.tracker.manage": true,
    "sams.salary.view": true
}'::jsonb
WHERE role_key = 'hod';

-- Add sams.* permissions to principal role
UPDATE custom_roles SET permissions = permissions || '{
    "sams.dashboard.view": true,
    "sams.appraisal.approve": true,
    "sams.appraisal.return": true,
    "sams.coe.approve": true,
    "sams.staff_mapping.view": true,
    "sams.executive.view": true,
    "sams.salary.view": true
}'::jsonb
WHERE role_key = 'principal';

-- Create IQAC Coordinator role (if not exists)
INSERT INTO custom_roles (role_key, role_name, description, is_system_role, permissions)
VALUES (
    'iqac_coordinator',
    'IQAC Coordinator',
    'Internal Quality Assurance Cell coordinator for compliance validation',
    true,
    '{
        "sams.dashboard.view": true,
        "sams.appraisal.validate": true,
        "sams.cycle.manage": true,
        "sams.reports.export": true,
        "sams.staff_mapping.view": true,
        "sams.salary.view": true
    }'::jsonb
)
ON CONFLICT DO NOTHING;

-- Create IQAC Chairman role
INSERT INTO custom_roles (role_key, role_name, description, is_system_role, permissions)
VALUES (
    'iqac_chairman',
    'IQAC Chairman',
    'Internal Quality Assurance Cell chairman',
    true,
    '{
        "sams.dashboard.view": true,
        "sams.appraisal.validate": true,
        "sams.cycle.manage": true,
        "sams.reports.export": true,
        "sams.staff_mapping.view": true,
        "sams.salary.view": true
    }'::jsonb
)
ON CONFLICT DO NOTHING;

-- Create Vice Principal role
INSERT INTO custom_roles (role_key, role_name, description, is_system_role, permissions)
VALUES (
    'vice_principal',
    'Vice Principal',
    'Vice Principal with same SAMS permissions as Principal',
    true,
    '{
        "sams.dashboard.view": true,
        "sams.appraisal.approve": true,
        "sams.appraisal.return": true,
        "sams.coe.approve": true,
        "sams.staff_mapping.view": true,
        "sams.executive.view": true,
        "sams.salary.view": true
    }'::jsonb
)
ON CONFLICT DO NOTHING;
```

**Step 2: Verify migration syntax**

Run: `cat supabase/migrations/20260408000001_sams_staff_appraisal_module.sql | head -5`
Expected: Shows the header comment

**Step 3: Apply migration to staging**

Run: `ACCESS_TOKEN=$(cat ~/.supabase/access-token) && curl -s -X POST "https://api.supabase.com/v1/projects/hhprjbgknupaplivtoib/database/query" -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -d @- <<< '{"query": "SELECT table_name FROM information_schema.tables WHERE table_schema = '\''public'\'' AND table_name LIKE '\''sams_%'\'' ORDER BY table_name;"}'`
Expected: 23 sams_* tables listed

**Step 4: Commit**

```bash
git add supabase/migrations/20260408000001_sams_staff_appraisal_module.sql
git commit -m "feat(sams): add 23-table migration with RLS, storage, roles, seed data"
```

---

## Phase 2: Types + Sidebar (SEQUENTIAL)

### T02: Create SAMS TypeScript types

**Files:**
- Create: `types/sams.ts`

**Step 1: Write types file**

All interfaces for the 23 tables, form data types, filter types, constants. Follow exact pattern from `types/leave-onduty.ts`:
- Core table interfaces with optional joined data
- Separate FormData, Filters, Input types
- Constants for grades, metric codes, colors, labels
- Type guards

Key types needed:
- `SamsAppraisalCycle`, `SamsAppraisal`, `SamsMetricScore`
- `SamsSupplementEntry`, `SamsNarrative`, `SamsDeclaration`
- `SamsInternationalEngagement`, `SamsAiImpactRecord`
- `SamsTeamProject`, `SamsTeamMember`, `SamsPeerEvaluation`
- `SamsApproval`, `SamsAppeal`
- `SamsFeedbackToken`, `SamsStudentFeedback`
- `SamsSalaryConfig`, `SamsSalaryProjection`, `SamsBenefitsConfig`
- `MetricCode` type union ('M01' | ... | 'M16')
- `METRIC_DEFINITIONS` constant array with name, code, category, auto_source, is_team, thresholds
- `GRADE_BANDS` constant
- `AppraisalStatus`, `CycleState`, `Grade` type unions

**Step 2: Verify types compile**

Run: `npx tsc --noEmit types/sams.ts 2>&1 | head -5`
Expected: No errors (or only unrelated pre-existing errors)

**Step 3: Commit**

```bash
git add types/sams.ts
git commit -m "feat(sams): add TypeScript types for 23 tables + constants"
```

---

### T03: Add SAMS to sidebar menu

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

**Step 1: Add MENU_PERMISSIONS entries**

Add after the last module's permissions:
```typescript
// Staff Appraisal (SAMS)
'/staff-appraisal': 'sams.dashboard.view',
'/staff-appraisal/appraisal': 'sams.appraisal.submit',
'/staff-appraisal/review': 'sams.appraisal.review',
'/staff-appraisal/staff-mapping': 'sams.staff_mapping.view',
'/staff-appraisal/team-evaluation': 'sams.team.evaluate',
'/staff-appraisal/appeals': 'sams.appeal.file',
'/staff-appraisal/feedback': 'sams.feedback.generate_token',
'/staff-appraisal/cycles': 'sams.cycle.manage',
'/staff-appraisal/salary': 'sams.salary.view',
'/staff-appraisal/reports': 'sams.reports.export',
'/staff-appraisal/executive': 'sams.executive.view',
'/staff-appraisal/international': 'sams.tracker.manage',
'/staff-appraisal/ai-impact': 'sams.tracker.manage',
```

**Step 2: Add menu group to GetPages()**

Add the Staff Appraisal group with all 13 menu items (see spec §16 for exact structure). Use lucide-react icons: ClipboardCheck, FileText, CheckSquare, Users, UserCheck, Scale, MessageSquare, Calendar, IndianRupee, BarChart3, Briefcase, Globe, Brain.

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add lib/sidebarMenuLink.ts
git commit -m "feat(sams): add Staff Appraisal sidebar menu + permissions"
```

---

## Phase 3: Auto-Measurement Engine (SEQUENTIAL)

### T04: Create auto-measure service

**Files:**
- Create: `lib/services/sams/sams-auto-measure-service.ts`

**Step 1: Write service with 16 measurement methods**

Follow pattern from `lib/services/academic/leave-onduty-service.ts`:
- Static class `SamsAutoMeasureService`
- Use `getSupabase()` helper for untyped table access
- One method per metric: `measureM01(staffId, calendarYear, quarter)`
- Each returns `{ count: number; score: number; grade: string; entries: any[] }`
- Main orchestrator: `measureAll(staffId, institutionId, calendarYear, quarter)` returns all 16 scores
- Scoring logic per metric uses thresholds from spec (3+ = A++/3, 2 = A+/2, 1 = A/1, 0 = B/0)

Key queries (from spec §11):
- M01: Count from `sh_solutions` + `sh_builder_assignments` + `sh_training_programs`
- M02: Count solutions with 2+ departments
- M04: Count from `sh_publications` + `sh_publication_contributors`
- M05: Count from `industry_partners` + `industry_projects` + `sh_solution_mous`
- M06: Count mentees from `ss_mentor_matches`
- M08: From `pde_finks_competency` (6 dimensions, competency_pct)
- M09: Parse `facilitator_development.certifications` JSONB
- M10: AVG `okr_objectives.overall_progress` + committee count (either/or rule)
- M12: `facilitator_development.student_feedback_average` + `student_attendance`
- M13: SUM `sh_publications.h_index_contribution` where scopus_indexed
- M14: Count from `wp_pulse_entries`
- M15: Count from `user_activity_logs`
- M16: Count from `process_definitions` + `process_instances`

**Step 2: Verify service compiles**

Run: `npx tsc --noEmit lib/services/sams/sams-auto-measure-service.ts 2>&1 | head -10`

**Step 3: Commit**

```bash
git add lib/services/sams/sams-auto-measure-service.ts
git commit -m "feat(sams): add auto-measurement engine for 16 metrics"
```

---

## Phase 4: Remaining Services + All Hooks (SEQUENTIAL)

### T05: Create all SAMS services

**Files:**
- Create: `lib/services/sams/sams-cycle-service.ts`
- Create: `lib/services/sams/sams-appraisal-service.ts`
- Create: `lib/services/sams/sams-supplement-service.ts`
- Create: `lib/services/sams/sams-narrative-service.ts`
- Create: `lib/services/sams/sams-team-service.ts`
- Create: `lib/services/sams/sams-review-service.ts`
- Create: `lib/services/sams/sams-appeal-service.ts`
- Create: `lib/services/sams/sams-feedback-service.ts`
- Create: `lib/services/sams/sams-salary-service.ts`
- Create: `lib/services/sams/sams-ai-service.ts`
- Create: `lib/services/sams/sams-report-service.ts`
- Create: `lib/services/sams/sams-tracker-service.ts`

Each service follows the static class pattern from the codebase analysis. Key methods per service listed in spec §13.

**Step 1: Create all 12 service files**
**Step 2: Verify build:** `npm run build 2>&1 | tail -5`
**Step 3: Commit**

```bash
git add lib/services/sams/
git commit -m "feat(sams): add 12 service files for complete module"
```

---

### T06: Create all SAMS hooks

**Files:**
- Create: `hooks/sams/use-sams-cycles.ts`
- Create: `hooks/sams/use-sams-appraisal.ts`
- Create: `hooks/sams/use-sams-auto-scores.ts`
- Create: `hooks/sams/use-sams-supplements.ts`
- Create: `hooks/sams/use-sams-narratives.ts`
- Create: `hooks/sams/use-sams-teams.ts`
- Create: `hooks/sams/use-sams-review.ts`
- Create: `hooks/sams/use-sams-appeals.ts`
- Create: `hooks/sams/use-sams-feedback.ts`
- Create: `hooks/sams/use-sams-salary.ts`
- Create: `hooks/sams/use-sams-dashboard.ts`
- Create: `hooks/sams/use-sams-reports.ts`
- Create: `hooks/sams/use-sams-trackers.ts`

Each hook follows the KEYS + useQuery + useMutation pattern from codebase analysis. Key hook listed in spec §14.

**Step 1: Create all 13 hook files**
**Step 2: Verify build:** `npm run build 2>&1 | tail -5`
**Step 3: Commit**

```bash
git add hooks/sams/
git commit -m "feat(sams): add 13 React Query hooks"
```

---

## Phase 5: Dashboard Page (SEQUENTIAL — sets patterns)

### T07: Create live performance dashboard

**Files:**
- Create: `app/(routes)/staff-appraisal/page.tsx`
- Create: `app/(routes)/staff-appraisal/layout.tsx`
- Create: `app/(routes)/staff-appraisal/_components/MetricScoreCard.tsx`
- Create: `app/(routes)/staff-appraisal/_components/ScoreBreakdown.tsx`

**Step 1: Create layout.tsx** — minimal, just passes children

**Step 2: Create MetricScoreCard component** — shows auto-score + supplement + final per metric with progress bar and grade badge

**Step 3: Create ScoreBreakdown component** — 16-metric grid showing all scores

**Step 4: Create page.tsx** — role-aware dashboard:
- Faculty: sees own 16 metric scores (live), total points, overall grade, submission status
- HoD: sees department summary + pending reviews count
- Principal: sees institution summary
- IQAC: sees compliance overview
- Uses `usePermissions()` to determine view
- Wrapped in `PermissionGuard module='sams' action='dashboard.view'`

**Step 5: Verify:** `npm run build 2>&1 | tail -5`
**Step 6: Commit**

```bash
git add app/\(routes\)/staff-appraisal/
git commit -m "feat(sams): add live performance dashboard with 16-metric score cards"
```

---

## Phase 6A: Faculty Appraisal Form (PARALLEL — own files)

### T08: Faculty review & supplement form

**Files:**
- Create: `app/(routes)/staff-appraisal/appraisal/page.tsx`
- Create: `app/(routes)/staff-appraisal/appraisal/[id]/page.tsx`
- Create: `app/(routes)/staff-appraisal/_components/MetricSidebar.tsx`
- Create: `app/(routes)/staff-appraisal/_components/NarrativeEditor.tsx`
- Create: `app/(routes)/staff-appraisal/_components/SupplementEntryForm.tsx`
- Create: `app/(routes)/staff-appraisal/_components/DeclarationCheckbox.tsx`
- Create: `app/(routes)/staff-appraisal/_components/AppraisalStatusStepper.tsx`

16-metric sidebar navigation with live scores. Each metric panel shows: auto-score with data source, supplement entry form, narrative text editor, evidence upload. Submit gate: all 16 metrics must be reviewed + declaration checkbox. Auto-save on every field change.

**Verify:** `npm run build`
**Commit:** `feat(sams): add faculty appraisal review & supplement form`

---

## Phase 6B: New Trackers (PARALLEL — own files)

### T09: International engagements + AI impact trackers

**Files:**
- Create: `app/(routes)/staff-appraisal/international/page.tsx`
- Create: `app/(routes)/staff-appraisal/ai-impact/page.tsx`
- Create: `app/(routes)/staff-appraisal/_components/InternationalEngagementForm.tsx`
- Create: `app/(routes)/staff-appraisal/_components/AiImpactRecordForm.tsx`

M03 page: CRUD for international engagements (event name, country, type, mode, evidence). M07 page: CRUD for AI impact records (course, tools used, baseline vs current pass rates, improvement %).

**Verify:** `npm run build`
**Commit:** `feat(sams): add M03 international + M07 AI impact trackers`

---

## Phase 6C: Team Evaluation (PARALLEL — own files)

### T10: Team projects + peer evaluation

**Files:**
- Create: `app/(routes)/staff-appraisal/team-evaluation/page.tsx`
- Create: `app/(routes)/staff-appraisal/team-evaluation/[projectId]/page.tsx`
- Create: `app/(routes)/staff-appraisal/_components/PeerEvaluationForm.tsx`

Team project creation for M01, M02, M05, M06, M10. Anonymous peer evaluation form (5 criteria × 1-5 + % contribution). Score aggregation display (evaluator identity hidden from evaluated, visible to HoD/IQAC).

**Verify:** `npm run build`
**Commit:** `feat(sams): add team evaluation with anonymous peer ratings`

---

## Phase 7A: Review Flow (PARALLEL — own files)

### T11: HoD + Principal review

**Files:**
- Create: `app/(routes)/staff-appraisal/review/page.tsx`
- Create: `app/(routes)/staff-appraisal/review/[id]/page.tsx`
- Create: `app/(routes)/staff-appraisal/staff-mapping/page.tsx`
- Create: `app/(routes)/staff-appraisal/_components/ReturnForRevisionModal.tsx`

Review queue: HoD sees department faculty submissions. Click to view full appraisal (auto-scores + supplements + narratives). Approve or Return (flags specific metric with reason). Staff mapping: department status grid. HoD self-appraisal skips to Principal. No HoD → escalate to Principal.

**Verify:** `npm run build`
**Commit:** `feat(sams): add HoD/Principal review flow + staff mapping`

---

## Phase 7B: Feedback + Appeals (PARALLEL — own files)

### T12: Student feedback tokens + appeals

**Files:**
- Create: `app/(routes)/staff-appraisal/feedback/page.tsx`
- Create: `app/(routes)/staff-appraisal/feedback/[token]/page.tsx`
- Create: `app/(routes)/staff-appraisal/appeals/page.tsx`
- Create: `app/(routes)/staff-appraisal/_components/FeedbackTokenCard.tsx`

Feedback: HoD generates token (SAMS-Q2-DEPT-ID-TKN), 48hr expiry. Public page (no auth) for student feedback (5 Likert 1-5, anonymous). Appeals: faculty files appeal per metric to HoD. 7-day SLA. HoD resolves with remarks. Overdue → MD alert.

**Verify:** `npm run build`
**Commit:** `feat(sams): add M12 feedback tokens + appeals system`

---

## Phase 8: Salary + Reports + Executive (SEQUENTIAL)

### T13: Salary projections + benefits display

**Files:**
- Create: `app/(routes)/staff-appraisal/salary/page.tsx`
- Create: `app/(routes)/staff-appraisal/_components/SalaryProjectionCard.tsx`

Grade-based salary cap (A++=15%, A+=10%, A=standard, B=none). Min 2 points for any increment. All 8 benefit categories displayed per grade.

### T14: IQAC reports + executive dashboard

**Files:**
- Create: `app/(routes)/staff-appraisal/reports/page.tsx`
- Create: `app/(routes)/staff-appraisal/executive/page.tsx`

Reports: IQAC compliance dashboard, PDF/Excel export (all facilitators × 16 metrics). Executive: unified read-only dashboard (top/bottom performers, institution averages, grade distribution).

### T15: Appraisal cycles management

**Files:**
- Create: `app/(routes)/staff-appraisal/cycles/page.tsx`

IQAC/COO manages quarterly cycles. Create/open/close. One active per institution. 7-day submission window.

**Verify:** `npm run build`
**Commit:** `feat(sams): add salary projections, reports, executive dashboard, cycle management`

---

## Phase 9: AI Alignment + Automation (SEQUENTIAL)

### T16: AI alignment edge function

**Files:**
- Create: `supabase/functions/sams-evaluate-submission/index.ts`

Claude API call on every submission. Scores all 16 metrics against vision/mission/CoE context. Stores in `sams_ai_evaluation_log`. Non-blocking — submission succeeds even if AI fails.

### T17: AI alignment display panel

**Files:**
- Create: `app/(routes)/staff-appraisal/_components/AIAlignmentPanel.tsx`

Per-metric alignment score (0-3), overall alignment %, 2-sentence justification. Color coding: ≥3 green, 2 amber, <2 red.

### T18: Automation edge functions

**Files:**
- Create: `supabase/functions/sams-auto-populate/index.ts`
- Create: `supabase/functions/sams-carry-forward/index.ts`
- Create: `supabase/functions/sams-deadline-reminders/index.ts`
- Create: `supabase/functions/sams-appeal-sla-check/index.ts`
- Create: `supabase/functions/sams-snapshot-usage/index.ts`

Auto-populate on cycle open. Carry-forward Q(n-1) entries. Daily deadline reminders. Daily appeal SLA check. Weekly M15 usage snapshots.

**Verify:** `npm run build`
**Commit:** `feat(sams): add AI alignment + automation edge functions`

---

## Task Summary

| Phase | Tasks | Mode | Description |
|-------|-------|------|-------------|
| 1 | T01 | Sequential | Database: 23 tables, RLS, storage, roles, seeds |
| 2 | T02-T03 | Sequential | Types + sidebar menu |
| 3 | T04 | Sequential | Auto-measurement engine (core brain) |
| 4 | T05-T06 | Sequential | 12 services + 13 hooks |
| 5 | T07 | Sequential | Dashboard page (sets patterns) |
| 6A | T08 | Parallel | Faculty appraisal form |
| 6B | T09 | Parallel | M03 + M07 trackers |
| 6C | T10 | Parallel | Team evaluation |
| 7A | T11 | Parallel | Review flow (HoD + Principal) |
| 7B | T12 | Parallel | Feedback + appeals |
| 8 | T13-T15 | Sequential | Salary + reports + executive + cycles |
| 9 | T16-T18 | Sequential | AI alignment + automation |

**Total: 18 tasks across 9 phases. ~23 tables, 13 services, 13 hooks, 16 pages, 12 components, 6 edge functions.**

---

## Risks & Gotchas

1. **Auto-measurement queries depend on existing data** — staging has only 10 test staff records. Scores will all be 0/B until real data exists. Build the measurement logic correctly; test with manual INSERT statements.

2. **`pde_finks_competency` is a VIEW** (not a table) — verify it's queryable and has the expected columns before building M08 measurement.

3. **`user_activity_logs` may not exist yet** or may be empty — M15 (Platform Adoption) needs this table populated. Build the measurement logic but gracefully handle empty/missing data.

4. **RLS policies use `get_my_institution_id()`** — this function must exist in the database (it was created in a 2025 migration). Verify before running the migration.

5. **Parallel phases (6A/6B/6C and 7A/7B)** have non-overlapping files BUT share `_components/`. If two parallel agents create components with the same name → merge conflict. Solution: each parallel task lists its exact component files above — no overlap.

6. **Student feedback public page** needs `anon` access (no auth). The RLS policy allows anon INSERT on `sams_student_feedback`. Verify Supabase anon key is configured.

7. **Cumulative scoring carry-forward** — when a cycle opens for Q2, the system must copy Q1 entries. The `sams-carry-forward` edge function handles this. If it fails, Q2 scores will be too low. Build with retry logic.

---

## Known Issues (P2/P3 — deferred)

_Populated during build phase._

---

## Implementation Notes

_Populated after build — deviations from plan, lessons learned._
