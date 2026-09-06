-- campus_living_get_hostelite_bills — itemized bill list for one hostelite,
-- powering the Billing details section of the Residents → Learners detail drawer.
--
-- Each billing_student_bills row IS a line item (a billing category with its own
-- final_amount / balance_amount / status); there is no separate bill-items table.
-- paid_amount is derived as final_amount - balance_amount.
--
-- SECURITY DEFINER + gated on campus_living.residents.view so campus-living
-- operators (wardens) — who typically lack billing.schedule.view / billing.bills.view
-- and would otherwise get a SILENT empty list from billing_student_bills RLS — can
-- read the itemized bills. Scoped to the caller's accessible institutions (via the
-- learner's institution) to prevent cross-institution leakage, exactly like the
-- sibling rollup campus_living_get_hostelite_bill_status.
--
-- Scope: ALL academic years (the drawer shows the academic year per row).
-- cancelled / superseded bills are excluded to match the rollup's totals.

CREATE OR REPLACE FUNCTION public.campus_living_get_hostelite_bills(p_student_id uuid)
RETURNS TABLE (
  id uuid,
  item_category_id uuid,
  category_name text,
  bill_description text,
  due_date date,
  final_amount numeric,
  balance_amount numeric,
  paid_amount numeric,
  status text,
  fee_source text,
  applies_year_of_study integer,
  academic_year_id uuid,
  academic_year_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('campus_living.residents.view') THEN
    RAISE EXCEPTION 'permission denied: campus_living.residents.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.item_category_id,
    bc.category_name::text,
    b.bill_description,
    b.due_date,
    b.final_amount,
    b.balance_amount,
    (COALESCE(b.final_amount, 0) - COALESCE(b.balance_amount, 0))::numeric AS paid_amount,
    b.status::text,
    b.fee_source,
    b.applies_year_of_study,
    b.academic_year_id,
    ay.academic_year_name::text
  FROM billing_student_bills b
  JOIN learners_profiles lp ON lp.id = b.student_id
  LEFT JOIN billing_categories bc ON bc.id = b.item_category_id
  LEFT JOIN academic_years ay ON ay.id = b.academic_year_id
  WHERE b.student_id = p_student_id
    AND lp.institution_id = ANY(public._user_accessible_institutions())
    AND b.status NOT IN ('cancelled', 'superseded')
  ORDER BY ay.academic_year_name DESC NULLS LAST,
           b.due_date ASC NULLS LAST,
           bc.category_name ASC NULLS LAST;
END
$function$;

REVOKE ALL ON FUNCTION public.campus_living_get_hostelite_bills(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campus_living_get_hostelite_bills(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.campus_living_get_hostelite_bills(uuid) TO authenticated;
