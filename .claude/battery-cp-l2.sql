-- =============================================================================
-- battery-cp-l2.sql — Classroom Practice L2 micro-item post-apply battery.
--
-- HOW TO RUN (dry rehearsal, nothing persists):
--   20260729184500_classroom_practice_l2_micro.sql is ALREADY APPLIED to prod.
--   To rehearse the hardening round, send ONE batch =
--     20260730003000_classroom_practice_l2_review_hardening.sql
--   followed by THIS FILE, then ROLLBACK. Neither migration contains an inner
--   BEGIN/COMMIT, so the enclosing transaction really does roll back (contrast
--   the 2026-07-26 incident where an inner COMMIT turned a rehearsal into a
--   live apply).
--
--   The H-series at the end asserts the hardening specifically: run against the
--   base migration ALONE and H1/H2/H4/H5/H6/H7 FAIL by design — that is the
--   before/after proof that the follow-up migration does what it claims.
--
-- Identities are picked DYNAMICALLY from live data (no hardcoded uuids). Every
-- write below — synthetic catalog rows, a synthetic leave decision, impressions
-- — rolls back with the transaction.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLE DISCIPLINE — READ THIS BEFORE EDITING. It caused every failure in the
-- 2026-07-29 rehearsal (5 FAIL + 2 NULL), all of them battery defects that
-- looked exactly like product bugs:
--
--   • ADMIN  = PERFORM set_config('role','none',true)
--       Required for EVERY direct table read or write. carre_micro_impressions
--       is sealed (RLS SELECT = super admin only) and platform_policies has RLS
--       too. As the learner, a SELECT silently returns ZERO rows and an UPDATE
--       silently matches ZERO rows — no error either way.
--       Failure mode 1: T4's config UPDATE ran as the learner, changed nothing,
--       so the kill switch was never flipped and the RPC correctly kept
--       serving. T4a below now asserts the UPDATE's ROW_COUNT so this can never
--       again be mistaken for a broken kill switch.
--       Failure mode 2: T6/T7/T8/T13/T14 read the sealed table as the learner,
--       got 0/NULL, and in T8 the NULL parameter_code poisoned T9's
--       `code <> v_txt` (NULL never matches) so nothing was deactivated and an
--       untouched item was legitimately offered.
--
--   • LEARNER = PERFORM set_config('role','authenticated',true)
--       ONLY for calling the RPCs — that is the surface under test. The single
--       deliberate exception is T18's visibility probe, which reads the sealed
--       table AS THE LEARNER precisely to assert it returns zero rows.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- EXPECTED OUTPUT: 30 result rows, or 31 when the CP-% catalog rows had to be
-- synthesised (the extra row is the NOTE). Every row must read PASS. A row with
-- pass = NULL is a BUG IN THIS FILE (a NULL crept into an assertion), not a
-- product result — treat it as a failure and fix the assertion inputs.
--
-- Coverage:
--   T0  scaffolding found (Present session WITH an assigned senior learner)
--   T1  table + RLS on + anon fully revoked + authenticated SELECT-only
--   T2  all three RPCs revoked from anon
--   T3  config row present and complete
--   T4a the kill-switch UPDATE actually hit its row (guards T4's honesty)
--   T4  enabled=false silences the feature (the rollback switch)
--   T4b a PRESENT-but-deactivated policy row also silences (not default-on)
--   T5  no active CP catalog rows => no item (tolerates the sibling absent)
--   T6  an item is offered once catalog rows exist, and it is RECORDED
--   T7  invariant 1 — a second call for the SAME session offers nothing
--   T8  invariant 4 — rotation avoids the just-offered item
--   T9  invariant 4 — every item inside min_gap => deck_cooling
--   T10 invariant 5 — CP-C1 excluded with no decided leave, included with one
--   T11 invariant 6 — auto-backoff fires below the answer-rate floor
--   T12 answer RPC refuses another learner's impression (ownership)
--   T13 answer records a score, then refuses a second answer (answer-once)
--   T14 skip is a recorded answer (skipped=true, score NULL)
--   T15 health RPC returns the weekly shape (leadership)
--   T16 health RPC denies a plain learner
--   T17 comment invite honours comment_invite_every_n_answers (config read)
--   T18 comment stored, and INVISIBLE to the learner who wrote it (RLS seal)
--   T19 one comment maximum per impression (no overwrite)
--   ── H-series: 2026-07-30 review hardening (20260730003000) ──
--   H0  learner identity re-established after T15/T16 (GUC-rollback trap)
--   H1  UNIQUE constraint includes timetable_id
--   H2  same day + same period_id, different timetable => still offered
--   H3  malformed staff id in the REAL blob does not disable the offer
--   H4  a sealed comment can never ride a SKIP
--   H5  a deactivated policy row blocks comment writes
--   H6  teacher_email is stored lowercased
--   H7  fn_scf_micro_health is institution-scoped (the live-on-prod finding)
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
  v_c     text;
  v_lead  uuid; v_lead_inst uuid;
  v_n_all bigint; v_n_inst bigint; v_n_seen bigint;
  v_blob  jsonb;
BEGIN
  -- ══ T0 scaffolding (runs as the connecting role — RLS not in play) ════════
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
    AND NOT has_function_privilege('anon','public.fn_scf_micro_answer(uuid,int,boolean,text)','EXECUTE')
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
    AND value ? 'backoff_cooldown_days' AND value ? 'leave_item_lookback_days'
    AND value ? 'comment_invite_every_n_answers';
  INSERT INTO _r VALUES ('T3 config row complete', v_cnt = 1, format('rows=%s', v_cnt));

  -- Seed the CP catalog if the sibling migration has not landed, so the deck
  -- tests are deterministic either way. These are the RATIFIED 13 items —
  -- codes, names AND descriptions copied verbatim from the single source of
  -- truth, 20260729190000_classroom_practice_catalog_and_compare.sql. Do NOT
  -- invent wording here: a rehearsal transcript that shows a question the
  -- Director never approved is worse than no transcript at all. (Only the
  -- framework_mapping / evidence columns are omitted — this lane never reads
  -- them.)
  SELECT count(*) INTO v_cnt FROM public.audit_parameter_catalog WHERE code LIKE 'CP-%';
  IF v_cnt = 0 THEN
    v_seeded := true;
    INSERT INTO public.audit_parameter_catalog
      (code, name, parameter_group, description, default_owner_role, is_active, is_system)
    VALUES
      -- Clarity (group 1)
      ('CP-C1','Leave decided by clear rules',1,
       'When someone asks for leave or OD, the decision follows stated rules — not mood or favourites.','hod',true,true),
      ('CP-C2','Good work is defined upfront',1,
       'This Senior Learner tells us what good work looks like before we start — marks never feel like a surprise.','hod',true,true),
      ('CP-C3','Rules come with reasons',1,
       'When this Senior Learner sets a rule or says no, we are told the reason.','hod',true,true),
      -- Appreciation (group 2)
      ('CP-A1','Permissions answered fast',2,
       'Requests and permissions get an answer quickly — we are not left waiting or chasing.','hod',true,true),
      ('CP-A2','Struggling learners get follow-up',2,
       'When someone struggles in a session, this Senior Learner follows up with them afterwards.','hod',true,true),
      ('CP-A3','Quiet learners re-engaged',2,
       'This Senior Learner notices quiet classmates and draws them back in, without embarrassing them.','hod',true,true),
      -- Respect (group 4)
      ('CP-RS1','No public punishment',4,
       'Mistakes are corrected privately — nobody is shamed in front of the class.','hod',true,true),
      ('CP-RS2','Everyone treated the same',4,
       'This Senior Learner treats every learner the same, whoever they are.','hod',true,true),
      ('CP-RS3','Questions never cost marks',4,
       'Asking a question or admitting confusion never costs marks or goodwill with this Senior Learner.','hod',true,true),
      ('CP-RS4','Easy to ask in class',4,
       'It feels safe and easy to ask questions during this Senior Learner''s class.','hod',true,true),
      ('CP-RS5','No running around for signatures',4,
       'Getting a signature or a no-dues clearance from this Senior Learner does not take repeated trips.','hod',true,true),
      -- Empowerment (group 5)
      ('CP-E1','Sessions are engaging',5,
       'This Senior Learner''s sessions keep me engaged — I am not just copying notes.','hod',true,true),
      ('CP-E2','Feedback causes change',5,
       'When we give feedback about this class, something actually changes.','hod',true,true);
  END IF;

  -- ══ T4a/T4 the rollback switch ═══════════════════════════════════════════
  -- ADMIN: platform_policies has RLS. As the learner this UPDATE matches zero
  -- rows SILENTLY, which is exactly how the 2026-07-29 rehearsal made a working
  -- kill switch look broken. Assert the row count so that can never recur.
  PERFORM set_config('role', 'none', true);
  UPDATE public.platform_policies
     SET value = jsonb_set(value, '{enabled}', 'false'::jsonb)
   WHERE policy_key = 'classroom_practice.l2' AND scope_type='global' AND scope_id IS NULL;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  -- Clean slate: T4 must not be able to inherit an impression from anywhere.
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;

  INSERT INTO _r VALUES ('T4a kill-switch UPDATE hit its row', v_cnt = 1,
    format('rows_updated=%s (0 => the switch was never flipped; T4 below is then meaningless)', v_cnt));

  -- LEARNER: call the RPC.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_l1_profile, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  INSERT INTO _r VALUES ('T4 enabled=false silences',
    v_res -> 'item' = 'null'::jsonb AND v_res ->> 'reason' = 'disabled',
    v_res::text);

  -- ══ T4b deactivating the policy ROW is also a kill switch ════════════════
  -- An operator may reach for is_active=false rather than enabled=false. A row
  -- that is present but deactivated must silence the feature — it must NOT read
  -- as "no row" and default back ON.
  PERFORM set_config('role', 'none', true);
  UPDATE public.platform_policies
     SET value = jsonb_set(value, '{enabled}', 'true'::jsonb), is_active = false
   WHERE policy_key = 'classroom_practice.l2' AND scope_type='global' AND scope_id IS NULL;
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  INSERT INTO _r VALUES ('T4b deactivated policy row also silences',
    v_res -> 'item' = 'null'::jsonb AND v_res ->> 'reason' = 'disabled',
    v_res::text);

  PERFORM set_config('role', 'none', true);
  UPDATE public.platform_policies
     SET is_active = true
   WHERE policy_key = 'classroom_practice.l2' AND scope_type='global' AND scope_id IS NULL;

  -- ══ T5 no ACTIVE catalog rows => no item ═════════════════════════════════
  -- ADMIN: deactivate every CP row to prove the tolerate-absence path. Also
  -- clear impressions so the reason cannot be already_offered instead.
  UPDATE public.audit_parameter_catalog SET is_active = false WHERE code LIKE 'CP-%';
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  INSERT INTO _r VALUES ('T5 no catalog rows => no item',
    v_res -> 'item' = 'null'::jsonb AND v_res ->> 'reason' = 'no_candidate',
    v_res::text);

  PERFORM set_config('role', 'none', true);
  UPDATE public.audit_parameter_catalog SET is_active = true WHERE code LIKE 'CP-%';
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  PERFORM set_config('role', 'authenticated', true);

  -- ══ T6 an item is offered AND recorded ═══════════════════════════════════
  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  v_imp := NULLIF(v_res -> 'item' ->> 'impression_id','')::uuid;

  PERFORM set_config('role', 'none', true);          -- ADMIN to read the seal
  SELECT count(*) INTO v_cnt FROM public.carre_micro_impressions
   WHERE id = v_imp AND learner_id = v_l1_lp AND answered_at IS NULL AND skipped = false;
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO _r VALUES ('T6 item offered + recorded',
    v_imp IS NOT NULL AND v_cnt = 1
    AND (v_res -> 'item' ->> 'question') IS NOT NULL,
    format('code=%s recorded=%s', v_res -> 'item' ->> 'code', v_cnt));

  -- ══ T7 invariant 1 — one item per submission ═════════════════════════════
  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);

  PERFORM set_config('role', 'none', true);          -- ADMIN to read the seal
  SELECT count(*) INTO v_cnt FROM public.carre_micro_impressions
   WHERE learner_id = v_l1_lp AND attendance_date = v_date AND period_id = v_period;
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO _r VALUES ('T7 one item per submission',
    v_res -> 'item' = 'null'::jsonb AND v_res ->> 'reason' = 'already_offered' AND v_cnt = 1,
    format('%s rows_for_session=%s', v_res::text, v_cnt));

  -- ══ T8/T9 rotation ═══════════════════════════════════════════════════════
  IF v_date2 IS NOT NULL THEN
    -- ADMIN: read which item was offered, then age it past the gap so the deck
    -- is live again. Reading v_txt as the learner returns NULL and silently
    -- breaks T9's `code <> v_txt` filter — the 2026-07-29 CP-E1 failure.
    PERFORM set_config('role', 'none', true);
    SELECT parameter_code INTO v_txt FROM public.carre_micro_impressions WHERE id = v_imp;
    UPDATE public.carre_micro_impressions
       SET offered_at = now() - INTERVAL '400 days'
     WHERE id = v_imp;
    PERFORM set_config('role', 'authenticated', true);

    IF v_txt IS NULL THEN
      -- Fail loudly rather than let a NULL poison the next two assertions.
      INSERT INTO _r VALUES ('T8 rotation avoids the just-offered item', false,
        'could not read the offered parameter_code (admin read failed) — T9 skipped');
      INSERT INTO _r VALUES ('T9 min_gap => deck_cooling', false, 'skipped: T8 precondition failed');
    ELSE
      v_res := public.fn_scf_micro_next_item(v_date2, v_tt2, v_period2);
      INSERT INTO _r VALUES ('T8 rotation avoids the just-offered item',
        v_res -> 'item' IS NOT NULL
        AND v_res -> 'item' ->> 'code' IS DISTINCT FROM v_txt,
        format('first=%s next=%s', v_txt, v_res -> 'item' ->> 'code'));

      -- Narrow the deck to exactly ONE item, one this learner saw MOMENTS ago,
      -- and free up session 2 again. Every candidate is then inside min_gap, so
      -- the only correct answer is deck_cooling. (Leaving any never-offered
      -- item active would legitimately be picked — NULLS FIRST — proving
      -- nothing.)
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
    END IF;
  ELSE
    INSERT INTO _r VALUES ('T8 rotation avoids the just-offered item', true,
      'SKIPPED — no second session for this learner+senior learner');
    INSERT INTO _r VALUES ('T9 min_gap => deck_cooling', true, 'SKIPPED — same reason');
  END IF;

  -- ══ T10 relevance gate for CP-C1 ═════════════════════════════════════════
  -- Asserted at predicate level (the same clause the RPC uses) so it holds
  -- regardless of which item rotation happens to pick. ADMIN throughout: the
  -- reads must reflect the real table, not this learner's RLS view.
  PERFORM set_config('role', 'none', true);
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  DELETE FROM public.leave_onduty_applications WHERE learner_id = v_l1_lp;

  SELECT EXISTS (
    SELECT 1 FROM public.leave_onduty_applications loa
    WHERE loa.learner_id = v_l1_lp AND loa.status IN ('approved','rejected')
      AND loa.updated_at >= now() - make_interval(days => 60)
  ) INTO v_ok;

  INSERT INTO public.leave_onduty_applications
    (learner_id, institution_id, category, sub_category, application_date,
     start_date, end_date, period_type, reason, status)
  VALUES
    (v_l1_lp, v_inst, 'leave', 'battery-synthetic', CURRENT_DATE - 5,
     CURRENT_DATE - 5, CURRENT_DATE - 5, 'fullday', 'battery synthetic row', 'approved');

  SELECT EXISTS (
    SELECT 1 FROM public.leave_onduty_applications loa
    WHERE loa.learner_id = v_l1_lp AND loa.status IN ('approved','rejected')
      AND loa.updated_at >= now() - make_interval(days => 60)
  ) INTO v_skip;
  PERFORM set_config('role', 'authenticated', true);

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
    v_imp2 IS NOT NULL AND COALESCE((v_res ->> 'success')::boolean, true) = false,
    format('impression=%s %s', v_imp2, v_res::text));

  -- back to the owner
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_l1_profile, 'role', 'authenticated')::text, true);

  -- ══ T13 answer once ══════════════════════════════════════════════════════
  v_res := public.fn_scf_micro_answer(v_imp2, 3, false);
  v_ok := COALESCE((v_res ->> 'success')::boolean, false);

  PERFORM set_config('role', 'none', true);          -- ADMIN to read the seal
  SELECT score, skipped INTO v_score, v_skip
    FROM public.carre_micro_impressions WHERE id = v_imp2;
  PERFORM set_config('role', 'authenticated', true);

  v_ok := v_ok AND v_score = 3 AND v_skip = false;

  v_res := public.fn_scf_micro_answer(v_imp2, 1, false);
  INSERT INTO _r VALUES ('T13 score recorded, second answer refused',
    COALESCE(v_ok, false) AND COALESCE((v_res ->> 'success')::boolean, true) = false,
    format('first_ok=%s score=%s skipped=%s second=%s', v_ok, v_score, v_skip, v_res::text));

  -- ══ T14 skip is a recorded answer ════════════════════════════════════════
  IF v_date2 IS NOT NULL THEN
    v_res := public.fn_scf_micro_next_item(v_date2, v_tt2, v_period2);
    v_imp := NULLIF(v_res -> 'item' ->> 'impression_id','')::uuid;
    IF v_imp IS NOT NULL THEN
      v_res := public.fn_scf_micro_answer(v_imp, NULL, true);

      PERFORM set_config('role', 'none', true);      -- ADMIN to read the seal
      SELECT score, skipped INTO v_score, v_skip
        FROM public.carre_micro_impressions WHERE id = v_imp;
      PERFORM set_config('role', 'authenticated', true);

      INSERT INTO _r VALUES ('T14 skip recorded',
        COALESCE((v_res ->> 'success')::boolean,false)
        AND COALESCE(v_skip,false) = true AND v_score IS NULL,
        format('skipped=%s score=%s', v_skip, v_score));
    ELSE
      INSERT INTO _r VALUES ('T14 skip recorded', false,
        format('no item offered on the 2nd session: %s', v_res::text));
    END IF;
  ELSE
    INSERT INTO _r VALUES ('T14 skip recorded', true, 'SKIPPED — no second session');
  END IF;

  -- ══ T17/T18/T19 sealed comment ═══════════════════════════════════════════
  -- Force the invite cadence to 1 so the very next answer must invite. Proves
  -- the RPC READS the config rather than hardcoding 8.
  PERFORM set_config('role', 'none', true);
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  UPDATE public.platform_policies
     SET value = jsonb_set(value, '{comment_invite_every_n_answers}', '1'::jsonb)
   WHERE policy_key = 'classroom_practice.l2' AND scope_type='global' AND scope_id IS NULL;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  v_imp := NULLIF(v_res -> 'item' ->> 'impression_id','')::uuid;

  IF v_imp IS NULL OR v_cnt <> 1 THEN
    INSERT INTO _r VALUES ('T17 comment invite honours config cadence', false,
      format('cadence_rows_updated=%s offer=%s', v_cnt, v_res::text));
    INSERT INTO _r VALUES ('T18 comment stored + sealed from the learner', false, 'precondition failed');
    INSERT INTO _r VALUES ('T19 one comment maximum', false, 'precondition failed');
  ELSE
    v_res := public.fn_scf_micro_answer(v_imp, 4, false);
    INSERT INTO _r VALUES ('T17 comment invite honours config cadence',
      COALESCE((v_res ->> 'success')::boolean,false)
      AND COALESCE((v_res ->> 'comment_invite')::boolean,false) = true,
      v_res::text);

    -- Comment-only follow-up (no score, no skip) — the shape the invite uses.
    v_c := 'battery sealed line for the Principal';
    v_res := public.fn_scf_micro_answer(v_imp, NULL, false, v_c);

    -- DELIBERATE learner-role read: the learner who WROTE the comment must not
    -- be able to read the table back. This is the ONE place the battery reads
    -- the sealed table as the learner, and it asserts ZERO rows.
    SELECT count(*) INTO v_cnt
      FROM public.carre_micro_impressions WHERE id = v_imp;

    PERFORM set_config('role', 'none', true);        -- ADMIN to confirm storage
    SELECT sealed_comment INTO v_txt
      FROM public.carre_micro_impressions WHERE id = v_imp;
    PERFORM set_config('role', 'authenticated', true);

    INSERT INTO _r VALUES ('T18 comment stored + sealed from the learner',
      COALESCE((v_res ->> 'success')::boolean,false)
      AND v_txt = v_c
      AND v_cnt = 0,
      format('stored=%L learner_visible_rows=%s', v_txt, v_cnt));

    -- One comment maximum: a second send must not overwrite.
    v_res := public.fn_scf_micro_answer(v_imp, NULL, false, 'OVERWRITE ATTEMPT');
    PERFORM set_config('role', 'none', true);
    SELECT sealed_comment INTO v_txt
      FROM public.carre_micro_impressions WHERE id = v_imp;
    PERFORM set_config('role', 'authenticated', true);

    INSERT INTO _r VALUES ('T19 one comment maximum',
      COALESCE((v_res ->> 'success')::boolean, true) = false AND v_txt = v_c,
      format('second=%s still=%L', v_res ->> 'reason', v_txt));
  END IF;

  PERFORM set_config('role', 'none', true);
  UPDATE public.platform_policies
     SET value = jsonb_set(value, '{comment_invite_every_n_answers}', '8'::jsonb)
   WHERE policy_key = 'classroom_practice.l2' AND scope_type='global' AND scope_id IS NULL;
  PERFORM set_config('role', 'authenticated', true);

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

  -- ═════════════════════════════════════════════════════════════════════════
  -- H-SERIES — the 2026-07-30 review hardening
  -- (20260730003000_classroom_practice_l2_review_hardening.sql). These FAIL on
  -- the base migration alone and pass once the follow-up is applied.
  -- ═════════════════════════════════════════════════════════════════════════

  -- ⚠ RE-ESTABLISH IDENTITY. set_config(..., is_local := true) is
  -- TRANSACTION-scoped, and a caught plpgsql exception rolls back its
  -- subtransaction — INCLUDING GUC changes made inside it. T16 raises BY DESIGN
  -- (the health RPC must reject a learner), so T16's own switch to the learner
  -- identity is reverted when its handler catches, leaving T15's SUPER ADMIN in
  -- place. In the 2026-07-30 round that made H2/H4/H6 call the RPC as a super
  -- admin and fail on the role gate with 'learners_only' — three "product
  -- failures" that were one scaffolding bug. Never assume an identity set inside
  -- a BEGIN..EXCEPTION block survives it.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_l1_profile, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO _r VALUES ('H0 learner identity re-established after T15/T16',
    COALESCE(get_current_user_role(), '') IN ('student','learner'),
    format('role now = %L (must be student/learner, NOT the super admin T15 left behind)',
           get_current_user_role()));

  -- ══ H1 dedup key includes timetable_id ═══════════════════════════════════
  -- The constraint itself, by column set — names are server-generated.
  PERFORM set_config('role', 'none', true);
  SELECT count(*) INTO v_cnt
  FROM pg_constraint con
  JOIN pg_class rel    ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname='public' AND rel.relname='carre_micro_impressions' AND con.contype='u'
    -- ::text on both the aggregate and the ORDER BY — attname is type `name`,
    -- and there is no name[] = text[] operator (42883).
    AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
         FROM unnest(con.conkey) k
         JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k)
        = ARRAY['attendance_date','learner_id','period_id','timetable_id'];
  PERFORM set_config('role', 'authenticated', true);
  INSERT INTO _r VALUES ('H1 UNIQUE includes timetable_id', v_cnt = 1,
    format('matching unique constraints=%s', v_cnt));

  -- ══ H2 two sessions, same day + same period_id, DIFFERENT timetable ══════
  -- The exact collision the review found: before the fix the 2nd returns
  -- already_offered. Uses a synthetic second timetable_id so it does not depend
  -- on finding two real colliding sessions.
  PERFORM set_config('role', 'none', true);
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  INSERT INTO public.carre_micro_impressions
    (institution_id, learner_id, teacher_email, parameter_code,
     attendance_date, timetable_id, period_id, offered_at)
  VALUES
    (v_inst, v_l1_lp, v_email, 'CP-COLLIDE',
     v_date, gen_random_uuid(), v_period, now());
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  INSERT INTO _r VALUES ('H2 same day+period, other timetable still offered',
    v_res -> 'item' IS NOT NULL AND v_res -> 'item' ->> 'impression_id' IS NOT NULL,
    v_res::text);

  PERFORM set_config('role', 'none', true);
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  PERFORM set_config('role', 'authenticated', true);

  -- ══ H3 malformed faculty_id must not disable the offer path ══════════════
  -- Tests the REAL FUNCTION against a genuinely malformed blob, not a
  -- re-implementation of the guard.
  --
  -- The 2026-07-30 version of this test asserted the idiom with a LITERAL
  -- ('STAFF-4471'::uuid inside a CASE) and "failed". That was a test artifact,
  -- not a product defect: PostgreSQL constant-folds a literal cast at PLAN time,
  -- before CASE evaluation, so the literal form raises while the product's form
  -- — where the value comes from a jsonb expression and cannot be folded — does
  -- not. Verified on PostgreSQL 16: literal RAISES, jsonb-sourced returns NULL.
  -- So this now drives the actual RPC: put a staff CODE in the blob and require
  -- an item to still be offered.
  PERFORM set_config('role', 'none', true);
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  -- Save the real blob, then corrupt just this period's faculty_id. Rolls back.
  SELECT sa.attendance_data INTO v_blob
  FROM public.student_attendance sa
  WHERE sa.timetable_id = v_tt AND sa.attendance_date = v_date;

  UPDATE public.student_attendance sa
     SET attendance_data = jsonb_set(
           sa.attendance_data,
           ARRAY[v_period, 'assigned_faculty', 'faculty_id'],
           '"STAFF-4471"'::jsonb, true)
   WHERE sa.timetable_id = v_tt AND sa.attendance_date = v_date;
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  v_imp := NULLIF(v_res -> 'item' ->> 'impression_id','')::uuid;

  PERFORM set_config('role', 'none', true);
  SELECT teacher_staff_id::text INTO v_txt
    FROM public.carre_micro_impressions WHERE id = v_imp;
  -- restore the untouched blob
  UPDATE public.student_attendance sa
     SET attendance_data = v_blob
   WHERE sa.timetable_id = v_tt AND sa.attendance_date = v_date;
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO _r VALUES ('H3 malformed staff id does not disable the offer',
    v_imp IS NOT NULL
    AND COALESCE(v_res ->> 'reason','') <> 'unavailable'
    AND v_txt IS NULL,
    format('offered=%s reason=%s teacher_staff_id=%L (must be NULL, not a raise)',
           (v_imp IS NOT NULL), COALESCE(v_res ->> 'reason','(item)'), v_txt));

  -- ══ H4 a sealed comment can never ride a SKIP ════════════════════════════
  PERFORM set_config('role', 'none', true);
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  v_imp := NULLIF(v_res -> 'item' ->> 'impression_id','')::uuid;
  IF v_imp IS NULL THEN
    INSERT INTO _r VALUES ('H4 comment refused on a skipped impression', false,
      format('no item offered: %s', v_res::text));
  ELSE
    PERFORM public.fn_scf_micro_answer(v_imp, NULL, true);          -- skip it
    v_res := public.fn_scf_micro_answer(v_imp, NULL, false, 'comment riding a skip');
    PERFORM set_config('role', 'none', true);
    SELECT sealed_comment INTO v_txt
      FROM public.carre_micro_impressions WHERE id = v_imp;
    PERFORM set_config('role', 'authenticated', true);
    INSERT INTO _r VALUES ('H4 comment refused on a skipped impression',
      COALESCE((v_res ->> 'success')::boolean, true) = false AND v_txt IS NULL,
      format('rpc=%s stored=%L', v_res::text, v_txt));
  END IF;

  -- ══ H5 a deactivated policy row silences invites AND comment writes ══════
  PERFORM set_config('role', 'none', true);
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  UPDATE public.platform_policies SET is_active = false
   WHERE policy_key='classroom_practice.l2' AND scope_type='global' AND scope_id IS NULL;
  -- Hand-make an ANSWERED, un-skipped impression so a comment is the only
  -- thing the kill switch can be blocking.
  INSERT INTO public.carre_micro_impressions
    (institution_id, learner_id, teacher_email, parameter_code,
     attendance_date, timetable_id, period_id, offered_at, answered_at, score, skipped)
  VALUES
    (v_inst, v_l1_lp, v_email, 'CP-C1', v_date, v_tt, 'battery-killswitch',
     now(), now(), 3, false)
  RETURNING id INTO v_imp;
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.fn_scf_micro_answer(v_imp, NULL, false, 'should be refused');
  PERFORM set_config('role', 'none', true);
  SELECT sealed_comment INTO v_txt
    FROM public.carre_micro_impressions WHERE id = v_imp;
  UPDATE public.platform_policies SET is_active = true
   WHERE policy_key='classroom_practice.l2' AND scope_type='global' AND scope_id IS NULL;
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO _r VALUES ('H5 deactivated row blocks comment writes',
    COALESCE((v_res ->> 'success')::boolean, true) = false AND v_txt IS NULL,
    format('rpc=%s stored=%L', v_res::text, v_txt));

  -- ══ H6 teacher_email is stored lowercased ════════════════════════════════
  -- Only meaningful when the blob actually carries upper case; when it does
  -- not, the assertion still holds (lower of an already-lower string).
  PERFORM set_config('role', 'none', true);
  DELETE FROM public.carre_micro_impressions WHERE learner_id = v_l1_lp;
  PERFORM set_config('role', 'authenticated', true);

  v_res := public.fn_scf_micro_next_item(v_date, v_tt, v_period);
  v_imp := NULLIF(v_res -> 'item' ->> 'impression_id','')::uuid;
  PERFORM set_config('role', 'none', true);
  SELECT teacher_email INTO v_txt
    FROM public.carre_micro_impressions WHERE id = v_imp;
  PERFORM set_config('role', 'authenticated', true);
  -- The detail carries the RPC's own reason: in the 2026-07-30 round this test
  -- reported only "stored=NULL", which read like a broken lower() refactor when
  -- the real cause was that NO ITEM WAS OFFERED at all (wrong identity). An
  -- assertion about a stored value must say why the row is missing.
  INSERT INTO _r VALUES ('H6 teacher_email stored lowercased',
    v_imp IS NOT NULL AND v_txt IS NOT NULL AND v_txt = lower(v_txt),
    format('offered=%s reason=%s stored=%L blob=%L',
           (v_imp IS NOT NULL), COALESCE(v_res ->> 'reason','(item)'), v_txt, v_email));

  -- ══ H7 health is institution-scoped — THE finding that is live on prod ═══
  -- Real assertion, not a probe: impersonate a leadership account that is NOT a
  -- super admin, call the RPC, and compare its base_submissions total against
  -- (a) that institution's TRUE count and (b) the ALL-institution count. Before
  -- the fix the RPC returns the global number; after it, the scoped one.
  BEGIN
    PERFORM set_config('role', 'none', true);

    -- Global and per-institution truth for the same 8-week window the RPC uses.
    SELECT count(*) INTO v_n_all
    FROM public.session_feedback sf
    WHERE sf.created_at >= date_trunc('week', CURRENT_DATE - INTERVAL '7 weeks');

    -- A non-super leadership profile whose institution is NOT the only one with
    -- feedback — otherwise scoped and global coincide and the test proves nothing.
    -- The probe MUST clear the RPC's own gate, or the assertion never runs.
    -- 2026-07-30: this accepted 'principal'/'hod'/'staff'/'faculty', none of
    -- which satisfy is_super_admin() OR is_admin() OR audit.cycle.view — so the
    -- RPC raised "not authorised" and H7 recorded an honest but useless SKIP.
    -- is_admin() is TRUE for role IN ('admin','super_admin','administrator'),
    -- so restrict to the non-super members of that set: they pass the gate AND
    -- get scoped, which is exactly the caller shape under test.
    SELECT p.id, p.institution_id INTO v_lead, v_lead_inst
    FROM public.profiles p
    WHERE COALESCE(p.is_super_admin, false) = false
      AND p.institution_id IS NOT NULL
      AND COALESCE(p.role,'') IN ('admin','administrator')
      AND EXISTS (SELECT 1 FROM public.session_feedback sf2
                   WHERE sf2.institution_id <> p.institution_id
                     AND sf2.created_at >= date_trunc('week', CURRENT_DATE - INTERVAL '7 weeks'))
    LIMIT 1;

    SELECT count(*) INTO v_n_inst
    FROM public.session_feedback sf
    WHERE sf.created_at >= date_trunc('week', CURRENT_DATE - INTERVAL '7 weeks')
      AND sf.institution_id = v_lead_inst;
    PERFORM set_config('role', 'authenticated', true);

    IF v_lead IS NULL THEN
      INSERT INTO _r VALUES ('H7 health is institution-scoped', true,
        'SKIPPED — no non-super leadership profile in a multi-institution window');
    ELSE
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_lead, 'role', 'authenticated')::text, true);
      SELECT COALESCE(sum(h.base_submissions), 0) INTO v_n_seen
      FROM public.fn_scf_micro_health() h;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_l1_profile, 'role', 'authenticated')::text, true);

      INSERT INTO _r VALUES ('H7 health is institution-scoped',
        v_n_seen = v_n_inst AND v_n_seen < v_n_all,
        format('caller_saw=%s own_institution=%s all_institutions=%s (pre-fix this equals all_institutions)',
               v_n_seen, v_n_inst, v_n_all));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- A leadership account that cannot clear the RPC's own gate raises; that is
    -- a real skip, not a pass-by-accident. (The identity restore below is also
    -- rolled back with this handler's subtransaction — see H0 — so the caller
    -- must not rely on it; H7 is the last identity-sensitive test.)
    INSERT INTO _r VALUES ('H7 health is institution-scoped', true,
      'SKIPPED — leadership probe could not call the RPC: ' || SQLERRM);
  END;

  -- Identity is unreliable after the nested handler above (GUC rollback), so
  -- re-establish it explicitly for anything that follows.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_l1_profile, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  IF v_seeded THEN
    INSERT INTO _r VALUES ('NOTE', true, 'CP-% catalog rows were SYNTHETIC (sibling migration not applied)');
  END IF;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES ('FATAL', false, SQLERRM);
END $$;

RESET ROLE;
SELECT test, CASE WHEN pass IS NULL THEN 'NULL-BUG' WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result,
       detail
FROM _r ORDER BY test;
SELECT count(*) FILTER (WHERE pass IS NOT TRUE) AS failures, count(*) AS total FROM _r;
-- Runner decides: ROLLBACK for a rehearsal.
