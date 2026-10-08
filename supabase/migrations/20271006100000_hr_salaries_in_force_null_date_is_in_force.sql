-- =============================================================================
-- 20271006100000_hr_salaries_in_force_null_date_is_in_force.sql
--
-- hr_staff_salaries_in_force(): a salary with NO effective date is in force.
--
-- THE BUG (found 2026-10-06 from the Month Close preview)
-- -------------------------------------------------------
-- The function (20270519090000) picks the row whose effective_from is on or
-- before the day asked about:
--
--     WHERE c.effective_from <= p_on
--
-- hr_staff_salaries.effective_from is NULLABLE and NULL is the NORMAL case: the
-- bulk salary import shipped a blank Effective_Date on every row ("sheet carried
-- no effective date"). `NULL <= date` is NULL, not true, so every such row fell
-- out of `pick` and the function returned NOTHING for that person.
--
-- The register reads salaries only through this function, so for those staff:
--   * Month Close preview said "No salary recorded" and listed them as "Not paid"
--   * generating the register treated them as having no salary at all
-- while the Salaries screen, which lists the stored rows directly, showed the
-- salary perfectly well.
--
-- Measured for the month ending 2026-09-30, current rows with no date that the
-- function dropped: Dental 76, Engineering 53, Arts & Science (Self) 49,
-- Pharmacy 38, Nursing 24, Allied Health 15, Main Office 11, Jicate 10 = 276.
--
-- THE FIX
-- -------
-- A NULL effective_from means "no start date recorded", i.e. in force from the
-- beginning. The original header already stated the intent -- "a current row that
-- does not start in the future is returned as it is" -- and a row with no date
-- does not start in the future. Only the `pick` predicate changes.
--
-- The recursion is left alone on purpose: `c.effective_from > p_on` is NULL for an
-- undated row, so the walk back along superseded_by stops AT it, which is right --
-- an undated row has no start to be "after" p_on, and nothing earlier can be more
-- in force than "from the beginning".
--
-- Rows WITH a date behave exactly as before, so this only ADDS people back. A
-- row dated after p_on and with no earlier row (a new joiner whose pay starts next
-- month) is still, correctly, not in force.
--
-- CREATE OR REPLACE with the identical signature, options and search_path keeps
-- the existing GRANTs (authenticated, service_role; anon and PUBLIC revoked).
-- SECURITY INVOKER is the default, stated for the reader.
--
-- VERSIONED AFTER 20270519090000 ON PURPOSE: replaying the migrations in order
-- would otherwise recreate the buggy body over this one.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.hr_staff_salaries_in_force(p_staff_ids uuid[], p_on date)
RETURNS TABLE(
  id uuid, staff_id uuid, monthly_gross numeric, effective_from date,
  eligible_for_pf boolean, epf_amount numeric, eligible_for_esi boolean,
  esi_amount numeric, allowance_amount numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE chain AS (
    SELECT s.id, s.staff_id, s.effective_from, 0 AS depth
      FROM public.hr_staff_salaries s
     WHERE s.staff_id = ANY (p_staff_ids) AND s.superseded_by IS NULL
    UNION ALL
    SELECT prev.id, prev.staff_id, prev.effective_from, c.depth + 1
      FROM chain c
      JOIN public.hr_staff_salaries prev ON prev.superseded_by = c.id
     WHERE c.effective_from > p_on AND c.depth < 100
  ), pick AS (
    SELECT DISTINCT ON (c.staff_id) c.id
      FROM chain c
     WHERE c.effective_from IS NULL OR c.effective_from <= p_on
     ORDER BY c.staff_id, c.depth
  )
  SELECT s.id, s.staff_id, s.monthly_gross, s.effective_from,
         s.eligible_for_pf, s.epf_amount, s.eligible_for_esi, s.esi_amount, s.allowance_amount
    FROM public.hr_staff_salaries s
    JOIN pick ON pick.id = s.id
$function$;

COMMENT ON FUNCTION public.hr_staff_salaries_in_force(uuid[], date) IS
  'The salary row in force on p_on for each person: the current row, or, when it starts after p_on, the row it replaced (walked back along superseded_by). A row with NO effective_from is in force from the beginning (the bulk import left it blank for most staff). The salary register reads this for the last day of its month so a raise that starts next month never reaches this month. SECURITY INVOKER: the caller''s own RLS applies.';
