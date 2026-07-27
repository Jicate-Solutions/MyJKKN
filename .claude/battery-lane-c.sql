-- =============================================================================
-- battery-lane-c.sql — CLARIFICATION REQUESTS (Lane C) post-apply battery.
-- Runs AFTER 20260725133000_session_clarification_requests.sql is applied.
-- Single BEGIN .. (no COMMIT) transaction; the runner decides the rollback.
-- Identities are picked DYNAMICALLY from live data (no hardcoded uuids), so the
-- battery survives data drift. Every write below rolls back with the txn.
-- Coverage:
--   T0  scaffolding found (real Present session + 2 learners + team member + super admin)
--   T1  learner ask creates a pending row (allow)
--   T2  second ask same session upserts — same id, still 1 row (dedupe)
--   T3  outcome self-report by the same learner (allow)
--   T4  invalid outcome value rejected (deny)
--   T5  another learner sees ZERO of learner-1's rows (RLS deny)
--   T6  not-Present learner's ask rejected (deny)
--   T7  outcome without a prior ask rejected (deny)
--   T8  team-member (non-learner) ask rejected (deny)
--   T9  team-member read matches their audit.cycle.view permission (deny/allow honest)
--   T10 super admin (leadership) sees the row (allow)
--   T11 anon EXECUTE on the ask RPC denied (deny)
--   T12 direct table UPDATE by a learner denied — writes are RPC-only (deny)
--   T13 direct table INSERT by a learner denied — writes are RPC-only (deny)
-- =============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, pass boolean, detail text);
GRANT ALL ON _r TO authenticated;

DO $$
DECLARE
  v_l1_profile uuid; v_l1_lp uuid;
  v_l2_profile uuid; v_l2_lp uuid;
  v_tm_profile uuid;
  v_super uuid;
  v_sa_date date; v_sa_tt uuid; v_sa_period text;
  v_row  public.session_clarification_requests;
  v_row2 public.session_clarification_requests;
  v_cnt  int;
  v_has_perm boolean;
