-- 2026-07-10 · SCF permission switches: verdict-report read + 3 write keys
-- Director-approved (interview R2, 2026-07-09): move the last hardcoded
-- leader-role arrays in the lesson / live-poll / verdict write paths onto
-- Role Management switches, give the verdict-report panels their OWN read
-- switch, and close the v_sug_inst IS NULL hole in fn_scf_set_verdict.
--
-- NEW KEYS (registered in lib/constants/permissions.ts):
--   academic.session_feedback.verdict_report.view  — fn_scf_verdict_contradictions,
--       fn_scf_verdict_track_record. Seed: super_admin, administrator, principal,
--       ceo, executive_admin_officer (Director list — NO hod). The old arrays also
--       named institution_admin/dean/coordinator: those role_keys have NO
--       custom_roles row and NO users (verified 2026-07-10) — dead entries.
--       Tenant scope hoisted to role_has_institution_access uuid[] (same
--       treatment as the 13 fns in 20260731110000) so scope-all leadership
--       (ceo/eao/administrator) sees every college it may access.
--   academic.curriculum.lesson.manage — fn_curriculum_lesson_upsert (EDIT
--       override ONLY), fn_curriculum_lesson_ai_approve / _ai_reject
--       (leadership override ONLY). Seed = the living audience of today's
--       arrays: super_admin, administrator, hod, principal. system_admin stays
--       hardcoded in approve/reject (see remnant comment in the fn bodies).
--       The CREATE branch's teaching-evidence gate is UNTOUCHED.
--   academic.live_poll.manage — fn_live_poll_can_manage (class_session branch
--       ONLY; a WRITE-question fn gated on a manage key, never a .view),
--       fn_scf_open_pulse, _fn_live_poll_ensure_class_anchor. Seed:
--       super_admin, administrator, hod, principal.
--   academic.session_feedback.verdict.write — fn_scf_set_verdict leadership
--       branch. Seed: super_admin, administrator, hod, principal. The
--       assigned-faculty (own suggestion) branch and the caller-institution ==
--       target-institution tenant bind are PRESERVED; the IS NULL hole is
--       closed (latent: 14 suggestions in prod, 0 with NULL institution).
--
-- Verified by BEFORE/AFTER impersonation matrix (9 identities x 9 fns, rolled-
-- back txn): only intended flips are ceo/eao gaining the two verdict READS.

-- ---------------------------------------------------------------------------
-- 1. Seeds — grant the new keys to exactly today's audiences.
-- ---------------------------------------------------------------------------

UPDATE public.custom_roles
SET permissions = permissions || '{"academic.session_feedback.verdict_report.view": true}'::jsonb,
    updated_at  = now()
WHERE role_key IN ('super_admin','administrator','principal','ceo','executive_admin_officer')
  AND COALESCE(permissions->>'academic.session_feedback.verdict_report.view','false') <> 'true';

UPDATE public.custom_roles
SET permissions = permissions || '{"academic.curriculum.lesson.manage": true}'::jsonb,
    updated_at  = now()
WHERE role_key IN ('super_admin','administrator','hod','principal')
  AND COALESCE(permissions->>'academic.curriculum.lesson.manage','false') <> 'true';

UPDATE public.custom_roles
SET permissions = permissions || '{"academic.live_poll.manage": true}'::jsonb,
    updated_at  = now()
WHERE role_key IN ('super_admin','administrator','hod','principal')
  AND COALESCE(permissions->>'academic.live_poll.manage','false') <> 'true';

UPDATE public.custom_roles
SET permissions = permissions || '{"academic.session_feedback.verdict.write": true}'::jsonb,
    updated_at  = now()
WHERE role_key IN ('super_admin','administrator','hod','principal')
  AND COALESCE(permissions->>'academic.session_feedback.verdict.write','false') <> 'true';

