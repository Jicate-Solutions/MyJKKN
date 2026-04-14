-- ================================================================================
-- SOLUTIONS HUB RLS POLICIES
-- Created: 2026-02-05
-- Description: Comprehensive RLS policies for all 30 Solutions Hub tables
-- Purpose: Enable secure multi-role access to Solutions Hub data
-- ================================================================================

-- ================================================================================
-- HELPER FUNCTIONS FOR SOLUTIONS HUB ACCESS CONTROL
-- ================================================================================

-- Check if current user is a super admin
CREATE OR REPLACE FUNCTION sh_is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin')
    );
END;
$$;

-- Check if current user is JICATE staff
CREATE OR REPLACE FUNCTION sh_is_jicate_staff()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'jicate_staff'
    );
END;
$$;

-- Check if current user is HOD
CREATE OR REPLACE FUNCTION sh_is_hod()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'hod'
    );
END;
$$;

-- Get current user's department ID
CREATE OR REPLACE FUNCTION sh_user_department_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN (
        SELECT department_id FROM profiles
        WHERE id = auth.uid()
    );
END;
$$;

-- Get current user's institution ID
CREATE OR REPLACE FUNCTION sh_user_institution_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN (
        SELECT institution_id FROM profiles
        WHERE id = auth.uid()
    );
END;
$$;

-- Check if current user is a builder (registered in sh_builders)
CREATE OR REPLACE FUNCTION sh_is_builder()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM sh_builders
        WHERE user_id = auth.uid()
        AND is_active = true
    );
END;
$$;

-- Get builder ID for current user
CREATE OR REPLACE FUNCTION sh_get_builder_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN (
        SELECT id FROM sh_builders
        WHERE user_id = auth.uid()
        AND is_active = true
        LIMIT 1
    );
END;
$$;

-- Check if current user is staff
CREATE OR REPLACE FUNCTION sh_is_staff()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('staff', 'faculty', 'teaching_staff', 'non_teaching_staff')
    );
END;
$$;

-- Check if user has Solutions Hub management access
CREATE OR REPLACE FUNCTION sh_has_management_access()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN sh_is_admin() OR sh_is_jicate_staff() OR sh_is_hod();
END;
$$;

-- ================================================================================
-- SECTION 1: CLIENT MANAGEMENT TABLES
-- ================================================================================

-- sh_clients: Client organizations
DROP POLICY IF EXISTS "sh_clients_select" ON sh_clients;
DROP POLICY IF EXISTS "sh_clients_insert" ON sh_clients;
DROP POLICY IF EXISTS "sh_clients_update" ON sh_clients;
DROP POLICY IF EXISTS "sh_clients_delete" ON sh_clients;

CREATE POLICY "sh_clients_select" ON sh_clients
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR sh_is_builder()
    );

CREATE POLICY "sh_clients_insert" ON sh_clients
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_clients_update" ON sh_clients
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_clients_delete" ON sh_clients
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_client_referrals: Track referral sources
DROP POLICY IF EXISTS "sh_client_referrals_select" ON sh_client_referrals;
DROP POLICY IF EXISTS "sh_client_referrals_insert" ON sh_client_referrals;
DROP POLICY IF EXISTS "sh_client_referrals_update" ON sh_client_referrals;
DROP POLICY IF EXISTS "sh_client_referrals_delete" ON sh_client_referrals;

CREATE POLICY "sh_client_referrals_select" ON sh_client_referrals
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_client_referrals_insert" ON sh_client_referrals
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_client_referrals_update" ON sh_client_referrals
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_client_referrals_delete" ON sh_client_referrals
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_client_communications: Client communication logs
DROP POLICY IF EXISTS "sh_client_communications_select" ON sh_client_communications;
DROP POLICY IF EXISTS "sh_client_communications_insert" ON sh_client_communications;
DROP POLICY IF EXISTS "sh_client_communications_update" ON sh_client_communications;
DROP POLICY IF EXISTS "sh_client_communications_delete" ON sh_client_communications;