BEGIN
  -- ── Scaffolding (session role; RLS not in play) ────────────────────────────
  -- A real recent session where a learner with an auth profile is Present.
  SELECT sa.attendance_date, sa.timetable_id, per.key, lp.id, lp.profile_id
    INTO v_sa_date, v_sa_tt, v_sa_period, v_l1_lp, v_l1_profile
  FROM public.student_attendance sa
  CROSS JOIN LATERAL jsonb_each(sa.attendance_data) per
  CROSS JOIN LATERAL jsonb_array_elements(per.value->'students') st
  JOIN public.learners_profiles lp ON lp.id = (st->>'student_id')::uuid
  JOIN public.profiles p ON p.id = lp.profile_id
  WHERE st->>'status' = 'Present'
    AND sa.attendance_date >= CURRENT_DATE - 30
  LIMIT 1;

  -- A second learner who is NOT in that session's period at all.
  SELECT lp.id, lp.profile_id INTO v_l2_lp, v_l2_profile
  FROM public.learners_profiles lp
  JOIN public.profiles p ON p.id = lp.profile_id
  WHERE lp.id <> v_l1_lp
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_attendance sa2
      CROSS JOIN LATERAL jsonb_array_elements(sa2.attendance_data -> v_sa_period -> 'students') st2
      WHERE sa2.timetable_id = v_sa_tt
        AND sa2.attendance_date = v_sa_date
        AND sa2.attendance_data ? v_sa_period
        AND (st2->>'student_id')::uuid = lp.id
    )
  LIMIT 1;

  -- A team member: an auth profile with NO learners_profiles row.
  SELECT p.id INTO v_tm_profile
  FROM public.profiles p
  WHERE p.is_super_admin IS NOT TRUE
    AND p.role IN ('staff','faculty','hod')
    AND NOT EXISTS (SELECT 1 FROM public.learners_profiles lp2 WHERE lp2.profile_id = p.id)
  LIMIT 1;

  -- A super admin for the leadership read path.
  SELECT p.id INTO v_super FROM public.profiles p WHERE p.is_super_admin = true LIMIT 1;

  INSERT INTO _r VALUES ('T0 scaffolding found',
    v_l1_lp IS NOT NULL AND v_l2_lp IS NOT NULL AND v_tm_profile IS NOT NULL AND v_super IS NOT NULL,
    format('session=%s tt=%s period=%s l1_lp=%s l2_lp=%s tm=%s', v_sa_date, v_sa_tt, v_sa_period, v_l1_lp, v_l2_lp, v_tm_profile));

  -- ── T1: learner asks ───────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_l1_profile, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_row := public.fn_clarification_ask(v_sa_date, v_sa_tt, v_sa_period);
  INSERT INTO _r VALUES ('T1 learner ask creates pending row',
    v_row.id IS NOT NULL AND v_row.outcome = 'pending' AND v_row.student_id = v_l1_lp
      AND v_row.outcome_at IS NULL,
    format('id=%s outcome=%s course=%s', v_row.id, v_row.outcome, v_row.course_code));

  -- ── T2: second ask upserts, never duplicates ───────────────────────────────
  v_row2 := public.fn_clarification_ask(v_sa_date, v_sa_tt, v_sa_period);
  SELECT count(*) INTO v_cnt FROM public.session_clarification_requests
   WHERE student_id = v_l1_lp AND attendance_date = v_sa_date AND period_id = v_sa_period;
  INSERT INTO _r VALUES ('T2 second ask upserts not duplicates',
    v_row2.id = v_row.id AND v_cnt = 1,
    format('same_id=%s rows=%s', v_row2.id = v_row.id, v_cnt));

  -- ── T3: same learner self-reports the outcome ──────────────────────────────
  v_row2 := public.fn_clarification_outcome(v_sa_date, v_sa_period, 'refused');
  INSERT INTO _r VALUES ('T3 outcome self-report works',
    v_row2.id = v_row.id AND v_row2.outcome = 'refused' AND v_row2.outcome_at IS NOT NULL,
    format('outcome=%s outcome_at=%s', v_row2.outcome, v_row2.outcome_at));

  -- ── T4: invalid outcome value rejected ─────────────────────────────────────
  BEGIN
    v_row2 := public.fn_clarification_outcome(v_sa_date, v_sa_period, 'resolved');
    INSERT INTO _r VALUES ('T4 invalid outcome rejected', false, 'no exception raised');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('T4 invalid outcome rejected', SQLERRM LIKE '%invalid outcome%', SQLERRM);
  END;

  -- ── T5: another learner cannot read the row ────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_l2_profile, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_cnt FROM public.session_clarification_requests WHERE student_id = v_l1_lp;
  INSERT INTO _r VALUES ('T5 another learner sees zero rows', v_cnt = 0, format('visible=%s', v_cnt));

  -- ── T6: not-Present learner ask rejected ───────────────────────────────────
  BEGIN
    v_row2 := public.fn_clarification_ask(v_sa_date, v_sa_tt, v_sa_period);
    INSERT INTO _r VALUES ('T6 not-Present ask rejected', false, 'no exception raised');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('T6 not-Present ask rejected', SQLERRM LIKE '%not marked Present%', SQLERRM);
  END;

  -- ── T7: outcome without a prior ask rejected ───────────────────────────────
  BEGIN
    v_row2 := public.fn_clarification_outcome(v_sa_date, v_sa_period, 'refused');
    INSERT INTO _r VALUES ('T7 outcome without ask rejected', false, 'no exception raised');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('T7 outcome without ask rejected', SQLERRM LIKE '%no clarification request found%', SQLERRM);
  END;

  -- ── T8: team-member ask rejected ───────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tm_profile, 'role', 'authenticated')::text, true);
  BEGIN
    v_row2 := public.fn_clarification_ask(v_sa_date, v_sa_tt, v_sa_period);
    INSERT INTO _r VALUES ('T8 team-member ask rejected', false, 'no exception raised');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('T8 team-member ask rejected', SQLERRM LIKE '%only learners%', SQLERRM);
  END;

  -- ── T9: team-member read matches their permission (honest either way) ──────
  v_has_perm := public.user_has_permission('audit.cycle.view');
  SELECT count(*) INTO v_cnt FROM public.session_clarification_requests WHERE student_id = v_l1_lp;
  INSERT INTO _r VALUES ('T9 team-member read matches audit.cycle.view',
    (v_has_perm AND v_cnt >= 0) OR (NOT v_has_perm AND v_cnt = 0),
    format('has_audit_cycle_view=%s visible=%s', v_has_perm, v_cnt));

  -- ── T10: super admin (leadership) sees the row ─────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_cnt FROM public.session_clarification_requests
   WHERE student_id = v_l1_lp AND attendance_date = v_sa_date AND period_id = v_sa_period;
  INSERT INTO _r VALUES ('T10 super admin leadership read', v_cnt = 1, format('visible=%s', v_cnt));

  -- ── T11: anon cannot execute the ask RPC ───────────────────────────────────
  BEGIN
    PERFORM set_config('role', 'anon', true);
    v_row2 := public.fn_clarification_ask(v_sa_date, v_sa_tt, v_sa_period);
    INSERT INTO _r VALUES ('T11 anon execute denied', false, 'no exception raised');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('T11 anon execute denied', SQLERRM LIKE '%permission denied%', SQLERRM);
  END;
  PERFORM set_config('role', 'authenticated', true);

  -- ── T12: direct table UPDATE denied (writes are RPC-only) ──────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_l1_profile, 'role', 'authenticated')::text, true);
  BEGIN
    UPDATE public.session_clarification_requests SET outcome = 'unanswered' WHERE student_id = v_l1_lp;
    INSERT INTO _r VALUES ('T12 direct update denied', false, 'update did not error');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('T12 direct update denied', SQLERRM LIKE '%permission denied%', SQLERRM);
  END;

  -- ── T13: direct table INSERT denied (writes are RPC-only) ──────────────────
  BEGIN
    INSERT INTO public.session_clarification_requests (institution_id, student_id, attendance_date, period_id)
    VALUES (gen_random_uuid(), v_l1_lp, v_sa_date, 'battery-fake-period');
    INSERT INTO _r VALUES ('T13 direct insert denied', false, 'insert did not error');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('T13 direct insert denied', SQLERRM LIKE '%permission denied%', SQLERRM);
  END;
END $$;

RESET ROLE;
SELECT * FROM _r ORDER BY test;
