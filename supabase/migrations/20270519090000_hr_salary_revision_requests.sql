-- ============================================================================
-- Migration: 20270519090000_hr_salary_revision_requests
-- Ask for a salary revision -> (principal's check) -> the Director's yes or no
-- -> the new pay starts on the 1st of the month after his yes.
-- ============================================================================
-- !!! MUST NOT MERGE OR APPLY BEFORE #4103, #4111 AND #4119 !!!
--   Stacked on #4119 (feat/hr-salary-suggestion), which is stacked on #4103.
--   The suggested figure shown beside every request is #4119's; the band
--   warning is #4103's; #4111 is what keeps the rule and the band unreadable to
--   every signed-in account. hr_salary_revision_suggestion_inputs() below reads
--   the same two platform_policies rows #4119 reads.
-- ============================================================================
-- Created: 2026-09-29. The Director's 16 rulings of 29 Sep 2026 (interview):
--    1. Who may ASK: the principal (their college only), the head of department
--       (their department only), the HR head (anyone).
--    2. An HOD's request goes to the principal of that college first. Principal
--       agrees -> the Director; principal stops it -> closed with a reason, the
--       HOD is told. A principal's or the HR head's request goes straight to him.
--    3. The final yes is always the Director: is_super_admin() OR the new key
--       hr.payroll.salary_revision.approve, granted to NOBODY here.
--    4. The new pay starts on the 1st of the month AFTER his yes. Never
--       backdated. Never a month payroll is already working on.
--    5. The person is told in-app ONLY after a yes; never about a no.
--    6. Above the band maximum is allowed, with a red warning to him (#4103).
--    7. A pay cut may be asked for; it is marked as a CUT everywhere.
--    8. Principals and HODs may see the pay of their own people, only inside
--       this workflow. THIS WIDENS THE 21 AUG NARROWING (20260821230000) ON
--       PURPOSE: hr_staff_salaries itself stays super admin + HR head only; the
--       pay reaches principals and HODs through the scoped functions below.
--    9. Asking for oneself or for a senior is allowed, and flagged.
--   10. ONE open request per person, enforced by a partial unique index. A
--       second asker is told one is waiting and may comment on it.
--   11. A weekly reminder to him listing everything waiting. Nothing expires,
--       nothing approves itself.
--   12. He may change the amount when approving; the asker sees his figure.
--   13. The asker must write a reason; #4119's suggestion is shown beside it.
--   14. A no needs a short reason; only the asker (and, for an HOD's request,
--       the principal) sees it.
--   15. He gets a tick-box list and can approve several together.
--   16. The 18 Sep ruling stands: the band is reference only; nothing changes
--       pay without his yes.
--
-- WHY THE PAY IS WRITTEN ON THE START DATE AND NOT ON THE DAY OF THE YES
--   hr_staff_salaries keeps ONE current row per person (superseded_by IS NULL)
--   and every reader takes that row as "the pay now": the salary register
--   (salary-register-service.ts), Employee Salaries, the pay band check and
--   #4119's suggestion. None of them looks at effective_from. A row written on
--   29 Sep with effective_from 1 Oct would be read as September's pay the
--   moment it was saved. So the yes records the decision (status 'approved',
--   starts_on) and hr_salary_revision_apply_due_on() writes the salary row, via
--   fn_hr_set_staff_salary, only once starts_on has arrived.
--
--   That still leaves one hole: September's register is generated in early
--   October, AFTER the 1 Oct write, and would read October's pay. So the
--   register now reads hr_staff_salaries_in_force(ids, <last day of its month>)
--   which walks back along superseded_by past any row that starts after that
--   day. For every row that does not start in the future this returns exactly
--   the row the register read before. It also closes the same hole for the
--   future-dated rows HR can already type into the plain Update salary dialog.
--
-- WHAT A PERSON SEES
--   Requests: the asker their own; a principal their college's; an HOD their
--   department's; the HR head and the Director all. NOBODY in those lanes sees
--   a request about their OWN pay unless they asked for it — an HOD would
--   otherwise read a refusal about themselves (ruling 5).
--   The person whose pay it is sees ONLY hr_salary_revision_outcomes: the new
--   figure and the start date, written at the Director's yes. Never the
--   request, the reason, the asker, the comments or a refusal.
--   Reasons for a no or a stop live in hr_salary_revision_decision_notes, a
--   separate table, because RLS grants whole rows and ruling 14 is narrower
--   than "whoever can see the request".
--
-- WRITES go only through the SECURITY DEFINER functions below. The four tables
-- have SELECT policies and nothing else, and INSERT/UPDATE/DELETE are revoked.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_salary_revision_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The person whose pay it is.
  staff_id               uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  -- Where they worked and in which department WHEN ASKED. Snapshots, so a
  -- transfer does not move a request into another principal's list.
  institution_id         uuid NOT NULL REFERENCES public.institutions(id),
  department_id          uuid REFERENCES public.departments(id) ON DELETE SET NULL,

  asked_by               uuid NOT NULL,
  asked_as               text NOT NULL
                           CHECK (asked_as IN ('director', 'hr_head', 'principal', 'hod')),
  route                  text NOT NULL CHECK (route IN ('direct', 'via_principal')),
  is_self                boolean NOT NULL DEFAULT false,
  is_for_senior          boolean NOT NULL DEFAULT false,

  current_monthly_gross  numeric(12,2) NOT NULL CHECK (current_monthly_gross > 0),
  asked_monthly_gross    numeric(12,2) NOT NULL CHECK (asked_monthly_gross > 0),
  is_cut                 boolean GENERATED ALWAYS AS (asked_monthly_gross < current_monthly_gross) STORED,
  reason                 text NOT NULL
                           CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),

  status                 text NOT NULL CHECK (status IN (
                           'waiting_principal', 'waiting_director',
                           'approved', 'applied', 'stopped', 'refused')),

  principal_decided_by   uuid,
  principal_decided_at   timestamptz,
  director_decided_by    uuid,
  director_decided_at    timestamptz,

  final_monthly_gross    numeric(12,2) CHECK (final_monthly_gross > 0),
  final_is_cut           boolean GENERATED ALWAYS AS (final_monthly_gross < current_monthly_gross) STORED,
  starts_on              date,

  applied_salary_id      uuid REFERENCES public.hr_staff_salaries(id),
  applied_at             timestamptz,
  -- Why an approved revision whose date has come could not be written yet.
  apply_note             text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  -- Only an HOD's request goes via the principal.
  CONSTRAINT hr_srr_via_principal_is_hod
    CHECK (route = 'direct' OR asked_as = 'hod'),
  CONSTRAINT hr_srr_waiting_principal_route
    CHECK (status <> 'waiting_principal' OR route = 'via_principal'),
  -- A request that went via the principal left that step with a decision.
  CONSTRAINT hr_srr_principal_decided
    CHECK (route = 'direct' OR status = 'waiting_principal'
           OR (principal_decided_by IS NOT NULL AND principal_decided_at IS NOT NULL)),
  CONSTRAINT hr_srr_stopped_only_via_principal
    CHECK (status <> 'stopped' OR route = 'via_principal'),
  CONSTRAINT hr_srr_director_decided
    CHECK (status NOT IN ('approved', 'applied', 'refused')
           OR (director_decided_by IS NOT NULL AND director_decided_at IS NOT NULL)),
  -- A yes always carries the figure and a start on the 1st of a month.
  CONSTRAINT hr_srr_approved_has_figure_and_start
    CHECK (status NOT IN ('approved', 'applied')
           OR (final_monthly_gross IS NOT NULL AND starts_on IS NOT NULL
               AND EXTRACT(DAY FROM starts_on) = 1)),
  CONSTRAINT hr_srr_applied_has_salary
    CHECK ((status = 'applied') = (applied_salary_id IS NOT NULL AND applied_at IS NOT NULL))
);