-- ---------------------------------------------------------------------------
-- 2. Functions — bodies identical to production except the gate lines.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_scf_verdict_contradictions(p_from date, p_to date)
 RETURNS TABLE(id uuid, course_code text, faculty_email text, human_verdict text, verdict_on date, window_from date, window_to date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean; v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_verdict_contradictions: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.verdict_report.view')),
         lower(p.email)
    INTO v_inst, v_super, v_allowed, v_email
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_verdict_contradictions: not authorized';
  END IF;

  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  SELECT s.id, s.course_code, s.faculty_email, s.human_verdict,
         (s.human_verdict_at AT TIME ZONE 'Asia/Kolkata')::date AS verdict_on,   -- IST, matches track_record's window
         s.window_from, s.window_to
  FROM public.scf_ai_suggestions s
  WHERE s.domain = 'session_feedback'
    AND s.human_verdict = 'tried_helped'
    AND s.outcome_lift IS NOT NULL
    AND s.outcome_lift <= 0
    -- k>=3 floor on the OUTCOME class size (deep-review LOW): a "numbers say it
    -- didn't help" alert built on 1-2 next-session answers is noise, and this fn
    -- must not depend on the upstream measurer's floor staying in place.
    AND COALESCE(s.outcome_responses, 0) >= 3
    AND (s.human_verdict_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_from AND p_to
    AND (v_super OR s.institution_id = ANY(v_insts))
    -- Own-row exclusion — same invariant as fn_scf_verdict_track_record: even a
    -- teaching dean/principal never sees a contradiction row about themselves;
    -- NULL caller email fails closed.
    AND (v_super OR (v_email IS NOT NULL AND lower(s.faculty_email) IS DISTINCT FROM v_email))
  ORDER BY s.human_verdict_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_scf_verdict_track_record(p_from date, p_to date)
 RETURNS TABLE(faculty_email text, institution_id uuid, verdicts integer, measured integer, agreed integer, contradicted integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean; v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_verdict_track_record: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.verdict_report.view')),
         lower(p.email)
    INTO v_inst, v_super, v_allowed, v_email
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_verdict_track_record: not authorized';
  END IF;

  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  SELECT s.faculty_email,
         s.institution_id,
         count(*)::int AS verdicts,
         -- k>=3 floor on EVERY measured bucket (deep-review r2 MEDIUM, consensus):
         -- must match fn_scf_verdict_contradictions exactly, or the card can show
         -- a "contradicted" mark built on 1-2 noisy answers that the alert list
         -- deliberately suppresses. Sub-floor rows read as awaiting-measurement.
         count(*) FILTER (WHERE s.outcome_lift IS NOT NULL
           AND COALESCE(s.outcome_responses, 0) >= 3)::int AS measured,
         -- agreed is computed POSITIVELY (deep-review r2 LOW): an unexpected
         -- future verdict value lands in NEITHER bucket (an honest visible gap)
         -- instead of silently counting as a matched claim.
         count(*) FILTER (WHERE s.outcome_lift IS NOT NULL
           AND COALESCE(s.outcome_responses, 0) >= 3
           AND ((s.human_verdict = 'tried_helped' AND s.outcome_lift > 0)
                OR s.human_verdict = 'tried_no_change'))::int AS agreed,
         count(*) FILTER (WHERE s.outcome_lift IS NOT NULL
           AND COALESCE(s.outcome_responses, 0) >= 3
           AND s.human_verdict = 'tried_helped' AND s.outcome_lift <= 0)::int AS contradicted
  FROM public.scf_ai_suggestions s
  WHERE s.domain = 'session_feedback'
    AND s.human_verdict IS NOT NULL
    AND s.human_verdict <> 'not_tried'        -- no effect claimed → nothing to check
    -- IST local date (deep-review LOW): verdicts land near midnight IST; a raw
    -- ::date is UTC and shifts evening verdicts to the previous day.
    AND (s.human_verdict_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_from AND p_to
    AND (v_super OR s.institution_id = ANY(v_insts))
    -- Own-row exclusion — see header disposition. Supers (Director lane) see
    -- all; a NULL caller email FAILS CLOSED (no rows) rather than fail-open.
    AND (v_super OR (v_email IS NOT NULL AND lower(s.faculty_email) IS DISTINCT FROM v_email))
  GROUP BY s.faculty_email, s.institution_id
  ORDER BY contradicted DESC, verdicts DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_scf_set_verdict(p_suggestion_id uuid, p_verdict text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_email   text;
  v_caller_role    text;
  v_caller_inst    uuid;
  v_is_super       boolean;
  v_sug_email      text;
  v_sug_inst       uuid;
  v_authorized     boolean := false;
BEGIN
  -- Auth gate
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_set_verdict: not authenticated';
  END IF;

  -- Validate verdict value
  IF p_verdict NOT IN ('tried_helped', 'tried_no_change', 'not_tried') THEN
    RAISE EXCEPTION 'fn_scf_set_verdict: invalid verdict "%" — must be tried_helped, tried_no_change, or not_tried', p_verdict;
  END IF;

  -- Resolve caller identity (mirrors fn_scf_admin_college_summary pattern)
  SELECT lower(p.email),
         p.role,
         p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true)
    INTO v_caller_email, v_caller_role, v_caller_inst, v_is_super
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_caller_email IS NULL THEN
    RAISE EXCEPTION 'fn_scf_set_verdict: no profile found for caller';
  END IF;

  -- Resolve suggestion's faculty_email + institution_id
  SELECT lower(s.faculty_email), s.institution_id
    INTO v_sug_email, v_sug_inst
  FROM public.scf_ai_suggestions s
  WHERE s.id = p_suggestion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_scf_set_verdict: suggestion % not found', p_suggestion_id;
  END IF;

  -- Authorization check:
  --   1. Faculty themselves (caller email matches suggestion's faculty_email)
  --   2. Leadership/admin for the suggestion's institution
  IF v_is_super THEN
    v_authorized := true;
  ELSIF v_sug_email IS NOT NULL AND v_caller_email IS NOT DISTINCT FROM v_sug_email THEN
    v_authorized := true;
  ELSIF public.user_has_permission('academic.session_feedback.verdict.write')
     -- Tenant bind PRESERVED (the caller's own institution must match the
     -- TARGET suggestion's) and the v_sug_inst IS NULL hole CLOSED: a
     -- suggestion with no institution stamp is now verdict-able only by super
     -- or its own faculty, not by any leader of any college.
     AND v_sug_inst IS NOT NULL
     AND v_caller_inst IS NOT DISTINCT FROM v_sug_inst
  THEN
    v_authorized := true;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'fn_scf_set_verdict: not authorized to set verdict on this suggestion';
  END IF;

  -- Write the verdict
  UPDATE public.scf_ai_suggestions
  SET human_verdict    = p_verdict,
      human_verdict_at = now(),
      updated_at       = now()
  WHERE id = p_suggestion_id;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_live_poll_can_manage(p_context_type text, p_context_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email text; v_role_ok boolean; v_p public.scf_live_pulse;
        v_inst uuid; v_trainer uuid; v_creator uuid;
BEGIN
  IF auth.uid() IS NULL OR p_context_id IS NULL THEN RETURN false; END IF;
  CASE p_context_type
    WHEN 'induction_session' THEN
      RETURN public._fn_induction_can_manage_session_pulse(p_context_id);
    WHEN 'class_session' THEN
      -- class anchor = scf_live_pulse row; authority mirrors fn_scf_open_pulse:
      -- the assigned faculty OR a privileged role WITH access to the institution.
      SELECT * INTO v_p FROM public.scf_live_pulse WHERE id = p_context_id;
      IF v_p.id IS NULL THEN RETURN false; END IF;
      SELECT lower(pr.email),
             (pr.is_super_admin = true
              OR public.user_has_permission('academic.live_poll.manage'))
        INTO v_email, v_role_ok
      FROM public.profiles pr WHERE pr.id = auth.uid();
      IF v_email IS NULL THEN RETURN false; END IF;
      RETURN (lower(v_p.faculty_email) IS NOT DISTINCT FROM v_email)
          OR (COALESCE(v_role_ok,false)
              AND (public.is_super_admin() OR public.role_has_institution_access(v_p.institution_id)));
    WHEN 'cdc_training_session' THEN
      -- CDC programme is the anchor. Authority = the assigned trainer OR a CDC admin
      -- (is_cdc_staff() already folds in super-admin) with institution access. Mirrors
      -- cdc_training_programmes' write RLS (is_cdc_staff() AND role_has_institution_access).
      SELECT institution_id, trainer_staff_id INTO v_inst, v_trainer
        FROM public.cdc_training_programmes WHERE id = p_context_id;
      IF NOT FOUND THEN RETURN false; END IF;
      RETURN (v_trainer IS NOT NULL
              AND EXISTS (SELECT 1 FROM public.staff s WHERE s.id = v_trainer AND s.profile_id = auth.uid()))
          OR (public.is_cdc_staff() AND (v_inst IS NULL OR public.role_has_institution_access(v_inst)));
    WHEN 'hr_training_session' THEN
      -- HR session is the anchor. Authority mirrors hr_training_sessions' UPDATE RLS:
      -- the creator OR super/admin OR an HR editor with institution access.
      SELECT institution_id, created_by INTO v_inst, v_creator
        FROM public.hr_training_sessions WHERE id = p_context_id;
      IF NOT FOUND THEN RETURN false; END IF;
      RETURN (v_creator IS NOT NULL AND v_creator = auth.uid())
          OR public.is_super_admin() OR public.is_admin()
          OR (public.user_has_permission('hr.training.edit')
              AND (v_inst IS NULL OR public.role_has_institution_access(v_inst)));
    ELSE RETURN false;
  END CASE;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_scf_open_pulse(p_attendance_date date, p_timetable_id uuid, p_period_id text)
 RETURNS scf_live_pulse
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email      text;
  v_role_ok    boolean;
  v_is_faculty boolean;
  v_pv         jsonb;
  v_inst       uuid;
  v_existing   public.scf_live_pulse;
  v_row        public.scf_live_pulse;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_open_pulse: not authenticated'; END IF;
  SELECT lower(p.email),
         (p.is_super_admin = true
          OR public.user_has_permission('academic.live_poll.manage'))
    INTO v_email, v_role_ok
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RAISE EXCEPTION 'fn_scf_open_pulse: no profile'; END IF;

  SELECT sa.institution_id, sa.attendance_data -> p_period_id
    INTO v_inst, v_pv
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id
    AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;
  IF v_pv IS NULL THEN RAISE EXCEPTION 'fn_scf_open_pulse: no such session (timetable/date/period)'; END IF;

  v_is_faculty := (lower(v_pv -> 'assigned_faculty' ->> 'faculty_email') IS NOT DISTINCT FROM v_email);
  -- Institution gate: a privileged role only counts if it has access to THIS
  -- class's institution (super-admin bypasses). No cross-tenant pulses.
  IF NOT (v_is_faculty
          OR (COALESCE(v_role_ok, false)
              AND (public.is_super_admin() OR public.role_has_institution_access(v_inst)))) THEN
    RAISE EXCEPTION 'fn_scf_open_pulse: only the assigned faculty or an HOD/admin of this institution can open a pulse';
  END IF;

  -- Serialise concurrent opens for the SAME class so two callers cannot both
  -- create an open pulse (txn-scoped; released at commit/rollback).
  PERFORM pg_advisory_xact_lock(hashtext(p_timetable_id::text || '|' || p_attendance_date::text || '|' || p_period_id));

  -- Idempotent: reuse an already-open, non-expired pulse for this exact class.
  SELECT * INTO v_existing
  FROM public.scf_live_pulse lp
  WHERE lp.timetable_id = p_timetable_id
    AND lp.attendance_date = p_attendance_date
    AND lp.period_id = p_period_id
    AND lp.is_open = true
    AND lp.auto_close_at > now()
  ORDER BY lp.issued_at DESC
  LIMIT 1;
  IF v_existing.id IS NOT NULL THEN RETURN v_existing; END IF;

  INSERT INTO public.scf_live_pulse (
    institution_id, timetable_id, attendance_date, period_id,
    course_code, course_name, faculty_email, is_open, issued_at, auto_close_at, created_by
  )
  VALUES (
    v_inst, p_timetable_id, p_attendance_date, p_period_id,
    v_pv ->> 'course_code', v_pv ->> 'course_name',
    v_pv -> 'assigned_faculty' ->> 'faculty_email',
    true, now(), now() + interval '240 minutes', auth.uid()
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public._fn_live_poll_ensure_class_anchor(p_attendance_date date, p_timetable_id uuid, p_period_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email text; v_role_ok boolean; v_pv jsonb; v_inst uuid; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '_fn_live_poll_ensure_class_anchor: not authenticated'; END IF;
  SELECT lower(p.email),
         (p.is_super_admin = true
          OR public.user_has_permission('academic.live_poll.manage'))
    INTO v_email, v_role_ok
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RAISE EXCEPTION '_fn_live_poll_ensure_class_anchor: no profile'; END IF;

  SELECT sa.institution_id, sa.attendance_data -> p_period_id
    INTO v_inst, v_pv
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;
  IF v_pv IS NULL THEN RAISE EXCEPTION '_fn_live_poll_ensure_class_anchor: no such session'; END IF;

  IF NOT ((lower(v_pv -> 'assigned_faculty' ->> 'faculty_email') IS NOT DISTINCT FROM v_email)
          OR (COALESCE(v_role_ok,false) AND (public.is_super_admin() OR public.role_has_institution_access(v_inst)))) THEN
    RAISE EXCEPTION '_fn_live_poll_ensure_class_anchor: only the assigned faculty or an HOD/admin of this institution';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_timetable_id::text || '|' || p_attendance_date::text || '|' || p_period_id));
  SELECT id INTO v_id FROM public.scf_live_pulse
  WHERE timetable_id = p_timetable_id AND attendance_date = p_attendance_date AND period_id = p_period_id
  ORDER BY issued_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.scf_live_pulse (institution_id, timetable_id, attendance_date, period_id,
    course_code, course_name, faculty_email, is_open, issued_at, auto_close_at, created_by)
  VALUES (v_inst, p_timetable_id, p_attendance_date, p_period_id,
    v_pv ->> 'course_code', v_pv ->> 'course_name', v_pv -> 'assigned_faculty' ->> 'faculty_email',
    false, now(), now() + interval '240 minutes', auth.uid())   -- anchor only; not open yet
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_curriculum_lesson_upsert(p_lesson_id uuid, p_course_id uuid, p_title text, p_unit_label text DEFAULT NULL::text, p_sequence_no integer DEFAULT NULL::integer, p_learning_outcomes jsonb DEFAULT '[]'::jsonb, p_primary_fink text DEFAULT NULL::text, p_co_refs text[] DEFAULT '{}'::text[], p_bos_syllabus_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_creator uuid; v_lesson_inst uuid; v_role_ok boolean; v_role text;
        v_email text; v_staff_id uuid; v_priv_create boolean; v_teaches boolean; v_existing uuid; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_upsert: not authenticated'; END IF;
  IF btrim(coalesce(p_title,'')) = '' THEN RAISE EXCEPTION 'fn_curriculum_lesson_upsert: title required'; END IF;

  SELECT institution_id INTO v_inst FROM public.courses WHERE id = p_course_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_upsert: no such course'; END IF;

  -- v_role_ok gates ONLY the EDIT-branch leadership override below; the CREATE
  -- branch's Director-approved teaching-evidence gate (v_priv_create) is
  -- deliberately untouched. Repointed from a hardcoded role array onto the
  -- Role Management switch (seeded to exactly that array's living audience).
  SELECT p.role, lower(btrim(p.email)),
         (p.is_super_admin = true
          OR public.user_has_permission('academic.curriculum.lesson.manage'))
    INTO v_role, v_email, v_role_ok FROM public.profiles p WHERE p.id = auth.uid();

  IF p_lesson_id IS NULL THEN
    -- CREATE: only staff who TEACH this course may author its (published-on-create #31,
    -- self-approved) lesson. A teaching role + role_has_institution_access is NOT enough —
    -- that let ANY teaching staff in the institution inject published lessons into ANY
    -- course's shared spine (spine-pollution; direct-API gap with no UI path, deep-review
    -- 🟠 2026-07-05, Director-approved fix 2026-07-06). Plain faculty/staff must have TAUGHT
    -- p_course_id — appear as a period's assigned_faculty in student_attendance, the same
    -- teaching evidence the class poll (fn_live_poll_can_manage / _fn_curriculum_class_ctx)
    -- authorises on. Privileged roles (HOD/principal/dean/coordinator/admin/system_admin,
    -- super) keep the department-seed override — they legitimately manage the dept spine.
    -- CREATE authorization, cheapest-branch-first so the teaching-evidence jsonb scan
    -- runs ONLY for plain faculty — super-admin and privileged (dept-seed) roles
    -- authorize without paying for it.
    v_priv_create := public.is_super_admin()
                     OR v_role = ANY (ARRAY['hod','principal','dean','coordinator',
                                            'institution_admin','administrator','system_admin']);
    IF public.is_super_admin()
       OR (v_priv_create AND public.role_has_institution_access(v_inst)) THEN
      NULL;  -- authorized via the department-seed override; no teaching scan needed
    ELSIF v_role = ANY (ARRAY['faculty','school_faculty','staff'])
          AND public.role_has_institution_access(v_inst) THEN
      -- Plain teaching staff must actually TEACH this course. Match PRIMARILY on the
      -- stable staff id (blob assigned_faculty.faculty_id = staff.id, 100% populated),
      -- NOT the email string — a NULL profile email or casing/whitespace drift in the
      -- blob (real rows carry e.g. 'Senthil.m@jkkn.ac.in') would make an email equality
      -- NULL and SILENTLY lock out a genuinely-teaching faculty (deep-review 3-lens
      -- consensus 2026-07-06). The btrim+lower email is a NULL-guarded FALLBACK for the
      -- rare row missing a staff link. EXISTS short-circuits on the first matching
      -- period; this institution-scoped scan runs only here, on the low-frequency CREATE
      -- path, and only when a non-teacher is being (correctly) rejected.
      SELECT s.id INTO v_staff_id FROM public.staff s WHERE s.profile_id = auth.uid() LIMIT 1;
      v_teaches := (v_staff_id IS NOT NULL OR v_email IS NOT NULL) AND EXISTS (
        SELECT 1
        FROM public.student_attendance sa
        CROSS JOIN LATERAL jsonb_each(
          CASE WHEN jsonb_typeof(sa.attendance_data) = 'object' THEN sa.attendance_data ELSE '{}'::jsonb END
        ) AS pd(period_id, pv)
        -- assigned_faculty is a scalar object for a single-teacher period but an ARRAY of
        -- {faculty_id, faculty_email, ...} for a co-taught / substitute period (~19% of prod
        -- periods). Normalize both shapes to a set of faculty elements so a co-teacher is
        -- NOT false-blocked from authoring (deep-review LOW 2026-07-06, confirmed vs prod:
        -- 3,876 of 19,937 periods store the array form).
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE jsonb_typeof(pv -> 'assigned_faculty')
            WHEN 'array'  THEN pv -> 'assigned_faculty'
            WHEN 'object' THEN jsonb_build_array(pv -> 'assigned_faculty')
            ELSE '[]'::jsonb END
        ) AS fac
        WHERE sa.institution_id = v_inst
          AND pv ->> 'course_id' = p_course_id::text
          AND ( (v_staff_id IS NOT NULL AND fac ->> 'faculty_id' = v_staff_id::text)
                OR (v_email IS NOT NULL AND lower(btrim(fac ->> 'faculty_email')) = v_email) )
      );
      IF NOT v_teaches THEN
        RAISE EXCEPTION 'fn_curriculum_lesson_upsert: only staff who teach this course (or an HOD/admin of its institution) can create its lesson';
      END IF;
    ELSE
      RAISE EXCEPTION 'fn_curriculum_lesson_upsert: only staff who teach this course (or an HOD/admin of its institution) can create its lesson';
    END IF;
    -- Idempotent on (course, creator, title): a link-after-create retry that failed, or
    -- the teacher re-typing the same topic, REUSES the existing published lesson rather
    -- than minting a duplicate that pollutes the my-topics reuse list (deep-review 🟡).
    SELECT id INTO v_existing FROM public.curriculum_lesson
    WHERE course_id = p_course_id AND created_by = auth.uid()
      AND source = 'faculty' AND status = 'published'
      AND lower(title) = lower(btrim(p_title))
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      -- CREATE-ONCE semantics (intentional): re-typing an existing published title REUSES
      -- that lesson (never duplicates the title in the reuse list) and only refreshes the
      -- primary Fink dimension. outcomes / co_refs / unit / sequence are deliberately NOT
      -- overwritten here — those params default to '[]' / '{}' (not NULL), so a COALESCE
      -- update would WIPE them whenever the caller passed only a title (deep-review 🟡 flagged
      -- the drop; a naive "COALESCE all" is the more dangerous fix). To revise a lesson's
      -- content, EDIT it (pass p_lesson_id) — the EDIT branch patches each provided field.
      UPDATE public.curriculum_lesson
      SET primary_fink_dimension = COALESCE(p_primary_fink, primary_fink_dimension), updated_at = now()
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
    -- The unique index uq_curriculum_lesson_faculty_topic is the race backstop: if a
    -- concurrent double-submit slipped past the SELECT above, one INSERT wins and the
    -- loser reuses the winner's row instead of erroring or duplicating.
    BEGIN
      INSERT INTO public.curriculum_lesson
        (institution_id, course_id, sequence_no, unit_label, title, learning_outcomes,
         primary_fink_dimension, co_refs, source, status, bos_syllabus_id,
         created_by, approved_by, approved_at)
      VALUES
        (v_inst, p_course_id, p_sequence_no, p_unit_label, btrim(p_title),
         COALESCE(p_learning_outcomes,'[]'::jsonb), p_primary_fink, COALESCE(p_co_refs,'{}'),
         'faculty', 'published', p_bos_syllabus_id, auth.uid(), auth.uid(), now())
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_id FROM public.curriculum_lesson
      WHERE course_id = p_course_id AND created_by = auth.uid()
        AND source = 'faculty' AND status = 'published'
        AND lower(title) = lower(btrim(p_title))
      LIMIT 1;
    END;
    RETURN v_id;
  END IF;

  -- EDIT: creator-only (#33), HOD/admin override. Authority is bound to the TARGET
  -- lesson's OWN institution, NEVER the caller-supplied p_course_id — otherwise an HOD
  -- of institution A could edit institution B's lesson by pairing their own course id
  -- with a foreign lesson id (cross-tenant break; deep-review 🔴 2026-07-05).
  SELECT created_by, institution_id INTO v_creator, v_lesson_inst
  FROM public.curriculum_lesson WHERE id = p_lesson_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_upsert: no such lesson'; END IF;
  IF NOT (v_creator = auth.uid()
          OR public.is_super_admin()
          OR (COALESCE(v_role_ok,false) AND public.role_has_institution_access(v_lesson_inst))) THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_upsert: only the lesson creator or an HOD/admin of its institution can edit it';
  END IF;

  -- A rename that collides with the creator's own published topic in this course would
  -- otherwise raise a raw uq_curriculum_lesson_faculty_topic error (deep-review 🟡).
  -- Patch-style: an unspecified (NULL) param PRESERVES the current value, so a title-only
  -- edit doesn't silently wipe learning_outcomes / co_refs / fink / unit / sequence
  -- (deep-review 🟠 2026-07-05: the old full-replace was destructive for #33 edits).
  BEGIN
    UPDATE public.curriculum_lesson
    SET title = btrim(p_title),
        unit_label = COALESCE(p_unit_label, unit_label),
        sequence_no = COALESCE(p_sequence_no, sequence_no),
        learning_outcomes = COALESCE(p_learning_outcomes, learning_outcomes),
        primary_fink_dimension = COALESCE(p_primary_fink, primary_fink_dimension),
        co_refs = COALESCE(p_co_refs, co_refs),
        bos_syllabus_id = COALESCE(p_bos_syllabus_id, bos_syllabus_id),
        updated_at = now()
    WHERE id = p_lesson_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_upsert: you already have a published topic with that title in this course';
  END;
  RETURN p_lesson_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_curriculum_lesson_ai_approve(p_lesson_id uuid, p_title text DEFAULT NULL::text, p_unit_label text DEFAULT NULL::text, p_sequence_no integer DEFAULT NULL::integer, p_learning_outcomes jsonb DEFAULT NULL::jsonb, p_primary_fink text DEFAULT NULL::text, p_co_refs text[] DEFAULT NULL::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_course uuid; v_status text; v_source text; v_role text;
        v_email text; v_staff_id uuid; v_priv boolean; v_teaches boolean; v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_ai_approve: not authenticated'; END IF;
  -- FOR UPDATE: lock the draft row so two concurrent approve/reject calls can't both pass
  -- the status='draft' check and double-process (deep-review LOW 2026-07-06).
  SELECT institution_id, course_id, status, source INTO v_inst, v_course, v_status, v_source
  FROM public.curriculum_lesson WHERE id = p_lesson_id FOR UPDATE;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_ai_approve: no such lesson'; END IF;
  IF v_status <> 'draft' OR v_source NOT IN ('bos_ai','title_ai') THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_ai_approve: only an AI draft lesson can be approved via this function';
  END IF;

  -- APPROVE PUBLISHES the draft into the shared course spine, so its authority must be
  -- the SAME as Phase 1's hardened CREATE gate (fn_curriculum_lesson_upsert, PR #1819):
  -- plain teaching staff must actually TEACH this course (assigned_faculty.faculty_id =
  -- staff.id in student_attendance, 100% populated; email is a NULL-guarded fallback),
  -- privileged roles (HOD/principal/dean/coordinator/admin/super) keep the dept override.
  -- The original "any teaching staff of the institution" list mirrored the PRE-#1819
  -- CREATE gate and would let a faculty publish AI drafts into a course they don't teach
  -- (spine-pollution on the publish action — the exact gap #1819 closed for CREATE).
  SELECT role, lower(btrim(email)) INTO v_role, v_email FROM public.profiles WHERE id = auth.uid();
  -- Leadership override repointed onto the Role Management switch. system_admin
  -- REMNANT (deliberate): today's audiences differ per lesson fn — the EDIT
  -- override excludes system_admin while approve/reject include it — so one key
  -- cannot express both without a day-one flip. system_admin stays hardcoded
  -- here (as in the preserved CREATE branch) until the Director folds it in.
  v_priv := public.is_super_admin()
            OR public.user_has_permission('academic.curriculum.lesson.manage')
            OR v_role = 'system_admin';
  SELECT s.id INTO v_staff_id FROM public.staff s WHERE s.profile_id = auth.uid() LIMIT 1;
  v_teaches := (v_staff_id IS NOT NULL OR v_email IS NOT NULL) AND EXISTS (
    SELECT 1 FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(sa.attendance_data) = 'object' THEN sa.attendance_data ELSE '{}'::jsonb END
    ) AS pd(period_id, pv)
    -- assigned_faculty is a scalar object for a single-teacher period but an ARRAY of
    -- {faculty_id, faculty_email, ...} for a co-taught / substitute period (~19% of prod
    -- periods). Normalize both shapes so a co-teacher is not false-blocked from approving
    -- their own course's drafts (deep-review LOW 2026-07-06; mirrors PR #1819's 3b fix).
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE jsonb_typeof(pv -> 'assigned_faculty')
        WHEN 'array'  THEN pv -> 'assigned_faculty'
        WHEN 'object' THEN jsonb_build_array(pv -> 'assigned_faculty')
        ELSE '[]'::jsonb END
    ) AS fac
    WHERE sa.institution_id = v_inst
      AND pv ->> 'course_id' = v_course::text
      AND ( (v_staff_id IS NOT NULL AND fac ->> 'faculty_id' = v_staff_id::text)
            OR (v_email IS NOT NULL AND lower(btrim(fac ->> 'faculty_email')) = v_email) )
  );
  v_ok := public.is_super_admin()
          OR (v_priv AND public.role_has_institution_access(v_inst))
          OR (v_role = ANY (ARRAY['faculty','school_faculty','staff'])
              AND public.role_has_institution_access(v_inst) AND v_teaches);
  IF NOT v_ok THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_ai_approve: only staff who teach this course (or an HOD/admin of its institution) can approve its AI draft';
  END IF;

  -- Patch-style (COALESCE): an approve-with-no-edits leaves the AI content as-is;
  -- a faculty edit overrides only the fields they touched, mirroring Phase 1's
  -- fn_curriculum_lesson_upsert EDIT branch so behavior is familiar/consistent.
  UPDATE public.curriculum_lesson
  SET title = COALESCE(NULLIF(btrim(COALESCE(p_title,'')), ''), title),
      unit_label = COALESCE(p_unit_label, unit_label),
      sequence_no = COALESCE(p_sequence_no, sequence_no),
      learning_outcomes = COALESCE(p_learning_outcomes, learning_outcomes),
      primary_fink_dimension = COALESCE(p_primary_fink, primary_fink_dimension),
      co_refs = COALESCE(p_co_refs, co_refs),
      status = 'published',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  WHERE id = p_lesson_id;

  RETURN p_lesson_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_curriculum_lesson_ai_reject(p_lesson_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_course uuid; v_status text; v_source text; v_role text;
        v_email text; v_staff_id uuid; v_priv boolean; v_teaches boolean; v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_ai_reject: not authenticated'; END IF;
  -- FOR UPDATE: lock the draft row so two concurrent approve/reject calls can't both pass
  -- the status='draft' check and double-process (deep-review LOW 2026-07-06).
  SELECT institution_id, course_id, status, source INTO v_inst, v_course, v_status, v_source
  FROM public.curriculum_lesson WHERE id = p_lesson_id FOR UPDATE;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_curriculum_lesson_ai_reject: no such lesson'; END IF;
  IF v_status <> 'draft' OR v_source NOT IN ('bos_ai','title_ai') THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_ai_reject: only an AI draft lesson can be rejected via this function';
  END IF;

  -- Same course-teaching authority as approve (above) — a cross-department faculty must
  -- not be able to archive another course's AI drafts either (grief vector). Plain
  -- faculty must teach the course; privileged roles keep the dept override.
  SELECT role, lower(btrim(email)) INTO v_role, v_email FROM public.profiles WHERE id = auth.uid();
  -- Leadership override repointed onto the Role Management switch. system_admin
  -- REMNANT (deliberate): today's audiences differ per lesson fn — the EDIT
  -- override excludes system_admin while approve/reject include it — so one key
  -- cannot express both without a day-one flip. system_admin stays hardcoded
  -- here (as in the preserved CREATE branch) until the Director folds it in.
  v_priv := public.is_super_admin()
            OR public.user_has_permission('academic.curriculum.lesson.manage')
            OR v_role = 'system_admin';
  SELECT s.id INTO v_staff_id FROM public.staff s WHERE s.profile_id = auth.uid() LIMIT 1;
  v_teaches := (v_staff_id IS NOT NULL OR v_email IS NOT NULL) AND EXISTS (
    SELECT 1 FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(sa.attendance_data) = 'object' THEN sa.attendance_data ELSE '{}'::jsonb END
    ) AS pd(period_id, pv)
    -- assigned_faculty is a scalar object for a single-teacher period but an ARRAY of
    -- {faculty_id, faculty_email, ...} for a co-taught / substitute period (~19% of prod
    -- periods). Normalize both shapes so a co-teacher is not false-blocked from approving
    -- their own course's drafts (deep-review LOW 2026-07-06; mirrors PR #1819's 3b fix).
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE jsonb_typeof(pv -> 'assigned_faculty')
        WHEN 'array'  THEN pv -> 'assigned_faculty'
        WHEN 'object' THEN jsonb_build_array(pv -> 'assigned_faculty')
        ELSE '[]'::jsonb END
    ) AS fac
    WHERE sa.institution_id = v_inst
      AND pv ->> 'course_id' = v_course::text
      AND ( (v_staff_id IS NOT NULL AND fac ->> 'faculty_id' = v_staff_id::text)
            OR (v_email IS NOT NULL AND lower(btrim(fac ->> 'faculty_email')) = v_email) )
  );
  v_ok := public.is_super_admin()
          OR (v_priv AND public.role_has_institution_access(v_inst))
          OR (v_role = ANY (ARRAY['faculty','school_faculty','staff'])
              AND public.role_has_institution_access(v_inst) AND v_teaches);
  IF NOT v_ok THEN
    RAISE EXCEPTION 'fn_curriculum_lesson_ai_reject: only staff who teach this course (or an HOD/admin of its institution) can reject its AI draft';
  END IF;

  UPDATE public.curriculum_lesson SET status = 'archived', updated_at = now() WHERE id = p_lesson_id;
END $function$;

-- ---------------------------------------------------------------------------
-- 3. ACLs — re-assert the pre-change state (anon locked, authenticated only).
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.fn_scf_verdict_contradictions(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_verdict_contradictions(date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_verdict_track_record(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_verdict_track_record(date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_set_verdict(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_set_verdict(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_can_manage(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_can_manage(text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_open_pulse(date, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_open_pulse(date, uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public._fn_live_poll_ensure_class_anchor(date, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_live_poll_ensure_class_anchor(date, uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_curriculum_lesson_upsert(uuid, uuid, text, text, integer, jsonb, text, text[], uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_lesson_upsert(uuid, uuid, text, text, integer, jsonb, text, text[], uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_curriculum_lesson_ai_approve(uuid, text, text, integer, jsonb, text, text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_lesson_ai_approve(uuid, text, text, integer, jsonb, text, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_curriculum_lesson_ai_reject(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_curriculum_lesson_ai_reject(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
