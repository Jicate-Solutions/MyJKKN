-- ============================================================================
-- Migration: 20260613_hr_forms_substrate
-- Wave 3 — M9 Form Builder substrate
-- ============================================================================
-- Ships SUBSTRATE ONLY for the policy-driven form-builder.
-- Visual drag-drop builder, per-widget React components, and workflow engine
-- are deferred to follow-up PRs.
--
-- Tables shipped here:
--   1. hr_forms             — definitions (schema JSONB, approval_workflow JSONB,
--                              draft schema / workflow, classification, publish state)
--   2. hr_form_submissions  — user submissions + per-step approval history
--
-- Spec: specs/wave-3-policy-driven-hr-manual-2026-05-15.md §W3-M9
--       specs/hr-policy-jsonb-structures-2026-05-15.md §"Form-builder substrate"
--
-- 5 placeholder rows seeded so the admin index can render immediately:
--   excursion_approval, rd_claim, reimbursement, grading_benchmarks,
--   hr_workflow_diagram. All ship with empty widgets[] + empty workflow.steps[];
--   schemas land via follow-up PRs.
--
-- Director-lock R5-Q2 (memory: project_wave3_hr_policy_lock_2026_05_15):
--   Form-builder access = super_admin only. RLS reflects that for write paths;
--   reads are institution-scoped so staff can see forms relevant to their org.
--
-- TIER-0 safe-additive. Idempotent. Safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: hr_forms
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_forms (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_key                 TEXT UNIQUE NOT NULL,
  form_title               TEXT NOT NULL,
  description              TEXT,
  schema                   JSONB NOT NULL DEFAULT '{"widgets": []}'::jsonb,
  approval_workflow        JSONB NOT NULL DEFAULT '{"steps": []}'::jsonb,
  classification           TEXT NOT NULL DEFAULT 'major'
                              CHECK (classification IN ('operational','major')),
  is_published             BOOLEAN NOT NULL DEFAULT false,
  draft_schema             JSONB,
  draft_approval_workflow  JSONB,
  institution_id           UUID,
  created_by               UUID REFERENCES profiles(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_forms_published
  ON hr_forms (is_published, form_key);

CREATE INDEX IF NOT EXISTS idx_hr_forms_institution
  ON hr_forms (institution_id)
  WHERE institution_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Table: hr_form_submissions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_form_submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id             UUID NOT NULL REFERENCES hr_forms(id) ON DELETE RESTRICT,
  submitted_by        UUID NOT NULL REFERENCES profiles(id),
  institution_id      UUID,
  submission_data     JSONB NOT NULL,
  current_step        INT NOT NULL DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'submitted'
                         CHECK (status IN ('submitted','in_review','approved','rejected','withdrawn')),
  approval_history    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_form_submissions_form
  ON hr_form_submissions (form_id, status);

CREATE INDEX IF NOT EXISTS idx_hr_form_submissions_submitter
  ON hr_form_submissions (submitted_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_form_submissions_institution
  ON hr_form_submissions (institution_id, status)
  WHERE institution_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. updated_at touch triggers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_hr_forms_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_forms_touch ON hr_forms;
CREATE TRIGGER trg_hr_forms_touch
  BEFORE UPDATE ON hr_forms
  FOR EACH ROW EXECUTE FUNCTION fn_hr_forms_touch_updated_at();

DROP TRIGGER IF EXISTS trg_hr_form_submissions_touch ON hr_form_submissions;
CREATE TRIGGER trg_hr_form_submissions_touch
  BEFORE UPDATE ON hr_form_submissions
  FOR EACH ROW EXECUTE FUNCTION fn_hr_forms_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4. RLS — hr_forms
-- ----------------------------------------------------------------------------
-- Read:
--   - super_admin / admin: all rows
--   - Any authenticated user: published forms + forms in their institution
-- Write (insert/update/delete):
--   - super_admin / admin only (Director-lock R5-Q2)
-- ----------------------------------------------------------------------------
ALTER TABLE hr_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_forms_select ON hr_forms;
CREATE POLICY hr_forms_select ON hr_forms
  FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR is_published = true
    OR EXISTS (
      SELECT 1 FROM staff s
      WHERE s.profile_id = auth.uid()
        AND s.institution_id = hr_forms.institution_id
    )
  );

DROP POLICY IF EXISTS hr_forms_insert ON hr_forms;
CREATE POLICY hr_forms_insert ON hr_forms
  FOR INSERT WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hr_forms_update ON hr_forms;
CREATE POLICY hr_forms_update ON hr_forms
  FOR UPDATE USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hr_forms_delete ON hr_forms;
CREATE POLICY hr_forms_delete ON hr_forms
  FOR DELETE USING (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 5. RLS — hr_form_submissions
-- ----------------------------------------------------------------------------
-- Read:
--   - super_admin / admin: all
--   - Submitter: own rows
--   - Same-institution HR officer: institution-scoped rows
-- Write:
--   - Submitter: INSERT own rows (must match auth.uid())
--   - super_admin / admin / same-inst HR officer: UPDATE workflow status
--   - super_admin / admin: DELETE (rare; usually withdrawn)
-- ----------------------------------------------------------------------------
ALTER TABLE hr_form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_form_submissions_select ON hr_form_submissions;
CREATE POLICY hr_form_submissions_select ON hr_form_submissions
  FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM staff s
      WHERE s.profile_id = auth.uid()
        AND s.institution_id = hr_form_submissions.institution_id
    )
  );

DROP POLICY IF EXISTS hr_form_submissions_insert ON hr_form_submissions;
CREATE POLICY hr_form_submissions_insert ON hr_form_submissions
  FOR INSERT WITH CHECK (submitted_by = auth.uid());

DROP POLICY IF EXISTS hr_form_submissions_update ON hr_form_submissions;
CREATE POLICY hr_form_submissions_update ON hr_form_submissions
  FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM staff s
      WHERE s.profile_id = auth.uid()
        AND s.institution_id = hr_form_submissions.institution_id
    )
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM staff s
      WHERE s.profile_id = auth.uid()
        AND s.institution_id = hr_form_submissions.institution_id
    )
  );

