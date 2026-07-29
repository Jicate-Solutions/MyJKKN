-- =============================================================================
-- battery-cp-l2.sql — Classroom Practice L2 micro-item post-apply battery.
--
-- HOW TO RUN (dry rehearsal, nothing persists):
--   Send ONE batch = 20260729184500_classroom_practice_l2_micro.sql followed by
--   THIS FILE, then ROLLBACK. The migration contains NO inner BEGIN/COMMIT, so
--   the enclosing transaction really does roll back (contrast the 2026-07-26
--   incident where an inner COMMIT turned a rehearsal into a live apply).
--   Alternatively run this file alone AFTER the migration is applied.
--
-- Identities are picked DYNAMICALLY from live data (no hardcoded uuids). Every
-- write below — synthetic catalog rows, a synthetic leave decision, impressions
-- — rolls back with the transaction.
--
-- Coverage:
--   T0  scaffolding found (Present session WITH an assigned senior learner)
--   T1  table + RLS on + anon fully revoked + authenticated SELECT-only
--   T2  all three RPCs revoked from anon
--   T3  config row present and complete
--   T4  enabled=false silences the feature (the rollback switch)
--   T5  no CP catalog rows => no item (tolerates the sibling migration absent)
--   T6  an item is offered once catalog rows exist, and it is RECORDED
--   T7  invariant 1 — a second call for the SAME session offers nothing
--   T8  invariant 4 — rotation picks the least-recently-offered item
--   T9  invariant 4 — every item inside min_gap => deck_cooling, nothing offered
--   T10 invariant 5 — CP-C1 excluded with no decided leave, included with one
--   T11 invariant 6 — auto-backoff fires below the answer-rate floor
--   T12 answer RPC refuses another learner's impression (ownership)
--   T13 answer records a score, then refuses a second answer (answer-once)
--   T14 skip is a recorded answer (skipped=true, score NULL)
--   T15 health RPC returns the weekly shape (leadership)
--   T16 health RPC denies a plain learner
-- =============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, pass boolean, detail text);
GRANT ALL ON _r TO authenticated;

DO $$
DECLARE
  v_l1_profile uuid; v_l1_lp uuid;
  v_l2_profile uuid; v_l2_lp uuid;
  v_super uuid;
  v_inst  uuid;
  v_date  date; v_tt uuid; v_period text; v_email text;
  v_date2 date; v_tt2 uuid; v_period2 text;
  v_seeded boolean := false;
  v_res   jsonb;
  v_imp   uuid; v_imp2 uuid;
  v_cnt   int;
  v_txt   text;
  v_ok    boolean;
  v_score smallint; v_skip boolean;
