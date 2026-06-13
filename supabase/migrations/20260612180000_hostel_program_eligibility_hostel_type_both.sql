-- Add an explicit per-band "hostel type" (boys | girls | both) to fee-condition
-- eligibility, so an operator can configure a condition that is COMMON to both
-- genders ("both") instead of duplicating a boys + girls row.
--
-- Band MATCHING becomes gender-aware: a 'both' band matches every learner; a
-- 'boys'/'girls' band matches only that gender. The gender filter lives in
-- fn_hostel_effective_* via a DEFAULTED param, so any legacy 4-arg caller passes
-- NULL => no filter => identical behavior (backward-compatible). The composites
-- pass the learner's gender. fn_apply's name-translation (mig 20260612170000)
-- still maps the matched band's category NAME to the learner-gender variant.
--
-- Existing rows default to 'both' (they already apply to both after the
-- gender-agnostic change), so this migration does not change any current result.

-- ── 1. Column ───────────────────────────────────────────────────────────────
ALTER TABLE public.hostel_program_eligibility
  ADD COLUMN IF NOT EXISTS hostel_type text NOT NULL DEFAULT 'both'
  CHECK (hostel_type IN ('boys','girls','both'));

-- ── 2. Gender-aware effective resolvers (DROP 4-arg, CREATE 5-arg w/ default) ─
DROP FUNCTION IF EXISTS public.fn_hostel_effective_room_categories(uuid,uuid,uuid,numeric);
CREATE FUNCTION public.fn_hostel_effective_room_categories(
  p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric, p_gender text DEFAULT NULL
) RETURNS TABLE(category_id uuid)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH candidates AS (
    SELECT e.room_category_id AS cat,
           e.program_id, e.quota_id, e.fee_min, e.fee_max,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_id   IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int * 1 ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = p_institution
      AND e.is_active
      AND e.room_category_id IS NOT NULL
      AND (p_gender IS NULL OR e.hostel_type = 'both' OR e.hostel_type = p_gender)
      AND (e.program_id = p_program OR e.program_id IS NULL)
      AND (e.quota_id   = p_quota   OR e.quota_id   IS NULL)
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
  SELECT c.cat
  FROM candidates c JOIN winner w
    ON c.program_id IS NOT DISTINCT FROM w.program_id
   AND c.quota_id   IS NOT DISTINCT FROM w.quota_id
   AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
   AND c.fee_max    IS NOT DISTINCT FROM w.fee_max;
$$;

DROP FUNCTION IF EXISTS public.fn_hostel_effective_mess_categories(uuid,uuid,uuid,numeric);
CREATE FUNCTION public.fn_hostel_effective_mess_categories(
  p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric, p_gender text DEFAULT NULL
) RETURNS TABLE(category_id uuid)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH candidates AS (
    SELECT e.mess_category_id AS cat,
           e.program_id, e.quota_id, e.fee_min, e.fee_max,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_id   IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int * 1 ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = p_institution
      AND e.is_active
      AND e.mess_category_id IS NOT NULL
      AND (p_gender IS NULL OR e.hostel_type = 'both' OR e.hostel_type = p_gender)
      AND (e.program_id = p_program OR e.program_id IS NULL)
      AND (e.quota_id   = p_quota   OR e.quota_id   IS NULL)
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
  SELECT c.cat
  FROM candidates c JOIN winner w
    ON c.program_id IS NOT DISTINCT FROM w.program_id
   AND c.quota_id   IS NOT DISTINCT FROM w.quota_id
   AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
   AND c.fee_max    IS NOT DISTINCT FROM w.fee_max;
$$;

-- internal-only (called by the SECURITY DEFINER composites; owner has EXECUTE)
REVOKE EXECUTE ON FUNCTION public.fn_hostel_effective_room_categories(uuid,uuid,uuid,numeric,text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hostel_effective_mess_categories(uuid,uuid,uuid,numeric,text) FROM anon, PUBLIC;

-- ── 3. Composites pass the learner's gender ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_hostel_learner_room_categories(p_learner_id uuid)
RETURNS TABLE(category_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_institution uuid; v_program uuid; v_quota uuid; v_fee numeric; v_gender text; v_gt text;
BEGIN
  SELECT lp.institution_id, lp.program_id, lp.quota_id, lp.gender
    INTO v_institution, v_program, v_quota, v_gender
  FROM learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_institution IS NULL THEN RETURN; END IF;
  IF v_program IS NULL THEN RETURN; END IF;
  v_fee := fn_learner_current_year_academic_fee(p_learner_id);
  IF v_fee IS NULL THEN RETURN; END IF;

  v_gt := CASE WHEN lower(v_gender) LIKE 'm%' THEN 'boys'
               WHEN lower(v_gender) LIKE 'f%' THEN 'girls' ELSE NULL END;

  RETURN QUERY
    SELECT r.category_id
    FROM fn_hostel_effective_room_categories(v_institution, v_program, v_quota, v_fee, v_gt) r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_hostel_learner_mess_categories(p_learner_id uuid)
RETURNS TABLE(category_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_institution uuid; v_program uuid; v_quota uuid; v_fee numeric; v_gender text; v_gt text;
BEGIN
  SELECT lp.institution_id, lp.program_id, lp.quota_id, lp.gender
    INTO v_institution, v_program, v_quota, v_gender
  FROM learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_institution IS NULL THEN RETURN; END IF;
  IF v_program IS NULL THEN RETURN; END IF;
  v_fee := fn_learner_current_year_academic_fee(p_learner_id);
  IF v_fee IS NULL THEN RETURN; END IF;

  v_gt := CASE WHEN lower(v_gender) LIKE 'm%' THEN 'boys'
               WHEN lower(v_gender) LIKE 'f%' THEN 'girls' ELSE NULL END;

  RETURN QUERY
    SELECT m.category_id
    FROM fn_hostel_effective_mess_categories(v_institution, v_program, v_quota, v_fee, v_gt) m;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_hostel_learner_room_categories(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hostel_learner_mess_categories(uuid) TO authenticated;
