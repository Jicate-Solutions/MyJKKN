-- ===========================================================================
-- HR appraisals — checks on the appraisal ITSELF, before it is trusted to
-- judge people.
--
-- Updated: 2026-09-29 (Director approved all four parts the same day)
--
-- WHY
-- An appraisal only earns its cost if we can tell whether it measures
-- anything. Before this, there was no way to know: one head of department
-- rated each person, nobody checked whether a second head reading the same
-- evidence would agree, and a Below said nothing about what the college had
-- failed to provide.
--
-- WHAT THIS ADDS (stacked on 20270501090000 + 20270501090100, PR #4081)
--
--   1. A blind second rating. HR asks a second head to rate a submitted
--      appraisal from the same evidence the first head sees (the person's own
--      self-appraisal). New table hr_performance_review_second_ratings. The
--      second rater never sees the first head's ratings until both are in,
--      and the first head never sees the second rating at all. The second
--      rating NEVER changes the appraisal's outcome: nothing reads it except
--      the agreement report on the cycle page.
--      The second rater must be a team member of the SAME college as the
--      person appraised — refused by the guard trigger and again by the
--      evidence function. No exception for group-wide admins. And nobody who
--      can read appraisals (HR with the key, admins, super admins) may be the
--      second rater: they could see the head's rating (round-2 decision).
--
--   2. Conditions first on a Below. A head (or second rater) who rates Below
--      in any area must first say what the college did not provide — time,
--      training, equipment or materials, clarity of role, workload, other —
--      plus a short note. Policy key hr.performance_review
--      .conditions_first_on_below, absent = ON. Enforced by the service AND
--      here, by extending 4081's guard function.
--
--   (Parts 3 and 4 — checkable statements under each band, and the
--   saturation warning — need no schema: the statements live in the policy
--   JSON and the ticks inside the same JSONB the rating already lives in.
--   The 090100 guard does not restrict keys inside those JSONB columns, so
--   nothing here needs to change for them.)
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   No AI call of any kind. No grading or scoring of a person. Nothing ties a
--   rating to cost or pay. The second rating is not an input to final_score,
--   the promotion rule or the increment block.
--
-- SAFE TO APPLY
--   One new table (empty), two new trigger functions, one read function, one
--   pure helper, and a CREATE OR REPLACE of fn_hr_performance_review_guard
--   whose every existing rule is kept byte-for-byte; the only addition is the
--   conditions-first check. No existing row is rewritten.
--
-- No BEGIN/COMMIT on purpose, so a reviewer's BEGIN .. ROLLBACK rehearsal
-- actually rolls back.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0) Pure helper: which Below areas in a rating payload still owe an answer
--    to "what did the college not provide?"
--
--    The allowed reasons and the 10-character note minimum match
--    lib/hr/appraisal-harness.ts (CONDITION_REASONS, CONDITIONS_NOTE_MIN).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_appraisal_unanswered_conditions(p_payload jsonb)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_area    text;
  v_missing jsonb;
  v_ok      boolean;
  v_out     text[] := ARRAY[]::text[];
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN v_out;
  END IF;

  FOREACH v_area IN ARRAY ARRAY['teaching', 'research', 'service', 'collegiality'] LOOP
    IF (p_payload #>> ARRAY['ratings', v_area]) IS DISTINCT FROM 'below' THEN
      CONTINUE;
    END IF;

    v_missing := p_payload #> ARRAY['conditions', v_area, 'missing'];
    v_ok := v_missing IS NOT NULL
            AND jsonb_typeof(v_missing) = 'array'
            AND jsonb_array_length(v_missing) > 0;

    -- Checked in separate steps: jsonb_array_elements on a non-array raises,
    -- and SQL does not promise to short-circuit an AND.
    IF v_ok THEN
      v_ok := NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_missing) AS r(val)
        WHERE jsonb_typeof(r.val) <> 'string'
           OR (r.val #>> '{}') NOT IN
              ('time', 'training', 'equipment', 'role_clarity', 'workload', 'other')
      );
    END IF;

    IF v_ok THEN
      v_ok := length(trim(COALESCE(p_payload #>> ARRAY['conditions', v_area, 'note'], ''))) >= 10;
    END IF;

    IF NOT v_ok THEN
      v_out := v_out || v_area;
    END IF;
  END LOOP;

  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_appraisal_unanswered_conditions(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_appraisal_unanswered_conditions(jsonb) TO authenticated;

COMMENT ON FUNCTION public.fn_hr_appraisal_unanswered_conditions(jsonb) IS
  'Areas rated Below in an appraisal payload whose "what did the college not '
  'provide" answer is missing: at least one known reason and a note of 10+ '
  'characters. Pure; used by both appraisal guard triggers.';

-- ---------------------------------------------------------------------------
-- 1) 4081's guard, extended with conditions-first. Every existing rule below
--    is unchanged; the only new lines are marked "conditions first".
-- ---------------------------------------------------------------------------
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

-- The trigger itself is unchanged from 090100; re-created so this file is
-- complete on its own and re-applying it cannot leave two copies.
DROP TRIGGER IF EXISTS trg_hr_performance_review_guard ON public.hr_performance_reviews;
CREATE TRIGGER trg_hr_performance_review_guard
  BEFORE INSERT OR UPDATE ON public.hr_performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_performance_review_guard();

-- ---------------------------------------------------------------------------
-- 2) The blind second rating
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_performance_review_second_ratings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id      uuid NOT NULL REFERENCES public.hr_performance_reviews(id) ON DELETE CASCADE,
  -- Any profile HR picks, typically another head of department.
  rater_id       uuid NOT NULL REFERENCES public.profiles(id),
  -- Same shape as supervisor_review_jsonb: { ratings, statements, conditions,
  -- collegiality_example, notes }. NULL until the rater starts.
  rating_jsonb   jsonb,
  submitted_at   timestamptz,
  -- Copied from the person's own staff row by the trigger, for HR scoping.
  institution_id uuid REFERENCES public.institutions(id),
  assigned_by    uuid REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- One second rater per appraisal: the report compares pairs.
  CONSTRAINT hr_perf_second_rating_one_per_review UNIQUE (review_id)
);

COMMENT ON TABLE public.hr_performance_review_second_ratings IS
  'A blind second rating of a submitted appraisal, used ONLY for the agreement '
  'report that tells HR whether two heads reading the same evidence land on the '
  'same band. Never read by final approval, the promotion rule or the increment '
  'block. The rater sees the self-appraisal but not the first head''s ratings '
  'until both are in; the first head never sees this row.';

CREATE INDEX IF NOT EXISTS idx_hr_perf_second_ratings_rater
  ON public.hr_performance_review_second_ratings(rater_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_hr_perf_second_ratings_institution
  ON public.hr_performance_review_second_ratings(institution_id);

DROP TRIGGER IF EXISTS hr_perf_second_ratings_updated_at
  ON public.hr_performance_review_second_ratings;
CREATE TRIGGER hr_perf_second_ratings_updated_at
  BEFORE UPDATE ON public.hr_performance_review_second_ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row-level security ─────────────────────────────────────────────────────
ALTER TABLE public.hr_performance_review_second_ratings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hr_performance_review_second_ratings FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hr_performance_review_second_ratings TO authenticated;

-- Read: HR and the rater their own row. Nobody else — not the person
-- appraised, not the first head.
--
-- "HR" here is a super admin, or an admin or holder of the appraisal-manage
-- permission WITHIN THEIR COLLEGE SCOPE (role_has_institution_access). Plain
-- is_admin() is deliberately not enough on its own: in this module it crosses
-- colleges, and a second rating carries another college's self-appraisal.
DROP POLICY IF EXISTS "hr_perf_second_ratings_select" ON public.hr_performance_review_second_ratings;
CREATE POLICY "hr_perf_second_ratings_select"
  ON public.hr_performance_review_second_ratings FOR SELECT USING (
    (SELECT is_super_admin())
    OR (((SELECT is_admin()) OR user_has_permission('hr.performance_reviews.manage'))
        AND role_has_institution_access(institution_id))
    OR rater_id = (SELECT auth.uid())
  );

-- Ask someone: HR only.
DROP POLICY IF EXISTS "hr_perf_second_ratings_insert" ON public.hr_performance_review_second_ratings;
CREATE POLICY "hr_perf_second_ratings_insert"
  ON public.hr_performance_review_second_ratings FOR INSERT WITH CHECK (
    (SELECT is_super_admin())
    OR (((SELECT is_admin()) OR user_has_permission('hr.performance_reviews.manage'))
        AND role_has_institution_access(institution_id))
  );

-- Write: the rater, on their own row, until they submit. HR may change who
-- was asked while it is unsubmitted. Which COLUMNS each may change is pinned
-- by fn_hr_second_rating_guard below, because RLS cannot say.
DROP POLICY IF EXISTS "hr_perf_second_ratings_update" ON public.hr_performance_review_second_ratings;
CREATE POLICY "hr_perf_second_ratings_update"
  ON public.hr_performance_review_second_ratings FOR UPDATE USING (
    submitted_at IS NULL
    AND (
      rater_id = (SELECT auth.uid())
      OR (SELECT is_super_admin())
      OR (((SELECT is_admin()) OR user_has_permission('hr.performance_reviews.manage'))
          AND role_has_institution_access(institution_id))
    )
  ) WITH CHECK (
    rater_id = (SELECT auth.uid())
    OR (SELECT is_super_admin())
    OR (((SELECT is_admin()) OR user_has_permission('hr.performance_reviews.manage'))
        AND role_has_institution_access(institution_id))
  );

-- Withdraw a request: HR only, and only while unsubmitted. A submitted second
-- rating stays, so a disagreement cannot be deleted to improve the report.
-- Deleting the whole appraisal still removes it, by ON DELETE CASCADE, and on
-- purpose: a second rating of an appraisal that no longer exists compares
-- nothing, and #4081 promises a trial round deletes cleanly. Deleting an
-- appraisal is already an admin-only act under #4081's policies, so this is
-- not a new way to erase a disagreement.
DROP POLICY IF EXISTS "hr_perf_second_ratings_delete" ON public.hr_performance_review_second_ratings;
CREATE POLICY "hr_perf_second_ratings_delete"
  ON public.hr_performance_review_second_ratings FOR DELETE USING (
    submitted_at IS NULL
    AND (
      (SELECT is_super_admin())
      OR (((SELECT is_admin()) OR user_has_permission('hr.performance_reviews.manage'))
          AND role_has_institution_access(institution_id))
    )
  );

-- ── Who must never be a second rater: anyone who can read appraisals ───────
-- Decided 2026-09-29 (review round 2, option a). HR holding the manage key,
-- admins and super admins can read whole appraisal rows — the head's rating
-- included — so as second rater they would not be blind. They are refused,
-- judged for the RATER's identity, not the caller's (that also stops HR
-- assigning itself).
--
-- is_super_admin() and the one-argument user_has_permission() only answer for
-- auth.uid(), so this helper checks a GIVEN profile: the super-admin flag,
-- is_admin(profile), and the two-argument user_has_permission(profile, key)
-- that already exists on main (20260927020000; roles, legacy role mapping,
-- handover) rather than a copy of it. Owner-only: called from the guard and
-- the evidence function, which run as definer; no signed-in user can call it.
CREATE OR REPLACE FUNCTION public.fn_hr_profile_can_read_appraisals(p_profile uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_profile IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_profile AND p.is_super_admin = true)
    OR COALESCE(public.is_admin(p_profile), false)
    OR COALESCE(public.user_has_permission(p_profile, 'hr.performance_reviews.manage'), false)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_profile_can_read_appraisals(uuid) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.fn_hr_profile_can_read_appraisals(uuid) IS
  'True when the given profile can read whole appraisal rows (super admin, '
  'is_admin, or hr.performance_reviews.manage on a role). Such a person is '
  'never a blind second rater. Owner-only.';

-- For the rater search: which of these people cannot be asked, and so are
-- left off the list with a reason. HR only.
CREATE OR REPLACE FUNCTION public.fn_hr_second_rater_ineligible(p_profile_ids uuid[])
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('hr.performance_reviews.manage')) THEN
    RAISE EXCEPTION 'hr_second_rating: only HR may search for second raters'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(
    (SELECT array_agg(x) FROM unnest(p_profile_ids) AS t(x)
     WHERE public.fn_hr_profile_can_read_appraisals(x)),
    ARRAY[]::uuid[]
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_second_rater_ineligible(uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_second_rater_ineligible(uuid[]) TO authenticated;

-- ── Column guard for the second rating ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_hr_second_rating_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_hr        boolean;
  v_staff     uuid;
  v_status    text;
  v_subject   uuid;
  v_head      uuid;
  v_inst      uuid;
  v_policy    jsonb;
  v_area      text;
  v_open      text[];
BEGIN
  SELECT r.staff_id, r.status, s.profile_id, d.head_of_department_id, s.institution_id
    INTO v_staff, v_status, v_subject, v_head, v_inst
  FROM public.hr_performance_reviews r
  JOIN public.staff s ON s.id = r.staff_id
  LEFT JOIN public.departments d ON d.id = s.department_id
  WHERE r.id = NEW.review_id;

  -- HR for THIS appraisal: a super admin, or an admin / appraisal-manage
  -- holder whose college scope covers the person's college. Same rule as the
  -- table's row-level security.
  v_hr := COALESCE(is_super_admin(), false)
          OR (
            (COALESCE(is_admin(), false)
             OR COALESCE(user_has_permission('hr.performance_reviews.manage'), false))
            AND v_inst IS NOT NULL
            AND COALESCE(role_has_institution_access(v_inst), false)
          );

  -- ── INSERT: HR asks someone ─────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    IF NOT v_hr THEN
      RAISE EXCEPTION 'hr_second_rating: only HR may ask for a second rating'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_staff IS NULL THEN
      RAISE EXCEPTION 'hr_second_rating: no such appraisal'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_status = 'draft' THEN
      RAISE EXCEPTION 'hr_second_rating: a second rating can only be asked for once the appraisal is submitted'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.rater_id = v_subject THEN
      RAISE EXCEPTION 'hr_second_rating: nobody can give the second rating on their own appraisal'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.rater_id = v_head THEN
      RAISE EXCEPTION 'hr_second_rating: the second rater must not be the head who gives the first rating'
        USING ERRCODE = 'check_violation';
    END IF;
    IF public.fn_hr_profile_can_read_appraisals(NEW.rater_id) THEN
      RAISE EXCEPTION 'hr_second_rating: the second rater must not be someone who can read appraisals (HR with the appraisal key, an admin or a super admin) — they could see the head''s rating'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Same college only. The second rater reads the person's self-appraisal,
    -- so someone from another college must never be asked — not even by a
    -- group-wide admin (decided 2026-09-29: default NO, no exception). A person
    -- with no college on record cannot be matched, so they cannot be rated
    -- twice either.
    IF v_inst IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.staff rs
         WHERE rs.profile_id = NEW.rater_id AND rs.institution_id = v_inst
       ) THEN
      RAISE EXCEPTION 'hr_second_rating: the second rater must be a team member of the same college as the person appraised'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.rating_jsonb IS NOT NULL OR NEW.submitted_at IS NOT NULL THEN
      RAISE EXCEPTION 'hr_second_rating: a new request carries no rating — only the second rater writes one'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.institution_id := v_inst;
    NEW.assigned_by := v_uid;
    RETURN NEW;
  END IF;

  -- ── UPDATE ──────────────────────────────────────────────────────────────
  IF NEW.review_id IS DISTINCT FROM OLD.review_id
     OR NEW.institution_id IS DISTINCT FROM OLD.institution_id
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'hr_second_rating: review_id, institution_id, assigned_by and created_at cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A submitted second rating is a record. Nobody edits it, HR included.
  IF OLD.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'hr_second_rating: a submitted second rating cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The rater: their own rating and the submit, nothing else.
  IF v_uid IS NOT NULL AND v_uid = OLD.rater_id THEN
    IF NEW.rater_id IS DISTINCT FROM OLD.rater_id THEN
      RAISE EXCEPTION 'hr_second_rating: you cannot hand the second rating to someone else'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Given the appraisal key (or made an admin) AFTER being asked: this
    -- rater can now read the head's rating, so the rating is no longer blind.
    -- Refuse every edit and the submit; HR has to ask someone else. save() is
    -- a plain update, so this trigger is the only gate.
    IF public.fn_hr_profile_can_read_appraisals(v_uid) THEN
      RAISE EXCEPTION 'hr_second_rating: you can now read appraisals, so this second rating is no longer blind — ask HR to ask someone else'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.submitted_at IS NOT NULL THEN
      -- Every area rated.
      FOREACH v_area IN ARRAY ARRAY['teaching', 'research', 'service', 'collegiality'] LOOP
        IF COALESCE(NEW.rating_jsonb #>> ARRAY['ratings', v_area], '') NOT IN ('exceeds', 'meets', 'below') THEN
          RAISE EXCEPTION 'hr_second_rating: rate every area before submitting (missing: %)', v_area
            USING ERRCODE = 'check_violation';
        END IF;
      END LOOP;

      -- Read for the appraised person's college (falls back to the group
      -- value), the same read #4081's guard makes for the head.
      BEGIN
        v_policy := fn_get_policy_json('hr.performance_review', NULL, v_inst);
      EXCEPTION WHEN OTHERS THEN
        v_policy := NULL;
      END;

      -- Same Collegiality safeguard as every other tier.
      IF COALESCE((v_policy ->> 'collegiality_below_requires_example')::boolean, true)
         AND NEW.rating_jsonb #>> '{ratings,collegiality}' = 'below'
         AND length(trim(COALESCE(NEW.rating_jsonb ->> 'collegiality_example', ''))) < 20 THEN
        RAISE EXCEPTION 'hr_second_rating: a Below in Collegiality needs a written example of at least 20 characters'
          USING ERRCODE = 'check_violation';
      END IF;

      -- Conditions first, same rule as the first head.
      IF (v_policy -> 'conditions_first_on_below') IS DISTINCT FROM 'false'::jsonb THEN
        v_open := fn_hr_appraisal_unanswered_conditions(NEW.rating_jsonb);
        IF cardinality(v_open) > 0 THEN
          RAISE EXCEPTION 'hr_second_rating: before rating Below, say what the college did not provide (a reason and a note of at least 10 characters) for: %',
            array_to_string(v_open, ', ')
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Not the rater. HR may change who is asked, nothing else: HR writing the
  -- rating would put words in a rater's mouth.
  IF NOT v_hr THEN
    RAISE EXCEPTION 'hr_second_rating: you are not the second rater on this appraisal'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'hr_second_rating: only the second rater submits the second rating'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.rater_id IS DISTINCT FROM OLD.rater_id THEN
    IF NEW.rater_id = v_subject OR NEW.rater_id = v_head THEN
      RAISE EXCEPTION 'hr_second_rating: the second rater must be neither the person appraised nor their head'
        USING ERRCODE = 'check_violation';
    END IF;
    IF public.fn_hr_profile_can_read_appraisals(NEW.rater_id) THEN
      RAISE EXCEPTION 'hr_second_rating: the second rater must not be someone who can read appraisals (HR with the appraisal key, an admin or a super admin) — they could see the head''s rating'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_inst IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.staff rs
         WHERE rs.profile_id = NEW.rater_id AND rs.institution_id = v_inst
       ) THEN
      RAISE EXCEPTION 'hr_second_rating: the second rater must be a team member of the same college as the person appraised'
        USING ERRCODE = 'check_violation';
    END IF;
    -- The previous rater's unfinished draft does not pass to the new rater.
    NEW.rating_jsonb := NULL;
  ELSIF NEW.rating_jsonb IS DISTINCT FROM OLD.rating_jsonb THEN
    RAISE EXCEPTION 'hr_second_rating: only the second rater writes the second rating'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_second_rating_guard() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_hr_second_rating_guard ON public.hr_performance_review_second_ratings;
CREATE TRIGGER trg_hr_second_rating_guard
  BEFORE INSERT OR UPDATE ON public.hr_performance_review_second_ratings
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_second_rating_guard();

COMMENT ON FUNCTION public.fn_hr_second_rating_guard() IS
  'Pins which columns each party may write on a second rating: HR asks (and may '
  'change who, while unsubmitted), only the rater writes and submits the rating, '
  'nothing changes after submit. Refuses the person appraised or their own head '
  'as second rater, and enforces the Collegiality example and conditions-first '
  'rules on submit.';

-- ---------------------------------------------------------------------------
-- 3) What the second rater may read: the evidence, not the first rating.
--
--    The rater is usually a head of ANOTHER department, so the reviews table's
--    own RLS gives them nothing — and a row-level grant would have handed over
--    supervisor_review_jsonb with it. This returns only the self-appraisal,
--    plus the first head's ratings once BOTH are in.
--
-- ci:allow-secdef-authenticated fn_hr_second_rating_evidence is granted to every signed-in user because any head may be asked to rate; its body refuses every caller except the one profile named as rater_id on that second-rating row (a per-row ownership check the gate's predicate list does not recognise), so nobody else gets anything back. Rehearsed: the first head and the person appraised are refused.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_second_rating_evidence(p_second_rating_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.hr_performance_review_second_ratings%ROWTYPE;
  v_review  public.hr_performance_reviews%ROWTYPE;
  v_name    text;
  v_role    text;
  v_inst    uuid;
  v_both    boolean;
BEGIN
  SELECT * INTO v_row
  FROM public.hr_performance_review_second_ratings
  WHERE id = p_second_rating_id;

  IF NOT FOUND OR v_row.rater_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'hr_second_rating: you have not been asked to rate this appraisal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Someone who can read appraisals is not blind, whatever the request row
  -- says (e.g. they were given the key after being asked).
  IF public.fn_hr_profile_can_read_appraisals(auth.uid()) THEN
    RAISE EXCEPTION 'hr_second_rating: someone who can read appraisals cannot give a blind second rating'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_review FROM public.hr_performance_reviews WHERE id = v_row.review_id;

  SELECT NULLIF(trim(concat_ws(' ', s.first_name, s.last_name)), ''), s.designation, s.institution_id
    INTO v_name, v_role, v_inst
  FROM public.staff s
  WHERE s.id = v_review.staff_id;

  -- Defence in depth: even if a cross-college assignment ever slipped past the
  -- guard trigger, the evidence is not handed over unless the rater is a team
  -- member of the person's own college.
  IF v_inst IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.staff rs
       WHERE rs.profile_id = auth.uid() AND rs.institution_id = v_inst
     ) THEN
    RAISE EXCEPTION 'hr_second_rating: the second rater must be from the same college as the person appraised'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- "Both in": the second rating is submitted AND the first head has handed
  -- the appraisal on. Before that, the first head's ratings are withheld.
  v_both := v_row.submitted_at IS NOT NULL
            AND v_review.status IN ('supervisor_reviewed', 'sedc_reviewed', 'final_approved');

  RETURN jsonb_build_object(
    'second_rating_id', v_row.id,
    'review_id',        v_review.id,
    'person_name',      v_name,
    'designation',      v_role,
    -- The person's college, so the rater's form applies that college's
    -- settings. It is the rater's own college too (checked above).
    'institution_id',   v_inst,
    'self_appraisal',   v_review.self_appraisal_jsonb,
    'both_in',          v_both,
    'first_head_ratings',
      CASE WHEN v_both THEN v_review.supervisor_review_jsonb -> 'ratings' ELSE NULL END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_second_rating_evidence(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_second_rating_evidence(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_hr_second_rating_evidence(uuid) IS
  'For the assigned second rater only: the person''s self-appraisal (the same '
  'evidence the first head sees), and the first head''s ratings only once both '
  'ratings are in. Never returns the head''s notes or any later tier.';

-- ---------------------------------------------------------------------------
-- 4) HR holding the appraisal-manage key can READ the appraisals of their
--    own college(s).
--
--    Without this the new key opened an empty page: the round page lists
--    hr_performance_reviews, whose only readers were admins, the person and
--    their head. This is READ ONLY and college-scoped through the person's
--    staff row. It grants no write — the committee review, the Director's
--    sign-off and moving a round on stay with admins, as in #4081. PERMISSIVE,
--    so it ORs with #4081's policies and takes nothing away.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "hr_performance_reviews_select_appraisal_hr" ON public.hr_performance_reviews;
CREATE POLICY "hr_performance_reviews_select_appraisal_hr"
  ON public.hr_performance_reviews FOR SELECT USING (
    user_has_permission('hr.performance_reviews.manage')
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_performance_reviews.staff_id
        AND s.institution_id IS NOT NULL
        AND role_has_institution_access(s.institution_id)
    )
    -- Never a row the reader is still rating blind (a key granted after they
    -- were asked). Once they submit, the row is readable again.
    AND NOT EXISTS (
      SELECT 1 FROM public.hr_performance_review_second_ratings r
      WHERE r.review_id = hr_performance_reviews.id
        AND r.rater_id = (SELECT auth.uid())
        AND r.submitted_at IS NULL
    )
  );
