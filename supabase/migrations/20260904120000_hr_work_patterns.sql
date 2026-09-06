-- Work patterns: a per-staff working week that drives shift hours, weekly-off
-- stamping, leave entitlement and the salary day-rate.
--
-- WHY THIS EXISTS (2026-09-04)
--
-- JKKN Dental College employs people on three weekly shapes — 6 days (Mon–Sat,
-- 12 CL), 5 days (Mon–Fri, 6 CL) and 3 days (e.g. Tue/Wed/Thu, 0 CL) — each
-- with its own hours, and pays the 5- and 3-day staff on THEIR OWN scheduled
-- days rather than the institution's 26-day month. Nothing in the module could
-- say that: hr_shift_timings resolves per institution × category × gender with
-- no per-person level, CL comes from the leave type's default, and the salary
-- register divides by the closed month's working_days_count (the max across
-- staff). A 3-day person would have been charged ~13 unpaid days a month.
--
-- SHAPE
--
--   hr_work_patterns                     the named week, per institution
--   hr_shift_timings.work_pattern_id     the pattern's 7 rows live HERE, as a
--                                        new staff_scope = 'work_pattern', so
--                                        effective dating, second Saturday,
--                                        the weekly grid and the recompute all
--                                        come for free
--   hr_staff_work_pattern_assignments    who is on which pattern, from when
--   hr_work_pattern_leave_entitlements   days per leave type for the pattern
--
-- THE PATTERN IS EXCLUSIVE, NOT MERELY PREFERRED. When a staff member holds a
-- pattern on a date, fn_shift_timing_pick matches ONLY that pattern's rows and
-- returns nothing on a gap. Falling back to the institution week would mark a
-- Tue/Wed/Thu person's Saturday as working, then ABSENT, then loss of pay.
-- Gaps cannot happen in practice: fn_hr_assign_work_pattern refuses a pattern
-- whose week does not cover the effective date, and fn_save_shift_timing_week
-- always writes all seven days.
--
-- STAFF WITHOUT A PATTERN RESOLVE EXACTLY AS BEFORE. Every new predicate is
-- keyed on a NULL pattern id, so the other thirteen institutions see no change
-- until they create one.
--
-- ORDER IN THIS FILE IS LOAD-BEARING: the column is added before
-- fn_shift_timing_pick is recreated (it RETURNS SETOF hr_shift_timings); the
-- 6-argument pick is DROPPED before the 7-argument one is created (a defaulted
-- parameter makes a new overload, and two overloads make every existing call
-- ambiguous — 42725); the partial unique index is dropped and recreated in
-- this one transaction.

