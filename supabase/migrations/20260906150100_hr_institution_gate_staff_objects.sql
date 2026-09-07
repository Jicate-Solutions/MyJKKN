-- ============================================================================
-- INSTITUTIONS CAN BE EXCLUDED FROM THE HR MODULE (2026-09-06) — PART B
--
-- Part A gated the four ORG RESOLVERS, which covers the RLS path. This part
-- gates the four STAFF-LEVEL objects that already carry the CATEGORY gate, so
-- the two axes are enforced side by side in the same places:
--
--   v_hr_staff              -- the HR staff directory view
--   v_hr_leave_balance_src  -- (+ v_hr_leave_balance, which lists its columns
--                              explicitly and so must move with it)
--   fn_is_hr_staff          -- "is this person an HR employee"
--   fn_my_hr_context        -- hr_included, THE self-service gate
--
-- fn_my_hr_context IS THE WHOLE SELF-SERVICE STORY. Its hr_included column
-- already flows to hooks/hr/use-time-off-context.ts and from there to the
-- attendance and Time Off pages, which render "not an HR employee" when it is
-- false. ANDing the organization flag into it is all that is needed for staff of
-- an excluded institution to lose HR self-service — no page changes.
--
-- COALESCE(o.included_in_hr, false) ON THE LEFT JOIN, deliberately. An
-- institution with no hr_organizations row is not part of HR, and NULL must not
-- read as "included". The opposite default would let a mis-synced institution
-- silently keep access.
--
-- Still a no-op: all 14 organizations are included_in_hr = true.
--
-- NO EXPLICIT BEGIN/COMMIT — see the note in 20260905120000.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The HR staff directory
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_hr_staff AS
 SELECT s.id, s.first_name, s.last_name, s.gender, s.date_of_birth,
    s.marital_status, s.blood_group, s.email, s.phone, s.staff_id,
    s.profile_picture, s.address, s.state, s.district, s.pincode,
    s.date_of_joining, s.designation, s.category_id, s.institution_id,
    s.department_id, s.is_active, s.created_at, s.updated_at, s.created_by,
    s.updated_by, s.institution_email, s.profile_id, s.role_type,
    s.facilitator_certification, s.outcome_metrics, s.role_key,
    s.has_extended_profile, s.slug, s.status, s.display_order,
    s.experience_years, s.research_papers, s.phd_scholars, s.awards_won,
    s.pg_dissertations_guided, s.ug_projects_guided, s.qualification_summary,
    s.professional_summary, s.mentoring_description, s.google_scholar_url,
    s.researchgate_url, s.orcid_url, s.badges, s.qualifications,
    s.specialisations, s.experience_entries, s.research_focus_areas,
    s.publications, s.funded_projects, s.certifications, s.awards,
    s.memberships, s.phd_scholars_list, s.faqs, s.achievements,
    s.login_enabled, s.employment_type, s.bus_required, s.transport_route_id,
    s.transport_stop_id, s.tags, s.biometric_id, s.biometric_institution_id
   FROM staff s
     JOIN employment_categories ec ON ec.id = s.category_id
     -- The second axis. INNER JOIN on purpose: a staff row whose institution has
     -- no HR organization is not in HR either.
     JOIN hr_organizations o ON o.institution_id = s.institution_id
  WHERE ec.included_in_hr
    AND o.included_in_hr;

-- ---------------------------------------------------------------------------
-- 2. "Is this person an HR employee"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_is_hr_staff(p_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.staff s
      JOIN public.employment_categories ec ON ec.id = s.category_id
      JOIN public.hr_organizations o ON o.institution_id = s.institution_id
     WHERE s.id = p_staff_id
       AND ec.included_in_hr
       AND o.included_in_hr
  );
$function$;