CREATE POLICY "sh_client_communications_select" ON sh_client_communications
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_client_communications_insert" ON sh_client_communications
    FOR INSERT WITH CHECK (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_client_communications_update" ON sh_client_communications
    FOR UPDATE USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_client_communications_delete" ON sh_client_communications
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_discovery_visits: Site visits and discovery sessions
DROP POLICY IF EXISTS "sh_discovery_visits_select" ON sh_discovery_visits;
DROP POLICY IF EXISTS "sh_discovery_visits_insert" ON sh_discovery_visits;
DROP POLICY IF EXISTS "sh_discovery_visits_update" ON sh_discovery_visits;
DROP POLICY IF EXISTS "sh_discovery_visits_delete" ON sh_discovery_visits;

CREATE POLICY "sh_discovery_visits_select" ON sh_discovery_visits
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_discovery_visits_insert" ON sh_discovery_visits
    FOR INSERT WITH CHECK (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_discovery_visits_update" ON sh_discovery_visits
    FOR UPDATE USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_discovery_visits_delete" ON sh_discovery_visits
    FOR DELETE USING (
        sh_is_admin()
    );

-- ================================================================================
-- SECTION 2: SOLUTIONS & PROJECTS TABLES
-- ================================================================================

-- sh_solutions: Main solutions/projects table
DROP POLICY IF EXISTS "sh_solutions_select" ON sh_solutions;
DROP POLICY IF EXISTS "sh_solutions_insert" ON sh_solutions;
DROP POLICY IF EXISTS "sh_solutions_update" ON sh_solutions;
DROP POLICY IF EXISTS "sh_solutions_delete" ON sh_solutions;

CREATE POLICY "sh_solutions_select" ON sh_solutions
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR sh_is_builder()
    );

CREATE POLICY "sh_solutions_insert" ON sh_solutions
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_solutions_update" ON sh_solutions
    FOR UPDATE USING (
        sh_has_management_access()
        OR (sh_is_hod() AND lead_department_id = sh_user_department_id())
    );

CREATE POLICY "sh_solutions_delete" ON sh_solutions
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_solution_phases: Project phases and milestones
DROP POLICY IF EXISTS "sh_solution_phases_select" ON sh_solution_phases;
DROP POLICY IF EXISTS "sh_solution_phases_insert" ON sh_solution_phases;
DROP POLICY IF EXISTS "sh_solution_phases_update" ON sh_solution_phases;
DROP POLICY IF EXISTS "sh_solution_phases_delete" ON sh_solution_phases;

CREATE POLICY "sh_solution_phases_select" ON sh_solution_phases
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR sh_is_builder()
    );

CREATE POLICY "sh_solution_phases_insert" ON sh_solution_phases
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_solution_phases_update" ON sh_solution_phases
    FOR UPDATE USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_solution_phases_delete" ON sh_solution_phases
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_solution_mous: MOUs and contracts
DROP POLICY IF EXISTS "sh_solution_mous_select" ON sh_solution_mous;
DROP POLICY IF EXISTS "sh_solution_mous_insert" ON sh_solution_mous;
DROP POLICY IF EXISTS "sh_solution_mous_update" ON sh_solution_mous;
DROP POLICY IF EXISTS "sh_solution_mous_delete" ON sh_solution_mous;

CREATE POLICY "sh_solution_mous_select" ON sh_solution_mous
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_solution_mous_insert" ON sh_solution_mous
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_solution_mous_update" ON sh_solution_mous
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_solution_mous_delete" ON sh_solution_mous
    FOR DELETE USING (
        sh_is_admin()
    );

-- ================================================================================
-- SECTION 3: BUILDER MANAGEMENT TABLES
-- ================================================================================