-- RULING 10: one open request per person. 'approved' counts as open: until the
-- new pay is written, a second yes could be applied on top of the first.
CREATE UNIQUE INDEX IF NOT EXISTS hr_salary_revision_requests_one_open
  ON public.hr_salary_revision_requests (staff_id)
  WHERE status IN ('waiting_principal', 'waiting_director', 'approved');

CREATE INDEX IF NOT EXISTS hr_salary_revision_requests_status_idx
  ON public.hr_salary_revision_requests (status, starts_on);
CREATE INDEX IF NOT EXISTS hr_salary_revision_requests_institution_idx
  ON public.hr_salary_revision_requests (institution_id);
CREATE INDEX IF NOT EXISTS hr_salary_revision_requests_department_idx
  ON public.hr_salary_revision_requests (department_id);
CREATE INDEX IF NOT EXISTS hr_salary_revision_requests_asked_by_idx
  ON public.hr_salary_revision_requests (asked_by);

DROP TRIGGER IF EXISTS trg_hr_salary_revision_requests_updated_at ON public.hr_salary_revision_requests;
CREATE TRIGGER trg_hr_salary_revision_requests_updated_at
  BEFORE UPDATE ON public.hr_salary_revision_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.hr_salary_revision_requests IS
  'A request to change one person''s monthly pay: asked by a principal, an HOD or the HR head; checked by the principal when an HOD asked; decided by the Director. The pay itself is written to hr_staff_salaries only on starts_on. See 20270519090000.';

CREATE TABLE IF NOT EXISTS public.hr_salary_revision_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES public.hr_salary_revision_requests(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL,
  body        text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_salary_revision_comments_request_idx
  ON public.hr_salary_revision_comments (request_id, created_at);

COMMENT ON TABLE public.hr_salary_revision_comments IS
  'Comments on a salary revision request, seen by whoever can see the request. Never by the person whose pay it is.';

CREATE TABLE IF NOT EXISTS public.hr_salary_revision_decision_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES public.hr_salary_revision_requests(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('stopped', 'refused')),
  reason      text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  written_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_salary_revision_decision_notes_one UNIQUE (request_id, kind)
);

COMMENT ON TABLE public.hr_salary_revision_decision_notes IS
  'Why a request was stopped (principal) or refused (Director). RULING 14: only the asker, the principal for an HOD''s request, and the Director see it — narrower than the request itself, hence its own table.';

CREATE TABLE IF NOT EXISTS public.hr_salary_revision_outcomes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id              uuid NOT NULL UNIQUE REFERENCES public.hr_salary_revision_requests(id) ON DELETE CASCADE,
  staff_id                uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  previous_monthly_gross  numeric(12,2) NOT NULL,
  new_monthly_gross       numeric(12,2) NOT NULL CHECK (new_monthly_gross > 0),
  is_cut                  boolean GENERATED ALWAYS AS (new_monthly_gross < previous_monthly_gross) STORED,
  starts_on               date NOT NULL CHECK (EXTRACT(DAY FROM starts_on) = 1),
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_salary_revision_outcomes_staff_idx
  ON public.hr_salary_revision_outcomes (staff_id);

COMMENT ON TABLE public.hr_salary_revision_outcomes IS
  'What the person whose pay it is may know: the new monthly pay and the day it starts. Written only at the Director''s yes (ruling 5). Nothing about who asked, why, or any refusal.';

-- ----------------------------------------------------------------------------
-- 2. Small helpers
-- ----------------------------------------------------------------------------

-- Today in India. The day a yes is given decides the month the pay starts, and
-- a server clock in UTC would move 00:00-05:29 IST into the previous day.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_ist_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date
$function$;

-- "₹1,25,000" — Indian grouping, for notification text.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_rupees(p_amount numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_whole text;
  v_paise numeric;
  v_head  text;
BEGIN
  IF p_amount IS NULL THEN RETURN '—'; END IF;
  v_whole := trunc(abs(p_amount))::bigint::text;
  v_paise := round((abs(p_amount) - trunc(abs(p_amount))) * 100);
  IF length(v_whole) > 3 THEN
    v_head := left(v_whole, length(v_whole) - 3);
    v_head := regexp_replace(v_head, '(\d)(?=(\d{2})+$)', '\1,', 'g');
    v_whole := v_head || ',' || right(v_whole, 3);
  END IF;
  RETURN CASE WHEN p_amount < 0 THEN '-' ELSE '' END || '₹' || v_whole
         || CASE WHEN v_paise > 0 THEN '.' || lpad(v_paise::int::text, 2, '0') ELSE '' END;
END;
$function$;

-- Does THIS user (any user, not the caller) hold a permission through a role?
-- The same two lanes as user_has_permission() — user_roles and the legacy
-- profiles.role — tested by VALUE. Used to decide who is senior to whom and who
-- the principal of a college is. Internal: nobody signed in may call it.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_user_holds(p_user uuid, p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_user IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_roles ur
              JOIN public.custom_roles cr ON cr.id = ur.role_id
             WHERE ur.user_id = p_user
               AND (cr.permissions ->> p_key)::boolean IS TRUE)
    OR EXISTS (SELECT 1 FROM public.profiles pr
                 JOIN public.custom_roles cr ON cr.role_key = pr.role
                WHERE pr.id = p_user
                  AND (cr.permissions ->> p_key)::boolean IS TRUE))
$function$;

-- How senior a user is in THIS workflow: 4 the Director (super admin or the
-- approve key), 3 the HR head (ask anyone), 2 a principal, 1 an HOD, 0 anyone
-- else. Decided by permission keys, never by role names.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_user_tier(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_user IS NULL THEN 0
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND is_super_admin IS TRUE)
      OR public.hr_salary_revision_user_holds(p_user, 'hr.payroll.salary_revision.approve') THEN 4
    WHEN public.hr_salary_revision_user_holds(p_user, 'hr.payroll.salary_revision.ask_anyone') THEN 3
    WHEN public.hr_salary_revision_user_holds(p_user, 'hr.payroll.salary_revision.ask_own_college')
      OR public.hr_salary_revision_user_holds(p_user, 'hr.payroll.salary_revision.college_check') THEN 2
    WHEN public.hr_salary_revision_user_holds(p_user, 'hr.payroll.salary_revision.ask_own_department') THEN 1
    ELSE 0
  END
