-- ─── Rename billing "discounts" → "scholarships" — part 3b: get_billing_reports_discounts → get_billing_reports_scholarships ───
-- 2026-10-09. See 20271009130000_rename_discounts_to_scholarships.sql for the rationale and dependency scan.
-- Applied through the Supabase MCP apply_migration as "rename_scholarships_reports_fn"; ledger version aligned to 20271009130310.

-- Return shape changes → DROP + CREATE under the new name + explicit grants (authenticated + service_role only).
--
-- Post-conditions (no function body names billing_discounts / billing.discounts, no role holds an old key,
-- no object on billing_scholarships still named discount, RLS on, 4 policies on the new keys) were checked
-- afterwards as a read-only query — all passed — rather than recorded as a migration.

DROP FUNCTION IF EXISTS public.get_billing_reports_discounts(
  uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid,
  text[], text[], uuid, date, date, integer, integer);

CREATE FUNCTION public.get_billing_reports_scholarships(
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_academic_year_id uuid DEFAULT NULL::uuid,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL::uuid,
  p_degree_id uuid DEFAULT NULL::uuid,
  p_department_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_section_id uuid DEFAULT NULL::uuid,
  p_schemes text[] DEFAULT NULL::text[],
  p_accommodation_codes text[] DEFAULT NULL::text[],
  p_student_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0)
 RETURNS TABLE(scholarship_id uuid, first_name text, last_name text, roll_number text,
               institution_name text, bill_description text,
               scholarship_category_name text, scholarship_type_name text,
               value_mode text, scholarship_value numeric, scholarship_amount numeric,
               approval_status text, effective_date date, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT d.id, lp.first_name::text, lp.last_name::text, lp.roll_number::text,
         i.name::text, b.bill_description::text,
         sc.name::text, st.name::text, d.value_mode::text,
         d.scholarship_value, d.scholarship_amount,
         d.approval_status::text, d.effective_date,
         COUNT(*) OVER() AS total_count
  FROM public.billing_scholarships d
  JOIN public.billing_student_bills b ON b.id = d.bill_id
  JOIN public.billing_report_student_cohort(
         p_degree_id, p_department_id, p_program_id,
         p_semester_id, p_section_id, p_schemes, p_accommodation_codes) c ON c.student_id = b.student_id
  LEFT JOIN public.learners_profiles lp ON lp.id = b.student_id
  LEFT JOIN public.institutions i ON i.id = b.institution_id
  LEFT JOIN public.billing_scholarship_categories sc ON sc.id = d.scholarship_category_id
  LEFT JOIN public.billing_scholarship_types st ON st.id = d.scholarship_type_id
  WHERE b.institution_id = ANY(v_inst)
    AND (p_student_id IS NULL OR b.student_id = p_student_id)
    AND (p_item_category_id IS NULL OR b.item_category_id = p_item_category_id)
    AND (CASE
           WHEN p_academic_year_unspecified THEN b.academic_year_id IS NULL
           WHEN p_academic_year_id IS NOT NULL THEN b.academic_year_id = p_academic_year_id
           ELSE true END)
    AND (p_date_from IS NULL OR d.effective_date >= p_date_from)
    AND (p_date_to   IS NULL OR d.effective_date <= p_date_to)
  ORDER BY d.created_at DESC, d.id DESC
  LIMIT COALESCE(p_limit, 10000) OFFSET COALESCE(p_offset, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_reports_scholarships(
  uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid,
  text[], text[], uuid, date, date, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_reports_scholarships(
  uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid,
  text[], text[], uuid, date, date, integer, integer) TO authenticated, service_role;
