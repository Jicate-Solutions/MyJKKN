-- ============================================================================
-- The last two nightly routines: give the cron an identity, and stop building
-- an escalation that has nobody to send to
-- Created: 2026-08-04
-- ----------------------------------------------------------------------------
-- Both functions below are their LIVE production definitions (pg_get_functiondef,
-- captured 2026-08-04), each with ONE mechanical change, asserted line-by-line by
-- the generator to add only the lines shown and remove nothing.
--
-- ----------------------------------------------------------------------------
-- FIX 1 — cac-attendance-rollup: "HTTP 503 - Not authorised to refresh the CAC
-- attendance rollup", every night.
--
-- app/api/cron/cac-attendance-rollup/route.ts calls this RPC through
-- createServiceRoleClient(). A service-role client carries no user JWT, so
-- auth.uid() is NULL, so is_super_admin() and is_admin() both correctly return
-- false and the guard correctly refuses. The guard was written for a human
-- caller and the routine has no human.
--
-- Adding auth.role() = 'service_role' widens NOTHING: service_role bypasses RLS
-- by construction, so any holder of that key could already write
-- cac_attendance_rollup directly. This is the same shape public.exec_sql already
-- uses (auth.role() IS DISTINCT FROM 'service_role'), i.e. the established
-- mechanism in this database rather than a new one.
-- Reproduced before the fix: calling the RPC with the service-role key returned
-- HTTP 403 / 42501 with production's exact message.
--
-- ----------------------------------------------------------------------------
-- FIX 2 — session-feedback-escalation: 'null value in column "faculty_email" of
-- relation "session_feedback_escalations" violates not-null constraint'.
--
-- The esc CTE groups session_feedback by lower(f.faculty_email) with no NULL
-- filter, then inserts into session_feedback_escalations.faculty_email, which is
-- NOT NULL with no default. A NULL email forms its own group and breaks the
-- statement -- taking the whole digest down with it, including every VALID
-- escalation in the same run.
--
-- Measured on production 2026-08-04: 19,446 of 131,892 session_feedback rows
-- (14.7%) carry no faculty_email, and in last week's window exactly 2 such
-- groups cross the escalation threshold (count >= 3 AND avg(understood) < 3).
--
-- Dropping them is the correct semantics, not a workaround: an escalation is a
-- message addressed to a person, and these rows have no addressee to resolve.
-- faculty_id is NULL on ALL 19,446 of them, so no staff lookup can recover an
-- email either. When a blank must not count, do not write the row.
--
-- KNOWN GAP THIS DOES NOT FIX (reported separately, needs a data-capture
-- decision, not a code change): those 19,446 rows are unattributable, so two
-- sections that scored below threshold last week (CME365, 11 responses; CME346,
-- 7 responses) will escalate to nobody. The digest will now RUN instead of
-- crashing -- it still cannot name a Senior Learner who was never recorded.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_cac_refresh_attendance_rollup()
 RETURNS TABLE(institutions_updated integer, total_marks bigint, elapsed_ms integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_rows    integer;
  v_marks   bigint;
BEGIN
  IF NOT (
       COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR auth.role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'Not authorised to refresh the CAC attendance rollup'
      USING ERRCODE = '42501';
  END IF;

  WITH marks AS (
    SELECT sa.institution_id AS inst,
           count(*)                                            AS marks,
           count(*) FILTER (WHERE entry->>'status' = 'Present') AS present,
           min(sa.attendance_date)                             AS earliest,
           max(sa.attendance_date)                             AS latest
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(sa.attendance_data) AS period(pkey, pval)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(period.pval -> 'students') = 'array'
           THEN period.pval -> 'students'
           ELSE '[]'::jsonb END
    ) AS entry
    WHERE sa.institution_id IS NOT NULL
    GROUP BY sa.institution_id
  ),
  sess AS (
    SELECT sa.institution_id AS inst, count(*) AS sessions
    FROM public.student_attendance sa
    WHERE sa.institution_id IS NOT NULL
    GROUP BY sa.institution_id
  ),
  upserted AS (
    INSERT INTO public.cac_attendance_rollup AS r
      (institution_id, marks, present, presence_rate, sessions,
       earliest_date, latest_date, computed_at, updated_at)
    SELECT m.inst,
           m.marks,
           m.present,
           round(100.0 * m.present / NULLIF(m.marks, 0), 2),
           COALESCE(s.sessions, 0),
           m.earliest,
           m.latest,
           now(),
           now()
    FROM marks m
    LEFT JOIN sess s ON s.inst = m.inst
    ON CONFLICT (institution_id) DO UPDATE SET
      marks         = EXCLUDED.marks,
      present       = EXCLUDED.present,
      presence_rate = EXCLUDED.presence_rate,
      sessions      = EXCLUDED.sessions,
      earliest_date = EXCLUDED.earliest_date,
      latest_date   = EXCLUDED.latest_date,
      computed_at   = EXCLUDED.computed_at,
      updated_at    = now()
    RETURNING r.marks
  )
  SELECT count(*)::integer, COALESCE(sum(u.marks), 0)::bigint
    INTO v_rows, v_marks
  FROM upserted u;

  RETURN QUERY SELECT
    v_rows,
    v_marks,
    (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::integer;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_scf_apply_weekly_escalation_digest(p_week_start date, p_summaries jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(recipients_notified integer, classes_flagged integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_week_end   date := p_week_start + 6;
  v_system     uuid;
  v_recipients int := 0;
  v_classes    int := 0;
BEGIN
  -- Stable system identity for notifications.created_by (NOT NULL).
  SELECT p.id INTO v_system
  FROM public.profiles p
  WHERE p.is_super_admin = true OR p.role = 'super_admin'
  ORDER BY p.created_at ASC NULLS LAST
  LIMIT 1;

  -- Statement 1: upsert the escalation log (increment escalation_count ONCE per
  -- new week → idempotent if the cron re-runs the same week). Resolves the
  -- department via staff so the tier ladder + recipient lookup have it.
  WITH esc AS (
    SELECT f.institution_id,
           lower(f.faculty_email)         AS faculty_email,
           f.course_code,
           (array_agg(f.faculty_id))[1]   AS faculty_id
    FROM public.session_feedback f
    WHERE f.attendance_date BETWEEN p_week_start AND v_week_end
      AND f.faculty_email IS NOT NULL
    GROUP BY f.institution_id, lower(f.faculty_email), f.course_code
    HAVING count(*) >= 3 AND avg(f.understood) < 3
  ),
  esc_dept AS (
    SELECT esc.institution_id, s.department_id, esc.faculty_email, esc.course_code
    FROM esc LEFT JOIN public.staff s ON s.id = esc.faculty_id
  )
  INSERT INTO public.session_feedback_escalations AS e
    (institution_id, department_id, faculty_email, course_code,
     escalation_count, first_escalated_week, last_escalated_week, updated_at)
  SELECT ed.institution_id, ed.department_id, ed.faculty_email, ed.course_code,
         1, p_week_start, p_week_start, now()
  FROM esc_dept ed
  ON CONFLICT (institution_id, faculty_email, course_code) DO UPDATE
    SET escalation_count =
          e.escalation_count
          + CASE WHEN e.last_escalated_week IS NULL
                   OR e.last_escalated_week < p_week_start
                 THEN 1 ELSE 0 END,
        last_escalated_week  = GREATEST(COALESCE(e.last_escalated_week, p_week_start), p_week_start),
        first_escalated_week = LEAST(COALESCE(e.first_escalated_week, p_week_start), p_week_start),
        department_id        = COALESCE(e.department_id, EXCLUDED.department_id),
        updated_at           = now();

  GET DIAGNOSTICS v_classes = ROW_COUNT;
  IF v_classes = 0 THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  -- Statement 2: resolve recipients (HOD always; +Principal once escalation_count
  -- >= 2 — the log was upserted above, so the tier is now visible) and write one
  -- digest per recipient (idempotent per recipient per week via idempotency_key).
  WITH esc AS (
    SELECT f.institution_id,
           lower(f.faculty_email)               AS faculty_email,
           f.course_code,
           max(f.course_name)                   AS course_name,
           (array_agg(f.faculty_id))[1]         AS faculty_id,
           count(*)::bigint                      AS responses,
           round(avg(f.understood)::numeric, 2) AS avg_understood
    FROM public.session_feedback f
    WHERE f.attendance_date BETWEEN p_week_start AND v_week_end
      AND f.faculty_email IS NOT NULL
    GROUP BY f.institution_id, lower(f.faculty_email), f.course_code
    HAVING count(*) >= 3 AND avg(f.understood) < 3
  ),
  flagged AS (
    SELECT e.institution_id, l.department_id, e.faculty_email, e.course_code,
           e.course_name, e.responses, e.avg_understood, l.escalation_count,
           CASE WHEN l.escalation_count >= 2 THEN 'hod_principal' ELSE 'hod' END AS tier,
           COALESCE(p_summaries ->> (e.faculty_email || '|' || e.course_code),
                    'Average understanding ' || e.avg_understood::text
                    || '/5 across ' || e.responses::text || ' learners.') AS summary
    FROM esc e
    JOIN public.session_feedback_escalations l
      ON l.institution_id = e.institution_id
     AND l.faculty_email  = e.faculty_email
     AND l.course_code    = e.course_code
  ),
  recips AS (
    SELECT f.*, h.id AS recipient_id, 'hod'::text AS recipient_role
    FROM flagged f
    JOIN public.profiles h
      ON h.role = 'hod' AND h.department_id = f.department_id
     AND h.institution_id = f.institution_id
    UNION ALL
    SELECT f.*, pr.id AS recipient_id, 'principal'::text AS recipient_role
    FROM flagged f
    JOIN public.profiles pr
      ON pr.role = 'principal' AND pr.institution_id = f.institution_id
    WHERE f.tier = 'hod_principal'
  ),
  per_recipient AS (
    SELECT recipient_id,
           (array_agg(DISTINCT recipient_role))[1] AS recipient_role,
           count(DISTINCT (faculty_email || '|' || course_code))::int AS n_classes,
           string_agg(
             DISTINCT '• ' || COALESCE(course_name, course_code)
               || ' (avg ' || avg_understood::text || '/5, ' || responses::text
               || ' learners): ' || summary,
             E'\n'
           ) AS body_list
    FROM recips
    GROUP BY recipient_id
  ),
  ins_notif AS (
    INSERT INTO public.notifications (
      id, title, body, url, icon,
      created_by, targeting,
      priority, category, kind,
      requires_acknowledgment, is_layer_0,
      idempotency_key, metadata,
      created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      pr.n_classes || ' class' || CASE WHEN pr.n_classes = 1 THEN '' ELSE 'es' END
        || ' need your attention this week',
      'Classes flagged by learner feedback (avg understanding below 3) in your '
        || 'scope this week:' || E'\n' || pr.body_list,
      '/academic/session-feedback/principal',
      'alert-triangle',
      COALESCE(v_system, pr.recipient_id),
      jsonb_build_object('type', 'user', 'user_ids', jsonb_build_array(pr.recipient_id)),
      'high',
      'dashboard:scf_escalation',
      'work_item',
      FALSE,
      FALSE,
      'scf-esc:' || pr.recipient_id::text || ':' || p_week_start::text,
      jsonb_build_object('week_start', p_week_start, 'n_classes', pr.n_classes,
                         'role', pr.recipient_role, 'source', 'scf_escalation_digest'),
      now(), now()
    FROM per_recipient pr
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n2
      WHERE n2.idempotency_key =
        'scf-esc:' || pr.recipient_id::text || ':' || p_week_start::text
    )
    RETURNING id, (targeting -> 'user_ids' ->> 0)::uuid AS recipient_id
  ),
  ins_user AS (
    INSERT INTO public.user_notifications (id, notification_id, user_id, created_at)
    SELECT gen_random_uuid(), n.id, n.recipient_id, now()
    FROM ins_notif n
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_recipients FROM ins_user;

  -- Statement 3: stamp the per-class notified_week markers (separate statement →
  -- sees the notifications written above). A class is HOD-notified this week iff
  -- one of its HODs holds a digest notification for this week; same for Principal.
  UPDATE public.session_feedback_escalations e
  SET hod_notified_week = p_week_start
  WHERE e.last_escalated_week = p_week_start
    AND EXISTS (
      SELECT 1 FROM public.profiles h
      WHERE h.role = 'hod' AND h.department_id = e.department_id
        AND h.institution_id = e.institution_id
        AND EXISTS (SELECT 1 FROM public.notifications n
                    WHERE n.idempotency_key = 'scf-esc:' || h.id::text || ':' || p_week_start::text)
    );

  UPDATE public.session_feedback_escalations e
  SET principal_notified_week = p_week_start
  WHERE e.last_escalated_week = p_week_start
    AND e.escalation_count >= 2
    AND EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.role = 'principal' AND pr.institution_id = e.institution_id
        AND EXISTS (SELECT 1 FROM public.notifications n
                    WHERE n.idempotency_key = 'scf-esc:' || pr.id::text || ':' || p_week_start::text)
    );

  RETURN QUERY SELECT v_recipients, v_classes;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Anon locks. Neither function is new -- both are re-issued from their live
-- definitions -- but CREATE OR REPLACE re-runs Supabase's default privileges,
-- so the revokes are restated explicitly. Read live before writing these
-- (pg_proc.proacl, 2026-08-04):
--   fn_cac_refresh_attendance_rollup      postgres, authenticated, service_role
--   fn_scf_apply_weekly_escalation_digest postgres, service_role      <- NO authenticated
--
-- The CI guard's suggested remedy is "REVOKE FROM anon, PUBLIC; GRANT TO
-- authenticated". Applying that to BOTH would hand every logged-in user the
-- weekly escalation digest, which today only postgres and service_role can run.
-- Never satisfy a gate by widening access: each function keeps exactly the
-- grants it already had, and only the anon/PUBLIC revoke is added.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_cac_refresh_attendance_rollup() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cac_refresh_attendance_rollup() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_scf_apply_weekly_escalation_digest(date, jsonb) FROM anon, PUBLIC;
-- deliberately NO grant to authenticated here: it does not have one today.

-- ---------------------------------------------------------------------------
-- Assertions. Any failure raises inside the transaction and rolls the whole
-- migration back.
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE v_n int;
BEGIN
  -- ASSERT 1 - the CAC guard now admits the cron's service_role identity.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_cac_refresh_attendance_rollup'
     AND pg_get_functiondef(p.oid) LIKE '%auth.role() = ''service_role''%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'fn_cac_refresh_attendance_rollup did not take the service_role branch (found %)', v_n;
  END IF;

  -- ASSERT 2 - the guard still refuses everyone else (the RAISE is intact).
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_cac_refresh_attendance_rollup'
     AND pg_get_functiondef(p.oid) LIKE '%Not authorised to refresh the CAC attendance rollup%'
     AND pg_get_functiondef(p.oid) LIKE '%is_super_admin%'
     AND pg_get_functiondef(p.oid) LIKE '%is_admin%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'fn_cac_refresh_attendance_rollup lost its original guard - refusing';
  END IF;

  -- ASSERT 3 - BOTH session_feedback scans now exclude the null-email rows.
  SELECT (length(pg_get_functiondef(p.oid))
          - length(replace(pg_get_functiondef(p.oid), 'AND f.faculty_email IS NOT NULL', '')))
         / length('AND f.faculty_email IS NOT NULL')
    INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_scf_apply_weekly_escalation_digest';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'expected the null-email filter on BOTH session_feedback scans, found %', v_n;
  END IF;
  -- ASSERT 4 - the escalation digest must NOT have gained an authenticated grant.
  IF has_function_privilege('authenticated',
       'public.fn_scf_apply_weekly_escalation_digest(date, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_scf_apply_weekly_escalation_digest gained an authenticated EXECUTE grant - refusing to widen it';
  END IF;

  -- ASSERT 5 - neither function is reachable by anon.
  IF has_function_privilege('anon', 'public.fn_cac_refresh_attendance_rollup()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_scf_apply_weekly_escalation_digest(date, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can still EXECUTE one of these functions - refusing';
  END IF;
END
$assert$;

COMMIT;
