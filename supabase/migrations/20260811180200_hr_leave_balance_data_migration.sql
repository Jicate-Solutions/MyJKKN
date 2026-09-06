-- =====================================================================
-- Derived leave entitlement — data migration
-- =====================================================================
-- Order matters. Step 1 must run BEFORE step 2, or the three divergent
-- values are lost and those people silently gain 7 days.

BEGIN;

-- 1. Preserve the rows that differ from their type default. Verified
--    2026-08-11: exactly 3, all Vacation Leave at 7.00 against a 14.00
--    default, all cadre-derived. Selected by predicate, not by hardcoded
--    ids -- the ids are in the spec to verify the count, not to drive this.
INSERT INTO public.hr_leave_entitlement_overrides (
  employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
  entitled_days, reason
)
SELECT b.employee_id, b.leave_type_id, b.hr_academic_year_id, b.hr_organization_id,
       b.entitled, 'Migrated from cadre entitlement 2026-08-11'
FROM public.hr_leave_balances b
JOIN public.hr_leave_types t ON t.id = b.leave_type_id
JOIN public.hr_academic_years y ON y.id = b.hr_academic_year_id
WHERE y.end_date >= current_date
  AND b.entitled IS DISTINCT FROM t.default_entitled_days
ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id) DO NOTHING;

-- 2. Release the open years to derivation. used and carried_forward are
--    never touched -- they are recorded facts, not policy.
UPDATE public.hr_leave_balances b
   SET entitled = NULL, updated_at = now()
  FROM public.hr_academic_years y
 WHERE y.id = b.hr_academic_year_id
   AND y.end_date >= current_date;

-- 3. Freeze the years that have already ended, so the cron does not later
--    re-derive their numbers from today's policy.
UPDATE public.hr_academic_years
   SET frozen_at = now()
 WHERE end_date < current_date
   AND frozen_at IS NULL;

-- 4. Post-conditions. Raise rather than commit something wrong.
DO $$
DECLARE
  v_overrides  integer;
  v_not_null   integer;
  v_unfrozen   integer;
  v_uncovered  integer;
BEGIN
  SELECT count(*) INTO v_overrides FROM public.hr_leave_entitlement_overrides;

  SELECT count(*) INTO v_not_null
    FROM public.hr_leave_balances b
    JOIN public.hr_academic_years y ON y.id = b.hr_academic_year_id
   WHERE y.end_date >= current_date AND b.entitled IS NOT NULL;

  SELECT count(*) INTO v_unfrozen
    FROM public.hr_academic_years
   WHERE end_date < current_date AND frozen_at IS NULL;

  -- Every active staff member must resolve at least one row for the
  -- current year, or somebody is still locked out.
  SELECT count(*) INTO v_uncovered
    FROM public.staff s
   WHERE s.is_active
     AND NOT EXISTS (
       SELECT 1 FROM public.v_hr_leave_balance_src v
        WHERE v.employee_id = s.id
          AND v.hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'
     );

  IF v_overrides <> 3 THEN
    RAISE EXCEPTION 'Expected 3 migrated overrides, got %', v_overrides;
  END IF;
  IF v_not_null <> 0 THEN
    RAISE EXCEPTION 'Open-year rows still carry a frozen entitled: %', v_not_null;
  END IF;
  IF v_unfrozen <> 0 THEN
    RAISE EXCEPTION 'Ended years left unfrozen: %', v_unfrozen;
  END IF;
  IF v_uncovered <> 0 THEN
    RAISE EXCEPTION 'Active staff with no resolvable balance row: %', v_uncovered;
  END IF;
END $$;

COMMIT;