-- sh_builders: Builder profiles
DROP POLICY IF EXISTS "sh_builders_select" ON sh_builders;
DROP POLICY IF EXISTS "sh_builders_insert" ON sh_builders;
DROP POLICY IF EXISTS "sh_builders_update" ON sh_builders;
DROP POLICY IF EXISTS "sh_builders_delete" ON sh_builders;

CREATE POLICY "sh_builders_select" ON sh_builders
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR user_id = auth.uid()  -- Builders can view their own profile
    );

CREATE POLICY "sh_builders_insert" ON sh_builders
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_builders_update" ON sh_builders
    FOR UPDATE USING (
        sh_has_management_access()
        OR user_id = auth.uid()  -- Builders can update their own profile
    );

CREATE POLICY "sh_builders_delete" ON sh_builders
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_builder_skills: Builder skill matrix
DROP POLICY IF EXISTS "sh_builder_skills_select" ON sh_builder_skills;
DROP POLICY IF EXISTS "sh_builder_skills_insert" ON sh_builder_skills;
DROP POLICY IF EXISTS "sh_builder_skills_update" ON sh_builder_skills;
DROP POLICY IF EXISTS "sh_builder_skills_delete" ON sh_builder_skills;

CREATE POLICY "sh_builder_skills_select" ON sh_builder_skills
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR EXISTS (
            SELECT 1 FROM sh_builders
            WHERE sh_builders.id = sh_builder_skills.builder_id
            AND sh_builders.user_id = auth.uid()
        )
    );

CREATE POLICY "sh_builder_skills_insert" ON sh_builder_skills
    FOR INSERT WITH CHECK (
        sh_has_management_access()
        OR EXISTS (
            SELECT 1 FROM sh_builders
            WHERE sh_builders.id = sh_builder_skills.builder_id
            AND sh_builders.user_id = auth.uid()
        )
    );

CREATE POLICY "sh_builder_skills_update" ON sh_builder_skills
    FOR UPDATE USING (
        sh_has_management_access()
        OR EXISTS (
            SELECT 1 FROM sh_builders
            WHERE sh_builders.id = sh_builder_skills.builder_id
            AND sh_builders.user_id = auth.uid()
        )
    );

CREATE POLICY "sh_builder_skills_delete" ON sh_builder_skills
    FOR DELETE USING (
        sh_has_management_access()
        OR EXISTS (
            SELECT 1 FROM sh_builders
            WHERE sh_builders.id = sh_builder_skills.builder_id
            AND sh_builders.user_id = auth.uid()
        )
    );

-- sh_builder_assignments: Project assignments
DROP POLICY IF EXISTS "sh_builder_assignments_select" ON sh_builder_assignments;
DROP POLICY IF EXISTS "sh_builder_assignments_insert" ON sh_builder_assignments;
DROP POLICY IF EXISTS "sh_builder_assignments_update" ON sh_builder_assignments;
DROP POLICY IF EXISTS "sh_builder_assignments_delete" ON sh_builder_assignments;

CREATE POLICY "sh_builder_assignments_select" ON sh_builder_assignments
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR EXISTS (
            SELECT 1 FROM sh_builders
            WHERE sh_builders.id = sh_builder_assignments.builder_id
            AND sh_builders.user_id = auth.uid()
        )
    );

CREATE POLICY "sh_builder_assignments_insert" ON sh_builder_assignments
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_builder_assignments_update" ON sh_builder_assignments
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_builder_assignments_delete" ON sh_builder_assignments
    FOR DELETE USING (
        sh_has_management_access()
    );

-- ================================================================================
-- SECTION 4: DEVELOPMENT & DEPLOYMENT TABLES
-- ================================================================================

-- sh_prototype_iterations: Development iterations
DROP POLICY IF EXISTS "sh_prototype_iterations_select" ON sh_prototype_iterations;
DROP POLICY IF EXISTS "sh_prototype_iterations_insert" ON sh_prototype_iterations;
DROP POLICY IF EXISTS "sh_prototype_iterations_update" ON sh_prototype_iterations;
DROP POLICY IF EXISTS "sh_prototype_iterations_delete" ON sh_prototype_iterations;