$function$;

-- The caller's own departments (from their active staff rows). Called only
-- from the SECURITY DEFINER functions below (never from a policy), so it is not
-- granted to signed-in users at all.
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_my_department_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT s.department_id), ARRAY[]::uuid[])
    FROM public.staff s
   WHERE s.profile_id = auth.uid()
     AND s.is_active
     AND s.department_id IS NOT NULL
$function$;

-- RULING 3: the final yes is the Director's — a super admin, or whoever is
-- given hr.payroll.salary_revision.approve (nobody, as shipped).
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_can_approve()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin() OR public.user_has_permission('hr.payroll.salary_revision.approve')
$function$;

-- May the CALLER see a request with these facts? One function for the RLS
-- policy AND every definer read below, so the two cannot drift apart.
--   the Director: everything
--   the asker: their own requests
--   otherwise, never a request about the caller's own pay, and then:
--     ask_anyone (HR head): everything
--     ask_own_college / college_check (principal): their own college
--     ask_own_department (HOD): their own department
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_can_see(
  p_staff_id uuid, p_institution_id uuid, p_department_id uuid, p_asked_by uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.fn_hr_salary_revision_can_approve()
    OR p_asked_by = auth.uid()
    OR (
      NOT (p_staff_id = ANY (public.fn_my_staff_ids()))
      AND (
        public.user_has_permission('hr.payroll.salary_revision.ask_anyone')
        OR ((public.user_has_permission('hr.payroll.salary_revision.ask_own_college')
             OR public.user_has_permission('hr.payroll.salary_revision.college_check'))
            AND p_institution_id = ANY (public.fn_my_staff_institution_ids()))
        OR (public.user_has_permission('hr.payroll.salary_revision.ask_own_department')
            AND p_department_id = ANY (public.fn_hr_salary_revision_my_department_ids()))
      )
    )
  )
$function$;

-- In-app notice: a notifications row plus one user_notifications row per
-- recipient — the bell reads user_notifications, and a notifications row
-- without them reaches nobody (20261113000000). A failed notice must not undo
-- a decision, so it is caught and reported as a WARNING.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_notify(
  p_recipients uuid[], p_title text, p_body text, p_url text, p_key text, p_meta jsonb)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_to    uuid[];
  v_notif uuid;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT r), ARRAY[]::uuid[]) INTO v_to
    FROM unnest(p_recipients) AS r WHERE r IS NOT NULL;
  IF cardinality(v_to) = 0 THEN RETURN NULL; END IF;

  BEGIN
    INSERT INTO public.notifications
      (title, body, category, kind, targeting, url, priority,
       created_by, expires_at, idempotency_key, metadata)
    VALUES (
      p_title, p_body, 'hr:salary_revision', 'work_item',
      jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_to)),
      p_url, 'normal',
      COALESCE(auth.uid(), v_to[1]),
      now() + interval '60 days',
      p_key,
      COALESCE(p_meta, '{}'::jsonb) || jsonb_build_object('source', 'hr.payroll.salary_revision'))
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_notif;

    IF v_notif IS NULL THEN
      SELECT n.id INTO v_notif FROM public.notifications n WHERE n.idempotency_key = p_key;
    END IF;

    INSERT INTO public.user_notifications (notification_id, user_id)
    SELECT v_notif, r FROM unnest(v_to) AS r
    ON CONFLICT (notification_id, user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'hr_salary_revision_notify: % not delivered: %', p_key, SQLERRM;
    RETURN NULL;
  END;
  RETURN v_notif;
END;
$function$;

-- RULING 4: the 1st of the month after today (India), moved on by a month for
-- as long as a live salary register already exists for that month for the
-- person's paying organisation — payroll is already working on it.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_start_date(p_staff_id uuid, p_today date)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := (date_trunc('month', p_today) + interval '1 month')::date;
  v_org   uuid;
BEGIN
  SELECT hr_organization_id INTO v_org
    FROM public.hr_staff_salaries
   WHERE staff_id = p_staff_id AND superseded_by IS NULL;

  FOR i IN 1..24 LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.hr_salary_register_runs rr
       WHERE rr.hr_organization_id = v_org
         AND rr.period_year = EXTRACT(YEAR FROM v_start)::int
         AND rr.period_month = EXTRACT(MONTH FROM v_start)::int
         AND rr.superseded_by IS NULL);
    v_start := (v_start + interval '1 month')::date;
  END LOOP;
  RETURN v_start;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3. The salary in force on a day — what the register reads now
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER: the caller's own RLS on hr_staff_salaries applies, exactly
-- as it did to the register's direct read this replaces.
-- From the current row, walk back along superseded_by while the row starts
-- AFTER p_on; the first row that starts on or before p_on is the pay in force.
-- A current row that does not start in the future is returned as it is, so for
-- everybody without a future-dated row nothing changes.
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
     WHERE c.effective_from <= p_on
     ORDER BY c.staff_id, c.depth
  )
  SELECT s.id, s.staff_id, s.monthly_gross, s.effective_from,
         s.eligible_for_pf, s.epf_amount, s.eligible_for_esi, s.esi_amount, s.allowance_amount
    FROM public.hr_staff_salaries s
    JOIN pick ON pick.id = s.id
$function$;

COMMENT ON FUNCTION public.hr_staff_salaries_in_force(uuid[], date) IS
  'The salary row in force on p_on for each person: the current row, or, when it starts after p_on, the row it replaced (walked back along superseded_by). The salary register reads this for the last day of its month so a raise that starts next month never reaches this month. SECURITY INVOKER: the caller''s own RLS applies.';

-- ----------------------------------------------------------------------------
-- 4. Reads for the workflow screens
-- ----------------------------------------------------------------------------

-- The people the caller may ask for, with the pay now (RULING 8 — only here).
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_people()
RETURNS TABLE(
  staff_uuid uuid, person_name text, staff_code text, designation text,
  institution_id uuid, institution_name text, department_id uuid, department_name text,
  monthly_gross numeric, is_self boolean, open_request_id uuid, open_request_status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_any  boolean := public.user_has_permission('hr.payroll.salary_revision.ask_anyone');
  v_col  boolean := public.user_has_permission('hr.payroll.salary_revision.ask_own_college');
  v_dep  boolean := public.user_has_permission('hr.payroll.salary_revision.ask_own_department');
  v_inst uuid[]  := public.fn_my_staff_institution_ids();
  v_deps uuid[]  := public.fn_hr_salary_revision_my_department_ids();
  v_mine uuid[]  := public.fn_my_staff_ids();
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.user_has_permission('hr.payroll.salary_revision.ask_anyone')
             OR public.user_has_permission('hr.payroll.salary_revision.ask_own_college')
             OR public.user_has_permission('hr.payroll.salary_revision.ask_own_department')) THEN
    RAISE EXCEPTION 'Only a principal, a head of department or the HR head can ask for a salary revision.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.id,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.staff_id::text,
         s.designation::text,
         s.institution_id,
         i.name::text,
         s.department_id,
         d.department_name::text,
         sal.monthly_gross,
         s.id = ANY (v_mine),
         o.id,
         o.status
    FROM public.v_hr_staff s
    JOIN public.institutions i ON i.id = s.institution_id
    JOIN public.hr_staff_salaries sal ON sal.staff_id = s.id AND sal.superseded_by IS NULL
    LEFT JOIN public.departments d ON d.id = s.department_id
    LEFT JOIN public.hr_salary_revision_requests o
           ON o.staff_id = s.id AND o.status IN ('waiting_principal', 'waiting_director', 'approved')
   WHERE COALESCE(s.is_active, false)
     AND (v_any
          OR (v_col AND s.institution_id = ANY (v_inst))
          OR (v_dep AND s.department_id = ANY (v_deps)))
   ORDER BY i.name, 2;
