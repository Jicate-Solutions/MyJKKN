-- Hostel-year bill generation stats — powers the analytics panel on the
-- /campus-living/residents?tab=generate page. Returns, for one hostel year,
-- how many hostellers are billed (have >=1 non-cancelled bill tagged to that
-- hostel_year_id) vs not billed, plus bill count + amounts, with a per-institution
-- breakdown. Scoped server-side to the caller's accessible institutions (mirrors
-- the tab's super-admin=all / else=own scope) and gated on the same permission as
-- the generation RPC.
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
  IF p_hostel_year_id IS NULL THEN
    RAISE EXCEPTION 'hostel year is required';
  END IF;

  -- Caller's accessible institutions (branch 3 returns all for scope='all' roles).
  SELECT array_agg(institution_id) INTO v_insts
  FROM public.get_user_accessible_institutions(auth.uid());
  IF v_insts IS NULL THEN v_insts := ARRAY[]::uuid[]; END IF;

  WITH hostellers AS (
    SELECT h.id, h.institution_id
    FROM public.v_learner_hostelites h
    WHERE h.institution_id = ANY(v_insts)
  ),
  yr_bills AS (
    SELECT b.student_id, b.final_amount, b.balance_amount
    FROM public.billing_student_bills b
    WHERE b.hostel_year_id = p_hostel_year_id
      AND b.institution_id = ANY(v_insts)
      AND b.status NOT IN ('cancelled','superseded')
  ),
  billed AS (SELECT DISTINCT student_id FROM yr_bills),
  joined AS (
    SELECT h.id, h.institution_id, (bl.student_id IS NOT NULL) AS is_billed
    FROM hostellers h
    LEFT JOIN billed bl ON bl.student_id = h.id
  )
  SELECT jsonb_build_object(
    'total_hostellers',  (SELECT count(*) FROM joined),
    'billed',            (SELECT count(*) FROM joined WHERE is_billed),
    'not_billed',        (SELECT count(*) FROM joined WHERE NOT is_billed),
    'bill_count',        (SELECT count(*) FROM yr_bills),
    'total_amount',      (SELECT COALESCE(SUM(final_amount),0) FROM yr_bills),
    'paid_amount',       (SELECT COALESCE(SUM(final_amount - balance_amount),0) FROM yr_bills),
    'outstanding_amount',(SELECT COALESCE(SUM(balance_amount),0) FROM yr_bills),
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

REVOKE EXECUTE ON FUNCTION public.campus_living_hostel_year_bill_stats(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.campus_living_hostel_year_bill_stats(uuid) TO authenticated;