CREATE POLICY "sh_prototype_iterations_select" ON sh_prototype_iterations
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR sh_is_builder()
    );

CREATE POLICY "sh_prototype_iterations_insert" ON sh_prototype_iterations
    FOR INSERT WITH CHECK (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_prototype_iterations_update" ON sh_prototype_iterations
    FOR UPDATE USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_prototype_iterations_delete" ON sh_prototype_iterations
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_bug_reports: Bug tracking
DROP POLICY IF EXISTS "sh_bug_reports_select" ON sh_bug_reports;
DROP POLICY IF EXISTS "sh_bug_reports_insert" ON sh_bug_reports;
DROP POLICY IF EXISTS "sh_bug_reports_update" ON sh_bug_reports;
DROP POLICY IF EXISTS "sh_bug_reports_delete" ON sh_bug_reports;

CREATE POLICY "sh_bug_reports_select" ON sh_bug_reports
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR sh_is_builder()
    );

CREATE POLICY "sh_bug_reports_insert" ON sh_bug_reports
    FOR INSERT WITH CHECK (
        sh_has_management_access()
        OR sh_is_staff()
        OR sh_is_builder()
    );

CREATE POLICY "sh_bug_reports_update" ON sh_bug_reports
    FOR UPDATE USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_bug_reports_delete" ON sh_bug_reports
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_phase_deployments: Deployment tracking
DROP POLICY IF EXISTS "sh_phase_deployments_select" ON sh_phase_deployments;
DROP POLICY IF EXISTS "sh_phase_deployments_insert" ON sh_phase_deployments;
DROP POLICY IF EXISTS "sh_phase_deployments_update" ON sh_phase_deployments;
DROP POLICY IF EXISTS "sh_phase_deployments_delete" ON sh_phase_deployments;

CREATE POLICY "sh_phase_deployments_select" ON sh_phase_deployments
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR sh_is_builder()
    );