END;
$function$;

-- Requests the caller may see, with names. p_view:
--   'mine'     — asked by the caller
--   'college'  — waiting for the caller's check as principal
--   'director' — everything (the Director only)
--   'all'      — everything the caller may see
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_list(p_view text DEFAULT 'all')
RETURNS TABLE(
  id uuid, staff_id uuid, person_name text, staff_code text, designation text,
  institution_id uuid, institution_name text, department_name text,
  asked_by uuid, asked_by_name text, asked_as text, route text,
  is_self boolean, is_for_senior boolean,
  current_monthly_gross numeric, asked_monthly_gross numeric, is_cut boolean,
  final_monthly_gross numeric, final_is_cut boolean,
  reason text, status text, starts_on date,
  created_at timestamptz, principal_decided_at timestamptz,
  director_decided_at timestamptz, applied_at timestamptz, comment_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_view NOT IN ('mine', 'college', 'director', 'all') THEN
    RAISE EXCEPTION 'Unknown list: %', p_view USING ERRCODE = '22023';
  END IF;
  IF p_view = 'director' AND NOT public.fn_hr_salary_revision_can_approve() THEN
    RAISE EXCEPTION 'Only the Director can open the approval list.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_view = 'college' AND NOT public.user_has_permission('hr.payroll.salary_revision.college_check') THEN
    RAISE EXCEPTION 'Only a principal can open the principal''s check list.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT r.id, r.staff_id,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.staff_id::text, s.designation::text,
         r.institution_id, i.name::text, d.department_name::text,
         r.asked_by, COALESCE(pr.full_name, 'Someone')::text, r.asked_as, r.route,
         r.is_self, r.is_for_senior,
         r.current_monthly_gross, r.asked_monthly_gross, r.is_cut,
         r.final_monthly_gross, r.final_is_cut,
         r.reason, r.status, r.starts_on,
         r.created_at, r.principal_decided_at, r.director_decided_at, r.applied_at,
         (SELECT count(*)::int FROM public.hr_salary_revision_comments c WHERE c.request_id = r.id)
    FROM public.hr_salary_revision_requests r
    JOIN public.staff s ON s.id = r.staff_id
    JOIN public.institutions i ON i.id = r.institution_id
    LEFT JOIN public.departments d ON d.id = r.department_id
    LEFT JOIN public.profiles pr ON pr.id = r.asked_by
   WHERE public.fn_hr_salary_revision_can_see(r.staff_id, r.institution_id, r.department_id, r.asked_by)
     AND (p_view <> 'mine' OR r.asked_by = v_uid)
     AND (p_view <> 'college' OR (
           r.status = 'waiting_principal'
           AND r.institution_id = ANY (public.fn_my_staff_institution_ids())
           AND NOT (r.staff_id = ANY (public.fn_my_staff_ids()))))
   ORDER BY CASE r.status WHEN 'waiting_director' THEN 0 WHEN 'waiting_principal' THEN 1
                          WHEN 'approved' THEN 2 ELSE 3 END,
            r.created_at DESC;
END;
$function$;

-- One request, with its comments and — only for those ruling 14 allows — the
-- reason it was stopped or refused. NULL when the caller may not see it.
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_get(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row  record;
  v_note jsonb;
BEGIN
  SELECT * INTO v_row FROM public.fn_hr_salary_revision_list('all') l WHERE l.id = p_request_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT jsonb_build_object('kind', n.kind, 'reason', n.reason, 'created_at', n.created_at)
    INTO v_note
    FROM public.hr_salary_revision_decision_notes n
    JOIN public.hr_salary_revision_requests r ON r.id = n.request_id
   WHERE n.request_id = p_request_id
     AND (public.fn_hr_salary_revision_can_approve()
          OR r.asked_by = auth.uid()
          OR (r.route = 'via_principal'
              AND public.user_has_permission('hr.payroll.salary_revision.college_check')
              AND r.institution_id = ANY (public.fn_my_staff_institution_ids())
              AND NOT (r.staff_id = ANY (public.fn_my_staff_ids()))))
   ORDER BY n.created_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'request', to_jsonb(v_row),
    'decision_note', v_note,
    'comments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', c.id, 'body', c.body, 'created_at', c.created_at,
               'author_name', COALESCE(pr.full_name, 'Someone'))
             ORDER BY c.created_at)
        FROM public.hr_salary_revision_comments c
        LEFT JOIN public.profiles pr ON pr.id = c.author_id
       WHERE c.request_id = p_request_id), '[]'::jsonb));
END;
$function$;

