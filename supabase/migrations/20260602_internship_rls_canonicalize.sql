-- =====================================================================
-- Migration: Canonicalize Internship Module RLS Policies
-- Date:      2026-06-02
-- Branch:    feat/internships-rbac-bundle-rls
-- =====================================================================
--
-- PROBLEM
-- -------
-- 18 of 19 internship_* tables were created in
--   supabase/migrations/20260509_internship_module_substrate_v3.sql
-- with a NON-CANONICAL RLS pattern:
--
--     FOR ALL USING (
--       institution_id IN (
--         SELECT institution_id FROM user_institution_access
--         WHERE user_id = auth.uid()
--       )
--     )
--
-- This pattern has THREE production security bugs vs. the project
-- canonical pattern documented in CLAUDE.md:
--
--   1. No super_admin bypass.  is_super_admin() users are blocked
--      from rows whose institution_id is not in their
--      user_institution_access list.  Super admins are designed to
--      see EVERY institution.
--
--   2. No is_admin() bypass.  Platform admins (role IN
--      'admin','super_admin','administrator') are blocked the same way.
--
--   3. No permission gate.  Any authenticated user who has even one
--      row in user_institution_access can read/write EVERY internship
--      row for that institution, regardless of whether their role
--      grants internship.<resource>.view or .edit.  Permission keys
--      are completely bypassed -- the policy never calls
--      user_has_permission().
--
--   4. Bonus: WITH CHECK is implicit (inherits USING under FOR ALL).
--      Combined with #3, a non-internship role with any access grant
--      could write internship rows it should never touch.
--
-- CANONICAL PATTERN (per CLAUDE.md "Role Management & Dynamic
-- Permission System"):
--
--   FOR SELECT USING (
--     is_super_admin()
--     OR is_admin()
--     OR (user_has_permission('internship.<r>.view')
--         AND role_has_institution_access(institution_id))
--   );
--
--   FOR ALL USING (...edit...) WITH CHECK (...edit...);
--
-- One previously-fixed table is OUT OF SCOPE:
--   internship_site_types  --  patched separately in PR #830
--   (supabase/migrations/20260510_internship_module_audit_blocker_fixes.sql)
--   and left as-is per the canonicalization sprint plan.
--
-- TABLES MIGRATED (18)
-- --------------------
--   internship_external_sites                  -> internship.sites
--   internship_site_contacts                   -> internship.sites
--   internship_preceptors                      -> internship.preceptors
--   internship_approval_chains                 -> internship.policy.approval_chains
--   internship_posting_cycles                  -> internship.cycles
--   internship_cycle_hospitals                 -> internship.cycles
--   internship_program_config                  -> internship.policy.program_config
--   internship_logbook_templates               -> internship.logbook
--   internship_evaluation_rubrics              -> internship.evaluations
--   internship_assignments                     -> internship.assignments
--   internship_logbook_entries                 -> internship.logbook
--   internship_evaluations                     -> internship.evaluations
--   internship_incidents                       -> internship.incidents
--   internship_certificates                    -> internship.certificates
--   internship_vehicles                        -> internship.vehicles
--   internship_cycle_status_labels             -> internship.policy.status_labels
--   internship_college_blackouts               -> internship.policy.blackouts
--   internship_college_notification_overrides  -> internship.policy.notifications
--
-- IMPACT
-- ------
--   * Super admins (is_super_admin = true) regain visibility into
--     every institution's internship data.
--   * Platform admins (is_admin()) regain read+write across all
--     institutions.
--   * Every other role is now correctly gated by
--     internship.<resource>.{view,edit} AND
--     role_has_institution_access(institution_id).
--   * The 18 permission keys referenced below MUST be registered in
--     lib/constants/permissions.ts PERMISSION_CATEGORIES and granted
--     to the relevant roles via Role Management UI BEFORE non-admin
--     users will see any internship rows.  Until those grants are
--     in place, only super_admin/admin can read/write -- this is
--     deliberate (fail-closed).
--   * internship_site_types is unchanged.
--
-- ATOMICITY
-- ---------
-- The entire migration runs inside a single transaction.  Either
-- all 18 tables get the new policies, or none do.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- internship_external_sites  (resource: internship.sites)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_external_sites_institution_access" ON internship_external_sites;
DROP POLICY IF EXISTS "internship_external_sites_select"             ON internship_external_sites;
DROP POLICY IF EXISTS "internship_external_sites_modify"             ON internship_external_sites;

CREATE POLICY "internship_external_sites_select" ON internship_external_sites
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.sites.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_external_sites_modify" ON internship_external_sites
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.sites.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.sites.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_site_contacts  (resource: internship.sites)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_site_contacts_institution_access" ON internship_site_contacts;
DROP POLICY IF EXISTS "internship_site_contacts_select"             ON internship_site_contacts;
DROP POLICY IF EXISTS "internship_site_contacts_modify"             ON internship_site_contacts;

CREATE POLICY "internship_site_contacts_select" ON internship_site_contacts
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.sites.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_site_contacts_modify" ON internship_site_contacts
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.sites.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.sites.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_preceptors  (resource: internship.preceptors)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_preceptors_institution_access" ON internship_preceptors;
DROP POLICY IF EXISTS "internship_preceptors_select"             ON internship_preceptors;
DROP POLICY IF EXISTS "internship_preceptors_modify"             ON internship_preceptors;

CREATE POLICY "internship_preceptors_select" ON internship_preceptors
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.preceptors.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_preceptors_modify" ON internship_preceptors
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.preceptors.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.preceptors.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_approval_chains  (resource: internship.policy.approval_chains)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_approval_chains_institution_access" ON internship_approval_chains;
DROP POLICY IF EXISTS "internship_approval_chains_select"             ON internship_approval_chains;
DROP POLICY IF EXISTS "internship_approval_chains_modify"             ON internship_approval_chains;

CREATE POLICY "internship_approval_chains_select" ON internship_approval_chains
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.approval_chains.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_approval_chains_modify" ON internship_approval_chains
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.approval_chains.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.approval_chains.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_posting_cycles  (resource: internship.cycles)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_posting_cycles_institution_access" ON internship_posting_cycles;
DROP POLICY IF EXISTS "internship_posting_cycles_select"             ON internship_posting_cycles;
DROP POLICY IF EXISTS "internship_posting_cycles_modify"             ON internship_posting_cycles;

CREATE POLICY "internship_posting_cycles_select" ON internship_posting_cycles
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.cycles.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_posting_cycles_modify" ON internship_posting_cycles
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.cycles.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.cycles.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_cycle_hospitals  (resource: internship.cycles)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_cycle_hospitals_institution_access" ON internship_cycle_hospitals;
DROP POLICY IF EXISTS "internship_cycle_hospitals_select"             ON internship_cycle_hospitals;
DROP POLICY IF EXISTS "internship_cycle_hospitals_modify"             ON internship_cycle_hospitals;

CREATE POLICY "internship_cycle_hospitals_select" ON internship_cycle_hospitals
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.cycles.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_cycle_hospitals_modify" ON internship_cycle_hospitals
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.cycles.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.cycles.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_program_config  (resource: internship.policy.program_config)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_program_config_institution_access" ON internship_program_config;
DROP POLICY IF EXISTS "internship_program_config_select"             ON internship_program_config;
DROP POLICY IF EXISTS "internship_program_config_modify"             ON internship_program_config;

CREATE POLICY "internship_program_config_select" ON internship_program_config
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.program_config.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_program_config_modify" ON internship_program_config
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.program_config.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.program_config.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_logbook_templates  (resource: internship.logbook)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_logbook_templates_institution_access" ON internship_logbook_templates;
DROP POLICY IF EXISTS "internship_logbook_templates_select"             ON internship_logbook_templates;
DROP POLICY IF EXISTS "internship_logbook_templates_modify"             ON internship_logbook_templates;

CREATE POLICY "internship_logbook_templates_select" ON internship_logbook_templates
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.logbook.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_logbook_templates_modify" ON internship_logbook_templates
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.logbook.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.logbook.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_evaluation_rubrics  (resource: internship.evaluations)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_evaluation_rubrics_institution_access" ON internship_evaluation_rubrics;
DROP POLICY IF EXISTS "internship_evaluation_rubrics_select"             ON internship_evaluation_rubrics;
DROP POLICY IF EXISTS "internship_evaluation_rubrics_modify"             ON internship_evaluation_rubrics;

CREATE POLICY "internship_evaluation_rubrics_select" ON internship_evaluation_rubrics
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.evaluations.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_evaluation_rubrics_modify" ON internship_evaluation_rubrics
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.evaluations.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.evaluations.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_assignments  (resource: internship.assignments)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_assignments_institution_access" ON internship_assignments;
DROP POLICY IF EXISTS "internship_assignments_select"             ON internship_assignments;
DROP POLICY IF EXISTS "internship_assignments_modify"             ON internship_assignments;

CREATE POLICY "internship_assignments_select" ON internship_assignments
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.assignments.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_assignments_modify" ON internship_assignments
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.assignments.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.assignments.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_logbook_entries  (resource: internship.logbook)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_logbook_entries_institution_access" ON internship_logbook_entries;
DROP POLICY IF EXISTS "internship_logbook_entries_select"             ON internship_logbook_entries;
DROP POLICY IF EXISTS "internship_logbook_entries_modify"             ON internship_logbook_entries;

CREATE POLICY "internship_logbook_entries_select" ON internship_logbook_entries
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.logbook.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_logbook_entries_modify" ON internship_logbook_entries
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.logbook.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.logbook.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_evaluations  (resource: internship.evaluations)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_evaluations_institution_access" ON internship_evaluations;
DROP POLICY IF EXISTS "internship_evaluations_select"             ON internship_evaluations;
DROP POLICY IF EXISTS "internship_evaluations_modify"             ON internship_evaluations;

CREATE POLICY "internship_evaluations_select" ON internship_evaluations
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.evaluations.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_evaluations_modify" ON internship_evaluations
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.evaluations.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.evaluations.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_incidents  (resource: internship.incidents)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_incidents_institution_access" ON internship_incidents;
DROP POLICY IF EXISTS "internship_incidents_select"             ON internship_incidents;
DROP POLICY IF EXISTS "internship_incidents_modify"             ON internship_incidents;

CREATE POLICY "internship_incidents_select" ON internship_incidents
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.incidents.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_incidents_modify" ON internship_incidents
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.incidents.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.incidents.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_certificates  (resource: internship.certificates)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_certificates_institution_access" ON internship_certificates;
DROP POLICY IF EXISTS "internship_certificates_select"             ON internship_certificates;
DROP POLICY IF EXISTS "internship_certificates_modify"             ON internship_certificates;

CREATE POLICY "internship_certificates_select" ON internship_certificates
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.certificates.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_certificates_modify" ON internship_certificates
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.certificates.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.certificates.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_vehicles  (resource: internship.vehicles)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_vehicles_institution_access" ON internship_vehicles;
DROP POLICY IF EXISTS "internship_vehicles_select"             ON internship_vehicles;
DROP POLICY IF EXISTS "internship_vehicles_modify"             ON internship_vehicles;

CREATE POLICY "internship_vehicles_select" ON internship_vehicles
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.vehicles.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_vehicles_modify" ON internship_vehicles
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.vehicles.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.vehicles.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_cycle_status_labels  (resource: internship.policy.status_labels)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_cycle_status_labels_institution_access" ON internship_cycle_status_labels;
DROP POLICY IF EXISTS "internship_cycle_status_labels_select"             ON internship_cycle_status_labels;
DROP POLICY IF EXISTS "internship_cycle_status_labels_modify"             ON internship_cycle_status_labels;

CREATE POLICY "internship_cycle_status_labels_select" ON internship_cycle_status_labels
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.status_labels.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_cycle_status_labels_modify" ON internship_cycle_status_labels
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.status_labels.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.status_labels.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_college_blackouts  (resource: internship.policy.blackouts)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_college_blackouts_institution_access" ON internship_college_blackouts;
DROP POLICY IF EXISTS "internship_college_blackouts_select"             ON internship_college_blackouts;
DROP POLICY IF EXISTS "internship_college_blackouts_modify"             ON internship_college_blackouts;

CREATE POLICY "internship_college_blackouts_select" ON internship_college_blackouts
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.blackouts.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_college_blackouts_modify" ON internship_college_blackouts
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.blackouts.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.blackouts.edit')
        AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- internship_college_notification_overrides  (resource: internship.policy.notifications)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "internship_college_notification_overrides_institution_access" ON internship_college_notification_overrides;
DROP POLICY IF EXISTS "internship_college_notification_overrides_select"             ON internship_college_notification_overrides;
DROP POLICY IF EXISTS "internship_college_notification_overrides_modify"             ON internship_college_notification_overrides;

CREATE POLICY "internship_college_notification_overrides_select" ON internship_college_notification_overrides
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.notifications.view')
        AND role_has_institution_access(institution_id))
  );

CREATE POLICY "internship_college_notification_overrides_modify" ON internship_college_notification_overrides
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.notifications.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('internship.policy.notifications.edit')
        AND role_has_institution_access(institution_id))
  );

COMMIT;