CREATE POLICY "sh_phase_deployments_insert" ON sh_phase_deployments
    FOR INSERT WITH CHECK (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_phase_deployments_update" ON sh_phase_deployments
    FOR UPDATE USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_phase_deployments_delete" ON sh_phase_deployments
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_implementation_users: Client user accounts
DROP POLICY IF EXISTS "sh_implementation_users_select" ON sh_implementation_users;
DROP POLICY IF EXISTS "sh_implementation_users_insert" ON sh_implementation_users;
DROP POLICY IF EXISTS "sh_implementation_users_update" ON sh_implementation_users;
DROP POLICY IF EXISTS "sh_implementation_users_delete" ON sh_implementation_users;

CREATE POLICY "sh_implementation_users_select" ON sh_implementation_users
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_implementation_users_insert" ON sh_implementation_users
    FOR INSERT WITH CHECK (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_implementation_users_update" ON sh_implementation_users
    FOR UPDATE USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_implementation_users_delete" ON sh_implementation_users
    FOR DELETE USING (
        sh_is_admin()
    );

-- ================================================================================
-- SECTION 5: TRAINING & COHORT TABLES
-- ================================================================================

-- sh_training_programs: Training curriculum
DROP POLICY IF EXISTS "sh_training_programs_select" ON sh_training_programs;
DROP POLICY IF EXISTS "sh_training_programs_insert" ON sh_training_programs;
DROP POLICY IF EXISTS "sh_training_programs_update" ON sh_training_programs;
DROP POLICY IF EXISTS "sh_training_programs_delete" ON sh_training_programs;

CREATE POLICY "sh_training_programs_select" ON sh_training_programs
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_training_programs_insert" ON sh_training_programs
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_training_programs_update" ON sh_training_programs
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_training_programs_delete" ON sh_training_programs
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_training_sessions: Individual training sessions
DROP POLICY IF EXISTS "sh_training_sessions_select" ON sh_training_sessions;
DROP POLICY IF EXISTS "sh_training_sessions_insert" ON sh_training_sessions;
DROP POLICY IF EXISTS "sh_training_sessions_update" ON sh_training_sessions;
DROP POLICY IF EXISTS "sh_training_sessions_delete" ON sh_training_sessions;

CREATE POLICY "sh_training_sessions_select" ON sh_training_sessions
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_training_sessions_insert" ON sh_training_sessions
    FOR INSERT WITH CHECK (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_training_sessions_update" ON sh_training_sessions
    FOR UPDATE USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_training_sessions_delete" ON sh_training_sessions
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_cohort_members: Training cohort members
DROP POLICY IF EXISTS "sh_cohort_members_select" ON sh_cohort_members;
DROP POLICY IF EXISTS "sh_cohort_members_insert" ON sh_cohort_members;
DROP POLICY IF EXISTS "sh_cohort_members_update" ON sh_cohort_members;
DROP POLICY IF EXISTS "sh_cohort_members_delete" ON sh_cohort_members;

CREATE POLICY "sh_cohort_members_select" ON sh_cohort_members
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR user_id = auth.uid()
    );

CREATE POLICY "sh_cohort_members_insert" ON sh_cohort_members
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_cohort_members_update" ON sh_cohort_members
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_cohort_members_delete" ON sh_cohort_members
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_cohort_assignments: Cohort project assignments
DROP POLICY IF EXISTS "sh_cohort_assignments_select" ON sh_cohort_assignments;
DROP POLICY IF EXISTS "sh_cohort_assignments_insert" ON sh_cohort_assignments;
DROP POLICY IF EXISTS "sh_cohort_assignments_update" ON sh_cohort_assignments;
DROP POLICY IF EXISTS "sh_cohort_assignments_delete" ON sh_cohort_assignments;

CREATE POLICY "sh_cohort_assignments_select" ON sh_cohort_assignments
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR EXISTS (
            SELECT 1 FROM sh_cohort_members
            WHERE sh_cohort_members.id = sh_cohort_assignments.cohort_member_id
            AND sh_cohort_members.user_id = auth.uid()
        )
    );

CREATE POLICY "sh_cohort_assignments_insert" ON sh_cohort_assignments
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_cohort_assignments_update" ON sh_cohort_assignments
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_cohort_assignments_delete" ON sh_cohort_assignments
    FOR DELETE USING (
        sh_is_admin()
    );

-- ================================================================================
-- SECTION 6: CONTENT PRODUCTION TABLES
-- ================================================================================

-- sh_content_orders: Content production orders
DROP POLICY IF EXISTS "sh_content_orders_select" ON sh_content_orders;
DROP POLICY IF EXISTS "sh_content_orders_insert" ON sh_content_orders;
DROP POLICY IF EXISTS "sh_content_orders_update" ON sh_content_orders;
DROP POLICY IF EXISTS "sh_content_orders_delete" ON sh_content_orders;

CREATE POLICY "sh_content_orders_select" ON sh_content_orders
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_content_orders_insert" ON sh_content_orders
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_content_orders_update" ON sh_content_orders
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_content_orders_delete" ON sh_content_orders
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_content_deliverables: Content deliverables
DROP POLICY IF EXISTS "sh_content_deliverables_select" ON sh_content_deliverables;
DROP POLICY IF EXISTS "sh_content_deliverables_insert" ON sh_content_deliverables;
DROP POLICY IF EXISTS "sh_content_deliverables_update" ON sh_content_deliverables;
DROP POLICY IF EXISTS "sh_content_deliverables_delete" ON sh_content_deliverables;

CREATE POLICY "sh_content_deliverables_select" ON sh_content_deliverables
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_content_deliverables_insert" ON sh_content_deliverables
    FOR INSERT WITH CHECK (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_content_deliverables_update" ON sh_content_deliverables
    FOR UPDATE USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_content_deliverables_delete" ON sh_content_deliverables
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_production_learners: Content production learners
DROP POLICY IF EXISTS "sh_production_learners_select" ON sh_production_learners;
DROP POLICY IF EXISTS "sh_production_learners_insert" ON sh_production_learners;
DROP POLICY IF EXISTS "sh_production_learners_update" ON sh_production_learners;
DROP POLICY IF EXISTS "sh_production_learners_delete" ON sh_production_learners;

CREATE POLICY "sh_production_learners_select" ON sh_production_learners
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR user_id = auth.uid()
    );

CREATE POLICY "sh_production_learners_insert" ON sh_production_learners
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_production_learners_update" ON sh_production_learners
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_production_learners_delete" ON sh_production_learners
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_production_assignments: Production assignments
DROP POLICY IF EXISTS "sh_production_assignments_select" ON sh_production_assignments;
DROP POLICY IF EXISTS "sh_production_assignments_insert" ON sh_production_assignments;
DROP POLICY IF EXISTS "sh_production_assignments_update" ON sh_production_assignments;
DROP POLICY IF EXISTS "sh_production_assignments_delete" ON sh_production_assignments;

CREATE POLICY "sh_production_assignments_select" ON sh_production_assignments
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR EXISTS (
            SELECT 1 FROM sh_production_learners
            WHERE sh_production_learners.id = sh_production_assignments.learner_id
            AND sh_production_learners.user_id = auth.uid()
        )
    );

