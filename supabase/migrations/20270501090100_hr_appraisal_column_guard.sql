-- ===========================================================================
-- HR appraisals — pin WHICH COLUMNS each tier may write.
--
-- Updated: 2026-09-29
-- Updated: 2026-09-29 (round-4 review) - the Collegiality setting is read for
--   the appraised person's college, not group-wide only.
--
-- WHY THIS IS SEPARATE FROM 20270501090000
-- Row-level security is exactly that: row level. The policies in the previous
-- migration decide WHICH ROW you may update and in WHAT STATE. They cannot
-- say which COLUMNS you may change. So a staff member whose own appraisal was
-- still a draft could, through a direct PostgREST call with the anon key that
-- ships in every page bundle, write any column on that row.
--
-- THE WORST CASE IS NOT final_score
-- final_score is recomputed at sign-off, so writing it achieves little. The
-- real hole is sedc_review_jsonb. Final approval derives the score from
-- exactly that column:
--
--     const ratings = parseRatings(current.sedc_review_jsonb, areas);
--     const derived = deriveAppraisalScore(ratings, areas, ...);
--
-- so a staff member could author the committee's verdict on their own
-- appraisal, and the Director's sign-off would faithfully convert it into
-- their promotion score. cycle_id was equally open: a row could be moved into
-- another round entirely.
--
-- WHAT THIS ADDS
--   A BEFORE INSERT OR UPDATE trigger that allows each actor only the columns
--   their step owns, and enforces the Collegiality-Below example underneath
--   the screens rather than only on them.
--
-- Pattern follows the aiu_prompt_trails immutable-columns trigger
-- (20260922041500): raise check_violation with a message that names the
-- columns, so the refusal is legible to whoever hits it.
--
-- No BEGIN/COMMIT on purpose, so a reviewer's BEGIN .. ROLLBACK rehearsal
-- against production actually rolls back.
-- ===========================================================================

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
BEGIN
  v_admin := COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false);

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

COMMENT ON FUNCTION public.fn_hr_performance_review_guard() IS
  'Pins which COLUMNS each tier of an appraisal may write, which row-level '
  'security cannot express, and enforces the Collegiality-Below example '
  'underneath the screens. Without it a staff member could write the '
  'committee verdict on their own draft, and final approval derives the '
  'promotion score from exactly that column.';