-- What the suggestion and the band warning need about each person. The raw
-- band and rule must not reach a principal's or an HOD's browser (#4103,
-- #4111), so this is for the SERVER only: EXECUTE is granted to service_role
-- and nobody else. The route calls it only for staff ids the caller's own
-- scoped read above has already returned.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_suggestion_inputs(p_staff_ids uuid[])
RETURNS TABLE(
  staff_uuid uuid, institution_id uuid, designation text, date_of_joining date,
  experience_years integer, has_extended_profile boolean, qualifications jsonb,
  research_papers integer, monthly_gross numeric, band jsonb, rule jsonb,
  rule_source text, rule_updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.institution_id, s.designation::text, s.date_of_joining,
         s.experience_years, s.has_extended_profile, s.qualifications,
         s.research_papers, sal.monthly_gross, bp.value,
         COALESCE(rc.value, rg.value),
         CASE WHEN rc.id IS NOT NULL THEN 'college'
              WHEN rg.id IS NOT NULL THEN 'group' END,
         COALESCE(rc.updated_at, rg.updated_at)
    FROM public.v_hr_staff s
    LEFT JOIN public.hr_staff_salaries sal
           ON sal.staff_id = s.id AND sal.superseded_by IS NULL
    LEFT JOIN public.platform_policies bp
           ON bp.policy_key = 'hr.pay_scales' AND bp.scope_type = 'institution'
          AND bp.scope_id = s.institution_id
    LEFT JOIN public.platform_policies rc
           ON rc.policy_key = 'hr.salary_suggestion_rule' AND rc.scope_type = 'institution'
          AND rc.scope_id = s.institution_id AND rc.is_active IS NOT FALSE
          AND rc.publication_state <> 'draft_only'
          AND public.hr_salary_rule_has_amount(rc.value)
    LEFT JOIN public.platform_policies rg
           ON rg.policy_key = 'hr.salary_suggestion_rule' AND rg.scope_type = 'global'
          AND rg.scope_id IS NULL AND rg.is_active IS NOT FALSE
          AND rg.publication_state <> 'draft_only'
          AND public.hr_salary_rule_has_amount(rg.value)
   WHERE s.id = ANY (p_staff_ids)
$function$;

-- ----------------------------------------------------------------------------
-- 5. Asking
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_propose(
  p_staff_id uuid, p_monthly_gross numeric, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_s        record;
  v_current  numeric;
  v_as       text;
  v_cap_tier integer;
  v_sub_tier integer;
  v_route    text;
  v_open     uuid;
  v_id       uuid;
  v_self     boolean;
  v_name     text;
  v_checkers uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_monthly_gross IS NULL OR p_monthly_gross <= 0 THEN
    RAISE EXCEPTION 'The new monthly pay must be more than zero.' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Write a reason. The Director reads it before he decides.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(p_reason)) > 2000 THEN
    RAISE EXCEPTION 'The reason is too long (2,000 characters at most).' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.profile_id, s.institution_id, s.department_id, s.first_name, s.last_name
    INTO v_s
    FROM public.v_hr_staff s
   WHERE s.id = p_staff_id AND COALESCE(s.is_active, false);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This person is not on the HR list of active team members.' USING ERRCODE = 'P0002';
  END IF;

  -- RULING 1 — who may ask for whom. The broadest lane the caller holds wins.
  IF public.fn_hr_salary_revision_can_approve() THEN
    v_as := 'director'; v_cap_tier := 4;
  ELSIF public.user_has_permission('hr.payroll.salary_revision.ask_anyone') THEN
    v_as := 'hr_head'; v_cap_tier := 3;
  ELSIF public.user_has_permission('hr.payroll.salary_revision.ask_own_college')
        AND v_s.institution_id = ANY (public.fn_my_staff_institution_ids()) THEN
    v_as := 'principal'; v_cap_tier := 2;
  ELSIF public.user_has_permission('hr.payroll.salary_revision.ask_own_department')
        AND v_s.department_id = ANY (public.fn_hr_salary_revision_my_department_ids()) THEN
    v_as := 'hod'; v_cap_tier := 1;
  ELSE
    RAISE EXCEPTION 'You can ask only for people in your own college (principal) or your own department (head of department).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT monthly_gross INTO v_current
    FROM public.hr_staff_salaries
   WHERE staff_id = p_staff_id AND superseded_by IS NULL;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'This person has no salary recorded yet, so there is nothing to revise. HR records the first salary on Employee Salaries.'
      USING ERRCODE = 'P0002';
  END IF;
  IF p_monthly_gross = v_current THEN
    RAISE EXCEPTION 'That is the same as the pay now.' USING ERRCODE = '22023';
  END IF;

  -- RULING 10. The partial unique index is the real guarantee; this check only
  -- lets the second asker be told WHICH request is waiting.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_staff_id::text || ':salary_revision', 0));
  SELECT id INTO v_open FROM public.hr_salary_revision_requests
   WHERE staff_id = p_staff_id AND status IN ('waiting_principal', 'waiting_director', 'approved');
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'A salary revision for this person is already waiting. You can add a comment to it instead.'
      USING ERRCODE = 'unique_violation', DETAIL = v_open::text;
  END IF;

  -- RULING 9 — flagged, never refused.
  v_self := p_staff_id = ANY (public.fn_my_staff_ids());
  v_sub_tier := public.hr_salary_revision_user_tier(v_s.profile_id);

  -- RULING 2. An HOD's request goes via the principal — unless it is ABOUT a
  -- principal or someone more senior, who cannot check their own pay.
  v_route := CASE WHEN v_as = 'hod' AND v_sub_tier < 2 THEN 'via_principal' ELSE 'direct' END;

  INSERT INTO public.hr_salary_revision_requests (
    staff_id, institution_id, department_id, asked_by, asked_as, route,
    is_self, is_for_senior, current_monthly_gross, asked_monthly_gross, reason, status)
  VALUES (
    p_staff_id, v_s.institution_id, v_s.department_id, v_uid, v_as, v_route,
    v_self, (NOT v_self) AND v_sub_tier > v_cap_tier, v_current, p_monthly_gross, btrim(p_reason),
    CASE v_route WHEN 'via_principal' THEN 'waiting_principal' ELSE 'waiting_director' END)
  RETURNING id INTO v_id;

  IF v_route = 'via_principal' THEN
    v_name := TRIM(BOTH FROM COALESCE(v_s.first_name, '') || ' ' || COALESCE(v_s.last_name, ''));
    SELECT array_agg(DISTINCT st.profile_id) INTO v_checkers
      FROM public.staff st
     WHERE st.institution_id = v_s.institution_id
       AND st.is_active AND st.profile_id IS NOT NULL
       AND st.id <> p_staff_id
       AND public.hr_salary_revision_user_holds(st.profile_id, 'hr.payroll.salary_revision.college_check');
    PERFORM public.hr_salary_revision_notify(
      v_checkers,
      'A salary revision needs your check',
      'A head of department asked for a salary revision for ' || v_name
        || '. Please agree or stop it before it goes to the Director.',
      '/hr/salary-revisions/' || v_id,
      'hr.payroll.salary_revision.check:' || v_id,
      jsonb_build_object('request_id', v_id));
  END IF;

  RETURN v_id;
END;
$function$;

