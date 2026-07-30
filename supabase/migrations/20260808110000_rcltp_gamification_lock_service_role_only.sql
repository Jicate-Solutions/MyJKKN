-- Migration: RCLTP gamification — make the award/streak functions actually
--            service_role-only, as their own comments already claim.
-- Date: 2026-07-30
--
-- WHY (a documented invariant that was never enforced):
--   Three separate places in the codebase assert that badge awards and streak
--   updates are server-side-only and that a learner cannot self-award:
--     app/api/rcltp/gamification/award/route.ts:4
--         "SECURITY DEFINER fn_rcltp_award_badge (service_role EXECUTE only)"
--     app/api/rcltp/gamification/streak/route.ts:4
--         "DEFINER fn_rcltp_update_streak (service_role EXECUTE only)"
--     hooks/rcltp/use-rcltp-gamification.ts:6-7 and
--     lib/services/rcltp/gamification-service.ts:10-11
--         awards/streaks are server-side only; a learner "cannot" self-award.
--   The live grant never matched the comment. Measured on prod
--   kvizhngldtiuufknvehv 2026-07-30, both functions carried
--       postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
--   i.e. has_function_privilege('authenticated', ..., 'EXECUTE') = TRUE.
--   Both are SECURITY DEFINER, both mutate, and NEITHER body references
--   auth.uid(), is_super_admin(), is_admin() or user_has_permission() — verified
--   by reading prosrc, not by reading the migration that created them. So the
--   ONLY thing standing between a signed-in learner and a self-award was the
--   API route's `rcltp.assessment.manage` permission gate — which a learner
--   bypasses entirely by calling the RPC directly with the anon key that ships
--   in every Next.js bundle, naming their own uuid as p_learner_id. That feeds
--   a LIVE leaderboard.
--
-- WHY REVOKING IS SAFE (this is the whole point — re-proven before writing):
--   `git grep "fn_rcltp_award_badge|fn_rcltp_update_streak" jicate/main
--    -- app lib hooks components scripts` returns exactly TWO .rpc() call sites:
--     app/api/rcltp/gamification/award/route.ts:60   admin.rpc('fn_rcltp_award_badge', ...)
--     app/api/rcltp/gamification/streak/route.ts:60  admin.rpc('fn_rcltp_update_streak', ...)
--   In both, `admin` = rcltpAdminClient() (app/api/rcltp/_lib/route-helpers.ts:28-30)
--   = createServiceRoleClient() (lib/supabase/server.ts:87-101), which builds a
--   client from SUPABASE_SERVICE_ROLE_KEY — a TRUE service-role client, NOT a
--   session-bound one. This is the load-bearing distinction: createServerSupabaseClient()
--   and createClientSupabaseClient() both execute as `authenticated`, so revoking
--   would break them; createServiceRoleClient() does not. There are ZERO
--   session-bound callers, and ZERO in-DB callers (no other pg_proc body and no
--   trigger references either function — checked on prod).
--
--   Blast radius at time of writing: rcltp_learner_badges = 0 rows,
--   rcltp_streaks = 0 rows. Nothing has been exploited; the fix is free now.
--
-- SCOPE — ACL ONLY. No function body is touched, no signature changes, no
--   behaviour changes. Because nothing is CREATE OR REPLACEd, there is no
--   stale-body risk and nothing to re-assert beyond the grants below.
--
-- FAMILY SWEEP (all 11 public.fn_rcltp_* functions on prod; all SECURITY DEFINER).
--   Criteria for inclusion: (a) no in-body auth/permission guard, AND
--   (b) EXECUTE-able by `authenticated`, AND (c) zero session-bound callers.
--
--   INCLUDED (meet all three):
--     fn_rcltp_award_badge          — no guard, authenticated=TRUE, only admin.rpc
--     fn_rcltp_update_streak        — no guard, authenticated=TRUE, only admin.rpc
--
--   DELIBERATELY LEFT — already correct (no guard, but authenticated=FALSE
--   already; these are the sibling pair that proves the intended pattern, and
--   are exactly what the two above should have looked like):
--     fn_rcltp_remedial_plan_ai_draft_upsert  acl: postgres,service_role only
--     fn_rcltp_remedial_plan_enqueue          acl: postgres,service_role only
--
--   DELIBERATELY LEFT — real in-body guard AND a session-bound caller
--   (createClientSupabaseClient(), which runs as `authenticated`); revoking any
--   of these would break a live screen, which is the failure mode this
--   migration exists to avoid causing:
--     fn_rcltp_at_risk_learners        is_super_admin/is_admin/user_has_permission('rcltp.review'|'rcltp.report.view_all'|'rcltp.config.manage')
--     fn_rcltp_passage_review_priority is_super_admin/is_admin/user_has_permission('rcltp.review'|'rcltp.question.approve'|'rcltp.config.manage')
--     fn_rcltp_questions_for_take      user_has_permission('rcltp.assessment.take')
--     fn_rcltp_remedial_plan_approve   is_super_admin/is_admin OR (user_has_permission('rcltp.review') AND role_has_institution_access(...))
--     fn_rcltp_school_dashboard        is_super_admin/is_admin/user_has_permission('rcltp.report.view_all'|'rcltp.config.manage')
--     fn_rcltp_spotcheck_week          auth.uid() NOT NULL + is_super_admin/is_admin/user_has_permission(...)
--     fn_rcltp_spotcheck_resolve       auth.uid() NOT NULL + UPDATE scoped `AND s.reviewer_id = v_uid` (body read in full,
--                                      NOT trusted from a keyword match — the guard is genuine, not a comment mention)
--
--   `anon` already held EXECUTE on NONE of the 11, so no anon hole exists here;
--   anon is nevertheless named in the REVOKEs below so a future re-grant by
--   Supabase's ALTER DEFAULT PRIVILEGES cannot silently reopen one.
--
-- NO inner BEGIN;/COMMIT; in this file — an inner COMMIT would turn a
-- BEGIN..ROLLBACK rehearsal into a live apply.

