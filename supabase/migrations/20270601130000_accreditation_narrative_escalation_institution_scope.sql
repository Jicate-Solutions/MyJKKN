-- RE-ARMED 2026-09-30 (W12 desk rescue sweep, worktree wf_5851a612-9cd-1): this
-- file was written on 13 Aug as 20260829010000 but never reached main, so the
-- live reminder still escalates to super admins only. Re-numbered past the
-- ledger and every open PR; content unchanged.
-- Re-checked 30 Sep against the LIVE catalog: fn_accreditation_narrative_reminders
-- is still byte-identical (whitespace aside) to the body in 20260816040000, the
-- body this file was built on. 20260830010000 (the ceo / managing_director grant)
-- IS applied, so the containment below is now overdue rather than pre-emptive.
--
-- ─── Stop chasing people about other colleges' NAAC narratives ───────────────
-- 2026-08-13 — Director decision R2, taken 2026-08-13.
--
-- ⚠ NOT APPLIED TO ANY DATABASE. Director-gated apply, by hand.
--
-- Ordered BEFORE 20260830010000 (the ceo/managing_director grant) deliberately:
-- the fan-out must already be correct at the moment anybody new receives the
-- key, not one migration later.
--
-- ══ WHAT IS ACTUALLY ON PRODUCTION RIGHT NOW ═════════════════════════════════
--
-- Read from the live catalog on 2026-08-13, NOT from the repo:
--
--   fn_accreditation_narrative_reminders escalates to SUPER ADMINS ONLY:
--       FROM created2 c JOIN public.profiles p ON true WHERE p.is_super_admin
--   and labels the row targeting = {"type":"role","roles":["super_admin"]}.
--
-- The repo says otherwise, and the repo is wrong. Migration 20260727130000
-- ("widen escalation from super-admin to IQAC") is NOT in
-- supabase_migrations.schema_migrations and its permission-based fan is NOT in
-- the live body. Worse, it could not survive even if it were applied: the LATER
-- 20260816040000 (which IS in the ledger, and added the 36h expires_at) carries
-- a copy of the function built from the PRE-widening body, so applying the repo
-- in version order lands on super-admin-only regardless. The widening was
-- silently reverted by a sibling migration that copied a stale body.
--
-- This file is therefore built on the LIVE body — expires_at included — and not
-- on 20260727130000. Copying the repo's version here would have deleted the
-- notification expiry that is currently in production.
--
-- ══ WHAT WAS WRONG WITH THE INTENDED BEHAVIOUR ═══════════════════════════════
--
-- The escalation is supposed to reach holders of
-- accreditation.naac.narrative.manage. That key is a WRITE permission whose RLS
-- (accred_metric_owners_manage) contains `AND role_has_institution_access(...)`,
-- so it is institution-contained on the write side. The reminder is SECURITY
-- DEFINER and had no institution predicate at all, so the delivery side was
-- cluster-wide for everybody. Governing what somebody may WRITE is not the same
-- as governing what they are TOLD ABOUT, and only the first was contained.
--
-- ══ THE RULE THIS FILE IMPLEMENTS (Director R2) ══════════════════════════════
--
--   * a holder whose role is institution_scope = 'all' is chased CLUSTER-WIDE.
--     That is the job: ceo, managing_director, accreditation_officer, registrar,
--     coo. Read live 2026-08-13, custom_roles.institution_scope holds exactly
--     two values, 'all' and 'own', with no NULLs.
--
--   * a holder whose role is institution_scope = 'own' (principal, hod,
--     vice_principal) is chased ONLY about narratives belonging to their own
--     institution — profiles.institution_id.
--
--   * a holder who has the key via a DIRECTOR HANDOVER is chased only inside the
--     tenant the handover was made in. This file matches that on
--     profiles.institution_id, which is EXACTLY director_handovers.institution_id
--     for any handover that grants: fn_handover_grants_key already requires
--         AND dh.institution_id IS NOT DISTINCT FROM p.institution_id
--     so whenever the handover is granting at all, the two are equal by
--     construction. role_has_institution_access() is deliberately NOT used —
--     it answers "may the CALLER see this institution", is evaluated for
--     auth.uid() (there is no auth.uid() inside a cron), and returns true for
--     every institution when the caller holds an 'all' role. That is a
--     different question from "which tenant was this grant made in".
--
--   * SUPER ADMINS stay cluster-wide. They are the entire live audience today,
--     and narrowing them would be a silent removal nobody asked for.
--
-- Nobody else is widened or narrowed. Measured live, `user_has_permission`'s
-- super-admin bypass (is_super_admin = true OR role = 'super_admin') and the
-- live fan's predicate (is_super_admin = true) select the SAME people today:
-- profiles with role = 'super_admin' but the flag not true number 0, so moving
-- to user_has_permission() adds nobody by accident.
--
-- ══ THE NUDGE BRANCH IS DELIBERATELY UNTOUCHED ═══════════════════════════════
--
-- Branch 1 nudges accreditation_metric_narratives.owner_user_id — one named
-- person, who is the owner OF THAT NARRATIVE. It is already incapable of
-- chasing anyone about another college's work, so per the decision it is left
-- exactly as it is. Not one character of branch 1 changes here.
--
-- ══ A SECOND DEFECT FOUND WHILE MEASURING, AND FIXED HERE BECAUSE THE FIRST ══
-- ══ FIX IS INERT WITHOUT IT ══════════════════════════════════════════════════
--
-- The escalation labelled itself targeting = {"type":"role","roles":[...]}.
-- RLS on public.notifications is:
--
--     notifications_select_own        USING fn_notification_is_for_user(targeting, auth.uid())
--     notifications_select_super_admin USING is_super_admin()
--
-- and fn_notification_is_for_user is, verbatim from the catalog:
--
--     (p_targeting->>'user_id')::uuid = p_user_id
--     OR (p_targeting->'user_ids' ? p_user_id::text)
--     OR p_targeting->>'broadcast' = 'true'
--
-- It matches user_id / user_ids / broadcast and NOTHING ELSE. A "role" label —
-- and equally the "permission" label 20260727130000 wanted to use — matches no
-- arm. So a non-super-admin recipient would get a user_notifications row whose
-- PARENT notification they cannot read, and the read path
-- (lib/services/notification/notification-service.ts) embeds the parent with
-- `notifications!inner(...)`, so an unreadable parent DROPS the row from the
-- list AND from the unread badge. Today that is invisible because the only
-- recipients are super admins, who pass on the second policy.
--
-- Widening delivery without fixing the label would therefore have shipped
-- notifications that are written, counted as "escalated", and never seen. The
-- targeting is now {"type":"user","user_ids":[...]} — the same shape branch 1
-- already uses and the shape fn_notification_is_for_user actually honours —
-- carrying the resolved recipients for THAT narrative. Super admins keep both
-- routes to the row.
--
-- ══ MEASURED READ-ONLY ON PRODUCTION, 2026-08-13 ═════════════════════════════
--
--   85 narratives exist; 19 are escalatable RIGHT NOW (status in the four
--   escalatable states AND updated_at older than 7 days), across 7 institutions.
--   The often-quoted "85" is the count ignoring the age filter.
--
--   holders of the manage key today, via user_has_permission(), = 15:
--     13 super admins            → cluster-wide
--      1 accreditation_officer   → institution_scope 'all' → cluster-wide
--      1 director handover (eao@jkkn.ac.in, accepted 2026-08-11, full,
--        route /accreditation/manage/owners) → tenant-scoped
--
--   user_notifications rows for those 19 narratives:
--     live today (super admins only)            247
--     with this file, today's holders           266
--     with this file + 20260830010000's grant   323
--     unfixed permission fan, today's holders   285   (eao chased about all 19)
--     unfixed permission fan, after the grant   342
--
--   So today the fix removes exactly eao@jkkn.ac.in's 19 cross-college chases:
--   0 of the 19 escalatable narratives belong to their institution.
--
--   The size of what it prevents is better seen in the shape the Director
--   declined: had `principal` been granted the key (13 principals, scope 'own'),
--   the unfixed fan would write 589 rows against these same 19 narratives and
--   the fixed one writes 354 — 235 chases about other colleges, prevented.
--
-- ══ DELIBERATELY NOT CHANGED ═════════════════════════════════════════════════
--
--   * Deactivated holders. One current holder has is_active = false and is
--     chased today; this file keeps chasing them. Filtering them is a narrowing
--     nobody asked for and belongs in its own decision. Recorded, not done.
--   * p_nudge_days / p_escalate_days defaults, the idempotency keys, the 36h
--     expires_at, the notification copy, the signature, and the grants.
--
-- No BEGIN/COMMIT in this file, so a reviewer's BEGIN … ROLLBACK rehearsal
-- against production actually rolls back.