-- RULING 10 — a comment on a waiting request, by anyone who may see it.
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_comment(p_request_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_r  record;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RAISE EXCEPTION 'Write something first.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(p_body)) > 2000 THEN
    RAISE EXCEPTION 'The comment is too long (2,000 characters at most).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id;
  IF NOT FOUND
     OR NOT public.fn_hr_salary_revision_can_see(v_r.staff_id, v_r.institution_id, v_r.department_id, v_r.asked_by) THEN
    RAISE EXCEPTION 'No such request, or you cannot see it.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_r.status NOT IN ('waiting_principal', 'waiting_director') THEN
    RAISE EXCEPTION 'This request has already been decided.' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.hr_salary_revision_comments (request_id, author_id, body)
  VALUES (p_request_id, auth.uid(), btrim(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 6. The principal's check (RULING 2)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_college_decide(
  p_request_id uuid, p_agree boolean, p_reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_r    record;
  v_name text;
BEGIN
  IF v_uid IS NULL OR p_agree IS NULL THEN
    RAISE EXCEPTION 'Sign in and choose agree or stop.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such request.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.user_has_permission('hr.payroll.salary_revision.college_check')
     OR NOT (v_r.institution_id = ANY (public.fn_my_staff_institution_ids())) THEN
    RAISE EXCEPTION 'Only the principal of this college can check this request.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_r.staff_id = ANY (public.fn_my_staff_ids()) THEN
    RAISE EXCEPTION 'You cannot check a request about your own pay.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_r.status <> 'waiting_principal' THEN
    RAISE EXCEPTION 'This request is no longer waiting for the principal.' USING ERRCODE = '55000';
  END IF;

  IF p_agree THEN
    UPDATE public.hr_salary_revision_requests
       SET status = 'waiting_director', principal_decided_by = v_uid, principal_decided_at = now()
     WHERE id = p_request_id;
    IF p_reason IS NOT NULL AND btrim(p_reason) <> '' THEN
      INSERT INTO public.hr_salary_revision_comments (request_id, author_id, body)
      VALUES (p_request_id, v_uid, left(btrim(p_reason), 2000));
    END IF;
    RETURN 'waiting_director';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Write a short reason. The head of department who asked will see it.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.hr_salary_revision_requests
     SET status = 'stopped', principal_decided_by = v_uid, principal_decided_at = now()
   WHERE id = p_request_id;
  INSERT INTO public.hr_salary_revision_decision_notes (request_id, kind, reason, written_by)
  VALUES (p_request_id, 'stopped', left(btrim(p_reason), 2000), v_uid);

  SELECT TRIM(BOTH FROM COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) INTO v_name
    FROM public.staff WHERE id = v_r.staff_id;
  PERFORM public.hr_salary_revision_notify(
    ARRAY[v_r.asked_by],
    'The principal stopped a salary revision',
    'The principal stopped the salary revision you asked for ' || v_name
      || '. Their reason: ' || left(btrim(p_reason), 500),
    '/hr/salary-revisions/' || p_request_id,
    'hr.payroll.salary_revision.stopped:' || p_request_id,
    jsonb_build_object('request_id', p_request_id));
  RETURN 'stopped';
END;
$function$;

-- ----------------------------------------------------------------------------
-- 7. The Director's decision (RULINGS 3, 4, 5, 12, 14, 15)
-- ----------------------------------------------------------------------------
-- Internal: approve one request that the caller has already been checked for.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_approve_one(
  p_request_id uuid, p_final numeric, p_note text)
RETURNS date
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_r       record;
  v_final   numeric;
  v_start   date;
  v_now_pay numeric;
  v_subject uuid;
  v_name    text;
  v_when    text;
BEGIN
  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such request.' USING ERRCODE = 'P0002';
  END IF;
  IF v_r.status <> 'waiting_director' THEN
    RAISE EXCEPTION 'This request is not waiting for the Director (it is %).', v_r.status
      USING ERRCODE = '55000';
  END IF;

  v_final := COALESCE(p_final, v_r.asked_monthly_gross);
  IF v_final IS NULL OR v_final <= 0 THEN
    RAISE EXCEPTION 'The new monthly pay must be more than zero.' USING ERRCODE = '22023';
  END IF;

  v_start := public.hr_salary_revision_start_date(v_r.staff_id, public.hr_salary_revision_ist_today());

  UPDATE public.hr_salary_revision_requests
     SET status = 'approved', final_monthly_gross = v_final, starts_on = v_start,
         director_decided_by = v_uid, director_decided_at = now()
   WHERE id = p_request_id;

  IF p_note IS NOT NULL AND btrim(p_note) <> '' THEN
    INSERT INTO public.hr_salary_revision_comments (request_id, author_id, body)
    VALUES (p_request_id, COALESCE(v_uid, v_r.asked_by), left(btrim(p_note), 2000));
  END IF;

  SELECT monthly_gross INTO v_now_pay
    FROM public.hr_staff_salaries WHERE staff_id = v_r.staff_id AND superseded_by IS NULL;

  INSERT INTO public.hr_salary_revision_outcomes
    (request_id, staff_id, previous_monthly_gross, new_monthly_gross, starts_on)
  VALUES (p_request_id, v_r.staff_id, COALESCE(v_now_pay, v_r.current_monthly_gross), v_final, v_start);

  SELECT profile_id, TRIM(BOTH FROM COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_subject, v_name
    FROM public.staff WHERE id = v_r.staff_id;
  v_when := to_char(v_start, 'FMDD FMMonth YYYY');

  -- RULING 5: the person is told now, and only now.
  PERFORM public.hr_salary_revision_notify(
    ARRAY[v_subject],
    'Your monthly pay is changing',
    'From ' || v_when || ' your monthly pay will be ' || public.hr_salary_revision_rupees(v_final)
      || ' (it is ' || public.hr_salary_revision_rupees(COALESCE(v_now_pay, v_r.current_monthly_gross)) || ' now).'
      || CASE WHEN v_final < COALESCE(v_now_pay, v_r.current_monthly_gross) THEN ' This is a pay cut.' ELSE '' END,
    '/hr/my-pay-changes',
    'hr.payroll.salary_revision.outcome:' || p_request_id,
    jsonb_build_object('request_id', p_request_id));

  -- RULING 12: the asker sees his figure.
  PERFORM public.hr_salary_revision_notify(
    ARRAY[v_r.asked_by],
    'Salary revision approved',
    'The Director approved the salary revision you asked for ' || v_name || ': '
      || public.hr_salary_revision_rupees(v_final) || ' a month from ' || v_when
      || CASE WHEN v_final <> v_r.asked_monthly_gross
              THEN ' (you asked for ' || public.hr_salary_revision_rupees(v_r.asked_monthly_gross) || ').'
              ELSE '.' END,
    '/hr/salary-revisions/' || p_request_id,
    'hr.payroll.salary_revision.approved:' || p_request_id,
    jsonb_build_object('request_id', p_request_id));

  RETURN v_start;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_director_decide(
  p_request_id uuid, p_approve boolean,
  p_final_monthly_gross numeric DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_r    record;
  v_name text;
BEGIN
  IF v_uid IS NULL OR NOT public.fn_hr_salary_revision_can_approve() THEN
    RAISE EXCEPTION 'Only the Director can give the final yes or no.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'Choose yes or no.' USING ERRCODE = '22023';
  END IF;

  IF p_approve THEN
    PERFORM public.hr_salary_revision_approve_one(p_request_id, p_final_monthly_gross, p_reason);
    RETURN 'approved';
  END IF;

  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such request.' USING ERRCODE = 'P0002';
  END IF;
  IF v_r.status <> 'waiting_director' THEN
    RAISE EXCEPTION 'This request is not waiting for the Director (it is %).', v_r.status
      USING ERRCODE = '55000';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Write a short reason. Only the person who asked will see it.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hr_salary_revision_requests
     SET status = 'refused', director_decided_by = v_uid, director_decided_at = now()
   WHERE id = p_request_id;
  INSERT INTO public.hr_salary_revision_decision_notes (request_id, kind, reason, written_by)
  VALUES (p_request_id, 'refused', left(btrim(p_reason), 2000), v_uid);

  -- RULING 14: the asker is told, with the reason. The person whose pay it is
  -- is NOT (ruling 5).
  SELECT TRIM(BOTH FROM COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) INTO v_name
    FROM public.staff WHERE id = v_r.staff_id;
  PERFORM public.hr_salary_revision_notify(
    ARRAY[v_r.asked_by],
    'Salary revision not approved',
    'The Director said no to the salary revision you asked for ' || v_name
      || '. His reason: ' || left(btrim(p_reason), 500),
    '/hr/salary-revisions/' || p_request_id,
    'hr.payroll.salary_revision.refused:' || p_request_id,
    jsonb_build_object('request_id', p_request_id));
  RETURN 'refused';
END;
$function$;

-- RULING 15: tick several, approve them together at the amounts asked. All or
-- nothing: if any one is no longer waiting for him, none is approved.
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_director_approve_many(p_request_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids   uuid[];
  v_ready integer;
  v_id    uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.fn_hr_salary_revision_can_approve() THEN
    RAISE EXCEPTION 'Only the Director can give the final yes or no.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::uuid[]) INTO v_ids
    FROM unnest(p_request_ids) AS x WHERE x IS NOT NULL;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Tick at least one request.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.hr_salary_revision_requests
    WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_ready FROM public.hr_salary_revision_requests
   WHERE id = ANY (v_ids) AND status = 'waiting_director';
  IF v_ready <> cardinality(v_ids) THEN
    RAISE EXCEPTION '% of the % ticked requests are no longer waiting for you. Nothing was approved; reload the list.',
      cardinality(v_ids) - v_ready, cardinality(v_ids)
      USING ERRCODE = '55000';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM public.hr_salary_revision_approve_one(v_id, NULL, NULL);
  END LOOP;
  RETURN cardinality(v_ids);
END;
$function$;

-- ----------------------------------------------------------------------------
-- 8. Writing the new pay, on its start date (RULINGS 4 and 16)
-- ----------------------------------------------------------------------------
-- Internal, takes the day so the rehearsal can run it for 1 October. Writes
-- through fn_hr_set_staff_salary — the same supersede every salary change on
-- Employee Salaries goes through — with effective_from = starts_on, carrying
-- every other field (who pays, PF/ESI, allowance) over from the row in force.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_apply_due_on(p_today date)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_r    record;
  v_cur  record;
  v_new  uuid;
  v_done integer := 0;
BEGIN
  FOR v_r IN
    SELECT * FROM public.hr_salary_revision_requests
     WHERE status = 'approved' AND starts_on <= p_today
     ORDER BY starts_on, id
     FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO v_cur FROM public.hr_staff_salaries
     WHERE staff_id = v_r.staff_id AND superseded_by IS NULL;

    IF NOT FOUND THEN
      UPDATE public.hr_salary_revision_requests
         SET apply_note = 'No salary is recorded for this person any more, so the new pay could not be written. HR must record it on Employee Salaries.'
       WHERE id = v_r.id;
      CONTINUE;
    END IF;
    IF v_cur.effective_from > v_r.starts_on THEN
      UPDATE public.hr_salary_revision_requests
         SET apply_note = 'HR recorded a salary starting ' || to_char(v_cur.effective_from, 'FMDD FMMonth YYYY')
                          || ', after this revision''s start. HR must decide which one stands.'
       WHERE id = v_r.id;
      CONTINUE;
    END IF;

    v_new := public.fn_hr_set_staff_salary(
      p_staff_id               => v_r.staff_id,
      p_hr_organization_id     => v_cur.hr_organization_id,
      p_monthly_gross          => v_r.final_monthly_gross,
      p_effective_from         => v_r.starts_on,
      p_salary_structure       => v_cur.salary_structure,
      p_overtime_level         => v_cur.overtime_level,
      p_overtime_amount        => v_cur.overtime_amount,
      p_eligible_for_pf        => v_cur.eligible_for_pf,
      p_exempt_edli            => v_cur.exempt_edli,
      p_eligible_for_insurance => v_cur.eligible_for_insurance,
      p_eligible_for_gratuity  => v_cur.eligible_for_gratuity,
      p_eligible_for_etf       => v_cur.eligible_for_etf,
      p_notes                  => 'Salary revision approved by the Director on '
                                  || to_char((v_r.director_decided_at AT TIME ZONE 'Asia/Kolkata')::date, 'FMDD FMMonth YYYY')
                                  || ' (request ' || v_r.id || ').',
      p_epf_amount             => v_cur.epf_amount,
      p_eligible_for_esi       => v_cur.eligible_for_esi,
      p_esi_amount             => v_cur.esi_amount,
      p_allowance_amount       => v_cur.allowance_amount,
      p_allowance_label        => v_cur.allowance_label);

    UPDATE public.hr_salary_revision_requests
       SET status = 'applied', applied_salary_id = v_new, applied_at = now(), apply_note = NULL
     WHERE id = v_r.id;
    v_done := v_done + 1;
  END LOOP;
  RETURN v_done;
END;
$function$;

-- The daily cron (service role) and the Director's page call this. It takes no
-- day from the caller: nobody can make a raise start early.
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_apply_due()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.fn_hr_salary_revision_can_approve()
     AND NOT public.user_has_permission('hr.payroll.salary.manage') THEN
    RAISE EXCEPTION 'Only the Director or the HR head can run this.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.hr_salary_revision_apply_due_on(public.hr_salary_revision_ist_today());
END;
$function$;

-- ----------------------------------------------------------------------------
-- 9. The weekly reminder (RULING 11) — service role only (the cron)
-- ----------------------------------------------------------------------------
-- Everything waiting, to the Director: every super admin, plus anyone given
-- hr.payroll.salary_revision.approve. Once per week (idempotency key per ISO week).
-- Nothing expires, nothing is approved by it.
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_weekly_digest()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_to      uuid[];
  v_waiting integer;
  v_check   integer;
  v_lines   text;
  v_today   date := public.hr_salary_revision_ist_today();
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'The weekly reminder is sent by the schedule only.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) FILTER (WHERE status = 'waiting_director'),
         count(*) FILTER (WHERE status = 'waiting_principal')
    INTO v_waiting, v_check
    FROM public.hr_salary_revision_requests;
  IF v_waiting + v_check = 0 THEN RETURN 0; END IF;

  SELECT array_agg(DISTINCT u) INTO v_to FROM (
    SELECT p.id AS u FROM public.profiles p WHERE p.is_super_admin IS TRUE
    UNION
    SELECT ur.user_id FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
     WHERE (cr.permissions ->> 'hr.payroll.salary_revision.approve')::boolean IS TRUE
  ) x;

  SELECT string_agg(line, E'\n' ORDER BY ord) INTO v_lines FROM (
    SELECT row_number() OVER (ORDER BY r.created_at) AS ord,
           '• ' || TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))
             || ': ' || public.hr_salary_revision_rupees(r.current_monthly_gross)
             || ' → ' || public.hr_salary_revision_rupees(r.asked_monthly_gross)
             || CASE WHEN r.is_cut THEN ' (PAY CUT)' ELSE '' END AS line
      FROM public.hr_salary_revision_requests r
      JOIN public.staff s ON s.id = r.staff_id
     WHERE r.status = 'waiting_director'
     ORDER BY r.created_at
     LIMIT 10) t;

  PERFORM public.hr_salary_revision_notify(
    v_to,
    'Salary revisions waiting for you',
    v_waiting || CASE WHEN v_waiting = 1 THEN ' salary revision is' ELSE ' salary revisions are' END
      || ' waiting for your yes or no.'
      || CASE WHEN v_lines IS NOT NULL THEN E'\n' || v_lines ELSE '' END
      || CASE WHEN v_waiting > 10 THEN E'\n…and ' || (v_waiting - 10) || ' more.' ELSE '' END
      || CASE WHEN v_check > 0 THEN E'\n' || v_check || ' more '
              || CASE WHEN v_check = 1 THEN 'is' ELSE 'are' END || ' waiting for a principal''s check.' ELSE '' END,
    '/hr/salary-revisions/approve',
    'hr.payroll.salary_revision.digest:' || to_char(v_today, 'IYYY-IW'),
    jsonb_build_object('waiting_director', v_waiting, 'waiting_principal', v_check));
  RETURN v_waiting + v_check;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 10. Row level security — SELECT only; every write is a function above
-- ----------------------------------------------------------------------------
ALTER TABLE public.hr_salary_revision_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_salary_revision_comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_salary_revision_decision_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_salary_revision_outcomes       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_salary_revision_requests_select ON public.hr_salary_revision_requests;
CREATE POLICY hr_salary_revision_requests_select ON public.hr_salary_revision_requests
  FOR SELECT TO authenticated
  USING (public.fn_hr_salary_revision_can_see(staff_id, institution_id, department_id, asked_by));

DROP POLICY IF EXISTS hr_salary_revision_comments_select ON public.hr_salary_revision_comments;
CREATE POLICY hr_salary_revision_comments_select ON public.hr_salary_revision_comments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hr_salary_revision_requests r WHERE r.id = request_id));

-- RULING 14: the asker, the principal of an HOD's request, the Director.
DROP POLICY IF EXISTS hr_salary_revision_decision_notes_select ON public.hr_salary_revision_decision_notes;
CREATE POLICY hr_salary_revision_decision_notes_select ON public.hr_salary_revision_decision_notes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_hr_salary_revision_can_approve())
    OR EXISTS (
      SELECT 1 FROM public.hr_salary_revision_requests r
       WHERE r.id = request_id
         AND (r.asked_by = auth.uid()
              OR (r.route = 'via_principal'
                  AND (SELECT public.user_has_permission('hr.payroll.salary_revision.college_check'))
                  AND r.institution_id = ANY (public.fn_my_staff_institution_ids())
                  AND NOT (r.staff_id = ANY (public.fn_my_staff_ids())))))
  );

