-- ============================================
-- Startup Studio Module: ss_ prefixed tables
-- Migration: Create all Startup Studio tables in MyJKKN
-- Source: Standalone Startup Studio (jkkn-solution-studio)
-- ============================================

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE ss_cycle_status AS ENUM ('active', 'completed', 'abandoned');
CREATE TYPE ss_problem_frequency AS ENUM ('daily', 'weekly', 'monthly', 'occasional');
CREATE TYPE ss_decision_type AS ENUM ('proceed', 'iterate', 'pivot', 'stop');
CREATE TYPE ss_workflow_type AS ENUM (
  'AUDIT', 'GENERATION', 'TRANSFORMATION', 'CLASSIFICATION',
  'EXTRACTION', 'SYNTHESIS', 'PREDICTION', 'RECOMMENDATION',
  'MONITORING', 'ORCHESTRATION'
);
CREATE TYPE ss_problem_bank_status AS ENUM ('open', 'claimed', 'in_progress', 'solved', 'archived');
CREATE TYPE ss_validation_status AS ENUM ('unvalidated', 'partially_validated', 'validated');
CREATE TYPE ss_problem_theme AS ENUM (
  'healthcare', 'education', 'agriculture', 'environment',
  'community', 'operations', 'productivity', 'other'
);
CREATE TYPE ss_attempt_outcome AS ENUM ('building', 'deployed', 'abandoned', 'success', 'partial');
CREATE TYPE ss_nif_stage AS ENUM (
  'identified', 'screened', 'shortlisted', 'incubating',
  'graduated', 'rejected', 'on_hold'
);
CREATE TYPE ss_startup_status AS ENUM ('ideation', 'mvp', 'launched', 'funded', 'acquired');
CREATE TYPE ss_funding_stage AS ENUM ('pre_seed', 'seed', 'series_a');
CREATE TYPE ss_interest_level AS ENUM ('browsing', 'interested', 'committed', 'sponsoring');
CREATE TYPE ss_submission_status AS ENUM (
  'draft', 'submitted', 'under_review', 'shortlisted', 'winner', 'rejected'
);
CREATE TYPE ss_review_status AS ENUM ('pending', 'in_review', 'approved', 'needs_revision', 'flagged');
CREATE TYPE ss_case_study_status AS ENUM ('draft', 'under_review', 'approved', 'published', 'archived');

-- ============================================
-- CORE TABLES
-- ============================================

-- Events (Appathons, Demo Days, etc.)
CREATE TABLE IF NOT EXISTS public.ss_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT false,
    config JSONB DEFAULT '{}'::jsonb,
    banner_color TEXT DEFAULT 'amber',
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cycles (Learner Flywheel Journeys)
CREATE TABLE IF NOT EXISTS public.ss_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id UUID REFERENCES public.ss_events(id) ON DELETE SET NULL,
    name TEXT,
    status ss_cycle_status NOT NULL DEFAULT 'active',
    current_step INTEGER DEFAULT 1 CHECK (current_step >= 1 AND current_step <= 8),
    impact_score INTEGER CHECK (impact_score >= 0 AND impact_score <= 100),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- FLYWHEEL STEP TABLES (Steps 1-8)
-- ============================================

-- Step 1: Problem Discovery
CREATE TABLE IF NOT EXISTS public.ss_problems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.ss_cycles(id) ON DELETE CASCADE,
    statement TEXT,
    refined_statement TEXT,
    pain_level INTEGER CHECK (pain_level >= 1 AND pain_level <= 10),
    frequency ss_problem_frequency,
    answers JSONB DEFAULT '{}'::jsonb,
    completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: Context Discovery
CREATE TABLE IF NOT EXISTS public.ss_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.ss_cycles(id) ON DELETE CASCADE,
    who TEXT,
    primary_users TEXT,
    secondary_users TEXT,
    when_occurs TEXT,
    where_occurs TEXT,
    frequency TEXT,
    pain_level INTEGER CHECK (pain_level >= 1 AND pain_level <= 10),
    workaround_satisfaction INTEGER CHECK (workaround_satisfaction >= 1 AND workaround_satisfaction <= 10),
    current_workaround TEXT,
    completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Context Interviews