CREATE OR REPLACE FUNCTION public.fn_accreditation_narrative_reminders(
  p_nudge_days int DEFAULT 3, p_escalate_days int DEFAULT 7
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_sys uuid;
  v_today text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD');
  v_nudged int := 0;
  v_escalated int := 0;
BEGIN
  SELECT id INTO v_sys FROM public.profiles WHERE is_super_admin = true ORDER BY created_at NULLS LAST LIMIT 1;
  IF v_sys IS NULL THEN RAISE EXCEPTION 'no system identity for notifications.created_by'; END IF;

  -- 1) NUDGE the owner of an actionable draft stuck > p_nudge_days -------------
  --    UNCHANGED. Targets that narrative's own owner_user_id, so it cannot
  --    reach across colleges by construction.
  WITH stuck AS (
    SELECT n.id, n.owner_user_id AS uid, n.metric_code,
           'accred_narr_nudge:'||n.id::text||':'||v_today AS ik
    FROM public.accreditation_metric_narratives n
    WHERE n.owner_user_id IS NOT NULL
      AND ( (n.status = 'ai_drafted' AND n.grounding_verdict = 'grounded')
            OR n.status = 'revision_requested' )
      AND n.updated_at < now() - make_interval(days => GREATEST(0, p_nudge_days))
  ),
  created AS (
    INSERT INTO public.notifications
      -- 2026-08-09 expiry: expires_at added; 36h = 1.5x the daily re-emit cycle.
      (id, title, body, url, icon, priority, category, kind, idempotency_key, targeting, created_by, created_at, updated_at, expires_at)
    SELECT gen_random_uuid(),
      'NAAC narrative awaiting your review',
      'An AI-drafted NAAC narrative for metric '||s.metric_code||' is waiting for you to review and okay it.',
      '/accreditation/naac/narratives/'||s.id::text, 'FileText', 'normal', 'accreditation', 'work_item',
      s.ik, jsonb_build_object('type','user','user_ids', jsonb_build_array(s.uid)), v_sys, now(), now(),
      now() + interval '36 hours'
    FROM stuck s
    WHERE NOT EXISTS (SELECT 1 FROM public.notifications x WHERE x.idempotency_key = s.ik)
    RETURNING id, (targeting->'user_ids'->>0)::uuid AS uid
  ),
  fan AS (
    INSERT INTO public.user_notifications (id, notification_id, user_id, created_at)
    SELECT gen_random_uuid(), c.id, c.uid, now() FROM created c
    RETURNING 1
  )
  SELECT count(*) INTO v_nudged FROM fan;

  -- 2) ESCALATE a draft stuck > p_escalate_days, TO THE RIGHT PEOPLE ONLY ------
  --
  --    elig classifies every holder of the manage key into "chased everywhere"
  --    vs "chased inside one institution". Membership itself comes from
  --    user_has_permission(), so all four of its paths count — super-admin
  --    bypass, multi-role, legacy profiles.role, and the director handover.
  --    MATERIALIZED because it is joined per narrative and the permission call
  --    is a plpgsql function over the whole profiles table.
  WITH elig AS MATERIALIZED (
    SELECT p.id, p.institution_id,
           (
             -- the oversight backstop: unchanged from the live behaviour
             p.is_super_admin = true
             OR p.role = 'super_admin'
             -- the key arrives through a role that is scoped to the whole cluster
             OR EXISTS (
                  SELECT 1
                    FROM public.user_roles ur
                    JOIN public.custom_roles cr ON cr.id = ur.role_id
                   WHERE ur.user_id = p.id
                     AND (cr.permissions ->> 'accreditation.naac.narrative.manage')::boolean = true
                     AND cr.institution_scope = 'all'
                )
             OR EXISTS (
                  SELECT 1
                    FROM public.custom_roles cr
                   WHERE cr.role_key = p.role
                     AND (cr.permissions ->> 'accreditation.naac.narrative.manage')::boolean = true
                     AND cr.institution_scope = 'all'
                )
           ) AS cluster_wide
      FROM public.profiles p
     WHERE public.user_has_permission(p.id, 'accreditation.naac.narrative.manage')
  ),
  stuck2 AS (
    SELECT n.id, n.institution_id, n.metric_code,
           'accred_narr_esc:'||n.id::text||':'||v_today AS ik
    FROM public.accreditation_metric_narratives n
    WHERE n.status IN ('ai_drafted','owner_okayed','principal_approved','revision_requested')
      AND ( n.status <> 'ai_drafted' OR n.grounding_verdict = 'grounded' )
      AND n.updated_at < now() - make_interval(days => GREATEST(1, p_escalate_days))
  ),
  -- THE PREDICATE. Anything scoped is matched on the narrative's own
  -- institution; only 'all'-scoped roles and super admins escape it. Note this
  -- is an inner join, so a narrative that resolves to nobody produces no
  -- notification at all rather than an unaddressed one.
  aud AS (
    SELECT s.id AS narrative_id, s.metric_code, s.ik, e.id AS uid
      FROM stuck2 s
      JOIN elig e
        ON (e.cluster_wide OR e.institution_id = s.institution_id)
  ),
  aud_agg AS (
    SELECT a.narrative_id, a.metric_code, a.ik,
           jsonb_agg(DISTINCT a.uid::text) AS user_ids
      FROM aud a
     GROUP BY a.narrative_id, a.metric_code, a.ik
  ),
  created2 AS (
    INSERT INTO public.notifications
      -- 2026-08-09 expiry: expires_at added; 36h = 1.5x the daily re-emit cycle.
      (id, title, body, url, icon, priority, category, kind, idempotency_key, targeting, created_by, created_at, updated_at, expires_at)
    SELECT gen_random_uuid(),
      'Overdue NAAC narrative needs attention',
      'A NAAC narrative for metric '||g.metric_code||' has been waiting more than '||p_escalate_days||' days for review.',
      '/accreditation/naac/narratives/'||g.narrative_id::text, 'AlertTriangle', 'high', 'accreditation', 'work_item',
      g.ik,
      -- "user_ids", not "role"/"permission": the ONLY shapes
      -- fn_notification_is_for_user honours are user_id / user_ids / broadcast,
      -- and notifications RLS is that function. A label the filter does not
      -- recognise makes the row unreadable to every non-super-admin recipient,
      -- and the read path embeds the parent with an inner join.
      jsonb_build_object('type','user','user_ids', g.user_ids),
      v_sys, now(), now(),
      now() + interval '36 hours'
    FROM aud_agg g
    WHERE NOT EXISTS (SELECT 1 FROM public.notifications x WHERE x.idempotency_key = g.ik)
    RETURNING id, idempotency_key
  ),
  fan2 AS (
    INSERT INTO public.user_notifications (id, notification_id, user_id, created_at)
    SELECT gen_random_uuid(), c.id, a.uid, now()
      FROM created2 c
      JOIN aud a ON a.ik = c.idempotency_key
    RETURNING 1
  )
  SELECT count(*) INTO v_escalated FROM fan2;

  RETURN jsonb_build_object('nudged', v_nudged, 'escalated', v_escalated);
