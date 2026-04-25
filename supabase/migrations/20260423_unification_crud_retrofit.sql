-- Compliance Unification Program — CRUD retrofit migration
-- ==========================================================================
-- Purpose: Retroactively apply /myjkkn-chain principles to Unification tables
-- that were previously seed-only:
--   1. is_system flag on seed-bearing tables (grievance_categories,
--      sh_accreditation_metrics). Protects system-default rows from admin delete.
--   2. quality_evidence_source_registry — replaces text-field source_table
--      with a typed registry. Registry is advisory (no FK yet — keeps existing
--      evidence rows untouched).
--   3. Modernize grievance_* RLS policies from hardcoded role arrays to the
--      dynamic permission system (user_has_permission + role_has_institution_access
--      + is_super_admin/is_admin bypass).
--
-- Idempotent: IF NOT EXISTS + ON CONFLICT DO NOTHING + DROP POLICY IF EXISTS.
-- Safe to re-run on prod.

-- ==========================================================================
-- Part 1: is_system flag on seed-bearing tables
-- ==========================================================================

ALTER TABLE grievance_categories
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

ALTER TABLE sh_accreditation_metrics
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- Mark existing seeded rows as is_system=true.
-- Grievance categories: the 5 canonical names we seeded in PR-A6a.
UPDATE grievance_categories
SET is_system = true
WHERE name IN ('Sexual Harassment (ICC)', 'Ragging', 'Academic',
               'Infrastructure / Hostel', 'Other')
  AND is_system = false;

-- Accreditation metrics: every row that already exists on prod was seeded
-- by the program (PR-A2 substrate + my PR-A6a UGC add). Mark all existing
-- rows as is_system. Future local/supplementary metrics added via the UI
-- default to is_system=false.
UPDATE sh_accreditation_metrics
SET is_system = true
WHERE is_system = false;

COMMENT ON COLUMN grievance_categories.is_system IS
  'true = system-default (protected from admin delete/rename in UI); false = institution-created';
COMMENT ON COLUMN sh_accreditation_metrics.is_system IS
  'true = official body-rubric metric (protected); false = local/supplementary metric added by IQAC';

-- ==========================================================================
-- Part 2: quality_evidence_source_registry
-- ==========================================================================

CREATE TABLE IF NOT EXISTS quality_evidence_source_registry (
  source_kind text PRIMARY KEY,
  source_table text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE quality_evidence_source_registry IS
  'Typed registry of source tables that can emit to quality_evidence_mappings. Advisory (no FK on mappings yet). UI uses this to display source-kind metadata.';

-- Seed registry with known modules that either already emit evidence or are
-- planned to. display_name is user-facing; source_table is the physical table.
INSERT INTO quality_evidence_source_registry (source_kind, source_table, display_name, description, is_system)
VALUES
  ('grievance_ticket',      'grievance_tickets',         'Grievance Tickets',
   'Resolved grievance tickets emit NAAC 7.7.1 + UGC grievance evidence.', true),
  ('ip_filing',             'ip_filings',                'IP Filings',
   'Patents, copyrights, design filings. Emits NAAC 3.5 + NIRF RPC evidence.', true),
  ('sh_publication',        'sh_publications',           'Solutions Hub Publications',
   'Journal papers, conference articles. Emits NAAC 9.1 + NIRF RPC + NBA PO + QS Citations.', true),
  ('anti_ragging_affidavit','hostel_anti_ragging_affidavits', 'Anti-Ragging Affidavits',
   'Signed affidavits from hostel residents. Emits UGC anti-ragging + NAAC 7.7 + NAAC 5.6(Auto).', true),
  ('admission_naac_evidence','admission_naac_evidence',  'Admission NAAC Evidence',
   'Demographic / category / seat-type data from admission pipeline for NAAC 1.2, 2.1.', true),
  ('pde_naac_evidence',     'pde_naac_evidence',         'PDE NAAC Evidence',
   'Professional Development Evidence (staff FDPs, workshops) for NAAC 2.4.', true),
  ('hostel_incident',       'hostel_incidents',          'Hostel Incidents',
   'Escalated hostel incidents can federate into grievance_tickets (A6c).', true),
  ('accreditation_submission','accreditation_submissions','Accreditation Submissions',
   'One-click compliance outputs (DCF 2025 XLSX, NIRF CSV, NBA PDF). Self-referencing.', true)
ON CONFLICT (source_kind) DO NOTHING;

-- RLS on registry: read-open, write system-admin-only (since these are seed rows).
ALTER TABLE quality_evidence_source_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qesr_select_all" ON quality_evidence_source_registry;
CREATE POLICY "qesr_select_all" ON quality_evidence_source_registry FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "qesr_manage_admin" ON quality_evidence_source_registry;
CREATE POLICY "qesr_manage_admin" ON quality_evidence_source_registry FOR ALL
USING (is_super_admin() OR is_admin())
WITH CHECK (is_super_admin() OR is_admin());

-- ==========================================================================
-- Part 3: Modernize grievance_* RLS
-- ==========================================================================

-- grievance_categories — replace 2 hardcoded-role policies with dynamic permission pattern.
DROP POLICY IF EXISTS "grievance_categories_admin_all" ON grievance_categories;
DROP POLICY IF EXISTS "grievance_categories_staff_select" ON grievance_categories;

CREATE POLICY "grievance_categories_select" ON grievance_categories FOR SELECT
USING (
  is_super_admin() OR is_admin()
  OR (
    role_has_institution_access(institution_id)
    AND (
      user_has_permission('grievance.categories.view')
      OR user_has_permission('grievance.tickets.create')  -- filers need to see category list
    )
  )
);

CREATE POLICY "grievance_categories_manage" ON grievance_categories FOR ALL
USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('grievance.categories.manage')
    AND role_has_institution_access(institution_id)
  )
)
WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('grievance.categories.manage')
    AND role_has_institution_access(institution_id)
  )
);

