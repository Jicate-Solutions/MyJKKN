-- ============================================================================
-- Migration: 20270525090000_hr_appraisal_director_rating
-- The Director's ruling of 30 Sep 2026: "Appraisal sign-off: the Director CAN
-- change a rating; recorded next to the committee's."
-- ============================================================================
-- !!! MUST NOT MERGE OR APPLY BEFORE #4081, #4109 AND #4121 !!!
--   Stacked on #4109 (feat/hr-appraisal-harness). #4121's fn_is_the_director()
--   is on main and applied; section 0 checks it is really there.
--
--  * hr_performance_reviews.director_review_jsonb: the Director's own ratings
--    for the areas he changed, with a reason, who and when:
--      {"ratings": {"<area>": "exceeds|meets|below", ...},
--       "reason": "...", "set_by": "<profile id>", "set_at": "<timestamp>"}
--    The committee's sedc_review_jsonb is NEVER overwritten: both stay, side
--    by side, on the sign-off screen and in every export.
--  * The promotion score (final_score) is derived from the committee's ratings
--    with the Director's changes laid over them (lib, at sign-off).
--  * Only the NAMED Director list may write the column (fn_is_the_director()),
--    never an admin or another super admin, and only with a reason of at
--    least 10 characters. Enforced in the BEFORE trigger, before the admin
--    shortcut, because RLS grants whole rows and cannot pin a column.
--
-- The guard function below is 20270505090000's body with that one rule added
-- and the new column in every tier's forbidden list. Safe to apply twice.
-- No inner BEGIN/COMMIT. Nothing here changes anybody's pay.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. The Director list first. Stop here, changing nothing, if it is missing.
-- ----------------------------------------------------------------------------
DO $check$
BEGIN
  IF to_regprocedure('public.fn_is_the_director()') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.fn_is_the_director() is missing. Apply #4121 (20270520090000_the_director_list) before this migration.';
  END IF;
  IF to_regprocedure('public.fn_hr_appraisal_unanswered_conditions(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'ABORT: 20270505090000 (the appraisal harness) is missing. Apply #4109 before this migration.';
  END IF;
END
$check$;

-- ----------------------------------------------------------------------------
-- 1. The column
-- ----------------------------------------------------------------------------
ALTER TABLE public.hr_performance_reviews
  ADD COLUMN IF NOT EXISTS director_review_jsonb jsonb;

COMMENT ON COLUMN public.hr_performance_reviews.director_review_jsonb IS
  '30 Sep 2026: the Director''s own ratings for the areas he changed at sign-off, with a reason, who and when. The committee''s sedc_review_jsonb is never overwritten. Written by the named Director list only (fn_is_the_director()). Migration 20270525090000.';

-- ----------------------------------------------------------------------------
-- 2. The guard, with the Director-only rule
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_performance_review_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin        boolean;
  v_self         boolean;
  v_hod          boolean;
  v_policy       jsonb;
  v_need_example boolean;
  v_need_conditions boolean;   -- conditions first (20270505090000)
BEGIN
  v_admin := COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false);

  -- ── 30 Sep 2026: the Director's own rating (director_review_jsonb) ──────
  -- Written by the NAMED Director list only (fn_is_the_director(), #4121),
  -- never by an admin or another super admin, and only with a reason. Checked
  -- before the admin shortcut below, so the shortcut cannot bypass it.
  IF (TG_OP = 'INSERT' AND NEW.director_review_jsonb IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.director_review_jsonb IS DISTINCT FROM OLD.director_review_jsonb) THEN
    IF NOT COALESCE(public.fn_is_the_director(), false) THEN
      RAISE EXCEPTION 'hr_performance_reviews: only the Director can change a rating at sign-off (director_review_jsonb)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.director_review_jsonb IS NOT NULL
       AND (jsonb_typeof(NEW.director_review_jsonb -> 'ratings') IS DISTINCT FROM 'object'
            OR length(trim(COALESCE(NEW.director_review_jsonb ->> 'reason', ''))) < 10) THEN
      RAISE EXCEPTION 'hr_performance_reviews: a changed rating needs the ratings and a reason of at least 10 characters'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_self := EXISTS (
    SELECT 1 FROM public.staff
    WHERE id = NEW.staff_id AND profile_id = auth.uid()
  );

  v_hod := EXISTS (
    SELECT 1
    FROM public.staff s
    JOIN public.departments d ON d.id = s.department_id
    WHERE s.id = NEW.staff_id AND d.head_of_department_id = auth.uid()
  );

  -- ── Collegiality safeguard, enforced here and not only on screen ────────
  -- Absent key means ON, matching lib/hr/appraisal-ratings.ts. If the policy
  -- cannot be read at all we keep the safeguard on: a rule about fairness
  -- should not switch itself off because a lookup failed.
  --
  -- Read for the college of the person being appraised, never the writer's
  -- and never group-wide only. A college may switch the safeguard off (the
  -- Director's 29 Sep ruling); a college with no row of its own falls back
  -- to the group value inside fn_get_policy. Before this, no college was
  -- passed at all, so the group value always won.
  BEGIN
    v_policy := fn_get_policy_json(
      'hr.performance_review',
      NULL,
      (SELECT s.institution_id FROM public.staff s WHERE s.id = NEW.staff_id)
    );
  EXCEPTION WHEN OTHERS THEN
    v_policy := NULL;
  END;
  v_need_example :=
    COALESCE((v_policy ->> 'collegiality_below_requires_example')::boolean, true);

  IF v_need_example THEN
    -- Each tier is checked only as it HANDS ON. A draft may be incomplete.
    IF NEW.status = 'self_submitted'
       AND NEW.self_appraisal_jsonb #>> '{ratings,collegiality}' = 'below'
       AND length(trim(COALESCE(NEW.self_appraisal_jsonb ->> 'collegiality_example', ''))) < 20 THEN
      RAISE EXCEPTION 'hr_performance_reviews: a Below in Collegiality needs a written example of at least 20 characters'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'supervisor_reviewed'
       AND NEW.supervisor_review_jsonb #>> '{ratings,collegiality}' = 'below'
       AND length(trim(COALESCE(NEW.supervisor_review_jsonb ->> 'collegiality_example', ''))) < 20 THEN
      RAISE EXCEPTION 'hr_performance_reviews: a Below in Collegiality needs a written example of at least 20 characters'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'sedc_reviewed'
       AND NEW.sedc_review_jsonb #>> '{ratings,collegiality}' = 'below'
       AND length(trim(COALESCE(NEW.sedc_review_jsonb ->> 'collegiality_example', ''))) < 20 THEN
      RAISE EXCEPTION 'hr_performance_reviews: a Below in Collegiality needs a written example of at least 20 characters'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── Conditions first on a Below (20270505090000) ────────────────────────
  -- A head who rates Below in any area must first say what the college did
  -- not provide. Absent key means ON, same direction as the safeguard above;
  -- an unreadable policy also keeps it on.
  --
  -- Checked as the head HANDS ON, i.e. when the row arrives at
  -- supervisor_reviewed with a new or changed head's payload. A send-back
  -- from the Director (sedc_reviewed -> supervisor_reviewed) does not touch
  -- the head's payload and is not re-judged here, so a college that switches
  -- this on mid-round cannot strand an appraisal already past the head.
  --
  -- Only a JSON false switches it off — the same test the app uses
  -- (conditions_first_on_below !== false) — so a hand-typed "false" string or
  -- any other junk keeps it on instead of raising a cast error.
  v_need_conditions :=
    (v_policy -> 'conditions_first_on_below') IS DISTINCT FROM 'false'::jsonb;

  IF v_need_conditions
     AND NEW.status = 'supervisor_reviewed'
     AND (
       TG_OP = 'INSERT'
       OR OLD.status NOT IN ('supervisor_reviewed', 'sedc_reviewed')
       OR NEW.supervisor_review_jsonb IS DISTINCT FROM OLD.supervisor_review_jsonb
     )
     AND cardinality(fn_hr_appraisal_unanswered_conditions(NEW.supervisor_review_jsonb)) > 0 THEN
    RAISE EXCEPTION 'hr_performance_reviews: before rating Below, say what the college did not provide (a reason and a note of at least 10 characters) for: %',
      array_to_string(fn_hr_appraisal_unanswered_conditions(NEW.supervisor_review_jsonb), ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Admins and super admins own the committee and Director steps, so they are
  -- not column-restricted. They are still bound by the safeguard above.
  IF v_admin THEN
    RETURN NEW;
  END IF;

  -- ── INSERT: only your own row, carrying only your own tier ──────────────
  IF TG_OP = 'INSERT' THEN
    IF NOT v_self THEN
      RAISE EXCEPTION 'hr_performance_reviews: you may only create your own appraisal'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.supervisor_review_jsonb IS NOT NULL
       OR NEW.sedc_review_jsonb IS NOT NULL
       OR NEW.director_review_jsonb IS NOT NULL
       OR NEW.final_score IS NOT NULL
       OR NEW.final_remarks IS NOT NULL
       OR NEW.final_approved_at IS NOT NULL
       OR NEW.final_approved_by IS NOT NULL
       OR NEW.supervisor_reviewed_at IS NOT NULL
       OR NEW.sedc_reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'hr_performance_reviews: a new appraisal may carry only your own self-appraisal (forbidden: supervisor_review_jsonb, sedc_review_jsonb, final_score, final_remarks, final_approved_at, final_approved_by, supervisor_reviewed_at, sedc_reviewed_at)'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- ── UPDATE ──────────────────────────────────────────────────────────────
  -- Nobody outside admin moves a row between rounds or between people.
  IF NEW.cycle_id IS DISTINCT FROM OLD.cycle_id
     OR NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
    RAISE EXCEPTION 'hr_performance_reviews: cycle_id and staff_id cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Being the subject wins over being the reviewer. A head of department who
  -- is also the person under appraisal is treated as the subject, so nobody
  -- can write their own supervisor review. (Consequence: a head's own
  -- appraisal has to be reviewed by an admin. That gap predates this change
  -- and is called out in the PR rather than papered over here.)
  IF v_self THEN
    IF NEW.supervisor_review_jsonb IS DISTINCT FROM OLD.supervisor_review_jsonb
       OR NEW.sedc_review_jsonb IS DISTINCT FROM OLD.sedc_review_jsonb
       OR NEW.director_review_jsonb IS DISTINCT FROM OLD.director_review_jsonb
       OR NEW.final_score IS DISTINCT FROM OLD.final_score
       OR NEW.final_remarks IS DISTINCT FROM OLD.final_remarks
       OR NEW.final_approved_at IS DISTINCT FROM OLD.final_approved_at
       OR NEW.final_approved_by IS DISTINCT FROM OLD.final_approved_by
       OR NEW.supervisor_reviewed_at IS DISTINCT FROM OLD.supervisor_reviewed_at
       OR NEW.sedc_reviewed_at IS DISTINCT FROM OLD.sedc_reviewed_at THEN
      RAISE EXCEPTION 'hr_performance_reviews: you may change only your own self-appraisal and submit it (forbidden: supervisor_review_jsonb, sedc_review_jsonb, final_score, final_remarks, final_approved_at, final_approved_by, supervisor_reviewed_at, sedc_reviewed_at)'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF v_hod THEN
    IF NEW.self_appraisal_jsonb IS DISTINCT FROM OLD.self_appraisal_jsonb
       OR NEW.sedc_review_jsonb IS DISTINCT FROM OLD.sedc_review_jsonb
       OR NEW.director_review_jsonb IS DISTINCT FROM OLD.director_review_jsonb
       OR NEW.final_score IS DISTINCT FROM OLD.final_score
       OR NEW.final_remarks IS DISTINCT FROM OLD.final_remarks
       OR NEW.final_approved_at IS DISTINCT FROM OLD.final_approved_at
       OR NEW.final_approved_by IS DISTINCT FROM OLD.final_approved_by
       OR NEW.self_submitted_at IS DISTINCT FROM OLD.self_submitted_at
       OR NEW.sedc_reviewed_at IS DISTINCT FROM OLD.sedc_reviewed_at THEN
      RAISE EXCEPTION 'hr_performance_reviews: as head of department you may change only your own review and pass it on (forbidden: self_appraisal_jsonb, sedc_review_jsonb, final_score, final_remarks, final_approved_at, final_approved_by, self_submitted_at, sedc_reviewed_at)'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Neither the subject, nor their head, nor an admin. RLS should already have
  -- refused; fail closed rather than assume it did.
  RAISE EXCEPTION 'hr_performance_reviews: you are not a party to this appraisal'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_performance_review_guard() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_hr_performance_review_guard ON public.hr_performance_reviews;
CREATE TRIGGER trg_hr_performance_review_guard
  BEFORE INSERT OR UPDATE ON public.hr_performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_performance_review_guard();

NOTIFY pgrst, 'reload schema';