-- ---------------------------------------------------------------------------
-- 3. The self-service gate
--
-- hr_included now means "this person's CATEGORY is in HR *and* their
-- INSTITUTION is". The join to hr_organizations was already here (LEFT, for the
-- organization id), so only the boolean changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_my_hr_context()
RETURNS TABLE(staff_id uuid, profile_id uuid, hr_organization_id uuid, institution_id uuid, first_name text, last_name text, email text, employee_code text, hr_included boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    s.id,
    s.profile_id,
    COALESCE(o.id, d.hr_organization_id),
    s.institution_id,
    s.first_name::text,
    s.last_name::text,
    s.email::text,
    COALESCE(d.hr_employee_code, s.staff_id)::text,
    COALESCE(ec.included_in_hr, false) AND COALESCE(o.included_in_hr, false)
  FROM public.staff s
  LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
  LEFT JOIN public.hr_organizations o ON o.institution_id = s.institution_id
  LEFT JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE s.profile_id = auth.uid()
    AND s.is_active
  LIMIT 1;
$function$;

-- ---------------------------------------------------------------------------
-- 4. The leave balance views
--
-- Body is 20260902160000 section 3 plus the organization gate on BOTH branches.
-- The frozen-year branch never joined hr_organizations at all, so without the
-- new join an excluded institution would keep showing its frozen-year balances
-- while its live-year ones vanished — a half-applied gate is worse than none.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_hr_leave_balance_src AS
 SELECT s.id AS employee_id,
    t.id AS leave_type_id,
    y.id AS hr_academic_year_id,
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
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) AS entitled,
    COALESCE(b.used, 0::numeric) AS used,
    COALESCE(b.carried_forward, 0::numeric) AS carried_forward,
    -- available now nets off BOTH what has been taken and what is awaiting a
    -- decision, and is capped by what has actually accrued.
    --
    -- Calls the IMMUTABLE arithmetic on columns already in scope rather than the
    -- querying wrapper: 7,471 rows x a function that reads three tables would
    -- have turned a 12 ms view into thousands of queries. Pending arrives
    -- pre-aggregated from the join below for the same reason.
    public.fn_hr_leave_accrual_days(
      t.accrual_type, t.accrual_rate,
      COALESCE(o.entitled_days, b.entitled, t.default_entitled_days),
      y.start_date, s.date_of_joining, CURRENT_DATE)
      + COALESCE(b.carried_forward, 0::numeric)
      - COALESCE(b.used, 0::numeric)
      - COALESCE(pend.pending_days, 0::numeric) AS available,
        CASE
            WHEN o.entitled_days IS NOT NULL THEN 'override'::text
            WHEN b.entitled IS NOT NULL THEN 'frozen'::text
            ELSE 'policy'::text
        END AS entitlement_source,
    b.created_at,
    b.updated_at,
    t.document_required_after_days,
    public.fn_hr_leave_accrual_days(
      t.accrual_type, t.accrual_rate,
      COALESCE(o.entitled_days, b.entitled, t.default_entitled_days),
      y.start_date, s.date_of_joining, CURRENT_DATE) AS accrued,
    COALESCE(pend.pending_days, 0::numeric) AS pending
   FROM hr_academic_years y
     CROSS JOIN hr_leave_types t
     JOIN hr_organizations org ON org.id = t.hr_organization_id AND org.included_in_hr
     JOIN staff s ON s.institution_id = org.institution_id AND s.is_active
     JOIN employment_categories sec ON sec.id = s.category_id AND sec.included_in_hr
     LEFT JOIN hr_staff_details d ON d.staff_id = s.id
     LEFT JOIN hr_leave_balances b ON b.employee_id = s.id AND b.leave_type_id = t.id AND b.hr_academic_year_id = y.id
     LEFT JOIN hr_leave_entitlement_overrides o ON o.employee_id = s.id AND o.leave_type_id = t.id AND o.hr_academic_year_id = y.id
     -- ONE pass over the 354 unapproved day-leave rows, not one lookup per
     -- balance row. Days are counted with hr_calc_leave_days, the same function
     -- the cap trigger uses, so a day is never counted two ways.
     LEFT JOIN (
       SELECT a.employee_id, a.leave_type_id, a.hr_academic_year_id,
              sum(public.hr_calc_leave_days(
                    a.start_date, a.end_date, a.duration_type,
                    COALESCE(lt.skip_weekends, true), COALESCE(lt.skip_holidays, true),
                    a.hr_organization_id, a.employee_id)) AS pending_days
         FROM hr_leave_applications a
         JOIN hr_leave_types lt ON lt.id = a.leave_type_id
        WHERE a.status IN ('pending', 'escalated')
          AND lt.request_category = 'leave'
        GROUP BY a.employee_id, a.leave_type_id, a.hr_academic_year_id
     ) pend ON pend.employee_id = s.id AND pend.leave_type_id = t.id
           AND pend.hr_academic_year_id = y.id
  WHERE y.frozen_at IS NULL AND t.is_active
    AND (t.applicable_gender::text = 'all'::text OR lower(COALESCE(s.gender, ''::text)) = t.applicable_gender::text)
    AND (t.applicable_cadre_ids IS NULL OR (d.cadre_id = ANY (t.applicable_cadre_ids)))
    AND (NOT (EXISTS ( SELECT 1 FROM hr_leave_type_assignments a WHERE a.leave_type_id = t.id AND a.is_active))
         OR (EXISTS ( SELECT 1 FROM hr_leave_type_assignments a
              WHERE a.leave_type_id = t.id AND a.is_active
                AND (a.scope_kind::text = 'staff'::text AND a.staff_id = s.id
                     OR a.scope_kind::text = 'department'::text AND a.department_id = s.department_id
                     OR a.scope_kind::text = 'organization'::text))))
