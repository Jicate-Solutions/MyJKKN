-- ============================================================================
-- Narrow WHO may change the exam eligibility thresholds.
-- Updated: 2026-07-27 — Director decision: keep any VALUE allowed, but stop every
-- holder of a generic admin role from being able to move a regulatory threshold.
--
-- WHY
-- platform_policies_update is USING (is_super_admin() OR is_admin()). is_admin()
-- resolves TRUE for role IN ('admin','super_admin','administrator') — a broad,
-- hardcoded-role bypass. That meant anyone holding any of those roles could set
-- academic.exam_eligibility.attendance_pct to any number, including 0 (every
-- learner instantly "eligible") or 100 (nobody eligible), with no permission key
-- and no audit distinction from editing a cosmetic setting.
--
-- WHAT CHANGES
-- ONLY the two academic.exam_eligibility.* keys are narrowed. Every other policy
-- row keeps exactly its current editors — this migration must not reduce anyone's
-- ability to edit any other configuration.
--
--   academic.exam_eligibility.*  ->  is_super_admin()
--                                    OR user_has_permission('academic.exam_eligibility.manage')
--   everything else              ->  is_super_admin() OR is_admin()   (unchanged)
--
-- WHY THE EXISTING POLICY IS REPLACED RATHER THAN JOINED BY A NEW ONE
-- Postgres RLS PERMISSIVE policies are OR-ed together. Adding a second, stricter
-- policy would only ever WIDEN access — it cannot take anything away. Narrowing
-- therefore requires editing the policy that currently grants the access.
-- (Contrast platform_policies_social_attr_update, which is an additive per-key
-- policy: it GRANTS a permission-holder access, so a separate policy is correct
-- there. Do not copy that shape for a restriction.)
--
-- WITH CHECK CARRIES THE SAME CASE
-- If only USING were narrowed, an editor could take a row they ARE allowed to edit
-- and rename its policy_key INTO the eligibility namespace, landing a value they
-- were not allowed to set. Both clauses must agree.
-- ============================================================================

DROP POLICY IF EXISTS platform_policies_update ON public.platform_policies;

CREATE POLICY platform_policies_update ON public.platform_policies
FOR UPDATE
USING (
  CASE
    WHEN policy_key LIKE 'academic.exam_eligibility.%'
      THEN is_super_admin()
           OR user_has_permission('academic.exam_eligibility.manage')
    ELSE is_super_admin() OR is_admin()
  END
)
WITH CHECK (
  CASE
    WHEN policy_key LIKE 'academic.exam_eligibility.%'
      THEN is_super_admin()
           OR user_has_permission('academic.exam_eligibility.manage')
    ELSE is_super_admin() OR is_admin()
  END
);

-- DELETE is left as-is deliberately: dropping an eligibility row falls back to the
-- code default (75/65), which is safe. Setting a WRONG value is the harmful action,
-- and that is what UPDATE now gates.

DO $$
DECLARE
  v_using text;
  v_check text;
BEGIN
  SELECT qual, with_check INTO v_using, v_check
  FROM pg_policies
  WHERE tablename = 'platform_policies' AND policyname = 'platform_policies_update';

  IF v_using IS NULL THEN
    RAISE EXCEPTION 'ABORT: platform_policies_update did not survive the replace';
  END IF;

  IF v_using NOT LIKE '%exam_eligibility%'
     OR v_check NOT LIKE '%exam_eligibility%' THEN
    RAISE EXCEPTION 'ABORT: eligibility branch missing (using=%, check=%)', v_using, v_check;
  END IF;

  -- The generic branch must still be present, or every other config row just lost
  -- its editors.
  IF v_using NOT LIKE '%is_admin()%' THEN
    RAISE EXCEPTION 'ABORT: generic is_admin() branch lost — other policy rows would become uneditable';
  END IF;

  RAISE NOTICE 'platform_policies_update narrowed for academic.exam_eligibility.* only';
END $$;
