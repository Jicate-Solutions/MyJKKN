-- ONE live request per staff member per calendar day.
--
-- Leave, Short Time Off and Compensatory Off claims now occupy a day
-- exclusively: if any one of them is live (pending / escalated / approved) on a
-- date, no second request of any type or length may be filed for that date.
--
-- WHAT WAS ACTUALLY BROKEN. Three guards existed and none of them talked to
-- each other:
--
--   * hr_trig_leave_enforce_no_overlap blocked leave-vs-leave by date range,
--     but opened with `IF v_category IS DISTINCT FROM 'leave' THEN RETURN NEW`.
--     That single line is the whole reason Short Time Off and comp-off were
--     never checked against anything;
--   * hr_trig_sto_enforce_limits blocked two permissions on one day ONLY when
--     their clock times overlapped, so 09:05-09:35 plus 15:30-16:30 sailed
--     through -- 10 of the 13 real clashes in production;
--   * hr_comp_off_credits_employee_date_unique blocked two claims on one worked
--     date and nothing else.
--
-- Nothing anywhere compared the three categories. A staff member could hold
-- half-day casual leave, a permission and a comp-off claim on the same date.
--
-- ONE PREDICATE, TWO TRIGGERS. fn_hr_day_occupancy_clash is the single body
-- both triggers ask, so hr_leave_applications and hr_comp_off_credits cannot
-- drift into disagreeing about what "occupied" means -- the same discipline
-- fn_hr_leave_biometric_gap enforces between the approval queue and the
-- attendance gate. Both triggers take the SAME advisory lock, so a leave insert
-- and a comp-off insert for one employee cannot race past each other.