CREATE POLICY "sh_production_assignments_insert" ON sh_production_assignments
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_production_assignments_update" ON sh_production_assignments
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_production_assignments_delete" ON sh_production_assignments
    FOR DELETE USING (
        sh_is_admin()
    );

-- ================================================================================
-- SECTION 7: FINANCIAL TABLES
-- ================================================================================

-- sh_revenue_split_models: Revenue sharing models
DROP POLICY IF EXISTS "sh_revenue_split_models_select" ON sh_revenue_split_models;
DROP POLICY IF EXISTS "sh_revenue_split_models_insert" ON sh_revenue_split_models;
DROP POLICY IF EXISTS "sh_revenue_split_models_update" ON sh_revenue_split_models;
DROP POLICY IF EXISTS "sh_revenue_split_models_delete" ON sh_revenue_split_models;

CREATE POLICY "sh_revenue_split_models_select" ON sh_revenue_split_models
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_revenue_split_models_insert" ON sh_revenue_split_models
    FOR INSERT WITH CHECK (
        sh_is_admin()
    );

CREATE POLICY "sh_revenue_split_models_update" ON sh_revenue_split_models
    FOR UPDATE USING (
        sh_is_admin()
    );

CREATE POLICY "sh_revenue_split_models_delete" ON sh_revenue_split_models
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_payments: Payment tracking
DROP POLICY IF EXISTS "sh_payments_select" ON sh_payments;
DROP POLICY IF EXISTS "sh_payments_insert" ON sh_payments;
DROP POLICY IF EXISTS "sh_payments_update" ON sh_payments;
DROP POLICY IF EXISTS "sh_payments_delete" ON sh_payments;

CREATE POLICY "sh_payments_select" ON sh_payments
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_payments_insert" ON sh_payments
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_payments_update" ON sh_payments
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_payments_delete" ON sh_payments
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_earnings_ledger: Earnings distribution
DROP POLICY IF EXISTS "sh_earnings_ledger_select" ON sh_earnings_ledger;
DROP POLICY IF EXISTS "sh_earnings_ledger_insert" ON sh_earnings_ledger;
DROP POLICY IF EXISTS "sh_earnings_ledger_update" ON sh_earnings_ledger;
DROP POLICY IF EXISTS "sh_earnings_ledger_delete" ON sh_earnings_ledger;

