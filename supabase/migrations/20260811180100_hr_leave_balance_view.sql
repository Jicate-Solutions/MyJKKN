-- =====================================================================
-- Derived leave entitlement — the read surface
-- =====================================================================
-- Two views on purpose:
--
--   v_hr_leave_balance_src  the derivation, with NO access predicate.
--                           Revoked from anon and authenticated. Exists so
--                           fn_hr_freeze_leave_year can read the same
--                           derivation the UI reads without inheriting a
--                           predicate that would evaluate against the cron's
--                           service-role identity.
--   v_hr_leave_balance      src + the access predicate. This is what the app
--                           reads.
--
-- The predicate is copied VERBATIM from the hlb_select policy on
-- hr_leave_balances. security_invoker is deliberately NOT used even though
-- PG 15.6 supports it: the driving table of the open arm is `staff`, so
-- invoker mode would silently substitute staff's RLS for the leave-balance
-- rule that governs this data today -- a different, unaudited access model.

BEGIN;

CREATE OR REPLACE VIEW public.v_hr_leave_balance_src AS
-- ---------------------------------------------------------------------
-- OPEN YEARS: derive. Returns a row for every eligible staff x type pair
-- whether or not a ledger row exists -- this arm is what lets a staff
-- member created five minutes ago apply for leave with no admin action.
-- ---------------------------------------------------------------------
SELECT
  s.id                              AS employee_id,
  t.id                              AS leave_type_id,
  y.id                              AS hr_academic_year_id,
  t.hr_organization_id,
  t.leave_type_name,
  t.leave_type_code,
  t.request_category,
  t.color_code,
  t.display_order,
  t.duration_type,
  t.allow_half_day,
  t.allow_hourly,
  t.max_continuous_days,
  t.min_advance_notice_days,
  t.requires_documents,
  -- COALESCE, not truthiness: an override or frozen value of 0 is a real
  -- decision ("eligible, but no days") and must beat the default.
  COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)          AS entitled,
  COALESCE(b.used, 0)                                                     AS used,
  COALESCE(b.carried_forward, 0)                                          AS carried_forward,
  COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)
    + COALESCE(b.carried_forward, 0)
    - COALESCE(b.used, 0)                                                 AS available,
  CASE
    WHEN o.entitled_days IS NOT NULL THEN 'override'
    WHEN b.entitled      IS NOT NULL THEN 'frozen'
    ELSE 'policy'
  END                                                                     AS entitlement_source,
  b.created_at,
  b.updated_at
FROM public.hr_academic_years y
CROSS JOIN public.hr_leave_types t
JOIN public.hr_organizations org ON org.id = t.hr_organization_id
JOIN public.staff s
  ON s.institution_id = org.institution_id
 AND s.is_active
LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
LEFT JOIN public.hr_leave_balances b
  ON b.employee_id         = s.id
 AND b.leave_type_id       = t.id
 AND b.hr_academic_year_id = y.id
LEFT JOIN public.hr_leave_entitlement_overrides o
  ON o.employee_id         = s.id
 AND o.leave_type_id       = t.id
 AND o.hr_academic_year_id = y.id
WHERE y.frozen_at IS NULL
  AND t.is_active
  -- Eligibility rules preserved from generate_hr_leave_balances. All three
  -- are inert today (0 gender-restricted types, 0 cadre-restricted types,
  -- 1 assignment on test data), so this changes nothing now and stops a
  -- future maternity/cadre-restricted type being granted to everyone.
  AND (t.applicable_gender = 'all'
       OR lower(COALESCE(s.gender, '')) = t.applicable_gender)
  AND (t.applicable_cadre_ids IS NULL OR d.cadre_id = ANY(t.applicable_cadre_ids))
  AND (
    NOT EXISTS (
      SELECT 1 FROM public.hr_leave_type_assignments a
       WHERE a.leave_type_id = t.id AND a.is_active
    )
    OR EXISTS (
      SELECT 1 FROM public.hr_leave_type_assignments a
       WHERE a.leave_type_id = t.id
         AND a.is_active
         AND (
              (a.scope_kind = 'staff'      AND a.staff_id      = s.id)
           OR (a.scope_kind = 'department' AND a.department_id = s.department_id)
           OR (a.scope_kind = 'organization')
         )
    )
  )

UNION ALL

-- ---------------------------------------------------------------------
-- FROZEN YEARS: stored rows only, no cross join. History is served
-- exactly as recorded. An override still wins, so a past year can be
-- corrected deliberately.
-- ---------------------------------------------------------------------
SELECT
  b.employee_id,
  b.leave_type_id,
  b.hr_academic_year_id,
  b.hr_organization_id,
  t.leave_type_name,
  t.leave_type_code,
  t.request_category,
  t.color_code,
  t.display_order,
  t.duration_type,
  t.allow_half_day,
  t.allow_hourly,
  t.max_continuous_days,
  t.min_advance_notice_days,
  t.requires_documents,
  COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)          AS entitled,
  b.used,
  b.carried_forward,
  COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)
    + b.carried_forward - b.used                                          AS available,
  CASE
    WHEN o.entitled_days IS NOT NULL THEN 'override'
    WHEN b.entitled      IS NOT NULL THEN 'frozen'
    ELSE 'policy'
  END                                                                     AS entitlement_source,
  b.created_at,
  b.updated_at
FROM public.hr_leave_balances b
JOIN public.hr_academic_years y
  ON y.id = b.hr_academic_year_id
 AND y.frozen_at IS NOT NULL
JOIN public.hr_leave_types t ON t.id = b.leave_type_id
LEFT JOIN public.hr_leave_entitlement_overrides o
  ON o.employee_id         = b.employee_id
 AND o.leave_type_id       = b.leave_type_id
 AND o.hr_academic_year_id = b.hr_academic_year_id;

-- The derivation is internal. Only view owners (and therefore
-- v_hr_leave_balance and SECURITY DEFINER functions) may read it.
REVOKE ALL ON public.v_hr_leave_balance_src FROM anon, authenticated;

CREATE OR REPLACE VIEW public.v_hr_leave_balance AS
SELECT * FROM public.v_hr_leave_balance_src v
WHERE (SELECT public.is_super_admin())
   OR v.employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
   OR ((SELECT public.user_has_permission('hr.leave.approve'))
       AND v.hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())));

REVOKE ALL ON public.v_hr_leave_balance FROM anon;
GRANT SELECT ON public.v_hr_leave_balance TO authenticated;

-- Supporting index for the LEFT JOINs above.
CREATE INDEX IF NOT EXISTS idx_hlb_lookup
  ON public.hr_leave_balances (employee_id, leave_type_id, hr_academic_year_id);

COMMIT;
