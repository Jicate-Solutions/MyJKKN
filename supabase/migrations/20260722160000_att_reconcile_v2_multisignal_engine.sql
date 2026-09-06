-- ============================================================================
-- Biometric <-> Work-Signal Attendance Reconciliation — v2 multi-signal engine
-- Date: 2026-07-22 · Spec: specs/biometric-worksignal-attendance-reconciliation-2026-07-22.md §14-§17
-- ============================================================================
-- Replaces the v1 generic-activity HIGH branch inside fn_att_reconcile_propose
-- with the TWO-SIGN rule (spec §15):
--
--   Sign A  = a qualifying same-day, faculty-attributed "did real work" act. Any of:
--             • class marked ON TIME  (PRIMARY: attendance taken within 15 min of the
--               scheduled period start, IST) — the strongest, hardest-to-fake sign
--             • pulses_run / lessons_linked / verdicts_given  (weaker desk acts, D13)
--   Sign B  = physically on campus that day (user_activity_logs.ip_address inside an
--             ACTIVE attendance_campus_networks range). MANDATORY anchor (D14/D16) —
--             stops two from-home desk acts faking presence.
--   Witness = ghost-class anti-cheat (D15): when Sign A is class-marking, prefer the
--             session witnessed = >=3 distinct learner confirmations (session_feedback).
--
--   HIGH   = (a non-class desk act OR an on-time+witnessed class mark) AND on campus.
--   MEDIUM = any single sign / on-campus-no-act / act-off-campus / not-yet-witnessed /
--            generic working-hours activity (the v1 tier, retained as the weak fallback).
--   none   = no signal at all -> no proposal (never auto-absent, never auto-grant).
--
-- The function still only writes PROPOSALS; fn_att_reconcile_review remains the ONLY
-- grant path (HR-approved). Signature is UNCHANGED (7 args) — CREATE OR REPLACE, so
-- the prod auto-classifier accepts it (no DROP).
--
-- DATA-MAP CORRECTION (verified live 2026-07-22, supersedes spec §14):
--   student_attendance.period_slot_id column is DEAD (100% NULL). The live slot ids
--   are the KEYS of student_attendance.attendance_data; the marking timestamp is
--   attendance_data.<slot>.students[].marked_at (NOT the row created_at). An
--   attendance_data key == a timetable slot's inner 'slot_id'; the timetable slot's
--   OUTER key == periods.id (the authoritative start_time; the slot JSON start_time is
--   NULL). staff_ids/primary_staff_id are staff.id. Faculty for the scf tables bridges
--   by faculty_email -> profiles.email (session_feedback.faculty_id does NOT equal
--   profiles.id — proven scar), except class_session_lesson.linked_by which IS a
--   profiles.id.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_att_reconcile_propose(
  p_start        date,
  p_end          date,
  p_campus_ip    inet    DEFAULT NULL,          -- optional single-IP override (in addition to attendance_campus_networks)
  p_work_start   time    DEFAULT '08:00',
  p_work_end     time    DEFAULT '18:00',
  p_min_actions  integer DEFAULT 3,             -- generic-activity threshold for the MEDIUM fallback tier
  p_realwork_actions text[] DEFAULT ARRAY['attendance','marks','grade','assessment']
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_written integer := 0;
BEGIN
  WITH
  -- Active faculty/hod, with lower(email) for the scf email-bridge.
  fac AS (
    SELECT p.id AS profile_id, lower(p.email) AS email
    FROM public.profiles p
    WHERE p.is_active = true AND p.role IN ('faculty','hod')
  ),
  -- profile -> set of staff.id (text) for the timetable staff match (usually 1).
  fac_staff AS (
    SELECT f.profile_id, array_agg(DISTINCT s.id::text) AS staff_ids
    FROM fac f JOIN public.staff s ON s.profile_id = f.profile_id
    GROUP BY f.profile_id
  ),
  -- Expected working days: Mon-Fri in the window.
  -- TODO(P1): subtract holidays + approved leave/on-duty once the calendar source is wired.
  days AS (
    SELECT d::date AS work_date
    FROM generate_series(p_start, p_end, interval '1 day') d
    WHERE extract(isodow FROM d) < 6
  ),
  -- faculty x working-day with NO biometric present-punch and not already marked off.
  gaps AS (
    SELECT f.profile_id, f.email, dd.work_date
    FROM fac f CROSS JOIN days dd
    WHERE NOT EXISTS (
      SELECT 1 FROM public.faculty_attendance_days a
      WHERE a.profile_id = f.profile_id AND a.work_date = dd.work_date
        AND a.source = 'biometric' AND a.status_code IN ('PRESENT','HALF_DAY','ON_DUTY')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.faculty_attendance_days a2
      WHERE a2.profile_id = f.profile_id AND a2.work_date = dd.work_date
        AND a2.status_code IN ('LEAVE','HOLIDAY','on_clinical_posting')
    )
  ),

  -- ---------- SIGN B: physically on campus that day (mandatory anchor) ----------
  -- Any activity from an ACTIVE attendance_campus_networks range (subnet-aware <<=),
  -- or the optional p_campus_ip override. No VPN at JKKN (D17) => campus IP == on-site.
  camp AS (
    SELECT g.profile_id, g.work_date,
           count(*)            AS campus_hits,
           min(ual.created_at) AS campus_first,
           max(ual.created_at) AS campus_last
    FROM gaps g
    JOIN public.user_activity_logs ual
      ON ual.user_id = g.profile_id
     AND (ual.created_at AT TIME ZONE 'Asia/Kolkata')::date = g.work_date
     AND ual.ip_address IS NOT NULL
     AND ( EXISTS (SELECT 1 FROM public.attendance_campus_networks n
                   WHERE n.is_active AND ual.ip_address <<= n.cidr)
           OR (p_campus_ip IS NOT NULL AND ual.ip_address = p_campus_ip) )
    GROUP BY g.profile_id, g.work_date
  ),

  -- ---------- generic working-hours activity (v1 tier, MEDIUM fallback only) ----------
  act AS (
    SELECT g.profile_id, g.work_date,
      count(*) FILTER (WHERE (ual.created_at AT TIME ZONE 'Asia/Kolkata')::time
                               BETWEEN p_work_start AND p_work_end) AS wh_actions,
      count(DISTINCT ual.ip_address) AS distinct_ips,
      bool_or(EXISTS (SELECT 1 FROM unnest(p_realwork_actions) rw
                      WHERE ual.action_type ILIKE '%'||rw||'%'
                         OR ual.resource_type ILIKE '%'||rw||'%')) AS real_work,
      min(ual.created_at) AS first_action,
      max(ual.created_at) AS last_action
    FROM gaps g
    JOIN public.user_activity_logs ual
      ON ual.user_id = g.profile_id
     AND (ual.created_at AT TIME ZONE 'Asia/Kolkata')::date = g.work_date
    GROUP BY g.profile_id, g.work_date
  ),

  -- ---------- SIGN A(1) PRIMARY: marked own scheduled class ON TIME ----------
  -- Expand every active timetable into teaching slots across all weekdays:
  --   outer key = periods.id (start_time source) · inner slot_id = attendance_data key
  --   staff_ids/primary_staff_id = staff.id
  tt_slots AS (
    SELECT t.id AS timetable_id,
           wd.weekday,
           slot.k                         AS period_id,      -- == periods.id (text)
           slot.v->>'slot_id'             AS slot_id,        -- == attendance_data key
           slot.v->'staff_ids'            AS staff_ids,      -- jsonb array of staff.id
           slot.v->>'primary_staff_id'    AS primary_staff
    FROM public.timetables t
    CROSS JOIN LATERAL jsonb_object_keys(t.timetable_data) AS wd(weekday)
    CROSS JOIN LATERAL jsonb_each(t.timetable_data->wd.weekday) AS slot(k,v)
    WHERE t.timetable_data IS NOT NULL
      AND jsonb_typeof(t.timetable_data) = 'object'
      AND (t.start_date IS NULL OR t.start_date <= p_end)
      AND (t.end_date   IS NULL OR t.end_date   >= p_start)
      AND coalesce((slot.v->>'is_break_slot')::bool, false) = false
      AND (slot.v ? 'staff_ids' OR slot.v ? 'primary_staff_id')
      AND (slot.v->>'slot_id') IS NOT NULL
  ),
  -- Actual markings: join attendance rows to their slot -> period -> start_time, and
  -- read the marking time from attendance_data.<slot>.students[].marked_at (min = earliest).
  marks_raw AS (
    SELECT ts.staff_ids, ts.primary_staff, sa.attendance_date AS work_date,
           ts.period_id, pr.start_time,
           (sm.marked_at AT TIME ZONE 'Asia/Kolkata') AS mark_ist,
           ( (sm.marked_at AT TIME ZONE 'Asia/Kolkata')::time
               BETWEEN pr.start_time AND pr.start_time + interval '15 min' ) AS is_ontime
    FROM public.student_attendance sa
    JOIN tt_slots ts
      ON ts.timetable_id = sa.timetable_id
     AND ts.weekday = upper(to_char(sa.attendance_date, 'FMDay'))
    JOIN public.periods pr ON pr.id::text = ts.period_id
    CROSS JOIN LATERAL (
      SELECT min((stu->>'marked_at')::timestamptz) AS marked_at
      FROM jsonb_each(sa.attendance_data) ad(a_key, a_val)
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(a_val->'students','[]'::jsonb)) stu
      WHERE ad.a_key = ts.slot_id
        AND (stu->>'marked_at') IS NOT NULL
    ) sm
    WHERE sa.attendance_date BETWEEN p_start AND p_end
      AND sa.timetable_id IS NOT NULL
      AND jsonb_typeof(sa.attendance_data) = 'object'
      AND sm.marked_at IS NOT NULL
  ),
  -- Attribute markings to a faculty profile via staff.id membership, per day.
  mark AS (
    SELECT fs.profile_id, mr.work_date,
           bool_or(mr.is_ontime)       AS mark_ontime,
           bool_or(NOT mr.is_ontime)   AS mark_late,
           jsonb_agg(jsonb_build_object(
             'period_id', mr.period_id, 'start_time', mr.start_time,
             'marked_ist', mr.mark_ist, 'ontime', mr.is_ontime)) AS mark_detail
    FROM marks_raw mr
    JOIN fac_staff fs
      ON (mr.staff_ids ?| fs.staff_ids OR mr.primary_staff = ANY(fs.staff_ids))
    GROUP BY fs.profile_id, mr.work_date
  ),

  -- ---------- SIGN A(2..4): weaker desk acts (D13) ----------
  pulse AS (   -- pulses_run: opened a live pulse (bridge by faculty_email)
    SELECT lower(lp.faculty_email) AS email,
           (coalesce(lp.issued_at, lp.created_at) AT TIME ZONE 'Asia/Kolkata')::date AS work_date
    FROM public.scf_live_pulse lp
    WHERE lp.faculty_email IS NOT NULL
      AND (coalesce(lp.issued_at, lp.created_at) AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_start AND p_end
    GROUP BY 1, 2
  ),
  lesson AS ( -- lessons_linked: linked_by IS a profiles.id
    SELECT csl.linked_by AS profile_id,
           (csl.linked_at AT TIME ZONE 'Asia/Kolkata')::date AS work_date
    FROM public.class_session_lesson csl
    WHERE csl.linked_by IS NOT NULL AND csl.linked_at IS NOT NULL
      AND (csl.linked_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_start AND p_end
    GROUP BY 1, 2
  ),
  verdict AS ( -- verdicts_given: gave a human verdict on an AI suggestion (bridge by faculty_email)
    SELECT lower(sug.faculty_email) AS email,
           (sug.human_verdict_at AT TIME ZONE 'Asia/Kolkata')::date AS work_date
    FROM public.scf_ai_suggestions sug
    WHERE sug.faculty_email IS NOT NULL AND sug.human_verdict IS NOT NULL
      AND sug.human_verdict_at IS NOT NULL
      AND (sug.human_verdict_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_start AND p_end
    GROUP BY 1, 2
  ),
  -- Ghost-class anti-cheat: max distinct-learner confirmations that faculty-day (>=3 = witnessed)
  wit AS (
    SELECT email, work_date, max(cnt) AS max_conf
    FROM (
      SELECT lower(sf.faculty_email) AS email, sf.attendance_date AS work_date,
             sf.period_id, count(DISTINCT sf.student_id) AS cnt
      FROM public.session_feedback sf
      WHERE sf.faculty_email IS NOT NULL
        AND sf.attendance_date BETWEEN p_start AND p_end
      GROUP BY lower(sf.faculty_email), sf.attendance_date, sf.period_id
    ) x
    GROUP BY email, work_date
  ),

  -- ---------- combine per gap-day ----------
  scored AS (
    SELECT g.profile_id, g.work_date, g.email,
      coalesce(mk.mark_ontime, false) AS mark_ontime,
      coalesce(mk.mark_late,   false) AS mark_late,
      (pl.email IS NOT NULL)          AS pulse,
      (ls.profile_id IS NOT NULL)     AS lesson,
      (vd.email IS NOT NULL)          AS verdict,
      (coalesce(cp.campus_hits,0) > 0) AS on_campus,
      coalesce(wt.max_conf, 0)        AS wit_conf,
      coalesce(ac.wh_actions, 0)      AS wh_actions,
      coalesce(ac.distinct_ips, 0)    AS distinct_ips,
      coalesce(ac.real_work, false)   AS real_work,
      ac.first_action, ac.last_action, cp.campus_first, cp.campus_last, mk.mark_detail
    FROM gaps g
    LEFT JOIN mark    mk ON mk.profile_id = g.profile_id AND mk.work_date = g.work_date
    LEFT JOIN pulse   pl ON pl.email      = g.email      AND pl.work_date = g.work_date
    LEFT JOIN lesson  ls ON ls.profile_id = g.profile_id AND ls.work_date = g.work_date
    LEFT JOIN verdict vd ON vd.email      = g.email      AND vd.work_date = g.work_date
    LEFT JOIN camp    cp ON cp.profile_id = g.profile_id AND cp.work_date = g.work_date
    LEFT JOIN wit     wt ON wt.email      = g.email      AND wt.work_date = g.work_date
    LEFT JOIN act     ac ON ac.profile_id = g.profile_id AND ac.work_date = g.work_date
  ),
  labeled AS (
    SELECT s.*,
      (mark_ontime OR mark_late OR pulse OR lesson OR verdict) AS sign_a_any,
      -- qualifying HIGH Sign A: a non-class desk act, OR an on-time class mark that is witnessed
      ((pulse OR lesson OR verdict) OR (mark_ontime AND wit_conf >= 3)) AS sign_a_high,
      CASE WHEN mark_ontime AND wit_conf >= 3 THEN 'yes'
           WHEN mark_ontime                   THEN 'pending'
           ELSE 'n/a' END AS witnessed_state
    FROM scored s
  ),
  final AS (
    SELECT l.*,
      CASE
        WHEN sign_a_high AND on_campus THEN 'high'
        WHEN sign_a_any OR on_campus OR wh_actions >= p_min_actions OR real_work THEN 'medium'
        ELSE NULL
      END AS confidence
    FROM labeled l
  ),
  ins AS (
    INSERT INTO public.faculty_attendance_reconcile_proposals
      (profile_id, work_date, confidence, evidence, cycle_start, cycle_end)
    SELECT profile_id, work_date, confidence,
      jsonb_build_object(
        'engine_version', 'v2',
        'signals', jsonb_build_object(
          'class_marked_ontime', mark_ontime, 'class_marked_late', mark_late,
          'pulses_run', pulse, 'lessons_linked', lesson, 'verdicts_given', verdict),
        'sign_a_high', sign_a_high, 'on_campus', on_campus,
        'witnessed', witnessed_state, 'witness_confirmations', wit_conf,
        'wh_actions', wh_actions, 'distinct_ips', distinct_ips, 'real_work', real_work,
        'first_action', first_action, 'last_action', last_action,
        'campus_first', campus_first, 'campus_last', campus_last,
        'mark_detail', mark_detail),
      p_start, p_end
    FROM final
    WHERE confidence IS NOT NULL
    ON CONFLICT (profile_id, work_date) DO UPDATE
      SET confidence = EXCLUDED.confidence, evidence = EXCLUDED.evidence,
          cycle_start = EXCLUDED.cycle_start, cycle_end = EXCLUDED.cycle_end
      WHERE public.faculty_attendance_reconcile_proposals.status = 'pending'
    RETURNING 1
  )
  SELECT count(*) INTO v_written FROM ins;
  RETURN v_written;
END; $fn$;

-- Lock exactly as v1: service_role only (cron/system caller), never anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.fn_att_reconcile_propose(date,date,inet,time,time,integer,text[]) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_att_reconcile_propose(date,date,inet,time,time,integer,text[]) TO service_role;