-- ---------------------------------------------------------------------------
-- 1. The predicate
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_hr_day_occupancy_clash(
  p_employee_id       uuid,
  p_from              date,
  p_to                date,
  p_exclude_leave_id  uuid DEFAULT NULL,
  p_exclude_credit_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_leave  record;
  v_credit record;
BEGIN
  -- A caller with nothing to check is not a clash. Returning NULL rather than
  -- raising keeps the drawer's read-only wrapper honest on a half-filled form.
  IF p_employee_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RETURN NULL;
  END IF;

  -- DEFINER, so this sees every category regardless of what the caller may
  -- read. A staff member cannot select another person's rows, and an approver
  -- filing on someone's behalf may not hold staff.view -- either way the answer
  -- has to be the same one the trigger will act on.
  SELECT lt.leave_type_name AS label,
         a.start_date, a.end_date, a.start_time, a.end_time, a.status
    INTO v_leave
  FROM public.hr_leave_applications a
  LEFT JOIN public.hr_leave_types lt ON lt.id = a.leave_type_id
  WHERE a.employee_id = p_employee_id
    AND a.status IN ('pending', 'approved', 'escalated')
    AND (p_exclude_leave_id IS NULL OR a.id IS DISTINCT FROM p_exclude_leave_id)
    -- Half-open range intersection. A multi-day leave occupies every day it
    -- spans, so one shared day is enough to refuse.
    AND a.start_date <= p_to
    AND p_from       <= a.end_date
  ORDER BY a.start_date
  LIMIT 1;

  IF FOUND THEN
    RETURN format('%s %s (%s)',
      COALESCE(v_leave.label, 'a request'),
      CASE
        WHEN v_leave.start_time IS NOT NULL AND v_leave.end_time IS NOT NULL
          THEN format('on %s, %s-%s',
                 to_char(v_leave.start_date, 'DD/MM/YYYY'),
                 to_char(v_leave.start_time, 'HH24:MI'),
                 to_char(v_leave.end_time,   'HH24:MI'))
        WHEN v_leave.start_date = v_leave.end_date
          THEN format('on %s', to_char(v_leave.start_date, 'DD/MM/YYYY'))
        ELSE format('from %s to %s',
                 to_char(v_leave.start_date, 'DD/MM/YYYY'),
                 to_char(v_leave.end_date,   'DD/MM/YYYY'))
      END,
      v_leave.status);
  END IF;

  -- Comp-off claims have no 'escalated': hcoc goes pending -> approved or
  -- withdrawn. Listing a status that cannot occur would read as though it can.
  SELECT c.worked_date, c.status
    INTO v_credit
  FROM public.hr_comp_off_credits c
  WHERE c.employee_id = p_employee_id
    AND c.status IN ('pending', 'approved')
    AND (p_exclude_credit_id IS NULL OR c.id IS DISTINCT FROM p_exclude_credit_id)
    AND c.worked_date BETWEEN p_from AND p_to
  ORDER BY c.worked_date
  LIMIT 1;

  IF FOUND THEN
    RETURN format('a compensatory off claim on %s (%s)',
      to_char(v_credit.worked_date, 'DD/MM/YYYY'), v_credit.status);
  END IF;

  RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION public.fn_hr_day_occupancy_clash(uuid, date, date, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_day_occupancy_clash(uuid, date, date, uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_hr_day_occupancy_clash(uuid, date, date, uuid, uuid) IS
  'NULL when the employee has no live leave / short time off / comp-off claim touching [p_from, p_to], else a human description of the first clash. THE body behind both day-occupancy triggers.';

-- ---------------------------------------------------------------------------
-- 2. Read-only wrapper for the apply drawers
-- ---------------------------------------------------------------------------
--
-- The drawers used to compute a clash client-side from the caller's own
-- application list, which (a) filtered to request_category='leave', exactly
-- mirroring the bug this migration fixes, and (b) reads a list the route caps
-- at 50 rows. Asking the SAME predicate the trigger asks means the warning and
-- the refusal cannot disagree.

CREATE OR REPLACE FUNCTION public.fn_hr_day_occupancy_check(
  p_employee_id uuid,
  p_from        date,
  p_to          date
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- "Does this person already have something that day" is about their
  -- whereabouts, so it is answered only for yourself, for a super admin, or for
  -- someone who already decides leave for others.
  IF NOT (
       p_employee_id = ANY (COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[]))
       OR public.is_super_admin()
       OR public.user_has_permission('hr.leave.approve')
     ) THEN
    RETURN NULL;
  END IF;

  RETURN public.fn_hr_day_occupancy_clash(p_employee_id, p_from, p_to, NULL, NULL);
END $function$;

REVOKE ALL ON FUNCTION public.fn_hr_day_occupancy_check(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_day_occupancy_check(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.fn_hr_day_occupancy_check(uuid, date, date) IS
  'Drawer-facing wrapper over fn_hr_day_occupancy_clash. Answers for yourself, a super admin, or a leave approver; NULL for anyone else.';

-- ---------------------------------------------------------------------------
-- 3. Clean up the days that already carry more than one request
-- ---------------------------------------------------------------------------
--
-- 13 (staff, day) pairs / 26 rows at the time of writing. Within each day the
-- survivor is ranked approved > escalated > pending, then earliest created --
-- status first SPECIFICALLY so an approved request is never the one cancelled
-- while a pending one survives. That ordering is what keeps this migration
-- safe: cancelling an approved LEAVE would restore its balance
-- (hr_trig_update_leave_balance) but NOT un-stamp the attendance day
-- (fn_recompute_attendance_on_leave_approval only fires on the way INTO
-- approved), leaving the day marked LEAVE with no request behind it. The
-- assertions below abort the migration rather than let that happen.
--
-- Cancelled, not deleted: DELETE reverses nothing here -- there is no AFTER
-- DELETE trigger to give the balance back -- and the staff member deserves to
-- see what happened to their request.

DO $cleanup$
DECLARE
  v_bad_approved int;
  v_multiday     int;
  v_locked       int;
  v_leave_rows   int;
  v_credit_rows  int;
  v_remaining    int;
BEGIN
  DROP TABLE IF EXISTS _occ;
  CREATE TEMP TABLE _occ (
    id uuid, src text, employee_id uuid, status text, cat text, label text,
    start_date date, end_date date, created_at timestamptz
  );

  INSERT INTO _occ
  SELECT a.id, 'leave_app', a.employee_id, a.status::text,
         COALESCE(lt.request_category, 'leave'),
         COALESCE(lt.leave_type_name, 'a request'),
         a.start_date, a.end_date, a.created_at
  FROM public.hr_leave_applications a
  LEFT JOIN public.hr_leave_types lt ON lt.id = a.leave_type_id
  WHERE a.status IN ('pending', 'approved', 'escalated');

  INSERT INTO _occ
  SELECT c.id, 'comp_off', c.employee_id, c.status::text, 'comp_off_claim',
         'Compensatory off claim', c.worked_date, c.worked_date, c.created_at
  FROM public.hr_comp_off_credits c
  WHERE c.status IN ('pending', 'approved');

  DROP TABLE IF EXISTS _ranked;
  CREATE TEMP TABLE _ranked AS
  WITH days AS (
    SELECT o.*, generate_series(o.start_date, o.end_date, interval '1 day')::date AS d
    FROM _occ o
  ),
  clash_days AS (
    SELECT employee_id, d FROM days GROUP BY employee_id, d HAVING count(*) > 1
  ),
  involved AS (
    SELECT dd.* FROM days dd
    JOIN clash_days cd ON cd.employee_id = dd.employee_id AND cd.d = dd.d
  )
  SELECT i.*,
         row_number() OVER (
           PARTITION BY i.employee_id, i.d
           ORDER BY CASE i.status WHEN 'approved' THEN 0 WHEN 'escalated' THEN 1 ELSE 2 END,
                    i.created_at, i.id
         ) AS rn
  FROM involved i;

  -- A row losing on ANY of its days loses outright; this migration cancels
  -- whole requests and never trims a date range.
  DROP TABLE IF EXISTS _losers;
  CREATE TEMP TABLE _losers AS
  SELECT DISTINCT ON (l.id)
         l.id, l.src, l.status, l.cat, l.start_date, l.end_date, l.employee_id, l.d,
         (SELECT format('%s on %s (%s)', w.label, to_char(w.d, 'DD/MM/YYYY'), w.status)
            FROM _ranked w
           WHERE w.employee_id = l.employee_id AND w.d = l.d AND w.rn = 1
           LIMIT 1) AS kept
  FROM _ranked l
  WHERE l.rn > 1
  ORDER BY l.id, l.d;

  -- ASSERTION 1: no approved request other than a Short Time Off is ever
  -- cancelled. Short Time Off is the one category whose cancellation is inert:
  -- hr_trig_update_leave_balance skips it (minute-backed, not day-backed) and
  -- fn_recompute_attendance_on_leave_approval skips it (hourly). Anything else
  -- approved would leave a balance or an attendance stamp inconsistent.
  SELECT count(*) INTO v_bad_approved
  FROM _losers WHERE status = 'approved' AND cat IS DISTINCT FROM 'short_time_off';
  IF v_bad_approved > 0 THEN
    RAISE EXCEPTION
      'Refusing to run: % approved non-short-time-off request(s) would be cancelled, which would strand a leave balance or an attendance stamp. Resolve those days by hand first.',
      v_bad_approved;
  END IF;

  -- ASSERTION 2: nothing multi-day. Cancelling a five-day leave because it
  -- collides on one afternoon is not a cleanup, it is a decision.
  SELECT count(*) INTO v_multiday FROM _losers WHERE end_date > start_date;
  IF v_multiday > 0 THEN
    RAISE EXCEPTION
      'Refusing to run: % multi-day request(s) would be cancelled over a single clashing day. Resolve those by hand.',
      v_multiday;
  END IF;

  -- ASSERTION 3: a locked attendance month refuses every write to these tables
  -- (hr_trig_block_leave_in_locked_period fires on DELETE and UPDATE too), so a
  -- locked row would abort the migration mid-way with a far less clear message.
  SELECT count(*) INTO v_locked
  FROM _losers l
  JOIN public.staff s ON s.id = l.employee_id
  JOIN public.hr_attendance_periods ap
    ON ap.institution_id = s.institution_id
   AND ap.status = 'locked'
   AND make_date(ap.period_year, ap.period_month, 1) <= l.end_date
   AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > l.start_date;
  IF v_locked > 0 THEN
    RAISE EXCEPTION
      'Refusing to run: % duplicate request(s) fall in a locked attendance month. Reopen the month or resolve those rows by hand.',
      v_locked;
  END IF;

  UPDATE public.hr_leave_applications a
     SET status = 'cancelled',
         rejection_reason = format(
           'Automatically cancelled: only one leave, permission or compensatory off request is allowed per day. Kept %s.',
           COALESCE(l.kept, 'the other request')),
         updated_at = now()
    FROM _losers l
   WHERE l.src = 'leave_app' AND a.id = l.id;
  GET DIAGNOSTICS v_leave_rows = ROW_COUNT;

  UPDATE public.hr_comp_off_credits c
     SET status = 'withdrawn',
         notes = trim(both E' \n' from
           COALESCE(c.notes, '') || E'\n' || format(
             'Automatically withdrawn: only one leave, permission or compensatory off request is allowed per day. Kept %s.',
             COALESCE(l.kept, 'the other request'))),
         updated_at = now()
    FROM _losers l
   WHERE l.src = 'comp_off' AND c.id = l.id;
  GET DIAGNOSTICS v_credit_rows = ROW_COUNT;

  RAISE NOTICE 'Day-occupancy cleanup: % leave/STO cancelled, % comp-off claim(s) withdrawn.',
    v_leave_rows, v_credit_rows;

  -- Prove it worked before the triggers are armed, so a failure here is a
  -- rolled-back migration rather than a table that refuses every future insert.
  WITH live AS (
    SELECT a.employee_id, a.start_date, a.end_date
    FROM public.hr_leave_applications a
    WHERE a.status IN ('pending', 'approved', 'escalated')
    UNION ALL
    SELECT c.employee_id, c.worked_date, c.worked_date
    FROM public.hr_comp_off_credits c
    WHERE c.status IN ('pending', 'approved')
  ),
  days AS (
    SELECT employee_id, generate_series(start_date, end_date, interval '1 day')::date AS d
    FROM live
  )
  SELECT count(*) INTO v_remaining
  FROM (SELECT employee_id, d FROM days GROUP BY employee_id, d HAVING count(*) > 1) x;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Cleanup left % clashing (staff, day) pair(s); refusing to arm the triggers.', v_remaining;
  END IF;

  DROP TABLE IF EXISTS _losers;
  DROP TABLE IF EXISTS _ranked;
  DROP TABLE IF EXISTS _occ;
END $cleanup$;

-- ---------------------------------------------------------------------------
-- 4. Arm the rule on hr_leave_applications
-- ---------------------------------------------------------------------------
--
-- Same function name and same trigger name as the leave-only version it
-- replaces, so nothing that greps for either goes looking for a rename. The
-- error code stays 23505: comp-off-service.ts and the drawers already branch on
-- it, and a new code would silently fall through to a raw Postgres message.

CREATE OR REPLACE FUNCTION public.hr_trig_leave_enforce_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_clash text;
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'escalated') THEN
    RETURN NEW;
  END IF;

  -- No category filter. The `IF v_category IS DISTINCT FROM 'leave'` that used
  -- to sit here is exactly why Short Time Off and comp-off were never checked.

  -- Shared with trg_hcoc_day_occupancy: without ONE key, a leave insert and a
  -- comp-off insert for the same employee could each read a free day and both
  -- commit.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.employee_id::text || ':day-occupancy', 0)
  );

  v_clash := public.fn_hr_day_occupancy_clash(
    NEW.employee_id, NEW.start_date, NEW.end_date, NEW.id, NULL);

  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION
      'Only one request is allowed per day. This clashes with %. Cancel that one first, or pick a different date.',
      v_clash
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END $function$;

-- duration_type joins the column list: a first_half -> full edit changes which
-- days the row occupies and used to skip the check entirely.
DROP TRIGGER IF EXISTS trg_hla_leave_overlap ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_leave_overlap
  BEFORE INSERT OR UPDATE OF start_date, end_date, leave_type_id, duration_type
  ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_leave_enforce_no_overlap();

COMMENT ON FUNCTION public.hr_trig_leave_enforce_no_overlap() IS
  'One live request per employee per day, across leave, short time off and comp-off claims. Asks fn_hr_day_occupancy_clash.';

-- ---------------------------------------------------------------------------
-- 5. Arm the same rule on hr_comp_off_credits
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hr_trig_comp_off_day_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_clash text;
BEGIN
  IF NEW.status NOT IN ('pending', 'approved') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.employee_id::text || ':day-occupancy', 0)
  );

  v_clash := public.fn_hr_day_occupancy_clash(
    NEW.employee_id, NEW.worked_date, NEW.worked_date, NULL, NEW.id);

  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION
      'Only one request is allowed per day. This clashes with %. Cancel that one first, or claim a different date.',
      v_clash
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_hcoc_day_occupancy ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_day_occupancy
  BEFORE INSERT OR UPDATE OF worked_date, status
  ON public.hr_comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_comp_off_day_occupancy();