DROP POLICY IF EXISTS hr_form_submissions_delete ON hr_form_submissions;
CREATE POLICY hr_form_submissions_delete ON hr_form_submissions
  FOR DELETE USING (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 6. Seed 5 placeholder form rows
-- ----------------------------------------------------------------------------
-- All seeds use empty widgets[] + empty workflow.steps[]. Schemas + workflows
-- ship in follow-up PRs (per agent W3-M9 substrate-only scope).
-- Idempotent via ON CONFLICT on form_key.
-- ----------------------------------------------------------------------------
INSERT INTO hr_forms
  (form_key, form_title, description, schema, approval_workflow,
   classification, is_published)
VALUES
  (
    'excursion_approval',
    'Excursion Approval Form',
    'Schema pending design — see W3-M9 follow-up PRs.',
    '{"widgets": []}'::jsonb,
    '{"steps": []}'::jsonb,
    'major',
    false
  ),
  (
    'rd_claim',
    'R&D Claim Form',
    'Schema pending design — see W3-M9 follow-up PRs.',
    '{"widgets": []}'::jsonb,
    '{"steps": []}'::jsonb,
    'major',
    false
  ),
  (
    'reimbursement',
    'Reimbursement Request',
    'Schema pending design — see W3-M9 follow-up PRs.',
    '{"widgets": []}'::jsonb,
    '{"steps": []}'::jsonb,
    'operational',
    false
  ),
  (
    'grading_benchmarks',
    'Grading Benchmarks',
    'Schema pending design — see W3-M9 follow-up PRs.',
    '{"widgets": []}'::jsonb,
    '{"steps": []}'::jsonb,
    'major',
    false
  ),
  (
    'hr_workflow_diagram',
    'HR Workflow Renderer',
    'Schema pending design — see W3-M9 follow-up PRs.',
    '{"widgets": []}'::jsonb,
    '{"steps": []}'::jsonb,
    'major',
    false
  )
ON CONFLICT (form_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. Inline smoke test
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_forms_count INT;
  v_submissions_queryable BOOLEAN;
  v_expected_keys TEXT[] := ARRAY[
    'excursion_approval','rd_claim','reimbursement',
    'grading_benchmarks','hr_workflow_diagram'
  ];
  v_missing_keys TEXT[];
BEGIN
  -- Verify both tables exist and are queryable
  SELECT COUNT(*) INTO v_forms_count FROM hr_forms;
  SELECT EXISTS (SELECT 1 FROM hr_form_submissions LIMIT 1) IS NOT NULL
    INTO v_submissions_queryable;

  IF NOT v_submissions_queryable THEN
    RAISE EXCEPTION 'hr_form_submissions not queryable';
  END IF;

  -- Verify all 5 seeded keys present
  SELECT ARRAY(
    SELECT unnest(v_expected_keys)
    EXCEPT
    SELECT form_key FROM hr_forms WHERE form_key = ANY(v_expected_keys)
  ) INTO v_missing_keys;

  IF array_length(v_missing_keys, 1) > 0 THEN
    RAISE EXCEPTION 'Missing seeded form keys: %', v_missing_keys;
  END IF;

  RAISE NOTICE 'hr_forms substrate OK — % total rows; all 5 placeholder keys present', v_forms_count;
END
$$;