-- RULING 5: the person sees their own outcome — which exists only after a yes.
DROP POLICY IF EXISTS hr_salary_revision_outcomes_select ON public.hr_salary_revision_outcomes;
CREATE POLICY hr_salary_revision_outcomes_select ON public.hr_salary_revision_outcomes
  FOR SELECT TO authenticated
  USING (
    staff_id = ANY (public.fn_my_staff_ids())
    OR (SELECT public.fn_hr_salary_revision_can_approve())
  );

DROP POLICY IF EXISTS hr_salary_revision_requests_service_role ON public.hr_salary_revision_requests;
CREATE POLICY hr_salary_revision_requests_service_role ON public.hr_salary_revision_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS hr_salary_revision_comments_service_role ON public.hr_salary_revision_comments;
CREATE POLICY hr_salary_revision_comments_service_role ON public.hr_salary_revision_comments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS hr_salary_revision_decision_notes_service_role ON public.hr_salary_revision_decision_notes;
CREATE POLICY hr_salary_revision_decision_notes_service_role ON public.hr_salary_revision_decision_notes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS hr_salary_revision_outcomes_service_role ON public.hr_salary_revision_outcomes;
CREATE POLICY hr_salary_revision_outcomes_service_role ON public.hr_salary_revision_outcomes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.hr_salary_revision_requests, public.hr_salary_revision_comments,
              public.hr_salary_revision_decision_notes, public.hr_salary_revision_outcomes
  FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.hr_salary_revision_requests, public.hr_salary_revision_comments,
              public.hr_salary_revision_decision_notes, public.hr_salary_revision_outcomes
  FROM authenticated;
