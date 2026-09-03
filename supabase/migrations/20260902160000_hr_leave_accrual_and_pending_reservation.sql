-- ============================================================================
-- LEAVE: PENDING REQUESTS NOW RESERVE BALANCE, AND MONTHLY ACCRUAL EXISTS
-- (2026-09-02)
--
-- TWO PROBLEMS, ONE MIGRATION.
--
-- 1. A PENDING REQUEST RESERVED NOTHING. hr_trig_update_leave_balance()
--    increments hr_leave_balances.used only when a status becomes 'approved',
--    so every unapproved request was invisible to the apply-time check
--    (available = entitled + carried_forward - used). Apply for two days, then
--    apply again, and the second request saw the full balance. Measured before
--    this migration: 354 pending applications, 371 days the balance could not
--    see.
--
--    The per-period cap trigger DOES count pending correctly -- but it only
--    fires for types carrying leave_limit_period, which is CL (2/month) and
--    Clinical (15/year) alone. On-Duty, Clinical Duty and Vacation have no cap
--    at all, so nothing limited them.
--
-- 2. "ONE DAY A MONTH, UNUSED CARRIES FORWARD" WAS NEVER BUILT.
--    leave_max_days_per_period is a hard CEILING -- never more than N in a
--    month, unused is lost. accrual_type ('none'|'annual'|'monthly') and
--    accrual_rate have existed on hr_leave_types since 20260721120000 and
--    NOTHING has ever read them: only the admin form that writes them and the
--    migrations that seed defaults.
--
-- ACCRUAL IS COMPUTED, NEVER MATERIALISED. Accrued-to-date is a function of the
-- calendar, so it is derived on read -- no cron job, no per-month rows, nothing
-- to backfill or drift:
--
--     accrued(on) = LEAST(entitled, months_elapsed(year_start -> on) * rate)
--
-- "Carry forward within the year" then falls out for free: accrual is
-- cumulative, so a month in which nothing was taken simply leaves a larger
-- balance. There is no separate carry-forward step to schedule or get wrong.
--
-- OPT-IN, SO NOTHING CHANGES TODAY. When accrual_type <> 'monthly' the accrued
-- figure is the full default_entitled_days, exactly as now. All ten live types
-- are 'none', so no existing balance moves until a type is switched over.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Accrued days as at a date
--
-- The year bounds come from hr_leave_period_window('year', ...) rather than a
-- second reading of hr_academic_years, so accrual and the period cap can never
-- disagree about where a year starts. HR years run 1 June -> 31 May.
--
-- A MID-YEAR JOINER ACCRUES FROM THEIR JOINING MONTH, not the year start.
-- Crediting somebody who joined in September with June, July and August would
-- hand them three days they never earned.
--
-- EVALUATED AS AT p_on, WHICH IS THE REQUEST'S START DATE, not today -- the
-- same convention hr_leave_period_usage already uses. Applying in October for
-- days in December must not borrow accrual that has not happened yet.
-- ---------------------------------------------------------------------------
-- THE ARITHMETIC, AS A PURE FUNCTION.
--
-- Split out from the lookup wrapper below for one reason: the balance VIEW
-- returns 7,471 rows, and calling a querying function once per row would have
-- meant ~22,000 extra queries on a view that currently answers in 12 ms. This
-- one is IMMUTABLE and touches no table, so the view can call it inline on
-- columns it has already joined, at arithmetic cost.
--
-- The wrapper does the lookups and delegates here, so there is still exactly
-- ONE definition of how accrual is computed. Duplicating the CASE expression
-- into the view would have been the cheap fix and the one that drifts.
CREATE OR REPLACE FUNCTION public.fn_hr_leave_accrual_days(
  p_accrual_type text,
  p_accrual_rate numeric,
  p_entitled     numeric,
  p_year_start   date,
  p_joined_on    date,
  p_on           date
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    -- Not an accruing type: the whole entitlement is available from day one,
    -- which is what every type does today. This branch is what makes the
    -- migration a no-op until somebody opts a type in.
    WHEN p_accrual_type IS DISTINCT FROM 'monthly' OR COALESCE(p_accrual_rate, 0) <= 0
      THEN COALESCE(p_entitled, 0)
    WHEN p_year_start IS NULL OR p_on IS NULL
      THEN COALESCE(p_entitled, 0)
    -- Before the year started, or before they joined, nothing has accrued.
    WHEN p_on < GREATEST(p_year_start, COALESCE(p_joined_on, p_year_start))
      THEN 0
    ELSE LEAST(
      COALESCE(p_entitled, 0),
      GREATEST(0,
        (EXTRACT(YEAR  FROM p_on)::int
         - EXTRACT(YEAR FROM GREATEST(p_year_start, COALESCE(p_joined_on, p_year_start)))::int) * 12
      + (EXTRACT(MONTH FROM p_on)::int
         - EXTRACT(MONTH FROM GREATEST(p_year_start, COALESCE(p_joined_on, p_year_start)))::int)
      + 1
      ) * p_accrual_rate)
  END;
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_accrual_days(text, numeric, numeric, date, date, date) IS
  'Pure monthly-accrual arithmetic: cumulative months x rate, capped at entitlement, counting the month of p_on and starting no earlier than the joining month. IMMUTABLE so the balance view can call it per row without I/O.';

CREATE OR REPLACE FUNCTION public.fn_hr_leave_accrued_days(
  p_staff_id            uuid,
  p_leave_type_id       uuid,
  p_hr_academic_year_id uuid DEFAULT NULL,
  p_on                  date DEFAULT CURRENT_DATE
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t            record;
  w            record;
  v_entitled   numeric;
  v_joined     date;
  v_from       date;
BEGIN
  SELECT accrual_type, accrual_rate, default_entitled_days, request_category
    INTO t
  FROM public.hr_leave_types
  WHERE id = p_leave_type_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- The entitlement an override or a frozen balance may already have replaced.
  -- Read the same way v_hr_leave_balance_src does, so accrual is capped at the
  -- figure the balance actually shows rather than the type's default.
  SELECT COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)
    INTO v_entitled
  FROM (SELECT 1) _
  LEFT JOIN public.hr_leave_entitlement_overrides o
    ON o.employee_id = p_staff_id AND o.leave_type_id = p_leave_type_id
   AND o.hr_academic_year_id = p_hr_academic_year_id
  LEFT JOIN public.hr_leave_balances b
    ON b.employee_id = p_staff_id AND b.leave_type_id = p_leave_type_id
   AND b.hr_academic_year_id = p_hr_academic_year_id;

  v_entitled := COALESCE(v_entitled, t.default_entitled_days, 0);

  IF t.accrual_type IS DISTINCT FROM 'monthly' OR COALESCE(t.accrual_rate, 0) <= 0 THEN
    RETURN v_entitled;
  END IF;

  SELECT * INTO w FROM public.hr_leave_period_window('year', p_hr_academic_year_id, p_on);
  SELECT date_of_joining INTO v_joined FROM public.staff WHERE id = p_staff_id;

  -- Delegates: the arithmetic lives in exactly one place, and the view calls
  -- that same place inline.
  RETURN public.fn_hr_leave_accrual_days(
    t.accrual_type, t.accrual_rate, v_entitled, w.period_start, v_joined, p_on);
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_accrued_days(uuid, uuid, uuid, date) IS
  'Days accrued for one staff member and leave type as at a date. Monthly accrual is cumulative, so unused days carry forward within the year for free. Returns the full entitlement for any type that is not accrual_type = monthly, which is every type today.';

-- ---------------------------------------------------------------------------
-- 2. Days already spoken for by unapproved requests
--
-- Uses hr_calc_leave_days -- the same function the period cap and
-- hr_leave_period_usage use -- so a day is never counted one way here and
-- another way there.
--
-- 'pending' and 'escalated' only. A rejected, cancelled or withdrawn request
-- releases its days by simply dropping out of this sum, which is what makes the
-- reservation reversible with no ledger entry to unwind.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_leave_pending_days(
  p_staff_id            uuid,
  p_leave_type_id       uuid,
  p_hr_academic_year_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(sum(
           public.hr_calc_leave_days(
             a.start_date, a.end_date, a.duration_type,
             COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
             a.hr_organization_id, a.employee_id)
         ), 0)
    FROM public.hr_leave_applications a
    JOIN public.hr_leave_types t ON t.id = a.leave_type_id
   WHERE a.employee_id   = p_staff_id
     AND a.leave_type_id = p_leave_type_id
     AND (p_hr_academic_year_id IS NULL
          OR a.hr_academic_year_id = p_hr_academic_year_id)
     AND a.status IN ('pending', 'escalated')
     -- Comp off is credit-backed and short time off is minute-backed; neither
     -- draws on a day entitlement, and charging them one refused 100% of
     -- comp-off claims the last time it was tried.
     AND t.request_category = 'leave';
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_pending_days(uuid, uuid, uuid) IS
  'Day-leave days awaiting approval. Subtracted from available so a second request cannot spend what a first one has already claimed.';

-- ---------------------------------------------------------------------------
-- 3. The balance views gain `accrued` and `pending`
--
-- `entitled` and `used` keep their present meanings -- the ledger is NOT
-- rewritten. That is what keeps existing reports honest and makes this
-- reversible: available becomes a different expression over the same facts.
--
-- New columns are appended, because CREATE OR REPLACE VIEW can only add at the
-- end. Both views move together: the outer one lists its columns explicitly, so
-- adding to _src alone would leave the new columns unreachable.
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
     JOIN hr_organizations org ON org.id = t.hr_organization_id
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
-- 5. Month-by-month breakdown for the Balance tab
--
-- One call per (staff, type, year) instead of twelve round trips. Accrued is
-- cumulative-to-that-month; taken and pending are what falls IN that month, so
-- the columns read the way a payslip does.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_leave_monthly_breakdown(
  p_staff_id            uuid,
  p_leave_type_id       uuid,
  p_hr_academic_year_id uuid DEFAULT NULL
)
RETURNS TABLE(
  month_start date,
  accrued     numeric,
  taken       numeric,
  pending     numeric,
  balance     numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w record;
  t record;
BEGIN
  IF NOT public.is_super_admin()
     AND NOT (p_staff_id IN (SELECT unnest(public.fn_my_staff_ids())))
     AND NOT public.user_has_permission('hr.leave.approve') THEN
    RAISE EXCEPTION 'Not authorized to read this balance';
  END IF;

  SELECT skip_weekends, skip_holidays INTO t
    FROM public.hr_leave_types WHERE id = p_leave_type_id;

  SELECT * INTO w FROM public.hr_leave_period_window(
    'year', p_hr_academic_year_id, CURRENT_DATE);
  IF w.period_start IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(w.period_start, w.period_end, interval '1 month')::date AS m
  )
  SELECT m.m,
         public.fn_hr_leave_accrued_days(
           p_staff_id, p_leave_type_id, p_hr_academic_year_id,
           LEAST((m.m + interval '1 month - 1 day')::date, w.period_end)),
         COALESCE((
           SELECT sum(public.hr_calc_leave_days(a.start_date, a.end_date, a.duration_type,
                        COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
                        a.hr_organization_id, a.employee_id))
             FROM public.hr_leave_applications a
            WHERE a.employee_id = p_staff_id AND a.leave_type_id = p_leave_type_id
              AND a.status = 'approved'
              AND date_trunc('month', a.start_date) = m.m), 0),
         COALESCE((
           SELECT sum(public.hr_calc_leave_days(a.start_date, a.end_date, a.duration_type,
                        COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
                        a.hr_organization_id, a.employee_id))
             FROM public.hr_leave_applications a
            WHERE a.employee_id = p_staff_id AND a.leave_type_id = p_leave_type_id
              AND a.status IN ('pending','escalated')
              AND date_trunc('month', a.start_date) = m.m), 0),
         -- Running balance: everything accrued by this month, less everything
         -- taken or claimed up to and including it.
         public.fn_hr_leave_accrued_days(
           p_staff_id, p_leave_type_id, p_hr_academic_year_id,
           LEAST((m.m + interval '1 month - 1 day')::date, w.period_end))
         - COALESCE((
             SELECT sum(public.hr_calc_leave_days(a.start_date, a.end_date, a.duration_type,
                          COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
                          a.hr_organization_id, a.employee_id))
               FROM public.hr_leave_applications a
              WHERE a.employee_id = p_staff_id AND a.leave_type_id = p_leave_type_id
                AND a.status IN ('approved','pending','escalated')
                AND a.start_date <= LEAST((m.m + interval '1 month - 1 day')::date, w.period_end)
                AND a.start_date >= w.period_start), 0)
    FROM months m
   ORDER BY m.m;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Grants. A new function is executable by PUBLIC (which includes anon).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_hr_leave_accrued_days(uuid, uuid, uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_hr_leave_pending_days(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_hr_leave_monthly_breakdown(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_trig_leave_enforce_balance() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_hr_leave_accrued_days(uuid, uuid, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_pending_days(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_monthly_breakdown(uuid, uuid, uuid) TO authenticated, service_role;

COMMIT;