UNION ALL
 SELECT b.employee_id,
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
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) AS entitled,
    b.used,
    b.carried_forward,
    -- A FROZEN year does not accrue and takes no new requests, so its available
    -- stays the arithmetic it always was. Recomputing accrual against a closed
    -- year would rewrite history every time the clock moved.
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) + b.carried_forward - b.used AS available,
        CASE
            WHEN o.entitled_days IS NOT NULL THEN 'override'::text
            WHEN b.entitled IS NOT NULL THEN 'frozen'::text
            ELSE 'policy'::text
        END AS entitlement_source,
    b.created_at,
    b.updated_at,
    t.document_required_after_days,
    COALESCE(o.entitled_days, b.entitled, t.default_entitled_days) AS accrued,
    0::numeric AS pending
   FROM hr_leave_balances b
     JOIN hr_academic_years y ON y.id = b.hr_academic_year_id AND y.frozen_at IS NOT NULL
     JOIN hr_leave_types t ON t.id = b.leave_type_id
     JOIN hr_organizations forg ON forg.id = b.hr_organization_id AND forg.included_in_hr
     JOIN staff fs ON fs.id = b.employee_id
     JOIN employment_categories fec ON fec.id = fs.category_id AND fec.included_in_hr
     LEFT JOIN hr_leave_entitlement_overrides o ON o.employee_id = b.employee_id AND o.leave_type_id = b.leave_type_id AND o.hr_academic_year_id = b.hr_academic_year_id;

CREATE OR REPLACE VIEW public.v_hr_leave_balance AS
 SELECT v.employee_id,
    v.leave_type_id,
    v.hr_academic_year_id,
    v.hr_organization_id,
    v.leave_type_name,
    v.leave_type_code,
    v.request_category,
    v.color_code,
    v.display_order,
    v.duration_type,
    v.allow_half_day,
    v.allow_hourly,
    v.max_continuous_days,
    v.min_advance_notice_days,
    v.requires_documents,
    v.entitled,
    v.used,
    v.carried_forward,
    v.available,
    v.entitlement_source,
    v.created_at,
    v.updated_at,
    v.document_required_after_days,
    v.accrued,
    v.pending
   FROM v_hr_leave_balance_src v
  WHERE ( SELECT is_super_admin() AS is_super_admin)
     OR (v.employee_id IN ( SELECT unnest(fn_my_staff_ids()) AS unnest))
     OR ( SELECT user_has_permission('hr.leave.approve'::text) AS user_has_permission)
        AND (v.hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest));