CREATE TABLE IF NOT EXISTS public.ss_interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_id UUID NOT NULL REFERENCES public.ss_contexts(id) ON DELETE CASCADE,
    interviewee_name TEXT,
    interviewee_role TEXT,
    key_quote TEXT,
    pain_level INTEGER CHECK (pain_level >= 1 AND pain_level <= 10),
    referrals TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 3: Value Discovery
CREATE TABLE IF NOT EXISTS public.ss_value_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.ss_cycles(id) ON DELETE CASCADE,
    desperate_user_score INTEGER CHECK (desperate_user_score >= 0 AND desperate_user_score <= 5),
    quadrant TEXT,
    decision ss_decision_type,
    reasoning TEXT,
    criteria JSONB DEFAULT '{}'::jsonb,
    evidence JSONB DEFAULT '{}'::jsonb,
    completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 4: Workflow Classification
CREATE TABLE IF NOT EXISTS public.ss_workflow_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.ss_cycles(id) ON DELETE CASCADE,
    workflow_type ss_workflow_type,
    classification_path JSONB DEFAULT '[]'::jsonb,
    confidence TEXT,
    features TEXT[],
    completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 5: Prompt Generation
CREATE TABLE IF NOT EXISTS public.ss_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.ss_cycles(id) ON DELETE CASCADE,
    generated_prompt TEXT,
    user_edited_prompt TEXT,
    final_prompt TEXT,
    copied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 6: Building
CREATE TABLE IF NOT EXISTS public.ss_builds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.ss_cycles(id) ON DELETE CASCADE,
    lovable_project_url TEXT,
    deployed_url TEXT,
    screenshot_urls TEXT[],
    notes TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Steps 7-8: Impact Discovery
CREATE TABLE IF NOT EXISTS public.ss_impacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.ss_cycles(id) ON DELETE CASCADE,
    users_reached INTEGER DEFAULT 0,
    time_saved_minutes INTEGER DEFAULT 0,
    satisfaction_score INTEGER CHECK (satisfaction_score >= 1 AND satisfaction_score <= 10),
    total_users INTEGER,
    potential_users INTEGER,
    adoption_rate NUMERIC(5,2),
    pain_before INTEGER,
    pain_after INTEGER,
    nps_score INTEGER CHECK (nps_score >= 1 AND nps_score <= 10),
    impact_score INTEGER CHECK (impact_score >= 0 AND impact_score <= 100),
    feedback TEXT,
    lessons_learned TEXT,
    new_problems TEXT[],
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- AI COACHING
-- ============================================

CREATE TABLE IF NOT EXISTS public.ss_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.ss_cycles(id) ON DELETE CASCADE,
    step INTEGER NOT NULL CHECK (step >= 1 AND step <= 8),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ss_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.ss_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- GAMIFICATION
-- ============================================

CREATE TABLE IF NOT EXISTS public.ss_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_type TEXT NOT NULL,
    badge_name TEXT NOT NULL,
    earned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ss_skill_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    skill_area TEXT NOT NULL,
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PROBLEM BANK (Layer A: Repository)
-- ============================================

