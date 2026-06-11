-- Fee-aware program eligibility — fee source + resolvers.
-- SINGLE source of truth: nothing else computes the gating fee or the category set.

-- 1. The gating fee = current-academic-year academic bill total.
--    NO COALESCE: SUM over zero rows = NULL = "no fee data" => caller fails open.
--    SECURITY DEFINER so campus-living operators without billing read still get it
--    (returns only an aggregate numeric — no row leakage).
CREATE OR REPLACE FUNCTION public.fn_learner_current_year_academic_fee(p_learner_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Bills predating academic_year_id stamping have NULL here and are excluded;
  -- a learner with no matching (tagged) bill yields NULL => caller fails open. Intentional.
  SELECT SUM(b.final_amount)
  FROM billing_student_bills b
  JOIN learners_profiles lp ON lp.id = b.student_id
  WHERE b.student_id = p_learner_id
    AND b.fee_source = 'academic'
    AND b.status NOT IN ('cancelled','superseded')
    AND b.academic_year_id = lp.academic_year_id;
$$;

-- 2. Parametric resolver (room). Most-specific matching scope wins; tie-break by
--    tightest band. Returns ALL categories in the winning scope (allow-set).
--    Empty result => caller fails open.
CREATE OR REPLACE FUNCTION public.fn_hostel_effective_room_categories(
  p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric
) RETURNS TABLE(category_id uuid)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH candidates AS (
    SELECT e.room_category_id,
           e.program_id, e.quota_id, e.fee_min, e.fee_max,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_id   IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int * 1 ) AS specificity
    FROM hostel_program_room_eligibility e
    WHERE e.institution_id = p_institution
      AND e.is_active
      AND (e.program_id = p_program OR e.program_id IS NULL)
      AND (e.quota_id   = p_quota   OR e.quota_id   IS NULL)
      -- half-open interval [fee_min, fee_max): includes min, excludes max
      AND (e.fee_min IS NULL OR p_fee >= e.fee_min)
      AND (e.fee_max IS NULL OR p_fee <  e.fee_max)
  ),
  winner AS (
    SELECT program_id, quota_id, fee_min, fee_max
    FROM candidates
    ORDER BY specificity DESC,
             (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  SELECT c.room_category_id
  FROM candidates c JOIN winner w
    ON c.program_id IS NOT DISTINCT FROM w.program_id
   AND c.quota_id   IS NOT DISTINCT FROM w.quota_id
   AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
   AND c.fee_max    IS NOT DISTINCT FROM w.fee_max;
$$;

-- 3. Parametric resolver (mess) — identical shape on the mess table.
CREATE OR REPLACE FUNCTION public.fn_hostel_effective_mess_categories(
  p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric
) RETURNS TABLE(category_id uuid)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH candidates AS (
    SELECT e.mess_category_id,
           e.program_id, e.quota_id, e.fee_min, e.fee_max,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_id   IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int * 1 ) AS specificity
    FROM hostel_program_mess_eligibility e
    WHERE e.institution_id = p_institution
      AND e.is_active
      AND (e.program_id = p_program OR e.program_id IS NULL)
      AND (e.quota_id   = p_quota   OR e.quota_id   IS NULL)
      -- half-open interval [fee_min, fee_max): includes min, excludes max
      AND (e.fee_min IS NULL OR p_fee >= e.fee_min)
      AND (e.fee_max IS NULL OR p_fee <  e.fee_max)
  ),
  winner AS (
    SELECT program_id, quota_id, fee_min, fee_max
    FROM candidates
    ORDER BY specificity DESC,
             (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  SELECT c.mess_category_id
  FROM candidates c JOIN winner w
    ON c.program_id IS NOT DISTINCT FROM w.program_id
   AND c.quota_id   IS NOT DISTINCT FROM w.quota_id
   AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
   AND c.fee_max    IS NOT DISTINCT FROM w.fee_max;
$$;

-- 4. Composite (room): the interface callers use. Reads the learner's dims +
--    fee, then resolves. NULL fee or NULL program => empty => fail-open.
--    SECURITY DEFINER so it reliably reads learners_profiles; returns only ids.
CREATE OR REPLACE FUNCTION public.fn_hostel_learner_room_categories(p_learner_id uuid)
RETURNS TABLE(category_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_institution uuid; v_program uuid; v_quota uuid; v_fee numeric;
BEGIN
  SELECT lp.institution_id, lp.program_id, lp.quota_id
    INTO v_institution, v_program, v_quota
  FROM learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_institution IS NULL THEN RETURN; END IF;        -- no institution => fail-open
  IF v_program IS NULL THEN RETURN; END IF;            -- no program => fail-open
  v_fee := fn_learner_current_year_academic_fee(p_learner_id);
  IF v_fee IS NULL THEN RETURN; END IF;                -- no bill data => fail-open

  RETURN QUERY
    SELECT r.category_id
    FROM fn_hostel_effective_room_categories(v_institution, v_program, v_quota, v_fee) r;
END $$;

-- 5. Composite (mess).
CREATE OR REPLACE FUNCTION public.fn_hostel_learner_mess_categories(p_learner_id uuid)
RETURNS TABLE(category_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_institution uuid; v_program uuid; v_quota uuid; v_fee numeric;
BEGIN
  SELECT lp.institution_id, lp.program_id, lp.quota_id
    INTO v_institution, v_program, v_quota
  FROM learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_institution IS NULL THEN RETURN; END IF;        -- no institution => fail-open
  IF v_program IS NULL THEN RETURN; END IF;            -- no program => fail-open
  v_fee := fn_learner_current_year_academic_fee(p_learner_id);
  IF v_fee IS NULL THEN RETURN; END IF;                -- no bill data => fail-open

  RETURN QUERY
    SELECT m.category_id
    FROM fn_hostel_effective_mess_categories(v_institution, v_program, v_quota, v_fee) m;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_hostel_learner_room_categories(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hostel_learner_mess_categories(uuid) TO authenticated;

-- Lock down: revoke the Supabase-default anon/PUBLIC EXECUTE. The fee fn is
-- SECURITY DEFINER over billing data; the resolvers + composites run internally
-- via the DEFINER composites (owner has EXECUTE), so only the two composites
-- need a direct grant (the allocation page calls them as `authenticated`).
-- NOTE: Supabase grants EXECUTE directly to `anon` (not via PUBLIC) on every new
-- public function, so the revoke MUST name `anon` explicitly — `FROM PUBLIC`
-- alone leaves the explicit anon grant intact.
REVOKE EXECUTE ON FUNCTION public.fn_learner_current_year_academic_fee(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hostel_effective_room_categories(uuid,uuid,uuid,numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hostel_effective_mess_categories(uuid,uuid,uuid,numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hostel_learner_room_categories(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hostel_learner_mess_categories(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_hostel_learner_room_categories(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hostel_learner_mess_categories(uuid) TO authenticated;