-- ============================================================================
-- 1 · Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hr_work_patterns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES public.profiles(id),
  updated_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_work_patterns_name_chk CHECK (length(btrim(name)) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_work_patterns_name_uq
  ON public.hr_work_patterns (institution_id, lower(btrim(name)))
  WHERE is_active;
CREATE INDEX IF NOT EXISTS hr_work_patterns_institution_idx
  ON public.hr_work_patterns (institution_id);

ALTER TABLE public.hr_work_patterns ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.hr_work_patterns IS
  'A named working week for one institution (e.g. "3-day Tue/Wed/Thu"). Its hours are the hr_shift_timings rows with staff_scope=work_pattern; its leave figures are hr_work_pattern_leave_entitlements; who is on it is hr_staff_work_pattern_assignments.';

-- Who is on which pattern, from when. effective_until is EXCLUSIVE, like
-- hr_shift_timings. One pattern per person per day is a constraint, not a
-- convention, because the resolver has to give one answer.
CREATE TABLE IF NOT EXISTS public.hr_staff_work_pattern_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id         uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  work_pattern_id  uuid NOT NULL REFERENCES public.hr_work_patterns(id) ON DELETE RESTRICT,
  -- Denormalised from the pattern by t10_wpa_stamp_institution so RLS can
  -- scope on it without a join. The trigger also refuses a pattern from
  -- another institution than the staff member's.
  institution_id   uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  effective_from   date NOT NULL,
  effective_until  date,
  notes            text,
  created_by       uuid REFERENCES public.profiles(id),
  updated_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_swpa_effective_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
  CONSTRAINT hr_swpa_no_overlap EXCLUDE USING gist (
    staff_id WITH =,
    daterange(effective_from, effective_until, '[)') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS hr_swpa_staff_idx
  ON public.hr_staff_work_pattern_assignments (staff_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS hr_swpa_pattern_idx
  ON public.hr_staff_work_pattern_assignments (work_pattern_id);
CREATE INDEX IF NOT EXISTS hr_swpa_institution_idx
  ON public.hr_staff_work_pattern_assignments (institution_id);

ALTER TABLE public.hr_staff_work_pattern_assignments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.hr_staff_work_pattern_assignments IS
  'Effective-dated membership of a staff member in a work pattern. Written ONLY by fn_hr_assign_work_pattern, which also resyncs open leave balances. effective_until is exclusive.';

-- Days per leave type for a pattern. Only request_category=leave types belong
-- here: short time off is minute-backed and comp-off is credit-backed, and a
-- day figure on either would be a lie nothing reads (see
-- 20260828190000_hr_sto_entitled_days_uncapped.sql).
CREATE TABLE IF NOT EXISTS public.hr_work_pattern_leave_entitlements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_pattern_id  uuid NOT NULL REFERENCES public.hr_work_patterns(id) ON DELETE CASCADE,
  leave_type_id    uuid NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE CASCADE,
  entitled_days    numeric(6,2) NOT NULL CHECK (entitled_days >= 0),
  created_by       uuid REFERENCES public.profiles(id),
  updated_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_wple_pattern_type_uq UNIQUE (work_pattern_id, leave_type_id)
);

CREATE INDEX IF NOT EXISTS hr_wple_leave_type_idx
  ON public.hr_work_pattern_leave_entitlements (leave_type_id);

ALTER TABLE public.hr_work_pattern_leave_entitlements ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.hr_work_pattern_leave_entitlements IS
  'Entitled days per (work pattern, leave type). Read by generate_hr_leave_balances (between a staff-level assignment and department/organization ones) and by fn_hr_assign_work_pattern when it resyncs open balances.';

-- updated_at, same helper every HR table uses.
DROP TRIGGER IF EXISTS hr_work_patterns_updated_at ON public.hr_work_patterns;
CREATE TRIGGER hr_work_patterns_updated_at
  BEFORE UPDATE ON public.hr_work_patterns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS hr_swpa_updated_at ON public.hr_staff_work_pattern_assignments;
CREATE TRIGGER hr_swpa_updated_at
  BEFORE UPDATE ON public.hr_staff_work_pattern_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS hr_wple_updated_at ON public.hr_work_pattern_leave_entitlements;
CREATE TRIGGER hr_wple_updated_at
  BEFORE UPDATE ON public.hr_work_pattern_leave_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 1a · Integrity triggers
-- ----------------------------------------------------------------------------

-- The assignment's institution is the pattern's, and it must be the staff
-- member's too. A wrong institution_id here would grant cross-institution
-- visibility through role_has_institution_access, which is the only scope
-- predicate in the table's RLS.
CREATE OR REPLACE FUNCTION public.trg_wpa_stamp_institution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pattern_inst uuid;
  v_staff_inst   uuid;
BEGIN
  SELECT institution_id INTO v_pattern_inst FROM public.hr_work_patterns WHERE id = NEW.work_pattern_id;
  SELECT institution_id INTO v_staff_inst   FROM public.staff            WHERE id = NEW.staff_id;

  IF v_pattern_inst IS NULL THEN
    RAISE EXCEPTION 'Work pattern % not found', NEW.work_pattern_id USING ERRCODE = 'P0002';
  END IF;
  IF v_staff_inst IS DISTINCT FROM v_pattern_inst THEN
    RAISE EXCEPTION 'Staff member works at a different institution from the work pattern'
      USING ERRCODE = '23514';
  END IF;

  NEW.institution_id := v_pattern_inst;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS t10_wpa_stamp_institution ON public.hr_staff_work_pattern_assignments;
CREATE TRIGGER t10_wpa_stamp_institution
  BEFORE INSERT OR UPDATE OF staff_id, work_pattern_id, institution_id
  ON public.hr_staff_work_pattern_assignments
  FOR EACH ROW EXECUTE FUNCTION public.trg_wpa_stamp_institution();

-- A pattern's leave figures must name leave types of the pattern's own
-- institution (hr_organizations map 1:1 to institutions), and only day-based
-- ones.
CREATE OR REPLACE FUNCTION public.trg_wple_same_institution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pattern_inst uuid;
  v_type_inst    uuid;
  v_category     text;
BEGIN
  SELECT p.institution_id INTO v_pattern_inst
    FROM public.hr_work_patterns p WHERE p.id = NEW.work_pattern_id;

  SELECT o.institution_id, t.request_category INTO v_type_inst, v_category
    FROM public.hr_leave_types t
    JOIN public.hr_organizations o ON o.id = t.hr_organization_id
   WHERE t.id = NEW.leave_type_id;

  IF v_type_inst IS NULL THEN
    RAISE EXCEPTION 'Leave type % not found', NEW.leave_type_id USING ERRCODE = 'P0002';
  END IF;
  IF v_type_inst IS DISTINCT FROM v_pattern_inst THEN
    RAISE EXCEPTION 'Leave type belongs to a different institution from the work pattern'
      USING ERRCODE = '23514';
  END IF;
  IF v_category IS DISTINCT FROM 'leave' THEN
    RAISE EXCEPTION 'Only day-based leave types can carry a work-pattern entitlement (this one is %)', v_category
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS t10_wple_same_institution ON public.hr_work_pattern_leave_entitlements;
CREATE TRIGGER t10_wple_same_institution
  BEFORE INSERT OR UPDATE OF work_pattern_id, leave_type_id
  ON public.hr_work_pattern_leave_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.trg_wple_same_institution();

-- Retiring a pattern that people still hold would leave them resolving to
-- nothing (the pattern is exclusive). End their assignments first.
CREATE OR REPLACE FUNCTION public.trg_wp_guard_deactivate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_live integer;
BEGIN
  IF OLD.is_active AND NOT NEW.is_active THEN
    SELECT count(*) INTO v_live
      FROM public.hr_staff_work_pattern_assignments a
     WHERE a.work_pattern_id = NEW.id
       AND (a.effective_until IS NULL OR a.effective_until > CURRENT_DATE);
    IF v_live > 0 THEN
      RAISE EXCEPTION '% staff member(s) are still on this work pattern. Remove them before deactivating it.', v_live
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS t10_wp_guard_deactivate ON public.hr_work_patterns;
CREATE TRIGGER t10_wp_guard_deactivate
  BEFORE UPDATE OF is_active ON public.hr_work_patterns
  FOR EACH ROW EXECUTE FUNCTION public.trg_wp_guard_deactivate();

-- ----------------------------------------------------------------------------
-- 1b · Row level security — the same gates as hr_shift_timings
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS hr_work_patterns_select ON public.hr_work_patterns;
CREATE POLICY hr_work_patterns_select ON public.hr_work_patterns
  FOR SELECT USING (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (((SELECT public.user_has_permission('hr.shift_timings.view'))
         OR (SELECT public.user_has_permission('hr.shift_timings.manage')))
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hr_work_patterns_write ON public.hr_work_patterns;
CREATE POLICY hr_work_patterns_write ON public.hr_work_patterns
  FOR ALL USING (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(institution_id))
  ) WITH CHECK (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(institution_id))
  );

-- Assignments: HR reads by institution; a staff member reads their own row.
-- Writes are the RPC's job (SECURITY DEFINER, so it is not subject to this);
-- a direct write is left to super admins only.
DROP POLICY IF EXISTS hr_swpa_select ON public.hr_staff_work_pattern_assignments;
CREATE POLICY hr_swpa_select ON public.hr_staff_work_pattern_assignments
  FOR SELECT USING (
       (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (((SELECT public.user_has_permission('hr.shift_timings.view'))
         OR (SELECT public.user_has_permission('hr.shift_timings.manage')))
        AND public.role_has_institution_access(institution_id))
    OR staff_id = ANY (public.fn_my_staff_ids())
  );

DROP POLICY IF EXISTS hr_swpa_write ON public.hr_staff_work_pattern_assignments;
CREATE POLICY hr_swpa_write ON public.hr_staff_work_pattern_assignments
  FOR ALL USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS hr_wple_select ON public.hr_work_pattern_leave_entitlements;
CREATE POLICY hr_wple_select ON public.hr_work_pattern_leave_entitlements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.hr_work_patterns p
       WHERE p.id = work_pattern_id
         AND (   (SELECT public.is_super_admin())
              OR (SELECT public.is_admin())
              OR (((SELECT public.user_has_permission('hr.shift_timings.view'))
                   OR (SELECT public.user_has_permission('hr.shift_timings.manage')))
                  AND public.role_has_institution_access(p.institution_id)))
    )
  );

DROP POLICY IF EXISTS hr_wple_write ON public.hr_work_pattern_leave_entitlements;
CREATE POLICY hr_wple_write ON public.hr_work_pattern_leave_entitlements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.hr_work_patterns p
       WHERE p.id = work_pattern_id
         AND (   (SELECT public.is_super_admin())
              OR (SELECT public.is_admin())
              OR ((SELECT public.user_has_permission('hr.shift_timings.manage'))
                  AND public.role_has_institution_access(p.institution_id)))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hr_work_patterns p
       WHERE p.id = work_pattern_id
         AND (   (SELECT public.is_super_admin())
              OR (SELECT public.is_admin())
              OR ((SELECT public.user_has_permission('hr.shift_timings.manage'))
                  AND public.role_has_institution_access(p.institution_id)))
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_work_patterns                    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_staff_work_pattern_assignments   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_work_pattern_leave_entitlements  TO authenticated;
GRANT ALL ON public.hr_work_patterns                   TO service_role;
GRANT ALL ON public.hr_staff_work_pattern_assignments  TO service_role;
GRANT ALL ON public.hr_work_pattern_leave_entitlements TO service_role;

-- ============================================================================
-- 2 · hr_shift_timings gains the pattern scope
-- ============================================================================

ALTER TABLE public.hr_shift_timings
  ADD COLUMN IF NOT EXISTS work_pattern_id uuid REFERENCES public.hr_work_patterns(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS hr_shift_timings_work_pattern_idx
  ON public.hr_shift_timings (work_pattern_id)
  WHERE work_pattern_id IS NOT NULL;

ALTER TABLE public.hr_shift_timings DROP CONSTRAINT IF EXISTS hr_shift_timings_staff_scope_check;
ALTER TABLE public.hr_shift_timings ADD CONSTRAINT hr_shift_timings_staff_scope_check
  CHECK (staff_scope IN ('teaching', 'non_teaching', 'category', 'work_pattern'));

-- One scope, one target. The old two-way check becomes three-way.
ALTER TABLE public.hr_shift_timings DROP CONSTRAINT IF EXISTS hr_shift_timings_scope_category_chk;
ALTER TABLE public.hr_shift_timings ADD CONSTRAINT hr_shift_timings_scope_target_chk
  CHECK (
       (staff_scope = 'category'     AND employment_category_id IS NOT NULL AND work_pattern_id IS NULL)
    OR (staff_scope = 'work_pattern' AND work_pattern_id IS NOT NULL AND employment_category_id IS NULL)
    OR (staff_scope IN ('teaching', 'non_teaching') AND employment_category_id IS NULL AND work_pattern_id IS NULL)
  );

-- A pattern is already per person; a gender split on top of it has no meaning.
ALTER TABLE public.hr_shift_timings DROP CONSTRAINT IF EXISTS hr_shift_timings_pattern_gender_chk;
ALTER TABLE public.hr_shift_timings ADD CONSTRAINT hr_shift_timings_pattern_gender_chk
  CHECK (staff_scope <> 'work_pattern' OR applicable_gender = 'all');

-- The current-row unique index must carry the pattern, or two patterns' weeks
-- collide with each other (and with the general week) on the second save.
DROP INDEX IF EXISTS public.hr_shift_timings_current_uq;
CREATE UNIQUE INDEX hr_shift_timings_current_uq
  ON public.hr_shift_timings (
    institution_id,
    staff_scope,
    COALESCE(employment_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(work_pattern_id,        '00000000-0000-0000-0000-000000000000'::uuid),
    applicable_gender,
    day_of_week
  )
  WHERE effective_until IS NULL AND is_active;

-- ============================================================================
-- 3 · Which pattern does this person hold on this date?
-- ============================================================================
--
-- Plain SQL, STABLE, SECURITY INVOKER, schema-qualified — the same reasoning as
-- fn_shift_timing_pick: inside the SECURITY DEFINER resolvers it runs with
-- their privileges and can be inlined into the bulk resolver's LATERAL; called
-- directly it is gated by the assignments table's own SELECT policy. It
-- returns nothing but an id, so reaching it through the deliberately ungated
-- fn_shift_window exposes nothing new.
--
-- DELIBERATELY IGNORES hr_work_patterns.is_active. An assignment is the truth
-- for its date range; deactivating a pattern (only possible once nobody holds
-- it) must not make a recompute of an earlier month re-resolve those days
-- through the general week.
CREATE OR REPLACE FUNCTION public.fn_staff_work_pattern_id(p_staff_id uuid, p_date date)
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
  SELECT a.work_pattern_id
  FROM public.hr_staff_work_pattern_assignments a
  WHERE a.staff_id = p_staff_id
    AND a.effective_from <= p_date
    AND (a.effective_until IS NULL OR a.effective_until > p_date)
  ORDER BY a.effective_from DESC
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.fn_staff_work_pattern_id(uuid, date) IS
  'The work pattern a staff member holds on a date, or NULL. Ignores the pattern''s is_active on purpose: history must keep resolving as it was recorded.';

-- ============================================================================
-- 4 · fn_shift_timing_pick — the single resolution predicate, pattern-aware
-- ============================================================================
--
-- DROP first: adding a defaulted seventh parameter under CREATE OR REPLACE
-- would create a second overload and make every six-argument call raise
-- 42725 "function is not unique". The six-argument call shape still works
-- afterwards through the default.

DROP FUNCTION IF EXISTS public.fn_shift_timing_pick(uuid, uuid, boolean, text, smallint, date);

CREATE FUNCTION public.fn_shift_timing_pick(
  p_institution_id  uuid,
  p_category_id     uuid,
  p_is_teaching     boolean,
  p_gender          text,
  p_dow             smallint,
  p_date            date,
  p_work_pattern_id uuid DEFAULT NULL
)
RETURNS SETOF public.hr_shift_timings
LANGUAGE sql
STABLE
AS $function$
  SELECT t.*
  FROM public.hr_shift_timings t
  WHERE t.institution_id = p_institution_id
    AND t.day_of_week    = p_dow
    AND t.is_active
    AND t.effective_from <= p_date
    AND (t.effective_until IS NULL OR t.effective_until > p_date)
    AND (
      CASE
        -- A held pattern is EXCLUSIVE: its rows or nothing. See the file header.
        WHEN p_work_pattern_id IS NOT NULL THEN
             (t.staff_scope = 'work_pattern' AND t.work_pattern_id = p_work_pattern_id)
        ELSE
             t.staff_scope <> 'work_pattern'
         AND (
                 (t.staff_scope = 'category'     AND t.employment_category_id = p_category_id)
              OR (t.staff_scope = 'teaching'     AND p_is_teaching)
              OR (t.staff_scope = 'non_teaching' AND NOT p_is_teaching)
             )
      END
    )
    AND (
         t.applicable_gender = 'all'
      OR t.applicable_gender = lower(btrim(COALESCE(p_gender, '')))
    )
  ORDER BY
    CASE t.staff_scope WHEN 'category' THEN 0 ELSE 1 END,
    CASE WHEN t.applicable_gender = 'all' THEN 1 ELSE 0 END,
    t.effective_from DESC
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.fn_shift_timing_pick(uuid, uuid, boolean, text, smallint, date, uuid) IS
  'The single shift-timing resolution predicate. A held work pattern is exclusive (its rows or nothing); otherwise most specific wins: scope first (category over teaching/non_teaching), then gender (an exact match over ''all''), then the latest effective_from. Every reader must go through this.';

-- ============================================================================
-- 5 · The staff-aware wrappers pass the pattern through. Shapes unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_shift_window(p_staff_id uuid, p_date date)
 RETURNS TABLE(timing_id uuid, is_working_day boolean, first_half_start time without time zone, first_half_end time without time zone, second_half_start time without time zone, second_half_end time without time zone, grace_minutes integer, matched_by text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_institution_id uuid;
  v_category_id    uuid;
  v_is_teaching    boolean;
  v_gender         text;
  v_pattern_id     uuid;
  v_dow            smallint;
  v_second_sat     boolean;
BEGIN
  IF p_staff_id IS NULL OR p_date IS NULL THEN RETURN; END IF;

  SELECT s.institution_id, s.category_id, ec.is_teaching, s.gender
    INTO v_institution_id, v_category_id, v_is_teaching, v_gender
  FROM public.staff s
  JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE s.id = p_staff_id;

  IF v_institution_id IS NULL THEN RETURN; END IF;

  v_pattern_id := public.fn_staff_work_pattern_id(p_staff_id, p_date);
  v_dow        := EXTRACT(ISODOW FROM p_date)::smallint;
  v_second_sat := (v_dow = 6 AND EXTRACT(DAY FROM p_date) BETWEEN 8 AND 14);

  RETURN QUERY
  SELECT
    t.id,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN false ELSE t.is_working_day END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_start  END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_end    END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_start END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_end   END,
    t.grace_minutes,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN 'second_saturday_holiday'
         ELSE t.staff_scope END
  FROM public.fn_shift_timing_pick(
         v_institution_id, v_category_id, v_is_teaching, v_gender, v_dow, p_date, v_pattern_id) t;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_is_working_day(p_staff_id uuid, p_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_institution_id uuid;
  v_category_id    uuid;
  v_is_teaching    boolean;
  v_gender         text;
  v_pattern_id     uuid;
  v_dow            smallint;
  v_second_sat     boolean;
  v_working        boolean;
BEGIN
  IF p_staff_id IS NULL OR p_date IS NULL THEN RETURN NULL; END IF;

  SELECT s.institution_id, s.category_id, ec.is_teaching, s.gender
    INTO v_institution_id, v_category_id, v_is_teaching, v_gender
  FROM public.staff s
  JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE s.id = p_staff_id;

  IF v_institution_id IS NULL THEN RETURN NULL; END IF;

  v_pattern_id := public.fn_staff_work_pattern_id(p_staff_id, p_date);
  v_dow        := EXTRACT(ISODOW FROM p_date)::smallint;
  v_second_sat := (v_dow = 6 AND EXTRACT(DAY FROM p_date) BETWEEN 8 AND 14);

  SELECT CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN false
              ELSE t.is_working_day END
    INTO v_working
  FROM public.fn_shift_timing_pick(
         v_institution_id, v_category_id, v_is_teaching, v_gender, v_dow, p_date, v_pattern_id) t;

  RETURN v_working;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_resolve_shift_timing(p_staff_id uuid, p_date date)
 RETURNS TABLE(timing_id uuid, institution_id uuid, staff_scope text, employment_category_id uuid, applicable_gender text, day_of_week smallint, is_working_day boolean, first_half_start time without time zone, first_half_end time without time zone, second_half_start time without time zone, second_half_end time without time zone, grace_minutes integer, grace_deadline time without time zone, matched_by text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_institution_id uuid;
  v_category_id    uuid;
  v_is_teaching    boolean;
  v_gender         text;
  v_pattern_id     uuid;
  v_dow            smallint;
  v_second_sat     boolean;
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.staff s
                WHERE s.id = p_staff_id AND s.profile_id = auth.uid())
    OR (public.user_has_permission('hr.shift_timings.view')
        AND EXISTS (SELECT 1 FROM public.staff s
                     WHERE s.id = p_staff_id
                       AND public.role_has_institution_access(s.institution_id)))
  ) THEN
    RAISE EXCEPTION 'Not authorized to resolve shift timing for this staff member'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.institution_id, s.category_id, ec.is_teaching, s.gender
    INTO v_institution_id, v_category_id, v_is_teaching, v_gender
  FROM public.staff s
  JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE s.id = p_staff_id;

  IF v_institution_id IS NULL THEN RETURN; END IF;

  v_pattern_id := public.fn_staff_work_pattern_id(p_staff_id, p_date);
  v_dow        := EXTRACT(ISODOW FROM p_date)::smallint;
  v_second_sat := (v_dow = 6 AND EXTRACT(DAY FROM p_date) BETWEEN 8 AND 14);

  RETURN QUERY
  SELECT
    t.id,
    t.institution_id,
    t.staff_scope,
    t.employment_category_id,
    t.applicable_gender,
    t.day_of_week,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN false ELSE t.is_working_day END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_start  END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_end    END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_start END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_end   END,
    t.grace_minutes,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) OR NOT t.is_working_day THEN NULL
         ELSE (t.first_half_start + make_interval(mins => t.grace_minutes))::time END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN 'second_saturday_holiday'
         ELSE t.staff_scope END
  FROM public.fn_shift_timing_pick(
         v_institution_id, v_category_id, v_is_teaching, v_gender, v_dow, p_date, v_pattern_id) t;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_resolve_shift_timings_bulk(p_staff_ids uuid[], p_from date, p_to date)
 RETURNS TABLE(staff_id uuid, work_date date, timing_id uuid, is_working_day boolean, first_half_start time without time zone, first_half_end time without time zone, second_half_start time without time zone, second_half_end time without time zone, grace_minutes integer, matched_by text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR public.user_has_permission('hr.shift_timings.view')
    OR public.user_has_permission('hr.attendance.override')
  ) THEN
    RAISE EXCEPTION 'Not authorized to resolve shift timings'
      USING ERRCODE = '42501';
  END IF;

  IF p_to < p_from THEN
    RAISE EXCEPTION 'p_to must not be earlier than p_from' USING ERRCODE = '22023';
  END IF;

  IF (p_to - p_from) > 400 THEN
    RAISE EXCEPTION 'Date range too wide (% days); resolve at most 400 days at a time', (p_to - p_from)
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH s AS (
    SELECT st.id, st.institution_id, st.category_id, ec.is_teaching, st.gender
    FROM public.staff st
    JOIN public.employment_categories ec ON ec.id = st.category_id
    WHERE st.id = ANY(p_staff_ids)
  ), d AS (
    SELECT gs::date AS wd FROM generate_series(p_from, p_to, interval '1 day') gs
  )
  SELECT
    s.id,
    d.wd,
    t.id,
    CASE WHEN t.id IS NULL THEN NULL
         WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN false
         ELSE t.is_working_day END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_start  END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_end    END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_start END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_end   END,
    t.grace_minutes,
    CASE WHEN t.id IS NULL THEN NULL
         WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN 'second_saturday_holiday'
         ELSE t.staff_scope END
  FROM s
  CROSS JOIN d
  LEFT JOIN LATERAL public.fn_shift_timing_pick(
    s.institution_id, s.category_id, s.is_teaching, s.gender,
    EXTRACT(ISODOW FROM d.wd)::smallint, d.wd,
    public.fn_staff_work_pattern_id(s.id, d.wd)) t ON true;
END;
$function$;

-- Coverage is a per-category view and has no staff row to hand, so it cannot
-- resolve patterns. It now EXCLUDES staff who hold one on p_date rather than
-- counting them under a week they do not get.
CREATE OR REPLACE FUNCTION public.fn_shift_timing_coverage(p_institution_id uuid, p_date date)
 RETURNS TABLE(employment_category_id uuid, category_name text, is_teaching boolean, staff_gender text, staff_count bigint, resolved_timing_id uuid, resolved_via text, resolved_gender text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dow smallint;
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR ((public.user_has_permission('hr.shift_timings.view')
         OR public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(p_institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to view shift timing coverage for this institution'
      USING ERRCODE = '42501';
  END IF;

  v_dow := EXTRACT(ISODOW FROM p_date)::smallint;

  RETURN QUERY
  WITH cats AS (
    SELECT ec.id AS cat_id,
           ec.category_name AS cat_name,
           ec.is_teaching AS cat_is_teaching,
           s.gender AS cat_gender,
           count(s.id) AS cat_staff_count
    FROM public.staff s
    JOIN public.employment_categories ec ON ec.id = s.category_id
    WHERE s.institution_id = p_institution_id
      AND public.fn_staff_work_pattern_id(s.id, p_date) IS NULL
    GROUP BY ec.id, ec.category_name, ec.is_teaching, s.gender
  )
  SELECT c.cat_id, c.cat_name, c.cat_is_teaching, c.cat_gender, c.cat_staff_count,
         t.id, t.staff_scope, t.applicable_gender
  FROM cats c
  LEFT JOIN LATERAL public.fn_shift_timing_pick(
    p_institution_id, c.cat_id, c.cat_is_teaching, c.cat_gender, v_dow, p_date) t ON true
  ORDER BY c.cat_staff_count DESC, c.cat_name, c.cat_gender;
END;
$function$;

-- ============================================================================
-- 6 · fn_save_shift_timing_week — can write a pattern's week
-- ============================================================================
--
-- DROP for the same reason as pick: a new defaulted parameter is a new
-- overload. Every WHERE gains `work_pattern_id IS NOT DISTINCT FROM`, the
-- same trap applicable_gender had — without it, saving a pattern week finds
-- the general week as "current", closes it and overwrites it.

DROP FUNCTION IF EXISTS public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb, text);

CREATE FUNCTION public.fn_save_shift_timing_week(
  p_institution_id         uuid,
  p_staff_scope            text,
  p_employment_category_id uuid,
  p_effective_from         date,
  p_days                   jsonb,
  p_applicable_gender      text DEFAULT 'all',
  p_work_pattern_id        uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day      record;
  v_current  public.hr_shift_timings%ROWTYPE;
  v_written  integer := 0;
  v_actor    uuid := auth.uid();
  v_pattern_inst uuid;
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('hr.shift_timings.manage')
        AND public.role_has_institution_access(p_institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to configure shift timings for this institution'
      USING ERRCODE = '42501';
  END IF;

  IF p_staff_scope NOT IN ('teaching','non_teaching','category','work_pattern') THEN
    RAISE EXCEPTION 'Invalid staff_scope: %', p_staff_scope USING ERRCODE = '22023';
  END IF;

  IF p_applicable_gender NOT IN ('all','male','female','bigender') THEN
    RAISE EXCEPTION 'Invalid applicable_gender: %', p_applicable_gender USING ERRCODE = '22023';
  END IF;

  IF (p_staff_scope = 'category') <> (p_employment_category_id IS NOT NULL) THEN
    RAISE EXCEPTION 'staff_scope=category requires an employment_category_id, and vice versa'
      USING ERRCODE = '22023';
  END IF;

  IF (p_staff_scope = 'work_pattern') <> (p_work_pattern_id IS NOT NULL) THEN
    RAISE EXCEPTION 'staff_scope=work_pattern requires a work_pattern_id, and vice versa'
      USING ERRCODE = '22023';
  END IF;

  IF p_staff_scope = 'work_pattern' THEN
    IF p_applicable_gender <> 'all' THEN
      RAISE EXCEPTION 'A work pattern''s week applies to everyone on it; applicable_gender must be ''all'''
        USING ERRCODE = '22023';
    END IF;
    SELECT institution_id INTO v_pattern_inst FROM public.hr_work_patterns WHERE id = p_work_pattern_id;
    IF v_pattern_inst IS NULL THEN
      RAISE EXCEPTION 'Work pattern % not found', p_work_pattern_id USING ERRCODE = 'P0002';
    END IF;
    IF v_pattern_inst <> p_institution_id THEN
      RAISE EXCEPTION 'Work pattern belongs to a different institution' USING ERRCODE = '22023';
    END IF;
  END IF;

  FOR v_day IN
    SELECT *
    FROM jsonb_to_recordset(p_days) AS d(
      day_of_week smallint,
      is_working_day boolean,
      first_half_start time,
      first_half_end time,
      second_half_start time,
      second_half_end time,
      grace_minutes integer,
      second_saturday_holiday boolean
    )
  LOOP
    SELECT * INTO v_current
    FROM public.hr_shift_timings t
    WHERE t.institution_id = p_institution_id
      AND t.staff_scope    = p_staff_scope
      AND t.applicable_gender = p_applicable_gender
      AND t.day_of_week    = v_day.day_of_week
      AND t.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
      AND t.work_pattern_id        IS NOT DISTINCT FROM p_work_pattern_id
      AND t.effective_until IS NULL
      AND t.is_active;

    IF NOT FOUND THEN
      INSERT INTO public.hr_shift_timings (
        institution_id, staff_scope, employment_category_id, work_pattern_id, applicable_gender, day_of_week,
        is_working_day, first_half_start, first_half_end,
        second_half_start, second_half_end,
        grace_minutes, second_saturday_holiday, effective_from,
        created_by, updated_by
      ) VALUES (
        p_institution_id, p_staff_scope, p_employment_category_id, p_work_pattern_id, p_applicable_gender, v_day.day_of_week,
        v_day.is_working_day, v_day.first_half_start, v_day.first_half_end,
        v_day.second_half_start, v_day.second_half_end,
        COALESCE(v_day.grace_minutes, 0), COALESCE(v_day.second_saturday_holiday, false),
        p_effective_from, v_actor, v_actor
      );

    ELSIF p_effective_from <= v_current.effective_from THEN
      UPDATE public.hr_shift_timings h
         SET is_active  = false,
             updated_by = v_actor
       WHERE h.institution_id = p_institution_id
         AND h.staff_scope    = p_staff_scope
         AND h.applicable_gender = p_applicable_gender
         AND h.day_of_week    = v_day.day_of_week
         AND h.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
         AND h.work_pattern_id        IS NOT DISTINCT FROM p_work_pattern_id
         AND h.id <> v_current.id
         AND h.is_active
         AND h.effective_from >= p_effective_from;

      UPDATE public.hr_shift_timings h
         SET effective_until = p_effective_from,
             updated_by      = v_actor
       WHERE h.institution_id = p_institution_id
         AND h.staff_scope    = p_staff_scope
         AND h.applicable_gender = p_applicable_gender
         AND h.day_of_week    = v_day.day_of_week
         AND h.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
         AND h.work_pattern_id        IS NOT DISTINCT FROM p_work_pattern_id
         AND h.id <> v_current.id
         AND h.is_active
         AND h.effective_from < p_effective_from
         AND (h.effective_until IS NULL OR h.effective_until > p_effective_from);

      UPDATE public.hr_shift_timings
         SET is_working_day          = v_day.is_working_day,
             first_half_start        = v_day.first_half_start,
             first_half_end          = v_day.first_half_end,
             second_half_start       = v_day.second_half_start,
             second_half_end         = v_day.second_half_end,
             grace_minutes           = COALESCE(v_day.grace_minutes, 0),
             second_saturday_holiday = COALESCE(v_day.second_saturday_holiday, false),
             effective_from          = p_effective_from,
             updated_by              = v_actor
       WHERE id = v_current.id;

    ELSE
      UPDATE public.hr_shift_timings
         SET effective_until = p_effective_from,
             updated_by      = v_actor
       WHERE id = v_current.id;

      INSERT INTO public.hr_shift_timings (
        institution_id, staff_scope, employment_category_id, work_pattern_id, applicable_gender, day_of_week,
        is_working_day, first_half_start, first_half_end,
        second_half_start, second_half_end,
        grace_minutes, second_saturday_holiday, effective_from,
        created_by, updated_by
      ) VALUES (
        p_institution_id, p_staff_scope, p_employment_category_id, p_work_pattern_id, p_applicable_gender, v_day.day_of_week,
        v_day.is_working_day, v_day.first_half_start, v_day.first_half_end,
        v_day.second_half_start, v_day.second_half_end,
        COALESCE(v_day.grace_minutes, 0), COALESCE(v_day.second_saturday_holiday, false),
        p_effective_from, v_actor, v_actor
      );
    END IF;

    v_written := v_written + 1;
  END LOOP;

  RETURN v_written;
END;
$function$;

COMMENT ON FUNCTION public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb, text, uuid) IS
  'Save one scope''s week (teaching / non_teaching / category / work_pattern × gender) effective from a date. A pattern week is always gender ''all''. Closes the previous rows at that date, or rewrites them when backdating.';

-- ============================================================================
-- 7 · fn_hr_assign_work_pattern — the only write path for assignments
-- ============================================================================
--
-- Puts staff on a pattern (or takes them off: p_work_pattern_id NULL) from a
-- date, then RESYNCS their open leave balances so the entitlement changes at
-- once — the decision taken with HR on 2026-09-04: used days are kept, the
-- figure switches immediately.
--
-- UPDATE ONLY, NEVER INSERT, into hr_leave_balances. generate_hr_leave_balances
-- inserts ON CONFLICT DO NOTHING, so a row created here first would be skipped
-- by the generator for ever (no carried_forward, inflated "skipped"). Someone
-- with no row yet gets the pattern figure when balances are next generated —
-- the generator reads the same table.
--
-- YEARS BY DATE, NOT is_active. hr_academic_years is group-wide, and both
-- 2026-27 and 2027-28 are is_active today. Unfrozen years ending on or after
-- the effective date are the ones a change can still matter to.
--
-- OVERRIDES OUTRANK entitled everywhere it is read (v_hr_leave_balance_src and
-- fn_hr_leave_accrued_days both COALESCE(override, entitled, default)). The
-- before/after figures reported here use the same COALESCE, and a row under an
-- override is flagged so HR sees that the pattern figure is not what applies.

CREATE OR REPLACE FUNCTION public.fn_hr_assign_work_pattern(
  p_staff_ids       uuid[],
  p_work_pattern_id uuid,
  p_effective_from  date,
  p_notes           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor        uuid := auth.uid();
  v_removing     boolean := (p_work_pattern_id IS NULL);
  v_pattern      public.hr_work_patterns%ROWTYPE;
  v_missing      text;
  v_sid          uuid;
  v_staff        record;
  v_prev_pattern uuid;
  v_prev_name    text;
  v_changes      jsonb;
  v_rows         jsonb := '[]'::jsonb;
  r              record;
BEGIN
  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'An effective date is required' USING ERRCODE = '22023';
  END IF;
  IF p_staff_ids IS NULL OR cardinality(p_staff_ids) = 0 THEN
    RAISE EXCEPTION 'No staff selected' USING ERRCODE = '22023';
  END IF;

  IF NOT v_removing THEN
    SELECT * INTO v_pattern FROM public.hr_work_patterns WHERE id = p_work_pattern_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Work pattern % not found', p_work_pattern_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT v_pattern.is_active THEN
      RAISE EXCEPTION 'Work pattern "%" is inactive', v_pattern.name USING ERRCODE = '22023';
    END IF;

    IF NOT (
         public.is_super_admin()
      OR public.is_admin()
      OR (public.user_has_permission('hr.shift_timings.manage')
          AND public.role_has_institution_access(v_pattern.institution_id))
    ) THEN
      RAISE EXCEPTION 'Not authorized to assign work patterns at this institution'
        USING ERRCODE = '42501';
    END IF;

    -- The pattern is exclusive once held, so its week must already cover the
    -- effective date for every weekday.
    SELECT string_agg(d::text, ', ' ORDER BY d) INTO v_missing
      FROM generate_series(1, 7) AS d
     WHERE NOT EXISTS (
       SELECT 1 FROM public.hr_shift_timings t
        WHERE t.staff_scope = 'work_pattern'
          AND t.work_pattern_id = p_work_pattern_id
          AND t.day_of_week = d
          AND t.is_active
          AND t.effective_from <= p_effective_from
          AND (t.effective_until IS NULL OR t.effective_until > p_effective_from)
     );
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'Work pattern "%" has no week in force on % (weekday(s) % missing). Save the pattern''s week first.',
        v_pattern.name, to_char(p_effective_from, 'DD Mon YYYY'), v_missing
        USING ERRCODE = '22023';
    END IF;
  END IF;

  FOREACH v_sid IN ARRAY p_staff_ids LOOP
    SELECT s.id,
           s.staff_id AS staff_code,
           btrim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) AS name,
           s.institution_id
      INTO v_staff
      FROM public.staff s
     WHERE s.id = v_sid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Staff member % not found', v_sid USING ERRCODE = 'P0002';
    END IF;

    -- Per row, not once: a uuid[] would otherwise be a bulk cross-institution write.
    IF NOT v_removing AND v_staff.institution_id <> v_pattern.institution_id THEN
      RAISE EXCEPTION '% (%) works at a different institution from the work pattern',
        v_staff.name, coalesce(v_staff.staff_code, '?') USING ERRCODE = '22023';
    END IF;
    IF v_removing AND NOT (
         public.is_super_admin()
      OR public.is_admin()
      OR (public.user_has_permission('hr.shift_timings.manage')
          AND public.role_has_institution_access(v_staff.institution_id))
    ) THEN
      RAISE EXCEPTION 'Not authorized to change work patterns at this institution'
        USING ERRCODE = '42501';
    END IF;

    -- What they held going into the effective date (for the report and for
    -- the set of leave types whose figure is being withdrawn).
    SELECT a.work_pattern_id, p.name
      INTO v_prev_pattern, v_prev_name
      FROM public.hr_staff_work_pattern_assignments a
      JOIN public.hr_work_patterns p ON p.id = a.work_pattern_id
     WHERE a.staff_id = v_sid
       AND a.effective_from <= p_effective_from
       AND (a.effective_until IS NULL OR a.effective_until > p_effective_from)
     ORDER BY a.effective_from DESC
     LIMIT 1;
    IF NOT FOUND THEN
      v_prev_pattern := NULL;
      v_prev_name    := NULL;
    END IF;

    -- Same two branches as fn_end_shift_timing_override: something that
    -- started before the date keeps its history and is closed at the date;
    -- something starting on or after it never applied and is removed.
    DELETE FROM public.hr_staff_work_pattern_assignments
     WHERE staff_id = v_sid
       AND effective_from >= p_effective_from;

    UPDATE public.hr_staff_work_pattern_assignments
       SET effective_until = p_effective_from,
           updated_by      = v_actor
     WHERE staff_id = v_sid
       AND effective_from < p_effective_from
       AND (effective_until IS NULL OR effective_until > p_effective_from);

    IF NOT v_removing THEN
      INSERT INTO public.hr_staff_work_pattern_assignments (
        staff_id, work_pattern_id, institution_id, effective_from, notes, created_by, updated_by
      ) VALUES (
        v_sid, p_work_pattern_id, v_pattern.institution_id, p_effective_from, p_notes, v_actor, v_actor
      );
    END IF;

    -- Resync: every leave type the NEW or the PREVIOUS pattern speaks for.
    -- New figure = the new pattern's, or NULL (= follow policy) when it has
    -- none / when removing.
    v_changes := '[]'::jsonb;
    FOR r IN
      WITH touched AS (
        SELECT e.leave_type_id FROM public.hr_work_pattern_leave_entitlements e
         WHERE e.work_pattern_id = p_work_pattern_id
        UNION
        SELECT e.leave_type_id FROM public.hr_work_pattern_leave_entitlements e
         WHERE e.work_pattern_id = v_prev_pattern
      )
      SELECT b.employee_id, b.leave_type_id, b.hr_academic_year_id,
             t.leave_type_code, y.year_name,
             COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)   AS before_eff,
             ne.entitled_days                                                  AS new_raw,
             COALESCE(o.entitled_days, ne.entitled_days, t.default_entitled_days) AS after_eff,
             (o.id IS NOT NULL)                                                AS overridden
        FROM public.hr_leave_balances b
        JOIN touched tp ON tp.leave_type_id = b.leave_type_id
        JOIN public.hr_leave_types t ON t.id = b.leave_type_id
        JOIN public.hr_academic_years y ON y.id = b.hr_academic_year_id
        LEFT JOIN public.hr_leave_entitlement_overrides o
               ON o.employee_id = b.employee_id
              AND o.leave_type_id = b.leave_type_id
              AND o.hr_academic_year_id = b.hr_academic_year_id
        LEFT JOIN public.hr_work_pattern_leave_entitlements ne
               ON ne.work_pattern_id = p_work_pattern_id
              AND ne.leave_type_id = b.leave_type_id
       WHERE b.employee_id = v_sid
         AND t.request_category = 'leave'
         AND y.frozen_at IS NULL
         AND y.end_date >= p_effective_from
       ORDER BY y.start_date, t.display_order
    LOOP
      UPDATE public.hr_leave_balances
         SET entitled   = r.new_raw,
             updated_at = now()
       WHERE employee_id         = r.employee_id
         AND leave_type_id       = r.leave_type_id
         AND hr_academic_year_id = r.hr_academic_year_id;

      v_changes := v_changes || jsonb_build_object(
        'leave_type_code', r.leave_type_code,
        'year_name',       r.year_name,
        'from',            r.before_eff,
        'to',              r.after_eff,
        'overridden',      r.overridden
      );
    END LOOP;

    v_rows := v_rows || jsonb_build_object(
      'staff_id',         v_sid,
      'staff_code',       v_staff.staff_code,
      'name',             v_staff.name,
      'previous_pattern', v_prev_name,
      'changes',          v_changes
    );
  END LOOP;

  RETURN jsonb_build_object(
    'pattern_id',     p_work_pattern_id,
    'pattern_name',   CASE WHEN v_removing THEN NULL ELSE v_pattern.name END,
    'effective_from', p_effective_from,
    'removed',        v_removing,
    'staff_count',    cardinality(p_staff_ids),
    'staff',          v_rows
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_assign_work_pattern(uuid[], uuid, date, text) IS
  'Put staff on a work pattern (NULL pattern = take them off) from a date, and resync their open leave balances to the pattern''s figures (update-only; used days kept). Returns per-staff before/after per leave type.';

-- ============================================================================
-- 8 · generate_hr_leave_balances — the pattern sits between a staff-level
--     assignment and department/organization ones
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_hr_leave_balances(p_hr_org_id uuid, p_hr_academic_year_id uuid, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_created   integer := 0;
  v_skipped   integer := 0;
  v_fallback  jsonb   := '[]'::jsonb;
  v_inst_id   uuid;
  v_prior_ay  uuid;
  v_start     date;
  v_end       date;
  v_on        date;
  r           record;
BEGIN
  IF NOT public.user_has_permission('hr.leave.balance.manage') THEN
    RAISE EXCEPTION 'Insufficient permission: hr.leave.balance.manage required';
  END IF;

  SELECT institution_id INTO v_inst_id FROM public.hr_organizations WHERE id = p_hr_org_id;
  IF v_inst_id IS NULL THEN
    RAISE EXCEPTION 'Unknown hr_organization_id %', p_hr_org_id;
  END IF;

  IF NOT public.role_has_institution_access(v_inst_id) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to institution %', v_inst_id;
  END IF;

  SELECT start_date, end_date INTO v_start, v_end FROM public.hr_academic_years WHERE id = p_hr_academic_year_id;
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'Unknown hr_academic_year_id %', p_hr_academic_year_id;
  END IF;

  -- The day the pattern is read on: today, clamped into the year — the same
  -- convention hr_leave_balance_staff_detail uses for its STO window.
  v_on := LEAST(GREATEST(CURRENT_DATE, v_start), v_end);

  -- Group-wide years, so the prior year is simply the previous one -- no
  -- institution term, and no risk of picking another college's row.
  SELECT id INTO v_prior_ay
  FROM public.hr_academic_years
  WHERE end_date < v_start
  ORDER BY end_date DESC
  LIMIT 1;

  FOR r IN
    SELECT
      s.id  AS staff_id,
      s.staff_id AS staff_code,
      s.first_name,
      s.last_name,
      d.cadre_id,
      t.id  AS leave_type_id,
      t.default_entitled_days,
      t.allow_carry_forward,
      t.max_carry_forward_days,
      e.entitled_days AS cadre_entitled,
      asg.n           AS assignment_count,
      m.entitled_days AS assigned_entitled,
      m.scope_kind    AS assigned_scope,
      wp.entitled_days AS pattern_entitled
    FROM public.staff s
    CROSS JOIN public.hr_leave_types t
    LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
    LEFT JOIN public.hr_leave_type_entitlements e
           ON e.leave_type_id = t.id AND e.cadre_id = d.cadre_id
    LEFT JOIN LATERAL (
      SELECT count(*) AS n
      FROM public.hr_leave_type_assignments a
      WHERE a.leave_type_id = t.id AND a.is_active
    ) asg ON true
    LEFT JOIN LATERAL (
      SELECT a.entitled_days, a.scope_kind
      FROM public.hr_leave_type_assignments a
      WHERE a.leave_type_id = t.id
        AND a.is_active
        AND (
             (a.scope_kind = 'staff'        AND a.staff_id      = s.id)
          OR (a.scope_kind = 'department'   AND a.department_id = s.department_id)
          OR (a.scope_kind = 'organization')
        )
      ORDER BY CASE a.scope_kind
                 WHEN 'staff' THEN 1 WHEN 'department' THEN 2 ELSE 3 END
      LIMIT 1
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT pe.entitled_days
      FROM public.hr_staff_work_pattern_assignments a
      JOIN public.hr_work_pattern_leave_entitlements pe
        ON pe.work_pattern_id = a.work_pattern_id AND pe.leave_type_id = t.id
      WHERE a.staff_id = s.id
        AND a.effective_from <= v_on
        AND (a.effective_until IS NULL OR a.effective_until > v_on)
      ORDER BY a.effective_from DESC
      LIMIT 1
    ) wp ON true
    WHERE s.institution_id = v_inst_id
      AND s.is_active
      AND t.hr_organization_id = p_hr_org_id
      AND t.is_active
      -- The eligibility gate. A type with assignments applies only to the
      -- people they name; the pattern step must not resurrect anyone else.
      AND (asg.n = 0 OR m.scope_kind IS NOT NULL)
      AND (t.applicable_cadre_ids IS NULL OR d.cadre_id = ANY(t.applicable_cadre_ids))
      AND (
        t.applicable_gender = 'all'
        OR lower(coalesce(s.gender, '')) = t.applicable_gender
      )
  LOOP
    DECLARE
      v_entitled numeric;
      v_carried  numeric := 0;
      v_written  boolean := false;
    BEGIN
      -- IS NOT NULL, not COALESCE-truthiness: an override of 0 is a real
      -- decision ("eligible, but no days"), not an absent one.
      --
      -- A staff-level assignment is the most specific statement about one
      -- person and beats the pattern; the pattern beats the department- and
      -- organization-wide ones, the cadre figure and the type default.
      v_entitled := CASE
        WHEN r.assigned_scope = 'staff' AND r.assigned_entitled IS NOT NULL THEN r.assigned_entitled
        WHEN r.pattern_entitled IS NOT NULL                                  THEN r.pattern_entitled
        WHEN r.assigned_entitled IS NOT NULL                                 THEN r.assigned_entitled
        WHEN r.cadre_entitled    IS NOT NULL                                 THEN r.cadre_entitled
        ELSE r.default_entitled_days
      END;

      IF r.allow_carry_forward AND v_prior_ay IS NOT NULL THEN
        SELECT GREATEST(0, (b.entitled + b.carried_forward - b.used))
          INTO v_carried
        FROM public.hr_leave_balances b
        WHERE b.employee_id         = r.staff_id
          AND b.leave_type_id       = r.leave_type_id
          AND b.hr_academic_year_id = v_prior_ay;

        v_carried := COALESCE(v_carried, 0);
        IF r.max_carry_forward_days IS NOT NULL THEN
          v_carried := LEAST(v_carried, r.max_carry_forward_days);
        END IF;
      END IF;

      IF p_dry_run THEN
        IF EXISTS (
          SELECT 1 FROM public.hr_leave_balances b
          WHERE b.employee_id         = r.staff_id
            AND b.leave_type_id       = r.leave_type_id
            AND b.hr_academic_year_id = p_hr_academic_year_id
        ) THEN
          v_skipped := v_skipped + 1;
        ELSE
          v_created := v_created + 1;
          v_written := true;
        END IF;
      ELSE
        INSERT INTO public.hr_leave_balances (
          employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
          entitled, used, carried_forward
        ) VALUES (
          r.staff_id, r.leave_type_id, p_hr_academic_year_id, p_hr_org_id,
          v_entitled, 0, v_carried
        )
        ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id) DO NOTHING;

        IF FOUND THEN
          v_created := v_created + 1;
          v_written := true;
        ELSE
          v_skipped := v_skipped + 1;
        END IF;
      END IF;

      IF v_written
         AND r.assigned_entitled IS NULL
         AND r.pattern_entitled IS NULL
         AND r.cadre_entitled IS NULL THEN
        v_fallback := v_fallback || jsonb_build_object(
          'staff_code', r.staff_code,
          'name', trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')),
          'reason', CASE WHEN r.cadre_id IS NULL
                         THEN 'no cadre assigned'
                         ELSE 'no entitlement row for cadre' END
        );
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run',        p_dry_run,
    'created',        v_created,
    'skipped',        v_skipped,
    'prior_year_id',  v_prior_ay,
    'fallback_count', jsonb_array_length(v_fallback),
    'fallback',       v_fallback
  );
END
$function$;

-- ============================================================================
-- 9 · Period summary — the days each person was SCHEDULED for
-- ============================================================================
--
-- working_days (records minus weekly-off minus holidays) is what happened;
-- scheduled_days is what the resolver expected, for the FULL month, from the
-- same holiday source the import stamps HOLIDAY from. It is what the salary
-- register divides by for anyone on a work pattern. Not clamped to joining or
-- relieving — the same reason the register uses the institution standard for
-- everyone else: a mid-month joiner is unpaid for the days before they
-- joined, not paid a full month for half of one.
--
-- work_pattern_id is the MOST RECENT pattern held on ANY day of the month,
-- not the one in force on its last day: someone taken off a pattern
-- mid-month still has a blended scheduled_days and must be paid on it.

ALTER TABLE public.hr_attendance_period_summaries
  ADD COLUMN IF NOT EXISTS scheduled_days  numeric(5,1),
  ADD COLUMN IF NOT EXISTS work_pattern_id uuid REFERENCES public.hr_work_patterns(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hr_attendance_period_summaries.scheduled_days IS
  'Days the shift-timing resolver expected this person to work in the month (pattern-aware, full month, holidays removed). NULL on periods closed before 2026-09.';
COMMENT ON COLUMN public.hr_attendance_period_summaries.work_pattern_id IS
  'The work pattern held on any day of the month (most recent if several). When set, the salary register divides by scheduled_days instead of the period standard.';

CREATE OR REPLACE FUNCTION public.fn_hr_compute_attendance_period_summary(p_period_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period public.hr_attendance_periods;
  v_start  date;
  v_end    date;
  v_rows   integer;
BEGIN
  SELECT * INTO v_period FROM public.hr_attendance_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance period not found: %', p_period_id USING ERRCODE = 'P0002';
  END IF;

  v_start := make_date(v_period.period_year, v_period.period_month, 1);
  v_end   := (v_start + interval '1 month - 1 day')::date;

  DELETE FROM public.hr_attendance_period_summaries WHERE period_id = p_period_id;

  WITH rec AS (
    SELECT r.employee_id,
           st.code,
           COALESCE(r.late_minutes, 0)    AS late_minutes,
           COALESCE(r.excused_minutes, 0) AS excused_minutes
      FROM public.hr_attendance_records r
      JOIN public.hr_attendance_status_types st ON st.id = r.status_type_id
     WHERE r.institution_id = v_period.institution_id
       AND r.work_date BETWEEN v_start AND v_end
  ),
  agg AS (
    SELECT employee_id,
           count(*)                                                   AS total_days,
           count(*) FILTER (WHERE code = 'WEEKLY_OFF')                AS weekly_off,
           count(*) FILTER (WHERE code = 'HOLIDAY')                   AS holiday,
           count(*) FILTER (WHERE code IN ('PRESENT','REGULARIZED'))  AS full_present,
           count(*) FILTER (WHERE code = 'HALF_DAY')                  AS half_day,
           count(*) FILTER (WHERE code = 'ABSENT')                    AS absent,
           count(*) FILTER (WHERE code IN ('ON_DUTY','on_clinical_posting')) AS on_duty,
           -- A day the evaluator could not judge. A payslip built on top of
           -- these should say so rather than quietly treat them as absent.
           count(*) FILTER (WHERE code NOT IN (
             'PRESENT','REGULARIZED','HALF_DAY','ABSENT','WEEKLY_OFF',
             'HOLIDAY','LEAVE','ON_DUTY','on_clinical_posting'))      AS unprocessed,
           sum(late_minutes)                                          AS late_minutes,
           sum(excused_minutes)                                       AS excused_minutes
      FROM rec
     GROUP BY employee_id
  ),
  -- Approved requests expanded to individual dates, then INTERSECTED with the
  -- attendance records: a leave that falls on a Sunday is not a leave day, and
  -- counting it from the application alone would inflate the total.
  req AS (
    SELECT la.employee_id,
           lt.leave_type_code,
           lt.is_paid,
           lt.request_category,
           g.d::date AS dt,
           CASE WHEN la.duration_type ILIKE '%half%' THEN 0.5 ELSE 1.0 END AS wt,
           la.start_time, la.end_time
      FROM public.hr_leave_applications la
      JOIN public.hr_leave_types lt ON lt.id = la.leave_type_id
      CROSS JOIN LATERAL generate_series(la.start_date, la.end_date, interval '1 day') g(d)
     WHERE la.status = 'approved'
       AND g.d::date BETWEEN v_start AND v_end
  ),
  req_effective AS (
    SELECT q.*
      FROM req q
      JOIN public.hr_attendance_records r
        ON r.employee_id = q.employee_id AND r.work_date = q.dt
      JOIN public.hr_attendance_status_types st ON st.id = r.status_type_id
     WHERE r.institution_id = v_period.institution_id
       AND st.code NOT IN ('WEEKLY_OFF', 'HOLIDAY')
  ),
  req_agg AS (
    SELECT employee_id,
           COALESCE(sum(wt) FILTER (WHERE request_category = 'leave' AND is_paid), 0)         AS paid_leave,
           COALESCE(sum(wt) FILTER (WHERE request_category = 'leave' AND NOT is_paid), 0)     AS unpaid_leave,
           COALESCE(sum(wt) FILTER (WHERE request_category = 'compensatory_off'), 0)          AS comp_off,
           COALESCE(sum(
             GREATEST(0, EXTRACT(EPOCH FROM (end_time - start_time)) / 60)
           ) FILTER (WHERE request_category = 'short_time_off'), 0)::int                      AS sto_minutes,
           COALESCE(
             jsonb_object_agg(leave_type_code, days)
               FILTER (WHERE request_category = 'leave' AND leave_type_code IS NOT NULL),
             '{}'::jsonb)                                                                     AS leave_by_type
      FROM (
        SELECT employee_id, request_category, is_paid, leave_type_code,
               start_time, end_time, wt,
               sum(wt) OVER (PARTITION BY employee_id, leave_type_code) AS days
          FROM req_effective
      ) x
     GROUP BY employee_id
  )
  INSERT INTO public.hr_attendance_period_summaries (
    period_id, staff_id, working_days, present_days, half_days, absent_days,
    weekly_off_days, holiday_days, leave_days, on_duty_days, comp_off_days,
    lop_days, payable_days, leave_by_type, short_time_off_minutes,
    late_minutes, excused_minutes, unprocessed_days
  )
  SELECT
    p_period_id,
    a.employee_id,
    (a.total_days - a.weekly_off - a.holiday)::numeric(5,1)                  AS working_days,
    (a.full_present + a.half_day * 0.5)::numeric(5,1)                        AS present_days,
    a.half_day,
    (a.absent + a.half_day * 0.5)::numeric(5,1)                              AS absent_days,
    a.weekly_off,
    a.holiday,
    (COALESCE(r.paid_leave, 0) + COALESCE(r.unpaid_leave, 0))::numeric(5,1)  AS leave_days,
    a.on_duty::numeric(5,1),
    COALESCE(r.comp_off, 0)::numeric(5,1),
    -- LOP: working days neither attended nor covered by a PAID absence.
    -- Unpaid leave is deliberately not subtracted -- that is what makes it
    -- unpaid.
    GREATEST(0, (a.total_days - a.weekly_off - a.holiday)
                - LEAST((a.total_days - a.weekly_off - a.holiday),
                        (a.full_present + a.half_day * 0.5)
                        + COALESCE(r.paid_leave, 0) + a.on_duty
                        + COALESCE(r.comp_off, 0)))::numeric(5,1)            AS lop_days,
    LEAST((a.total_days - a.weekly_off - a.holiday),
          (a.full_present + a.half_day * 0.5)
          + COALESCE(r.paid_leave, 0) + a.on_duty
          + COALESCE(r.comp_off, 0))::numeric(5,1)                           AS payable_days,
    COALESCE(r.leave_by_type, '{}'::jsonb),
    COALESCE(r.sto_minutes, 0),
    COALESCE(a.late_minutes, 0),
    COALESCE(a.excused_minutes, 0),
    a.unprocessed
  FROM agg a
  LEFT JOIN req_agg r ON r.employee_id = a.employee_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Scheduled days and the pattern held, per person. See the section header.
  WITH staff_in AS (
    SELECT ps.staff_id, s.institution_id, s.category_id, ec.is_teaching, s.gender
      FROM public.hr_attendance_period_summaries ps
      JOIN public.staff s ON s.id = ps.staff_id
      JOIN public.employment_categories ec ON ec.id = s.category_id
     WHERE ps.period_id = p_period_id
  ),
  hol AS (
    SELECT h.holiday_date
      FROM public.fn_hr_calendar_holiday_dates(v_period.institution_id, v_start, v_end) h
  ),
  days AS (
    SELECT gs::date AS d FROM generate_series(v_start, v_end, interval '1 day') gs
  ),
  sched AS (
    SELECT si.staff_id,
           count(*) FILTER (
             WHERE COALESCE(
                     CASE WHEN (EXTRACT(ISODOW FROM dd.d) = 6
                                AND EXTRACT(DAY FROM dd.d) BETWEEN 8 AND 14
                                AND t.second_saturday_holiday) THEN false
                          ELSE t.is_working_day END,
                     false)
               AND NOT EXISTS (SELECT 1 FROM hol h WHERE h.holiday_date = dd.d)
           ) AS scheduled
      FROM staff_in si
      CROSS JOIN days dd
      LEFT JOIN LATERAL public.fn_shift_timing_pick(
        si.institution_id, si.category_id, si.is_teaching, si.gender,
        EXTRACT(ISODOW FROM dd.d)::smallint, dd.d,
        public.fn_staff_work_pattern_id(si.staff_id, dd.d)) t ON true
     GROUP BY si.staff_id
  ),
  pat AS (
    SELECT DISTINCT ON (a.staff_id) a.staff_id, a.work_pattern_id
      FROM public.hr_staff_work_pattern_assignments a
     WHERE a.effective_from <= v_end
       AND (a.effective_until IS NULL OR a.effective_until > v_start)
     ORDER BY a.staff_id, a.effective_from DESC
  )
  UPDATE public.hr_attendance_period_summaries ps
     SET scheduled_days  = sc.scheduled::numeric(5,1),
         work_pattern_id = pat.work_pattern_id
    FROM sched sc
    LEFT JOIN pat ON pat.staff_id = sc.staff_id
   WHERE ps.period_id = p_period_id
     AND ps.staff_id  = sc.staff_id;

  UPDATE public.hr_attendance_periods
     SET staff_count = v_rows,
         working_days_count = (
           SELECT max(working_days)::int
             FROM public.hr_attendance_period_summaries
            WHERE period_id = p_period_id
         ),
         updated_at = now()
   WHERE id = p_period_id;

  RETURN v_rows;
END;
$function$;

-- ============================================================================
-- 10 · Grants
-- ============================================================================

REVOKE ALL ON FUNCTION public.fn_staff_work_pattern_id(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_staff_work_pattern_id(uuid, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_shift_timing_pick(uuid, uuid, boolean, text, smallint, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_shift_timing_pick(uuid, uuid, boolean, text, smallint, date, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_hr_assign_work_pattern(uuid[], uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_assign_work_pattern(uuid[], uuid, date, text) TO authenticated;