CREATE TABLE IF NOT EXISTS public.ss_problem_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_cycle_id UUID REFERENCES public.ss_cycles(id) ON DELETE SET NULL,
    source_type TEXT DEFAULT 'cycle',
    source_year INTEGER,
    source_event TEXT,
    event_id UUID REFERENCES public.ss_events(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    problem_statement TEXT,
    theme ss_problem_theme DEFAULT 'other',
    sub_theme TEXT,
    who_affected TEXT,
    when_occurs TEXT,
    where_occurs TEXT,
    frequency TEXT,
    severity_rating INTEGER CHECK (severity_rating >= 1 AND severity_rating <= 10),
    current_workaround TEXT,
    validation_status ss_validation_status DEFAULT 'unvalidated',
    users_interviewed INTEGER DEFAULT 0,
    desperate_user_count INTEGER DEFAULT 0,
    desperate_user_score INTEGER DEFAULT 0,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    department TEXT,
    submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status ss_problem_bank_status DEFAULT 'open',
    is_open_for_attempts BOOLEAN DEFAULT true,
    best_solution_cycle_id UUID REFERENCES public.ss_cycles(id) ON DELETE SET NULL,
    best_solution_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ss_problem_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id UUID NOT NULL REFERENCES public.ss_problem_bank(id) ON DELETE CASCADE,
    cycle_id UUID REFERENCES public.ss_cycles(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    team_name TEXT,
    outcome ss_attempt_outcome DEFAULT 'building',
    outcome_notes TEXT,
    users_reached INTEGER DEFAULT 0,
    impact_score INTEGER CHECK (impact_score >= 0 AND impact_score <= 100),
    app_url TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE(problem_id, cycle_id)
);

CREATE TABLE IF NOT EXISTS public.ss_problem_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id UUID NOT NULL REFERENCES public.ss_problem_bank(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    tag_type TEXT DEFAULT 'custom',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE(problem_id, tag)
);

CREATE TABLE IF NOT EXISTS public.ss_problem_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id UUID NOT NULL REFERENCES public.ss_problem_bank(id) ON DELETE CASCADE,
    evidence_type TEXT NOT NULL,
    content TEXT NOT NULL,
    source_name TEXT,
    source_role TEXT,
    pain_level INTEGER CHECK (pain_level >= 1 AND pain_level <= 10),
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    collected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ============================================
-- KNOWLEDGE GRAPH (Layer B)
-- ============================================

CREATE TABLE IF NOT EXISTS public.ss_problem_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    slug TEXT UNIQUE,
    primary_theme ss_problem_theme,
    problem_count INTEGER DEFAULT 0,
    avg_severity NUMERIC(3,1) DEFAULT 0,
    cross_institutional BOOLEAN DEFAULT false,
    institutions_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    ai_summary TEXT,
    key_patterns TEXT[],
    suggested_actions TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ss_problem_cluster_members (
    cluster_id UUID NOT NULL REFERENCES public.ss_problem_clusters(id) ON DELETE CASCADE,
    problem_id UUID NOT NULL REFERENCES public.ss_problem_bank(id) ON DELETE CASCADE,
    membership_score NUMERIC(3,2) DEFAULT 0,
    is_centroid BOOLEAN DEFAULT false,
    added_by TEXT DEFAULT 'auto',
    PRIMARY KEY (cluster_id, problem_id)
);

CREATE TABLE IF NOT EXISTS public.ss_problem_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id UUID NOT NULL REFERENCES public.ss_problem_bank(id) ON DELETE CASCADE,
    severity_score INTEGER CHECK (severity_score >= 1 AND severity_score <= 10),
    validation_score INTEGER CHECK (validation_score >= 1 AND validation_score <= 10),
    uniqueness_score INTEGER CHECK (uniqueness_score >= 1 AND uniqueness_score <= 10),
    feasibility_score INTEGER CHECK (feasibility_score >= 1 AND feasibility_score <= 10),
    impact_potential_score INTEGER CHECK (impact_potential_score >= 1 AND impact_potential_score <= 10),
    composite_score NUMERIC(4,2) GENERATED ALWAYS AS (
        (COALESCE(severity_score, 0) + COALESCE(validation_score, 0) +
         COALESCE(uniqueness_score, 0) + COALESCE(feasibility_score, 0) +
         COALESCE(impact_potential_score, 0)) / 5.0
    ) STORED,
    scored_by TEXT DEFAULT 'manual',
    scored_by_user UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- NIF PIPELINE (Layer C)
-- ============================================

CREATE TABLE IF NOT EXISTS public.ss_nif_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id UUID UNIQUE NOT NULL REFERENCES public.ss_problem_bank(id) ON DELETE CASCADE,
    stage ss_nif_stage DEFAULT 'identified',
    identified_at TIMESTAMPTZ DEFAULT NOW(),
    screened_at TIMESTAMPTZ,
    shortlisted_at TIMESTAMPTZ,
    incubation_started_at TIMESTAMPTZ,
    graduated_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    identified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    screened_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    shortlisted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    decision_notes TEXT,
    rejection_reason TEXT,
    startup_name TEXT,
    startup_status ss_startup_status,
    startup_website TEXT,
    team_members JSONB DEFAULT '[]'::jsonb,
    funding_stage ss_funding_stage,
    funding_amount NUMERIC(15,2),
    funding_currency TEXT DEFAULT 'INR',
    jobs_created INTEGER DEFAULT 0,
    revenue_generated NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ss_nif_stage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES public.ss_nif_candidates(id) ON DELETE CASCADE,
    from_stage ss_nif_stage,
    to_stage ss_nif_stage NOT NULL,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ss_industry_interests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id UUID NOT NULL REFERENCES public.ss_problem_bank(id) ON DELETE CASCADE,
    partner_name TEXT NOT NULL,
    partner_type TEXT DEFAULT 'company',
    partner_website TEXT,
    contact_name TEXT,
    contact_email TEXT,
    interest_level ss_interest_level DEFAULT 'browsing',
    interest_notes TEXT,
    first_contact_at TIMESTAMPTZ,
    last_contact_at TIMESTAMPTZ,
    meetings_count INTEGER DEFAULT 0,
    sponsorship_type TEXT,
    sponsorship_value NUMERIC(15,2),
    status TEXT DEFAULT 'active',
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ss_research_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id UUID REFERENCES public.ss_problem_bank(id) ON DELETE SET NULL,
    cluster_id UUID REFERENCES public.ss_problem_clusters(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    abstract TEXT,
    research_type TEXT DEFAULT 'project',
    primary_discipline TEXT,
    secondary_disciplines TEXT[],
    suggested_by TEXT DEFAULT 'manual',
    suggested_by_user UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    claimed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'open',
    publication_title TEXT,
    publication_venue TEXT,
    publication_url TEXT,
    publication_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (problem_id IS NOT NULL OR cluster_id IS NOT NULL)
);

-- ============================================
-- APPATHON / JUDGING
-- ============================================

CREATE TABLE IF NOT EXISTS public.ss_appathon_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID REFERENCES public.ss_cycles(id) ON DELETE SET NULL,
    event_id UUID NOT NULL REFERENCES public.ss_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    participation_type TEXT DEFAULT 'individual',
    team_name TEXT,
    team_members JSONB DEFAULT '[]'::jsonb,
    applicant_name TEXT,
    applicant_email TEXT,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    department TEXT,
    year_of_study TEXT,
    app_name TEXT,
    problem_statement TEXT,
    solution_summary TEXT,
    live_url TEXT,
    lovable_url TEXT,
    github_url TEXT,
    elevator_pitch TEXT,
    demo_video_url TEXT,
    screenshots JSONB DEFAULT '[]'::jsonb,
    category TEXT,
    faculty_mentor TEXT,
    impact_metrics JSONB DEFAULT '{}'::jsonb,
    status ss_submission_status DEFAULT 'draft',
    submission_number TEXT,
    score NUMERIC(5,2),
    review_notes TEXT,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(cycle_id, event_id)
);