GRANT SELECT ON public.hr_salary_revision_requests, public.hr_salary_revision_comments,
               public.hr_salary_revision_decision_notes, public.hr_salary_revision_outcomes
  TO authenticated;
GRANT ALL ON public.hr_salary_revision_requests, public.hr_salary_revision_comments,
            public.hr_salary_revision_decision_notes, public.hr_salary_revision_outcomes
  TO service_role;

-- ----------------------------------------------------------------------------
-- 11. Function grants. REVOKE from anon AND PUBLIC on every one (Supabase's
--     default gives anon a direct grant that a PUBLIC revoke leaves alone).
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_ist_today() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_rupees(numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_user_holds(uuid, text) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_user_tier(uuid) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_notify(uuid[], text, text, text, text, jsonb) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_start_date(uuid, date) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_approve_one(uuid, numeric, text) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_apply_due_on(date) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_suggestion_inputs(uuid[]) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_weekly_digest() FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_my_department_ids() FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_can_approve() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_can_see(uuid, uuid, uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hr_staff_salaries_in_force(uuid[], date) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_people() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_list(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_get(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_propose(uuid, numeric, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_comment(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_college_decide(uuid, boolean, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_director_decide(uuid, boolean, numeric, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_director_approve_many(uuid[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_apply_due() FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.hr_salary_revision_ist_today() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_salary_revision_rupees(numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_salary_revision_can_approve() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_salary_revision_can_see(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_staff_salaries_in_force(uuid[], date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_salary_revision_people() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_salary_revision_list(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_salary_revision_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_salary_revision_propose(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_salary_revision_comment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_salary_revision_college_decide(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_salary_revision_director_decide(uuid, boolean, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_salary_revision_director_approve_many(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_salary_revision_apply_due() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_salary_revision_weekly_digest() TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_salary_revision_suggestion_inputs(uuid[]) TO service_role;

-- ----------------------------------------------------------------------------
-- 12. The ask and check keys — a DATA grant to three roles, by role_key
-- ----------------------------------------------------------------------------
-- The access checks above use only user_has_permission(); these UPDATEs are
-- the one place role keys appear, as the Director's ruling 1 names the roles:
--   principal -> ask for own college + the principal's check
--   hod       -> ask for own department
--   hr_head   -> ask for anyone
-- hr.payroll.salary_revision.approve is granted to NOBODY: the Director is a super
-- admin and passes is_super_admin(). Role Management can change any of this.
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
         || jsonb_build_object('hr.payroll.salary_revision.ask', true,
                               'hr.payroll.salary_revision.ask_own_college', true,
                               'hr.payroll.salary_revision.college_check', true),
       updated_at = now()
 WHERE role_key = 'principal';

UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
         || jsonb_build_object('hr.payroll.salary_revision.ask', true,
                               'hr.payroll.salary_revision.ask_own_department', true),
       updated_at = now()
 WHERE role_key = 'hod';

UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
         || jsonb_build_object('hr.payroll.salary_revision.ask', true,
                               'hr.payroll.salary_revision.ask_anyone', true),
       updated_at = now()
 WHERE role_key = 'hr_head';

COMMIT;