CREATE POLICY "sh_earnings_ledger_select" ON sh_earnings_ledger
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR (
            recipient_type = 'builder'
            AND builder_id = sh_get_builder_id()
        )
        OR (
            recipient_type = 'cohort_member'
            AND cohort_member_id IN (
                SELECT id FROM sh_cohort_members
                WHERE user_id = auth.uid()
            )
        )
        OR (
            recipient_type = 'production_learner'
            AND production_learner_id IN (
                SELECT id FROM sh_production_learners
                WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "sh_earnings_ledger_insert" ON sh_earnings_ledger
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_earnings_ledger_update" ON sh_earnings_ledger
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_earnings_ledger_delete" ON sh_earnings_ledger
    FOR DELETE USING (
        sh_is_admin()
    );

-- ================================================================================
-- SECTION 8: RESEARCH & PUBLICATION TABLES
-- ================================================================================

-- sh_publications: Research publications
DROP POLICY IF EXISTS "sh_publications_select" ON sh_publications;
DROP POLICY IF EXISTS "sh_publications_insert" ON sh_publications;
DROP POLICY IF EXISTS "sh_publications_update" ON sh_publications;
DROP POLICY IF EXISTS "sh_publications_delete" ON sh_publications;

CREATE POLICY "sh_publications_select" ON sh_publications
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR sh_is_builder()
    );

CREATE POLICY "sh_publications_insert" ON sh_publications
    FOR INSERT WITH CHECK (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_publications_update" ON sh_publications
    FOR UPDATE USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_publications_delete" ON sh_publications
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_publication_contributors: Publication authors
DROP POLICY IF EXISTS "sh_publication_contributors_select" ON sh_publication_contributors;
DROP POLICY IF EXISTS "sh_publication_contributors_insert" ON sh_publication_contributors;
DROP POLICY IF EXISTS "sh_publication_contributors_update" ON sh_publication_contributors;
DROP POLICY IF EXISTS "sh_publication_contributors_delete" ON sh_publication_contributors;

CREATE POLICY "sh_publication_contributors_select" ON sh_publication_contributors
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR builder_id = sh_get_builder_id()
        OR cohort_member_id IN (
            SELECT id FROM sh_cohort_members WHERE user_id = auth.uid()
        )
        OR learner_id IN (
            SELECT id FROM sh_production_learners WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "sh_publication_contributors_insert" ON sh_publication_contributors
    FOR INSERT WITH CHECK (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_publication_contributors_update" ON sh_publication_contributors
    FOR UPDATE USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_publication_contributors_delete" ON sh_publication_contributors
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_accreditation_metrics: Accreditation tracking
DROP POLICY IF EXISTS "sh_accreditation_metrics_select" ON sh_accreditation_metrics;
DROP POLICY IF EXISTS "sh_accreditation_metrics_insert" ON sh_accreditation_metrics;
DROP POLICY IF EXISTS "sh_accreditation_metrics_update" ON sh_accreditation_metrics;
DROP POLICY IF EXISTS "sh_accreditation_metrics_delete" ON sh_accreditation_metrics;

CREATE POLICY "sh_accreditation_metrics_select" ON sh_accreditation_metrics
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_accreditation_metrics_insert" ON sh_accreditation_metrics
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_accreditation_metrics_update" ON sh_accreditation_metrics
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_accreditation_metrics_delete" ON sh_accreditation_metrics
    FOR DELETE USING (
        sh_is_admin()
    );

-- ================================================================================
-- SECTION 9: SUPPORT & TRACKING TABLES
-- ================================================================================

-- sh_jicate_sessions: JICATE facilitation sessions
DROP POLICY IF EXISTS "sh_jicate_sessions_select" ON sh_jicate_sessions;
DROP POLICY IF EXISTS "sh_jicate_sessions_insert" ON sh_jicate_sessions;
DROP POLICY IF EXISTS "sh_jicate_sessions_update" ON sh_jicate_sessions;
DROP POLICY IF EXISTS "sh_jicate_sessions_delete" ON sh_jicate_sessions;

CREATE POLICY "sh_jicate_sessions_select" ON sh_jicate_sessions
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_jicate_sessions_insert" ON sh_jicate_sessions
    FOR INSERT WITH CHECK (
        sh_has_management_access()
        OR sh_is_jicate_staff()
    );

CREATE POLICY "sh_jicate_sessions_update" ON sh_jicate_sessions
    FOR UPDATE USING (
        sh_has_management_access()
        OR sh_is_jicate_staff()
    );

CREATE POLICY "sh_jicate_sessions_delete" ON sh_jicate_sessions
    FOR DELETE USING (
        sh_is_admin()
    );

-- sh_notifications: System notifications
DROP POLICY IF EXISTS "sh_notifications_select" ON sh_notifications;
DROP POLICY IF EXISTS "sh_notifications_insert" ON sh_notifications;
DROP POLICY IF EXISTS "sh_notifications_update" ON sh_notifications;
DROP POLICY IF EXISTS "sh_notifications_delete" ON sh_notifications;

CREATE POLICY "sh_notifications_select" ON sh_notifications
    FOR SELECT USING (
        user_id = auth.uid()
        OR sh_has_management_access()
    );

CREATE POLICY "sh_notifications_insert" ON sh_notifications
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_notifications_update" ON sh_notifications
    FOR UPDATE USING (
        user_id = auth.uid()  -- Users can mark their own notifications as read
        OR sh_has_management_access()
    );

CREATE POLICY "sh_notifications_delete" ON sh_notifications
    FOR DELETE USING (
        user_id = auth.uid()
        OR sh_is_admin()
    );

-- sh_audit_logs: Audit trail
DROP POLICY IF EXISTS "sh_audit_logs_select" ON sh_audit_logs;
DROP POLICY IF EXISTS "sh_audit_logs_insert" ON sh_audit_logs;
DROP POLICY IF EXISTS "sh_audit_logs_update" ON sh_audit_logs;
DROP POLICY IF EXISTS "sh_audit_logs_delete" ON sh_audit_logs;

CREATE POLICY "sh_audit_logs_select" ON sh_audit_logs
    FOR SELECT USING (
        sh_is_admin()
        OR sh_is_jicate_staff()
    );

CREATE POLICY "sh_audit_logs_insert" ON sh_audit_logs
    FOR INSERT WITH CHECK (
        true  -- Anyone authenticated can create audit logs
    );

CREATE POLICY "sh_audit_logs_update" ON sh_audit_logs
    FOR UPDATE USING (
        false  -- Audit logs should never be updated
    );

CREATE POLICY "sh_audit_logs_delete" ON sh_audit_logs
    FOR DELETE USING (
        sh_is_admin()
    );

-- ================================================================================
-- END OF SOLUTIONS HUB RLS POLICIES
-- ================================================================================

-- Add comment for tracking
COMMENT ON FUNCTION sh_is_admin() IS 'RLS helper: Check if current user is super_admin or admin';
COMMENT ON FUNCTION sh_is_jicate_staff() IS 'RLS helper: Check if current user is JICATE staff';
COMMENT ON FUNCTION sh_is_hod() IS 'RLS helper: Check if current user is HOD';
COMMENT ON FUNCTION sh_is_staff() IS 'RLS helper: Check if current user is staff/faculty';
COMMENT ON FUNCTION sh_is_builder() IS 'RLS helper: Check if current user is an active builder';
COMMENT ON FUNCTION sh_user_department_id() IS 'RLS helper: Get current user department ID';
COMMENT ON FUNCTION sh_user_institution_id() IS 'RLS helper: Get current user institution ID';
COMMENT ON FUNCTION sh_get_builder_id() IS 'RLS helper: Get builder ID for current user';
COMMENT ON FUNCTION sh_has_management_access() IS 'RLS helper: Check if user has Solutions Hub management access';