COMMENT ON FUNCTION public.hr_trig_comp_off_day_occupancy() IS
  'Mirror of trg_hla_leave_overlap on the claims table. Same predicate, same advisory lock, same 23505.';

-- ---------------------------------------------------------------------------
-- 6. Make the comp-off uniqueness live-only
-- ---------------------------------------------------------------------------
--
-- hr_comp_off_credits_employee_date_unique covers (employee_id, worked_date)
-- with NO status filter, so a withdrawn or rejected claim blocks that date
-- FOREVER -- two people are already stuck that way, and the cleanup above adds
-- a third by withdrawing a claim. A dead claim must not reserve a date.
--
-- The rule itself now lives in trg_hcoc_day_occupancy; this index stays as the
-- race-proof backstop for the one case it can express.

ALTER TABLE public.hr_comp_off_credits
  DROP CONSTRAINT IF EXISTS hr_comp_off_credits_employee_date_unique;
DROP INDEX IF EXISTS public.hr_comp_off_credits_employee_date_unique;

CREATE UNIQUE INDEX hr_comp_off_credits_employee_date_live_unique
  ON public.hr_comp_off_credits (employee_id, worked_date)
  WHERE status IN ('pending', 'approved');

COMMENT ON INDEX public.hr_comp_off_credits_employee_date_live_unique IS
  'One LIVE claim per employee per worked date. Partial on purpose: a withdrawn or rejected claim must not reserve the date for ever.';