CREATE TABLE IF NOT EXISTS public.ss_judging_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.ss_events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    theme TEXT,
    description TEXT,
    room_location TEXT,
    demo_order INTEGER,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(event_id, theme)
);

CREATE TABLE IF NOT EXISTS public.ss_track_judges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id UUID NOT NULL REFERENCES public.ss_judging_tracks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_lead BOOLEAN DEFAULT false,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(track_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.ss_judge_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.ss_appathon_submissions(id) ON DELETE CASCADE,
    judge_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    track_id UUID REFERENCES public.ss_judging_tracks(id) ON DELETE SET NULL,
    problem_impact INTEGER CHECK (problem_impact >= 1 AND problem_impact <= 10),
    solution_innovation INTEGER CHECK (solution_innovation >= 1 AND solution_innovation <= 10),
    working_prototype INTEGER CHECK (working_prototype >= 1 AND working_prototype <= 10),
    user_validation INTEGER CHECK (user_validation >= 1 AND user_validation <= 10),
    presentation_quality INTEGER CHECK (presentation_quality >= 1 AND presentation_quality <= 10),
    bioconvergence_alignment INTEGER CHECK (bioconvergence_alignment >= 1 AND bioconvergence_alignment <= 10),
    bonus_cross_disciplinary BOOLEAN DEFAULT false,
    bonus_cross_institutional BOOLEAN DEFAULT false,
    bonus_first_year BOOLEAN DEFAULT false,
    bonus_user_testimonials BOOLEAN DEFAULT false,
    weighted_score NUMERIC(6,2),
    total_score NUMERIC(6,2),
    notes TEXT,
    strengths TEXT,
    improvements TEXT,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(submission_id, judge_id)
);

CREATE TABLE IF NOT EXISTS public.ss_audience_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.ss_appathon_submissions(id) ON DELETE CASCADE,
    voter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    reaction TEXT,
    voted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LEARNING FLYWHEEL (Layer D)
-- ============================================