-- ---------------------------------------------------------------------------
-- 4. The database becomes the gate, not just the service
--
-- LeaveService already refuses an over-balance request and produces the friendly
-- message. It stays -- but it is TypeScript only, and that file's own comments
-- record the check being bypassed once already when `error` went undestructured
-- and `balance` came back undefined. A reservation that can be skipped by a
-- service-layer slip is not a reservation.
--
-- Enforced for request_category='leave' ONLY, matching the service and
-- hr_trig_update_leave_balance exactly. Comp off is credit-backed and STO is
-- minute-backed; applying a day entitlement to either refused every comp-off
-- claim the last time it was tried.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_trig_leave_enforce_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  t          record;
  v_this     numeric;
  v_accrued  numeric;
  v_carried  numeric;
  v_used     numeric;
  v_pending  numeric;
  v_avail    numeric;
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'escalated') THEN
    RETURN NEW;
  END IF;

  SELECT request_category, leave_type_name, skip_weekends, skip_holidays
    INTO t
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;

  IF t.request_category IS DISTINCT FROM 'leave' THEN
    RETURN NEW;
  END IF;

  v_this := public.hr_calc_leave_days(
    NEW.start_date, NEW.end_date, NEW.duration_type,
    COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
    NEW.hr_organization_id, NEW.employee_id);

  -- Serialised per (employee, leave type) exactly as the period cap is, so two
  -- requests submitted at once cannot both read the same free balance.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.employee_id::text || ':' || NEW.leave_type_id::text || ':bal', 0));

  v_accrued := public.fn_hr_leave_accrued_days(
    NEW.employee_id, NEW.leave_type_id, NEW.hr_academic_year_id, NEW.start_date);

  SELECT COALESCE(carried_forward, 0), COALESCE(used, 0)
    INTO v_carried, v_used
  FROM public.hr_leave_balances
  WHERE employee_id = NEW.employee_id
    AND leave_type_id = NEW.leave_type_id
    AND hr_academic_year_id = NEW.hr_academic_year_id;

  v_carried := COALESCE(v_carried, 0);
  v_used    := COALESCE(v_used, 0);

  -- Excludes this row, so an UPDATE that merely re-saves an existing request
  -- does not count itself twice.
  SELECT COALESCE(sum(
           public.hr_calc_leave_days(
             a.start_date, a.end_date, a.duration_type,
             COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
             a.hr_organization_id, a.employee_id)), 0)
    INTO v_pending
  FROM public.hr_leave_applications a
  WHERE a.employee_id         = NEW.employee_id
    AND a.leave_type_id       = NEW.leave_type_id
    AND a.hr_academic_year_id IS NOT DISTINCT FROM NEW.hr_academic_year_id
    AND a.id IS DISTINCT FROM NEW.id
    AND a.status IN ('pending', 'escalated');

  v_avail := v_accrued + v_carried - v_used - v_pending;

  IF v_this > v_avail THEN
    RAISE EXCEPTION
      'Insufficient % balance: % day(s) available (% accrued, % taken, % awaiting approval); this request needs %.',
      t.leave_type_name, v_avail, v_accrued, v_used, v_pending, v_this
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.hr_trig_leave_enforce_balance() IS
  'Refuses a day-leave request that exceeds accrued + carried - taken - already-pending. The database gate behind LeaveService''s friendly message.';

DROP TRIGGER IF EXISTS trg_hla_balance_guard ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_balance_guard
  BEFORE INSERT OR UPDATE OF start_date, end_date, duration_type, leave_type_id, status
  ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_leave_enforce_balance();

-- ---------------------------------------------------------------------------
--
-- This file is timestamped 20260902160000, but the body actually applied is
-- recorded as 20260902112409 and is 13,892 characters that do not contain the
-- function. It was appended to the file after the migration had already been
-- applied, so the database never had it: the other four functions from this
-- migration are present in pg_proc and that one was absent.
--
-- Removed rather than left in place, because a migration directory that claims
-- work it never did is worse than one that is merely incomplete -- replaying
-- this file would have created a function production never had, and reading it
-- told you a screen was backed by an RPC that did not exist. Its REVOKE/GRANT
-- pair went with it; both would have failed on a replay against a function
-- that no longer gets created here.
--
-- The month-by-month breakdown now lives in 20260905120000 (and is reshaped by
-- 20260905120200) as fn_hr_leave_monthly_ledger, applied and recorded.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 6. Grants. A new function is executable by PUBLIC (which includes anon).
-- ---------------------------------------------------------------------------
