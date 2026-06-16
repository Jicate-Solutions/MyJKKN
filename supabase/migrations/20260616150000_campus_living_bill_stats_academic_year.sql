-- Fix: the Generate-tab bill-stats must reflect how bills are ACTUALLY tagged — by the
-- learner's own academic_year_id — not hostel_year_id. Only 4 of ~7k bills carry a
-- hostel_year_id (the generation tool hasn't been run); real billing is academic-year
-- tagged. "Billed" now = the hosteller has any non-cancelled bill tagged to their OWN
-- academic_year_id (learners_profiles.academic_year_id). p_hostel_year_id is retained for
-- signature/tab-context stability but no longer gates the metric (it is per-hosteller-
-- academic-year, independent of the selected hostel year). Output shape is unchanged so
-- the service/hook/panel need no edits.
CREATE OR REPLACE FUNCTION public.campus_living_hostel_year_bill_stats(p_hostel_year_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_insts uuid[];
  v_result jsonb;
BEGIN
  IF NOT public.user_has_permission('campus_living.fees.config') THEN
    RAISE EXCEPTION 'permission denied: campus_living.fees.config' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_insts
  FROM public.get_user_accessible_institutions(auth.uid());
  IF v_insts IS NULL THEN v_insts := ARRAY[]::uuid[]; END IF;

  WITH hostellers AS (
    SELECT h.id, h.institution_id, lp.academic_year_id
    FROM public.v_learner_hostelites h
    JOIN public.learners_profiles lp ON lp.id = h.id
    WHERE h.institution_id = ANY(v_insts)
  ),
  ay_bills AS (
    SELECT hs.id AS student_id, b.final_amount, b.balance_amount
    FROM hostellers hs
    JOIN public.billing_student_bills b
      ON b.student_id = hs.id
     AND b.academic_year_id = hs.academic_year_id
     AND b.status NOT IN ('cancelled','superseded')
    WHERE hs.academic_year_id IS NOT NULL
  ),
  billed AS (SELECT DISTINCT student_id FROM ay_bills),
  joined AS (
    SELECT hs.id, hs.institution_id, (bl.student_id IS NOT NULL) AS is_billed
    FROM hostellers hs
    LEFT JOIN billed bl ON bl.student_id = hs.id
  )
  SELECT jsonb_build_object(
    'total_hostellers',  (SELECT count(*) FROM joined),
    'billed',            (SELECT count(*) FROM joined WHERE is_billed),
    'not_billed',        (SELECT count(*) FROM joined WHERE NOT is_billed),
    'bill_count',        (SELECT count(*) FROM ay_bills),
    'total_amount',      (SELECT COALESCE(SUM(final_amount),0) FROM ay_bills),
    'paid_amount',       (SELECT COALESCE(SUM(final_amount - balance_amount),0) FROM ay_bills),
    'outstanding_amount',(SELECT COALESCE(SUM(balance_amount),0) FROM ay_bills),
    'by_institution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'institution_id', j.institution_id,
               'institution_name', inst.name,
               'total', j.total, 'billed', j.billed, 'not_billed', j.total - j.billed
             ) ORDER BY inst.name)
      FROM (
        SELECT institution_id, count(*) AS total, count(*) FILTER (WHERE is_billed) AS billed
        FROM joined GROUP BY institution_id
      ) j
      JOIN public.institutions inst ON inst.id = j.institution_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN COALESCE(v_result, jsonb_build_object(
    'total_hostellers',0,'billed',0,'not_billed',0,'bill_count',0,
    'total_amount',0,'paid_amount',0,'outstanding_amount',0,'by_institution','[]'::jsonb));
END $function$;