END; $$;

-- Cron-only generator; anon/authenticated explicitly locked out. Re-asserted
-- after CREATE OR REPLACE to match the live ACL read on 2026-08-13
-- (postgres=X, service_role=X — anon, authenticated and PUBLIC hold nothing).
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_narrative_reminders(int,int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_narrative_reminders(int,int) TO service_role;

-- ══ GUARD — RAISE EXCEPTION, never RAISE NOTICE ══════════════════════════════
--
-- A NOTICE-only guard stamps zero rows, reads as a clean apply, and Studio hides
-- it entirely. Every check below aborts the migration.
--
-- The guard tests the three ways this change can be silently useless:
--   3a the replace did not land, or landed with the wrong properties
--   3b a dependency the new predicate needs does not exist, so the predicate
--      could never have been evaluated
--   3c the body still carries the OLD unscoped fan — which is exactly how
--      20260727130000 died, reverted by a later sibling that copied a stale
--      body. This is the check that would have caught that.
--
-- 🪤 3c reads pg_proc.prosrc, which KEEPS COMMENTS — a naive probe would match
--    the very paragraph above explaining what it removed. Comments are stripped
--    before matching, and the strip was negative-controlled read-only against
--    production before this file was written:
--      live body, raw                                   → probe fires  (true)
--      live body, comments stripped                     → probe fires  (true)
--      a body whose only occurrence is inside a comment → probe clears (false)
--      code occurrence alongside a comment occurrence   → probe fires  (true)
--    So it neither matches its own documentation nor misses real code, and it
--    demonstrably fires on the state production is in today, which is what
--    makes it non-vacuous rather than decorative.

DO $$
DECLARE
  v_src        text;
  v_secdef     boolean;
  v_cfg        text[];
  v_missing    text[] := ARRAY[]::text[];
  v_holders    int;
  v_cluster    int;
  v_scoped     int;
BEGIN
  -- 3a. the function exists exactly once with the expected shape
  SELECT p.prosrc, p.prosecdef, p.proconfig
    INTO v_src, v_secdef, v_cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_accreditation_narrative_reminders'
     AND pg_get_function_identity_arguments(p.oid) = 'p_nudge_days integer, p_escalate_days integer';

  IF v_src IS NULL THEN
    RAISE EXCEPTION
      'narrative escalation scope FAILED — fn_accreditation_narrative_reminders(int,int) is absent after CREATE OR REPLACE';
  END IF;

  IF v_secdef IS DISTINCT FROM true THEN
    v_missing := v_missing || 'function is not SECURITY DEFINER'::text;
  END IF;

  IF v_cfg IS NULL OR NOT ('search_path=public' = ANY (v_cfg)) THEN
    v_missing := v_missing || 'function lost SET search_path=public'::text;
  END IF;

  -- 3b. every dependency the new predicate reads must exist. If any of these
  --     were absent the predicate could not be evaluated at all, and the daily
  --     cron would fail at run time rather than here.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='custom_roles' AND column_name='institution_scope'
  ) THEN
    v_missing := v_missing || 'custom_roles.institution_scope is missing'::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='profiles' AND column_name='institution_id'
  ) THEN
    v_missing := v_missing || 'profiles.institution_id is missing'::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='accreditation_metric_narratives'
       AND column_name='institution_id'
  ) THEN
    v_missing := v_missing || 'accreditation_metric_narratives.institution_id is missing'::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='fn_handover_grants_key'
  ) THEN
    v_missing := v_missing || 'fn_handover_grants_key is missing (handover holders would be unreachable)'::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='user_has_permission'
       AND pg_get_function_identity_arguments(p.oid) = 'user_id uuid, permission_key text'
  ) THEN
    v_missing := v_missing || 'user_has_permission(uuid,text) is missing'::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='fn_notification_is_for_user'
  ) THEN
    v_missing := v_missing || 'fn_notification_is_for_user is missing (targeting shape unverifiable)'::text;
  END IF;

  -- 3c. the unscoped fan must be GONE from the code, comments stripped first
  IF position('CROSS JOIN' IN regexp_replace(v_src, '--[^\n]*', '', 'g')) > 0 THEN
    v_missing := v_missing
      || 'the unscoped CROSS JOIN fan is still in the body — a later migration has reverted this one'::text;
  END IF;

  -- 3d. the ESCALATION must still address itself the way RLS can read.
  --     Probed on `g.user_ids` — the aggregate built in aud_agg — and NOT on
  --     the bare "type/user/user_ids" triple, which branch 1 also contains and
  --     which would therefore have reported success with branch 2 reverted.
  IF position('''user_ids'', g.user_ids' IN regexp_replace(v_src, '--[^\n]*', '', 'g')) = 0 THEN
    v_missing := v_missing
      || 'escalation targeting is not the per-narrative user_ids shape that fn_notification_is_for_user honours'::text;
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'narrative escalation scope FAILED — % problem(s): %',
      array_length(v_missing, 1), array_to_string(v_missing, ' | ');
  END IF;

  -- 3e. REPORTED, NOT ENFORCED. These counts move legitimately as roles and
  --     handovers change, so they are printed rather than asserted — and they
  --     are never the only check on anything this file intends to change; every
  --     structural claim above goes through the RAISE EXCEPTION path.
  SELECT count(*),
         count(*) FILTER (WHERE cw),
         count(*) FILTER (WHERE NOT cw)
    INTO v_holders, v_cluster, v_scoped
    FROM (
      SELECT ( p.is_super_admin = true
               OR p.role = 'super_admin'
               OR EXISTS (SELECT 1 FROM public.user_roles ur
                            JOIN public.custom_roles cr ON cr.id = ur.role_id
                           WHERE ur.user_id = p.id
                             AND (cr.permissions ->> 'accreditation.naac.narrative.manage')::boolean = true
                             AND cr.institution_scope = 'all')
               OR EXISTS (SELECT 1 FROM public.custom_roles cr
                           WHERE cr.role_key = p.role
                             AND (cr.permissions ->> 'accreditation.naac.narrative.manage')::boolean = true
                             AND cr.institution_scope = 'all')
             ) AS cw
        FROM public.profiles p
       WHERE public.user_has_permission(p.id, 'accreditation.naac.narrative.manage')
    ) t;

  RAISE NOTICE 'escalation audience now: % holder(s) — % chased cluster-wide, % confined to their own institution',
    v_holders, v_cluster, v_scoped;
  RAISE NOTICE 'narrative escalation scope OK — unscoped fan removed, targeting readable by RLS';
END $$;