-- ---------------------------------------------------------------------------
-- 1. fn_rcltp_award_badge — signature taken verbatim from
--    pg_get_function_identity_arguments(oid) on prod (no overloads exist).
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_rcltp_award_badge(p_learner_id uuid, p_badge_slug text, p_institution_id uuid, p_evidence text)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_rcltp_award_badge(p_learner_id uuid, p_badge_slug text, p_institution_id uuid, p_evidence text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. fn_rcltp_update_streak
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_rcltp_update_streak(p_learner_id uuid, p_institution_id uuid, p_streak_type text, p_logged_date date)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_rcltp_update_streak(p_learner_id uuid, p_institution_id uuid, p_streak_type text, p_logged_date date)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Guard — fail loudly rather than half-apply.
--    Asserts, for EVERY function this migration touches: NOT EXECUTE-able by
--    `authenticated` and NOT by `anon`, and STILL EXECUTE-able by `service_role`.
--    Resolves each signature through to_regprocedure() first: has_function_privilege
--    RAISEs (rather than returning false) when handed an identifier that does not
--    resolve, which would otherwise report a typo'd signature as a privilege error
--    and hide which of the two checks actually failed.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_sig  text;
  v_oid  oid;
  v_sigs text[] := ARRAY[
    'public.fn_rcltp_award_badge(uuid, text, uuid, text)',
    'public.fn_rcltp_update_streak(uuid, uuid, text, date)'
  ];
BEGIN
  FOREACH v_sig IN ARRAY v_sigs LOOP
    v_oid := to_regprocedure(v_sig);

    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'RCLTP gamification lock: % does not resolve — signature drift, nothing was verified', v_sig;
    END IF;

    IF has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'RCLTP gamification lock FAILED: authenticated still holds EXECUTE on %', v_sig;
    END IF;

    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'RCLTP gamification lock FAILED: anon still holds EXECUTE on %', v_sig;
    END IF;

    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'RCLTP gamification lock FAILED: service_role LOST EXECUTE on % — the two API routes would 500', v_sig;
    END IF;
  END LOOP;

  RAISE NOTICE 'RCLTP gamification lock verified: % function(s) are service_role-only', array_length(v_sigs, 1);
END;
$guard$;
