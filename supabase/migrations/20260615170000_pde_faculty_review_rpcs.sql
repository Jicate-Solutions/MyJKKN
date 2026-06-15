-- =============================================================================
-- 20260615170000_pde_faculty_review_rpcs.sql
-- PDE Faculty Review — review-queue read + validation write RPCs.
-- Decision doc: docs/modules/pde/2026-06-14-DECISION-pde-category-taxonomy-split.md
--   (Option A — collapse to the 7 durable-value categories; the faculty review
--    surface now speaks durable-value, not the legacy capability vocabulary.)
-- =============================================================================
-- WHY (live-verified, 2026-06-15):
--   * The faculty "demonstrations" page shipped as a mock shell (empty array,
--     placeholder `capability_category` field, 3 hardcoded chips that exist in
--     no real taxonomy). There was no backend to list submissions for review
--     or to record a validation.
--   * `pde_demonstrations` RLS lets faculty/hod/coordinator/dean/institution_
--     admin/administrator READ same-institution rows (policy
--     `pde_demonstrations_faculty_same_inst`, FOR SELECT) — but there is NO
--     faculty UPDATE path, so validation writes cannot go through plain RLS.
--   * Learner names live on `profiles`, whose own RLS would block a faculty
--     member from reading another learner's row, and the FK shape makes a
--     PostgREST embed fragile.
--
-- FIX: two SECURITY DEFINER RPCs.
--   1. fn_pde_review_queue   — enriched read (joins the learner name), scoped
--      to the caller's institution inside the function. Mirrors the SELECT RLS
--      role set; never widens it. Hides draft/withdrawn from reviewers.
--   2. fn_pde_validate_demonstration — the only write path for faculty. Re-
--      checks the caller is a same-institution reviewer, enforces the status
--      machine (only submitted/under_review may be validated), appends the
--      validator id + note, and sets status to 'validated' (with raw_score) or
--      'rejected'. Weighted scoring stays downstream (the scoring engine writes
--      weighted_score/passed, per the table's own column comment) — faculty
--      only assign the raw_score here.
--
-- Both functions REVOKE EXECUTE FROM anon (CLAUDE.md mandatory rule — Supabase
-- default-grants anon EXECUTE on every new public function).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Review queue (read) — enriched, institution-scoped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_pde_review_queue(
  p_category text DEFAULT NULL,
  p_status   text DEFAULT NULL
)
RETURNS TABLE (
  id                uuid,
  learner_id        uuid,
  learner_name      text,
  institution_id    uuid,
  category_key      text,
  skill_name        text,
  evidence          jsonb,
  evidence_type     text,
  status            text,
  submitted_at      timestamptz,
  raw_score         numeric,
  weighted_score    numeric,
  passed            boolean,
  scored_at         timestamptz,
  rubric_policy_key text,
  validator_ids     jsonb,
  created_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id,
    d.learner_id,
    COALESCE(NULLIF(pr.full_name, ''), pr.email, 'Learner') AS learner_name,
    d.institution_id,
    d.category_key,
    d.skill_name,
    d.evidence,
    d.evidence_type,
    d.status,
    d.submitted_at,
    d.raw_score,
    d.weighted_score,
    d.passed,
    d.scored_at,
    d.rubric_policy_key,
    d.validator_ids,
    d.created_at
  FROM public.pde_demonstrations d
  LEFT JOIN public.profiles pr ON pr.id = d.learner_id
  WHERE
    -- caller must be a reviewer, scoped to the demonstration's institution
    EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid()
        AND (
          me.is_super_admin = true
          OR me.role = ANY (ARRAY[
            'super_admin','administrator','institution_admin',
            'dean','hod','coordinator','faculty'
          ])
        )
        AND (
          me.is_super_admin = true
          OR me.role = ANY (ARRAY['super_admin','administrator'])
          OR me.institution_id = d.institution_id
          OR d.institution_id IS NULL
        )
    )
    -- reviewers never see drafts or withdrawn submissions
    AND d.status NOT IN ('draft','withdrawn')
    AND (p_category IS NULL OR d.category_key = p_category)
    AND (p_status   IS NULL OR d.status       = p_status)
  ORDER BY
    (d.status = 'submitted') DESC,        -- un-actioned submissions first
    d.submitted_at DESC NULLS LAST,
    d.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_review_queue(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_review_queue(text, text) TO authenticated;

COMMENT ON FUNCTION public.fn_pde_review_queue(text, text) IS
  'Faculty review queue: institution-scoped, learner-name-enriched read of pde_demonstrations (durable-value taxonomy). SECURITY DEFINER; mirrors the SELECT RLS reviewer roles; hides draft/withdrawn. Locked from anon.';

-- ---------------------------------------------------------------------------
-- 2) Validate (write) — the only faculty write path into pde_demonstrations.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_pde_validate_demonstration(
  p_demonstration_id uuid,
  p_decision         text,                  -- 'validated' | 'rejected'
  p_raw_score        numeric DEFAULT NULL,  -- required when decision = 'validated'
  p_notes            text    DEFAULT NULL
)
RETURNS public.pde_demonstrations
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_demo    public.pde_demonstrations;
  v_allowed boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_pde_validate_demonstration: not authenticated';
  END IF;

  IF p_decision NOT IN ('validated', 'rejected') THEN
    RAISE EXCEPTION 'fn_pde_validate_demonstration: invalid decision "%" (expected validated|rejected)', p_decision;
  END IF;

  SELECT * INTO v_demo FROM public.pde_demonstrations WHERE id = p_demonstration_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_pde_validate_demonstration: demonstration % not found', p_demonstration_id;
  END IF;

  -- Authorize: same-institution reviewer (or cross-institution admin/super).
  SELECT (
    me.is_super_admin = true
    OR (
      me.role = ANY (ARRAY[
        'super_admin','administrator','institution_admin',
        'dean','hod','coordinator','faculty'
      ])
      AND (
        me.role = ANY (ARRAY['super_admin','administrator'])
        OR me.institution_id = v_demo.institution_id
        OR v_demo.institution_id IS NULL
      )
    )
  )
  INTO v_allowed
  FROM public.profiles me
  WHERE me.id = v_uid;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_pde_validate_demonstration: not authorized to validate this demonstration';
  END IF;

  -- Status machine: only an open submission can be validated/rejected.
  IF v_demo.status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'fn_pde_validate_demonstration: demonstration is "%", only submitted/under_review can be reviewed', v_demo.status;
  END IF;

  IF p_decision = 'validated' AND p_raw_score IS NULL THEN
    RAISE EXCEPTION 'fn_pde_validate_demonstration: raw_score is required when decision = validated';
  END IF;

  UPDATE public.pde_demonstrations SET
    status    = p_decision,  -- both 'validated' and 'rejected' are valid status values
    raw_score = CASE WHEN p_decision = 'validated' THEN p_raw_score ELSE raw_score END,
    validator_ids = CASE
      WHEN COALESCE(validator_ids, '[]'::jsonb) @> to_jsonb(ARRAY[v_uid::text])
        THEN validator_ids
      ELSE COALESCE(validator_ids, '[]'::jsonb) || to_jsonb(v_uid::text)
    END,
    validator_notes = COALESCE(validator_notes, '{}'::jsonb)
      || jsonb_build_object(v_uid::text, COALESCE(p_notes, '')),
    updated_at = now()
  WHERE id = p_demonstration_id
  RETURNING * INTO v_demo;

  RETURN v_demo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_validate_demonstration(uuid, text, numeric, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_validate_demonstration(uuid, text, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.fn_pde_validate_demonstration(uuid, text, numeric, text) IS
  'Faculty validation write path for pde_demonstrations (faculty RLS is SELECT-only). Re-checks same-institution reviewer, enforces submitted/under_review -> validated|rejected, appends validator id + note, sets raw_score on validate. Weighted scoring stays downstream. Locked from anon.';

-- PostgREST schema cache must see the new functions immediately.
NOTIFY pgrst, 'reload schema';