CREATE TABLE IF NOT EXISTS public.ss_problem_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id UUID NOT NULL REFERENCES public.ss_problem_bank(id) ON DELETE CASCADE,
    attempt_id UUID REFERENCES public.ss_problem_attempts(id) ON DELETE SET NULL,
    outcome_type TEXT NOT NULL,
    outcome_description TEXT,
    time_to_solution_days INTEGER,
    iterations_count INTEGER,
    user_adoption_rate NUMERIC(3,2),
    satisfaction_score NUMERIC(3,1),
    users_impacted INTEGER DEFAULT 0,
    time_saved_hours NUMERIC(10,1) DEFAULT 0,
    cost_saved NUMERIC(12,2) DEFAULT 0,
    revenue_generated NUMERIC(12,2) DEFAULT 0,
    what_worked TEXT,
    what_didnt_work TEXT,
    key_insights TEXT[],
    recommendations TEXT[],
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(problem_id, attempt_id)
);

CREATE TABLE IF NOT EXISTS public.ss_case_studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id UUID REFERENCES public.ss_problem_bank(id) ON DELETE SET NULL,
    attempt_id UUID REFERENCES public.ss_problem_attempts(id) ON DELETE SET NULL,
    outcome_id UUID REFERENCES public.ss_problem_outcomes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    slug TEXT UNIQUE,
    summary TEXT,
    full_content TEXT,
    theme TEXT,
    tags TEXT[],
    difficulty_level TEXT DEFAULT 'intermediate',
    learning_objectives TEXT[],
    key_takeaways TEXT[],
    status ss_case_study_status DEFAULT 'draft',
    published_at TIMESTAMPTZ,
    generated_by TEXT DEFAULT 'manual',
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ss_flywheel_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    period_type TEXT NOT NULL,
    problems_submitted INTEGER DEFAULT 0,
    problems_validated INTEGER DEFAULT 0,
    problems_in_pipeline INTEGER DEFAULT 0,
    outcomes_success INTEGER DEFAULT 0,
    outcomes_partial INTEGER DEFAULT 0,
    outcomes_abandoned INTEGER DEFAULT 0,
    avg_time_to_solution NUMERIC(8,1),
    case_studies_published INTEGER DEFAULT 0,
    total_users_impacted INTEGER DEFAULT 0,
    total_time_saved_hours NUMERIC(10,1) DEFAULT 0,
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(period_start, period_end, period_type)
);

-- ============================================
-- BYOS CONNECTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS public.ss_byos_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- ============================================
-- ADMIN / REVIEW
-- ============================================

CREATE TABLE IF NOT EXISTS public.ss_cycle_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID UNIQUE NOT NULL REFERENCES public.ss_cycles(id) ON DELETE CASCADE,
    status ss_review_status DEFAULT 'pending',
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Core
CREATE INDEX IF NOT EXISTS idx_ss_cycles_user ON public.ss_cycles(user_id);
CREATE INDEX IF NOT EXISTS idx_ss_cycles_event ON public.ss_cycles(event_id);
CREATE INDEX IF NOT EXISTS idx_ss_cycles_status ON public.ss_cycles(status);
CREATE INDEX IF NOT EXISTS idx_ss_events_active ON public.ss_events(is_active);

-- Flywheel steps
CREATE INDEX IF NOT EXISTS idx_ss_problems_cycle ON public.ss_problems(cycle_id);
CREATE INDEX IF NOT EXISTS idx_ss_contexts_cycle ON public.ss_contexts(cycle_id);
CREATE INDEX IF NOT EXISTS idx_ss_value_assessments_cycle ON public.ss_value_assessments(cycle_id);
CREATE INDEX IF NOT EXISTS idx_ss_workflow_classifications_cycle ON public.ss_workflow_classifications(cycle_id);
CREATE INDEX IF NOT EXISTS idx_ss_prompts_cycle ON public.ss_prompts(cycle_id);
CREATE INDEX IF NOT EXISTS idx_ss_builds_cycle ON public.ss_builds(cycle_id);
CREATE INDEX IF NOT EXISTS idx_ss_impacts_cycle ON public.ss_impacts(cycle_id);

-- AI coaching
CREATE INDEX IF NOT EXISTS idx_ss_conversations_cycle ON public.ss_conversations(cycle_id);
CREATE INDEX IF NOT EXISTS idx_ss_messages_conversation ON public.ss_messages(conversation_id);