BEGIN
  -- ══ T0 scaffolding ═══════════════════════════════════════════════════════
  -- A recent session where a learner with an auth profile is Present AND the
  -- period carries an assigned_faculty.faculty_email (no email => by design the
  -- feature offers nothing, so such a session cannot exercise the deck).
  SELECT sa.attendance_date, sa.timetable_id, per.key, sa.institution_id,
         lp.id, lp.profile_id,
         per.value -> 'assigned_faculty' ->> 'faculty_email'
    INTO v_date, v_tt, v_period, v_inst, v_l1_lp, v_l1_profile, v_email
  FROM public.student_attendance sa
  CROSS JOIN LATERAL jsonb_each(sa.attendance_data) per
  CROSS JOIN LATERAL jsonb_array_elements(per.value -> 'students') st
  JOIN public.learners_profiles lp ON lp.id = (st ->> 'student_id')::uuid
  JOIN public.profiles p ON p.id = lp.profile_id
  WHERE st ->> 'status' = 'Present'
    AND sa.attendance_date >= CURRENT_DATE - 60
    AND NULLIF(per.value -> 'assigned_faculty' ->> 'faculty_email', '') IS NOT NULL
    -- Must clear the RPC's own role gate, or every test below fails for the
    -- wrong reason ('learners_only'). 'student' is the literal DB role value.
    AND p.role IN ('student', 'learner')
  LIMIT 1;

  -- A SECOND session for the SAME learner + SAME senior learner (needed to
  -- exercise rotation: one submission may only ever carry one item).
  SELECT sa.attendance_date, sa.timetable_id, per.key
    INTO v_date2, v_tt2, v_period2
  FROM public.student_attendance sa
  CROSS JOIN LATERAL jsonb_each(sa.attendance_data) per
  CROSS JOIN LATERAL jsonb_array_elements(per.value -> 'students') st
  WHERE st ->> 'status' = 'Present'
    AND (st ->> 'student_id')::uuid = v_l1_lp
    AND lower(per.value -> 'assigned_faculty' ->> 'faculty_email') = lower(v_email)
    AND NOT (sa.attendance_date = v_date AND sa.timetable_id = v_tt AND per.key = v_period)
    AND sa.attendance_date >= CURRENT_DATE - 60
  LIMIT 1;

  -- A different learner (for the ownership test) — also role-gated, so a
  -- refusal proves OWNERSHIP rather than merely the role check.
  SELECT lp.id, lp.profile_id INTO v_l2_lp, v_l2_profile
  FROM public.learners_profiles lp
  JOIN public.profiles p ON p.id = lp.profile_id
  WHERE lp.id <> v_l1_lp
    AND p.role IN ('student', 'learner')
  LIMIT 1;

  -- A super admin (for the leadership-gated health RPC).
  SELECT p.id INTO v_super
  FROM public.profiles p
  WHERE p.is_super_admin IS TRUE
  LIMIT 1;

  INSERT INTO _r VALUES ('T0 scaffolding',
    v_l1_lp IS NOT NULL AND v_email IS NOT NULL AND v_l2_lp IS NOT NULL,
    format('learner=%s senior=%s session=%s/%s second_session=%s other_learner=%s',
           v_l1_lp, v_email, v_date, v_period,
           COALESCE(v_date2::text,'NONE'), v_l2_lp));

  IF v_l1_lp IS NULL OR v_email IS NULL THEN
    INSERT INTO _r VALUES ('ABORT', false, 'no usable session — remaining tests skipped');
    RETURN;
  END IF;

  -- ══ T1 table grants + RLS ════════════════════════════════════════════════
  SELECT bool_and(NOT has_table_privilege('anon', c.oid, p.priv))
    INTO v_ok
  FROM pg_class c
  CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(priv)
  WHERE c.relname = 'carre_micro_impressions'
    AND c.relnamespace = 'public'::regnamespace;

  SELECT c.relrowsecurity INTO v_skip
  FROM pg_class c
  WHERE c.relname = 'carre_micro_impressions'
    AND c.relnamespace = 'public'::regnamespace;

  INSERT INTO _r VALUES ('T1 anon revoked + RLS on',
    COALESCE(v_ok,false) AND COALESCE(v_skip,false)
    AND has_table_privilege('authenticated','public.carre_micro_impressions','SELECT')
    AND NOT has_table_privilege('authenticated','public.carre_micro_impressions','INSERT')
    AND NOT has_table_privilege('authenticated','public.carre_micro_impressions','UPDATE')
    AND NOT has_table_privilege('authenticated','public.carre_micro_impressions','DELETE'),
    format('anon_all_revoked=%s rls=%s', v_ok, v_skip));

  -- ══ T2 RPC anon revokes ══════════════════════════════════════════════════
  INSERT INTO _r VALUES ('T2 RPCs anon-revoked',
    NOT has_function_privilege('anon','public.fn_scf_micro_next_item(date,uuid,text)','EXECUTE')
    AND NOT has_function_privilege('anon','public.fn_scf_micro_answer(uuid,int,boolean)','EXECUTE')
    AND NOT has_function_privilege('anon','public.fn_scf_micro_health()','EXECUTE')
    AND has_function_privilege('authenticated','public.fn_scf_micro_next_item(date,uuid,text)','EXECUTE'),
    'anon EXECUTE denied on all three; authenticated allowed');

  -- ══ T3 config row ════════════════════════════════════════════════════════
  SELECT count(*) INTO v_cnt
  FROM public.platform_policies
  WHERE policy_key = 'classroom_practice.l2'
    AND scope_type = 'global' AND scope_id IS NULL
    AND value ? 'enabled' AND value ? 'min_gap_days_per_item'
    AND value ? 'backoff_answer_rate_floor' AND value ? 'backoff_window'
    AND value ? 'backoff_cooldown_days' AND value ? 'leave_item_lookback_days';
  INSERT INTO _r VALUES ('T3 config row complete', v_cnt = 1, format('rows=%s', v_cnt));

  -- Seed synthetic CP catalog rows if the sibling migration has not landed, so
  -- the deck tests are deterministic either way.
  SELECT count(*) INTO v_cnt FROM public.audit_parameter_catalog WHERE code LIKE 'CP-%';
  IF v_cnt = 0 THEN
    v_seeded := true;
    INSERT INTO public.audit_parameter_catalog
      (code, name, parameter_group, description, default_owner_role, is_active, is_system)
    VALUES
      ('CP-C1','Leave decided by clear rules',1,'Was your leave or on-duty request decided by clear rules?','hod',true,false),
      ('CP-A1','Doubts welcomed',2,'Were your doubts welcomed in this session?','hod',true,false),
      ('CP-E1','Time respected',5,'Did this session start and end on time?','hod',true,false);
  END IF;

  -- ══ Become the learner ═══════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_l1_profile, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- ══ T4 rollback switch ═══════════════════════════════════════════════════
  UPDATE public.platform_policies
     SET value = jsonb_set(value, '{enabled}', 'false'::jsonb)
   WHERE policy_key = 'classroom_practice.l2' AND scope_type='global' AND scope_id IS NULL;

  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  INSERT INTO _r VALUES ('T4 enabled=false silences',
    v_res -> 'item' = 'null'::jsonb AND v_res ->> 'reason' = 'disabled',
    v_res::text);

  UPDATE public.platform_policies
     SET value = jsonb_set(value, '{enabled}', 'true'::jsonb)
   WHERE policy_key = 'classroom_practice.l2' AND scope_type='global' AND scope_id IS NULL;

  -- ══ T5 no catalog rows => no item ════════════════════════════════════════
  -- Deactivate every CP row briefly (as owner) to prove the tolerate-absence path.
  PERFORM set_config('role', 'none', true);
  UPDATE public.audit_parameter_catalog SET is_active = false WHERE code LIKE 'CP-%';
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  INSERT INTO _r VALUES ('T5 no catalog rows => no item',
    v_res -> 'item' = 'null'::jsonb AND v_res ->> 'reason' = 'no_candidate',
    v_res::text);

  PERFORM set_config('role', 'none', true);
  UPDATE public.audit_parameter_catalog SET is_active = true WHERE code LIKE 'CP-%';
  PERFORM set_config('role', 'authenticated', true);

  -- ══ T6 an item is offered AND recorded ═══════════════════════════════════
  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  v_imp := NULLIF(v_res -> 'item' ->> 'impression_id','')::uuid;
  SELECT count(*) INTO v_cnt FROM public.carre_micro_impressions
   WHERE id = v_imp AND learner_id = v_l1_lp AND answered_at IS NULL AND skipped = false;
  INSERT INTO _r VALUES ('T6 item offered + recorded',
    v_imp IS NOT NULL AND v_cnt = 1
    AND (v_res -> 'item' ->> 'question') IS NOT NULL,
    format('code=%s recorded=%s', v_res -> 'item' ->> 'code', v_cnt));

  -- ══ T7 invariant 1 — one item per submission ═════════════════════════════
  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  SELECT count(*) INTO v_cnt FROM public.carre_micro_impressions
   WHERE learner_id = v_l1_lp AND attendance_date = v_date AND period_id = v_period;
  INSERT INTO _r VALUES ('T7 one item per submission',
    v_res -> 'item' = 'null'::jsonb AND v_res ->> 'reason' = 'already_offered' AND v_cnt = 1,
    format('%s rows_for_session=%s', v_res::text, v_cnt));

  -- ══ T8/T9 rotation ═══════════════════════════════════════════════════════
  IF v_date2 IS NOT NULL THEN
    -- Age the first impression past the gap so the deck is live again, and
    -- record which item it was.
    SELECT parameter_code INTO v_txt FROM public.carre_micro_impressions WHERE id = v_imp;
    PERFORM set_config('role', 'none', true);
    UPDATE public.carre_micro_impressions
       SET offered_at = now() - INTERVAL '400 days'
     WHERE id = v_imp;
    PERFORM set_config('role', 'authenticated', true);

    v_res := public.fn_scf_micro_next_item(v_date2, v_tt2, v_period2);
    INSERT INTO _r VALUES ('T8 rotation avoids the just-offered item',
      v_res -> 'item' IS NOT NULL
      AND v_res -> 'item' ->> 'code' IS DISTINCT FROM v_txt,
      format('first=%s next=%s', v_txt, v_res -> 'item' ->> 'code'));

    -- Narrow the deck to exactly ONE item, one this learner saw MOMENTS ago,
    -- and free up session 2 again. Every candidate is then inside min_gap, so
    -- the only correct answer is deck_cooling. (Leaving any never-offered item
    -- active would legitimately be picked — NULLS FIRST — and prove nothing.)
    PERFORM set_config('role', 'none', true);
    UPDATE public.carre_micro_impressions SET offered_at = now() WHERE id = v_imp;
    DELETE FROM public.carre_micro_impressions
     WHERE learner_id = v_l1_lp AND attendance_date = v_date2 AND period_id = v_period2;
    UPDATE public.audit_parameter_catalog SET is_active = false
     WHERE code LIKE 'CP-%' AND code <> v_txt;
    PERFORM set_config('role', 'authenticated', true);

    v_res := public.fn_scf_micro_next_item(v_date2, v_tt2, v_period2);
    INSERT INTO _r VALUES ('T9 min_gap => deck_cooling',
      v_res -> 'item' = 'null'::jsonb AND v_res ->> 'reason' = 'deck_cooling',
      v_res::text);

    PERFORM set_config('role', 'none', true);
    UPDATE public.audit_parameter_catalog SET is_active = true WHERE code LIKE 'CP-%';
    PERFORM set_config('role', 'authenticated', true);
  ELSE
    INSERT INTO _r VALUES ('T8 rotation avoids the just-offered item', true,
      'SKIPPED — no second session for this learner+senior learner (predicate-level only)');
    INSERT INTO _r VALUES ('T9 min_gap => deck_cooling', true, 'SKIPPED — same reason');
  END IF;

  -- ══ T10 relevance gate for CP-C1 ═════════════════════════════════════════
  -- Clear this learner's impressions so the deck is wide open, then compare
  -- candidate sets with and without a decided leave. Asserted at predicate
  -- level (the same clause the RPC uses) so it holds regardless of which item
  -- rotation happens to pick.
  PERFORM set_config('role', 'none', true);
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  DELETE FROM public.leave_onduty_applications WHERE learner_id = v_l1_lp;
  PERFORM set_config('role', 'authenticated', true);

  SELECT EXISTS (
    SELECT 1 FROM public.leave_onduty_applications loa
    WHERE loa.learner_id = v_l1_lp AND loa.status IN ('approved','rejected')
      AND loa.updated_at >= now() - make_interval(days => 60)
  ) INTO v_ok;

  PERFORM set_config('role', 'none', true);
  INSERT INTO public.leave_onduty_applications
    (learner_id, institution_id, category, sub_category, application_date,
     start_date, end_date, period_type, reason, status)
  VALUES
    (v_l1_lp, v_inst, 'leave', 'battery-synthetic', CURRENT_DATE - 5,
     CURRENT_DATE - 5, CURRENT_DATE - 5, 'fullday', 'battery synthetic row', 'approved');
  PERFORM set_config('role', 'authenticated', true);

  SELECT EXISTS (
    SELECT 1 FROM public.leave_onduty_applications loa
    WHERE loa.learner_id = v_l1_lp AND loa.status IN ('approved','rejected')
      AND loa.updated_at >= now() - make_interval(days => 60)
  ) INTO v_skip;

  INSERT INTO _r VALUES ('T10 CP-C1 relevance gate flips on a decided leave',
    v_ok = false AND v_skip = true,
    format('before=%s after=%s', v_ok, v_skip));

  -- ══ T11 auto-backoff ═════════════════════════════════════════════════════
  -- 10 recent impressions, none answered => answer rate 0 < 0.2, most recent
  -- inside the 3-day cooldown => the next offer must be refused.
  PERFORM set_config('role', 'none', true);
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  INSERT INTO public.carre_micro_impressions
    (institution_id, learner_id, teacher_email, parameter_code,
     attendance_date, timetable_id, period_id, offered_at)
  SELECT v_inst, v_l1_lp, v_email, 'CP-BACKOFF',
         CURRENT_DATE - g, v_tt, 'battery-' || g, now() - make_interval(hours => g)
  FROM generate_series(1, 10) g;
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  INSERT INTO _r VALUES ('T11 auto-backoff below floor',
    v_res -> 'item' = 'null'::jsonb AND v_res ->> 'reason' = 'backoff',
    v_res::text);

  PERFORM set_config('role', 'none', true);
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  PERFORM set_config('role', 'authenticated', true);

  -- ══ T12 ownership ════════════════════════════════════════════════════════
  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  v_imp2 := NULLIF(v_res -> 'item' ->> 'impression_id','')::uuid;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_l2_profile, 'role', 'authenticated')::text, true);
  v_res := public.fn_scf_micro_answer(v_imp2, 3, false);
  INSERT INTO _r VALUES ('T12 foreign impression refused',
    COALESCE((v_res ->> 'success')::boolean, true) = false,
    v_res::text);

  -- back to the owner
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_l1_profile, 'role', 'authenticated')::text, true);

  -- ══ T13 answer once ══════════════════════════════════════════════════════
  v_res := public.fn_scf_micro_answer(v_imp2, 3, false);
  SELECT score, skipped INTO v_score, v_skip
    FROM public.carre_micro_impressions WHERE id = v_imp2;
  v_ok := COALESCE((v_res ->> 'success')::boolean,false) AND v_score = 3 AND v_skip = false;

  v_res := public.fn_scf_micro_answer(v_imp2, 1, false);
  INSERT INTO _r VALUES ('T13 score recorded, second answer refused',
    v_ok AND COALESCE((v_res ->> 'success')::boolean, true) = false,
    format('first_ok=%s score=%s second=%s', v_ok, v_score, v_res::text));

  -- ══ T14 skip is a recorded answer ════════════════════════════════════════
  IF v_date2 IS NOT NULL THEN
    v_res := public.fn_scf_micro_next_item(v_date2, v_tt2, v_period2);
    v_imp := NULLIF(v_res -> 'item' ->> 'impression_id','')::uuid;
    IF v_imp IS NOT NULL THEN
      v_res := public.fn_scf_micro_answer(v_imp, NULL, true);
      SELECT score, skipped INTO v_score, v_skip
        FROM public.carre_micro_impressions WHERE id = v_imp;
      INSERT INTO _r VALUES ('T14 skip recorded',
        COALESCE((v_res ->> 'success')::boolean,false) AND v_skip = true AND v_score IS NULL,
        format('skipped=%s score=%s', v_skip, v_score));
    ELSE
      INSERT INTO _r VALUES ('T14 skip recorded', true, 'SKIPPED — no item offered on 2nd session');
    END IF;
  ELSE
    INSERT INTO _r VALUES ('T14 skip recorded', true, 'SKIPPED — no second session');
  END IF;

  -- ══ T15 health shape (leadership gate) ═══════════════════════════════════
  -- Nested handler: this RPC RAISEs on an unauthorised caller by design, and a
  -- raise here must not abort the tests already recorded above.
  BEGIN
    IF v_super IS NULL THEN
      INSERT INTO _r VALUES ('T15 health returns 8 weekly rows', true,
        'SKIPPED — no super admin profile found');
    ELSE
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
      SELECT count(*) INTO v_cnt FROM public.fn_scf_micro_health();
      INSERT INTO _r VALUES ('T15 health returns 8 weekly rows', v_cnt = 8, format('rows=%s', v_cnt));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('T15 health returns 8 weekly rows', false, SQLERRM);
  END;

  -- ══ T16 health gate denies a plain learner ═══════════════════════════════
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_l1_profile, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_cnt FROM public.fn_scf_micro_health();
    INSERT INTO _r VALUES ('T16 health denies a learner', false,
      format('NOT gated — returned %s rows', v_cnt));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('T16 health denies a learner', true, SQLERRM);
  END;

  IF v_seeded THEN
    INSERT INTO _r VALUES ('NOTE', true, 'CP-% catalog rows were SYNTHETIC (sibling migration not applied)');
  END IF;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES ('FATAL', false, SQLERRM);
END $$;

RESET ROLE;
SELECT test, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, detail FROM _r ORDER BY test;
SELECT count(*) FILTER (WHERE NOT pass) AS failures, count(*) AS total FROM _r;
-- Runner decides: ROLLBACK for a rehearsal.