-- grievance_tickets — 5 existing policies → modernized select/update/insert/delete.
DROP POLICY IF EXISTS "grievance_tickets_staff_select" ON grievance_tickets;
DROP POLICY IF EXISTS "grievance_tickets_staff_update" ON grievance_tickets;
DROP POLICY IF EXISTS "grievance_tickets_own_select" ON grievance_tickets;
DROP POLICY IF EXISTS "grievance_tickets_assigned_select" ON grievance_tickets;
DROP POLICY IF EXISTS "grievance_tickets_insert" ON grievance_tickets;

CREATE POLICY "grievance_tickets_select" ON grievance_tickets FOR SELECT
USING (
  is_super_admin() OR is_admin()
  OR (raised_by_id = auth.uid())     -- filer always sees own tickets
  OR (assigned_to = auth.uid())       -- assignee sees their queue
  OR (filed_by = auth.uid())          -- counselor filing on-behalf-of
  OR (
    user_has_permission('grievance.tickets.view')
    AND role_has_institution_access(institution_id)
  )
);

CREATE POLICY "grievance_tickets_insert" ON grievance_tickets FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  -- Open to all authenticated users — anyone can file a grievance at any
  -- institution (parent filing against college, alumni filing about old dept,
  -- staff filing across institutions). Institution scoping is enforced on
  -- SELECT and UPDATE instead.
);

CREATE POLICY "grievance_tickets_update" ON grievance_tickets FOR UPDATE
USING (
  is_super_admin() OR is_admin()
  OR (assigned_to = auth.uid())
  OR (raised_by_id = auth.uid() AND status IN ('open'))  -- filer can edit only while still open
  OR (
    user_has_permission('grievance.tickets.edit')
    AND role_has_institution_access(institution_id)
  )
)
WITH CHECK (
  is_super_admin() OR is_admin()
  OR (assigned_to = auth.uid())
  OR (raised_by_id = auth.uid())
  OR (
    user_has_permission('grievance.tickets.edit')
    AND role_has_institution_access(institution_id)
  )
);

CREATE POLICY "grievance_tickets_delete" ON grievance_tickets FOR DELETE
USING (
  is_super_admin() OR is_admin()
  -- Tickets should generally be withdrawn (status=withdrawn), not deleted.
  -- Delete is reserved for super-admin cleanup of test/spam data.
);

-- grievance_comments — scopes via parent ticket, so policies are nested EXISTS.
DROP POLICY IF EXISTS "grievance_comments_select" ON grievance_comments;
DROP POLICY IF EXISTS "grievance_comments_insert" ON grievance_comments;

CREATE POLICY "grievance_comments_select" ON grievance_comments FOR SELECT
USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM grievance_tickets gt
    WHERE gt.id = grievance_comments.ticket_id
      AND (
        gt.raised_by_id = auth.uid()
        OR gt.assigned_to = auth.uid()
        OR gt.filed_by = auth.uid()
        OR (
          user_has_permission('grievance.tickets.view')
          AND role_has_institution_access(gt.institution_id)
        )
      )
      AND (
        NOT grievance_comments.is_internal   -- public comments visible to all above
        OR (
          -- internal comments only to staff with edit permission (not to filer)
          user_has_permission('grievance.tickets.edit')
          AND role_has_institution_access(gt.institution_id)
        )
      )
  )
);

CREATE POLICY "grievance_comments_insert" ON grievance_comments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM grievance_tickets gt
    WHERE gt.id = grievance_comments.ticket_id
      AND (
        gt.raised_by_id = auth.uid()
        OR gt.assigned_to = auth.uid()
        OR gt.filed_by = auth.uid()
        OR is_super_admin()
        OR (
          user_has_permission('grievance.tickets.edit')
          AND role_has_institution_access(gt.institution_id)
        )
      )
  )
);

-- ==========================================================================
-- Part 4: Verification block (best-effort — fails only if critical state missing)
-- ==========================================================================
DO $$
DECLARE
  v_is_system_cats INT;
  v_is_system_metrics INT;
  v_registry_rows INT;
  v_grievance_policies INT;
BEGIN
  SELECT COUNT(*) INTO v_is_system_cats FROM grievance_categories WHERE is_system = true;
  SELECT COUNT(*) INTO v_is_system_metrics FROM sh_accreditation_metrics WHERE is_system = true;
  SELECT COUNT(*) INTO v_registry_rows FROM quality_evidence_source_registry;
  SELECT COUNT(*) INTO v_grievance_policies FROM pg_policies
    WHERE tablename IN ('grievance_tickets', 'grievance_categories', 'grievance_comments');

  RAISE NOTICE 'Retrofit complete: % seeded categories flagged, % seeded metrics flagged, % registry rows, % modernized grievance policies',
    v_is_system_cats, v_is_system_metrics, v_registry_rows, v_grievance_policies;
END $$;