-- Gamification
CREATE INDEX IF NOT EXISTS idx_ss_badges_user ON public.ss_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_ss_skill_progress_user ON public.ss_skill_progress(user_id);

-- Problem bank
CREATE INDEX IF NOT EXISTS idx_ss_problem_bank_theme ON public.ss_problem_bank(theme);
CREATE INDEX IF NOT EXISTS idx_ss_problem_bank_status ON public.ss_problem_bank(status);
CREATE INDEX IF NOT EXISTS idx_ss_problem_bank_institution ON public.ss_problem_bank(institution_id);
CREATE INDEX IF NOT EXISTS idx_ss_problem_bank_severity ON public.ss_problem_bank(severity_rating DESC);
CREATE INDEX IF NOT EXISTS idx_ss_problem_attempts_problem ON public.ss_problem_attempts(problem_id);
CREATE INDEX IF NOT EXISTS idx_ss_problem_attempts_user ON public.ss_problem_attempts(user_id);

-- NIF
CREATE INDEX IF NOT EXISTS idx_ss_nif_candidates_stage ON public.ss_nif_candidates(stage);
CREATE INDEX IF NOT EXISTS idx_ss_nif_stage_history_candidate ON public.ss_nif_stage_history(candidate_id);

-- Appathon
CREATE INDEX IF NOT EXISTS idx_ss_submissions_event ON public.ss_appathon_submissions(event_id);
CREATE INDEX IF NOT EXISTS idx_ss_submissions_user ON public.ss_appathon_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_ss_submissions_status ON public.ss_appathon_submissions(status);
CREATE INDEX IF NOT EXISTS idx_ss_judge_scores_submission ON public.ss_judge_scores(submission_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.ss_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_value_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_workflow_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_impacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_skill_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_problem_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_problem_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_problem_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_problem_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_problem_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_problem_cluster_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_problem_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_nif_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_nif_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_industry_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_research_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_appathon_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_judging_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_track_judges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_judge_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_audience_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_problem_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_case_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_flywheel_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_byos_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ss_cycle_reviews ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES (Service role bypass + authenticated read)
-- ============================================

-- Service role has full access (for API routes using withAuth)
-- Authenticated users can read most tables

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'ss_events', 'ss_cycles', 'ss_problems', 'ss_contexts', 'ss_interviews',
            'ss_value_assessments', 'ss_workflow_classifications', 'ss_prompts',
            'ss_builds', 'ss_impacts', 'ss_conversations', 'ss_messages',
            'ss_badges', 'ss_skill_progress', 'ss_problem_bank', 'ss_problem_attempts',
            'ss_problem_tags', 'ss_problem_evidence', 'ss_problem_clusters',
            'ss_problem_cluster_members', 'ss_problem_scores', 'ss_nif_candidates',
            'ss_nif_stage_history', 'ss_industry_interests', 'ss_research_topics',
            'ss_appathon_submissions', 'ss_judging_tracks', 'ss_track_judges',
            'ss_judge_scores', 'ss_audience_votes', 'ss_problem_outcomes',
            'ss_case_studies', 'ss_flywheel_metrics', 'ss_byos_connections',
            'ss_cycle_reviews'
        ])
    LOOP
        -- Authenticated users can read
        EXECUTE format(
            'CREATE POLICY "%s_select" ON public.%I FOR SELECT TO authenticated USING (true)',
            tbl, tbl
        );
        -- Service role can do everything
        EXECUTE format(
            'CREATE POLICY "%s_service_all" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
            tbl, tbl
        );
    END LOOP;
END
$$;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'ss_events', 'ss_cycles', 'ss_problems', 'ss_contexts',
            'ss_value_assessments', 'ss_workflow_classifications', 'ss_prompts',
            'ss_builds', 'ss_impacts', 'ss_problem_bank', 'ss_nif_candidates',
            'ss_industry_interests', 'ss_research_topics', 'ss_appathon_submissions',
            'ss_judge_scores', 'ss_problem_outcomes', 'ss_case_studies',
            'ss_byos_connections', 'ss_cycle_reviews', 'ss_problem_clusters'
        ])
    LOOP
        EXECUTE format(
            'CREATE TRIGGER tr_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
            tbl, tbl
        );
    END LOOP;
END
$$;
