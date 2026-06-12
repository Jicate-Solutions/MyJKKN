-- =============================================================================
-- 20260611230000_pde_bos_clo_connector.sql
-- PDE <-> BoS Outcome Connector — PR 1
-- Spec: specs/pde-bos-outcome-connector-2026-06-11.md (locked 2026-06-11)
-- =============================================================================
-- Additive only. Links every pde_demonstrations row to the curriculum outcome
-- it evidences:
--
--   bos_syllabus_id    BoS lane (autonomous colleges). Version-pinned: the demo
--                      keeps the syllabus version current at submission; BoS
--                      revisions do NOT re-link old evidence (spec §4.5).
--   vac_course_id      VAC lane (all 8 colleges), course-level only —
--                      vac_courses has no CLO structure (spec edge disposition).
--                      SPEC DEVIATION, flagged in PR body: spec §4.1 assumed a
--                      T4.2 FK already covered the VAC lane, but prod FKs are
--                      course_id→courses + lesson_id→vac_lessons; a course-level
--                      VAC link requires this new FK. lesson_id stays untouched
--                      as the finer-grained T4.2 reference.
--   clo_refs           learner-PROPOSED CLO numbers, e.g. [1,3]. Capped by
--                      platform_policies 'pde.obe.clo_tag_cap' (spec §4.10).
--   clo_refs_confirmed validator-CONFIRMED subset (spec §4.8). Attainment math
--                      reads THIS column only (accreditor-defensible).
--
-- BoS + VAC tables are strictly READ-ONLY to PDE (T4.3 discipline) — these are
-- reference FKs, never write paths.
-- =============================================================================

ALTER TABLE pde_demonstrations
  ADD COLUMN IF NOT EXISTS bos_syllabus_id uuid REFERENCES bos_course_syllabi(id) ON DELETE SET NULL;

ALTER TABLE pde_demonstrations
  ADD COLUMN IF NOT EXISTS vac_course_id uuid REFERENCES vac_courses(id) ON DELETE SET NULL;

ALTER TABLE pde_demonstrations
  ADD COLUMN IF NOT EXISTS clo_refs jsonb;

ALTER TABLE pde_demonstrations
  ADD COLUMN IF NOT EXISTS clo_refs_confirmed jsonb;

CREATE INDEX IF NOT EXISTS idx_pde_demonstrations_bos_syllabus
  ON pde_demonstrations(bos_syllabus_id) WHERE bos_syllabus_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pde_demonstrations_vac_course
  ON pde_demonstrations(vac_course_id) WHERE vac_course_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Policy seeds (config-table pattern — every tunable is a platform_policies row;
-- defensive NOT-EXISTS so re-running is a no-op).
-- -----------------------------------------------------------------------------

INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active, classification, publication_state)
SELECT
  'pde.obe.po_weight_map', 'global', NULL,
  '{"H": 1.0, "M": 0.5, "L": 0.25}'::jsonb,
  'PO/PSO attainment weight per CO->PO correlation grade (H/M/L). Read by pde-curriculum-service.computePOAttainment. Tune without deploy.',
  'object', true, true, 'major', 'published'
WHERE NOT EXISTS (SELECT 1 FROM platform_policies WHERE policy_key = 'pde.obe.po_weight_map');

INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active, classification, publication_state)
SELECT
  'pde.obe.clo_tag_cap', 'global', NULL,
  '2'::jsonb,
  'Max CLOs a learner may propose per demonstration (anti blanket-tag gaming; validator confirmation is the trust anchor). Director-locked at 2 on 2026-06-11. Raise without deploy.',
  'number', true, true, 'major', 'published'
WHERE NOT EXISTS (SELECT 1 FROM platform_policies WHERE policy_key = 'pde.obe.clo_tag_cap');

-- PostgREST schema-cache refresh so the new columns + FKs are visible to REST
-- embeds immediately (feedback_exec_sql_ddl_needs_pgrst_schema_reload).
NOTIFY pgrst, 'reload schema';
