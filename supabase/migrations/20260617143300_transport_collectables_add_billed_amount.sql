-- 20260617143300_transport_collectables_add_billed_amount.sql
--
-- Add total_billed to fn_list_transport_collectables so the /billing/transport table can show
-- bill amount + paid + status (paid / partial / unpaid), not just outstanding. Adding a
-- RETURNS TABLE column requires DROP + CREATE (output columns are part of the signature).
DROP FUNCTION IF EXISTS public.fn_list_transport_collectables(uuid[], uuid);

CREATE FUNCTION public.fn_list_transport_collectables(
  p_institution_ids  uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL
)
RETURNS TABLE(
  student_id        uuid,
  first_name        text,
  last_name         text,
  roll_number       text,
  institution_id    uuid,
  route_number      text,
  route_name        text,
  stop_name         text,
  total_billed      numeric,
  outstanding_amount numeric,
  payable_bill_ids  uuid[],
  bill_count        integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_accessible uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.transport.view') THEN
    RAISE EXCEPTION 'Not authorized: billing.transport.view required';
  END IF;

  SELECT array_agg(gai.institution_id)
    INTO v_accessible
  FROM public.get_user_accessible_institutions(auth.uid()) AS gai;
  IF v_accessible IS NULL THEN
    v_accessible := ARRAY[]::uuid[];
  END IF;

  RETURN QUERY
  SELECT
    lp.id,
    lp.first_name,
    lp.last_name,
    lp.roll_number,
    lp.institution_id,
    rt.route_number,
    rt.route_name,
    st.stop_name,
    -- Total transport fee billed (exclude cancelled/superseded, mirrors the student page).
    COALESCE(SUM(bsb.final_amount) FILTER (WHERE bsb.status NOT IN ('cancelled','superseded')), 0) AS total_billed,
    COALESCE(SUM(
      CASE WHEN bsb.status IN ('unpaid','partially_paid')
           THEN COALESCE(bsb.balance_amount, bsb.final_amount, bsb.total_amount, 0)
           ELSE 0 END
    ), 0) AS outstanding_amount,
    COALESCE(
      array_agg(bsb.id) FILTER (WHERE bsb.status IN ('unpaid','partially_paid')),
      ARRAY[]::uuid[]
    ) AS payable_bill_ids,
    COUNT(bsb.id)::int AS bill_count
  FROM public.learners_profiles lp
  JOIN public.billing_student_bills bsb
    ON bsb.student_id = lp.id
  JOIN public.billing_categories bc
    ON bc.id = bsb.item_category_id AND bc.kind = 'transport'
  LEFT JOIN public.tms_route rt      ON rt.id = lp.transport_route_id
  LEFT JOIN public.tms_route_stop st ON st.id = lp.transport_stop_id
  WHERE lp.institution_id = ANY(v_accessible)
    AND (p_institution_ids IS NULL OR lp.institution_id = ANY(p_institution_ids))
    AND (p_academic_year_id IS NULL OR bsb.academic_year_id = p_academic_year_id)
  GROUP BY lp.id, lp.first_name, lp.last_name, lp.roll_number, lp.institution_id,
           rt.route_number, rt.route_name, st.stop_name
  ORDER BY lp.first_name, lp.last_name;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_list_transport_collectables(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_list_transport_collectables(uuid[], uuid) TO authenticated;
