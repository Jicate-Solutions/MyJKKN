-- Close anon EXECUTE on the two admitted-by-source drill-down RPCs
--
-- Grants only. No function body is created, replaced or altered by this file,
-- so there is no CREATE OR REPLACE and nothing to re-assert a revoke against.
--
-- Functions:
--   public.fn_admitted_source_breakdown(uuid[], integer, text, integer, integer)
--   public.fn_admitted_source_counts(uuid[], integer)
-- Both introduced by supabase/migrations/20260813120000_fn_admitted_source_breakdown.sql.
--
-- Director decision 2026-08-13: "Shut the public door, keep staff access."
--
--
-- ═══ WHAT IS ACTUALLY TRUE — read from production 2026-08-14 ═══
--
-- The brief that commissioned this file described a live personal-data
-- exposure: an unauthenticated caller paging through learner names, roll
-- numbers and referrer names. **That is not what production does today, and
-- this file deliberately does not claim it.** The corrected facts, each one
-- measured rather than read off the source:
--
--   Both functions ARE `prosecdef = true`, owner `postgres`, and both carry
--   exactly this ACL:
--
--       =X/postgres  postgres=X/postgres  authenticated=X/postgres  service_role=X/postgres
--        ^^^^^^^^^^
--
--   So `has_function_privilege('anon', …, 'EXECUTE')` is genuinely **true** —
--   anon can CALL them. That leading `=X/` IS the grant to PUBLIC, and anon is
--   a member of PUBLIC. Neither function holds an `anon=X` entry of its own,
--   so a REVOKE naming only `anon` would succeed, change nothing, and report
--   success. **The PUBLIC half of `FROM anon, PUBLIC` below is the
--   load-bearing part.** (Same shape as the six closed by 20260827020000 and
--   the four closed on 2026-07-30.)
--
--   But calling them is not the same as reading anything. Both bodies open
--   with an institution gate:
--
--       WITH eligible_institutions AS (
--         SELECT i.id FROM institutions i
--          WHERE i.id = ANY(p_institution_ids)
--            AND role_has_institution_access(i.id)      -- ← the guard
--       )
--
--   and every subsequent row source is INNER JOINed to it. Executed as `anon`
--   on production inside a rolled-back transaction on 2026-08-14, passing all
--   14 institution ids and no year filter — that is, asking for everything:
--
--       current_user                            → anon
--       auth.uid()                              → NULL
--       role_has_institution_access(<inst>)     → false
--       fn_admitted_source_breakdown(…)         → 0 rows
--       fn_admitted_source_counts(…)            → 0 rows
--
--   Zero is a real zero, not an empty table: 4,938 learners_profiles rows are
--   `admitted` or `active` right now, and 1,535 admission_leads rows carry a
--   learner_profile_id. A signed-in team member sees those; anon sees none.
--
--   Why the guard holds for an anonymous caller — every branch of
--   role_has_institution_access falls through: is_super_admin() is false;
--   the user_roles and profiles lookups match nothing because auth.uid() is
--   NULL; and the own-institution branch compares
--   `check_institution_id = get_current_user_institution_id()`, which is
--   `uuid = NULL` → NULL, so the IF does not fire. It is NULL-safe by
--   construction, not by accident.
--
-- So this is defence in depth, not incident response — the same verdict
-- 20260827020000 reached for its Group A. It matters anyway, for two reasons.
-- First, a SECDEF function runs as its OWNER and bypasses RLS entirely, so the
-- guard inside the body is the ENTIRE perimeter; one CTE should not be all
-- that stands between the public internet and 4,938 learners' names, roll
-- numbers and referrers. Second, these take the institutions they report on AS
-- A PARAMETER — the exact shape that leaked 49 learners' names, emails, gender
-- and programme through fn_hostel_unallocated_candidates on 2026-07-30. The
-- difference between that incident and this file is one CTE that happens to be
-- present. Removing anon's ability to call them at all means a future edit to
-- the body cannot quietly re-open a public door.
--
--
-- ═══ WHY THIS IS A REVOKE AND NOT AN ALLOW-LIST ENTRY ═══
--
-- fn_is_event_creator and fn_is_designated_leave_approver were allow-listed
-- rather than revoked because they appear inside RLS policies granted TO
-- public, where a function is evaluated as the QUERYING role — revoking anon
-- would turn anon queries into `permission denied for function` instead of
-- zero rows, breaking the public event-registration form. Re-verified on
-- production 2026-08-14 that these two are NOT in that category:
--
--   RLS policies whose USING/WITH CHECK mentions them ....... 0
--   other functions calling them ............................ 0
--   views calling them ..................................... 0
--   pg_cron jobs calling them .............................. 0
--
-- So nothing evaluates them on anon's behalf, and revoking cannot convert a
-- working anon query into an error.
--
--
-- ═══ WHY `authenticated` IS PRESERVED ═══
--
-- Both have real application callers, every one of them behind a team-member
-- login, and the admission group dashboard breaks if EXECUTE is lost:
--   fn_admitted_source_breakdown(uuid[], integer, text, integer, integer)
--       lib/services/admission/group-dashboard-service.ts:377
--   fn_admitted_source_counts(uuid[], integer)
--       lib/services/admission/group-dashboard-service.ts:426
--   (shapes consumed by types/admission-workflow-config.ts:217-218)
--
-- `service_role` and `postgres` keep their explicit grants and are untouched;
-- REVOKE ... FROM anon, PUBLIC does not disturb a role's own ACL entry.
--
--
-- ═══ WHAT THIS FILE DOES NOT DO ═══
--
-- It adds NO internal permission guard. Both functions are institution-scoped
-- but not permission-scoped: any signed-in user — including a learner — can
-- call them for their OWN institution and read every learner's name, roll
-- number and referrer there. That is a real and separate gap. It is NOT closed
-- here, because closing it means adding a user_has_permission() check to a live
-- function body and could break the admission group dashboard for team members
-- whose roles were never audited against a specific permission key. It is written up
-- as a recommended follow-up in the pull request rather than shipped silently
-- alongside a grants-only change.
--
-- Deliberately no BEGIN/COMMIT: the Management API already wraps a batch in one
-- transaction, and leaving the file bare is what lets a reviewer rehearse it
-- with `BEGIN; <file>; <assertions>; ROLLBACK;` and have the ROLLBACK actually
-- roll back. A stray COMMIT would silently apply it.

-- ── The revoke ───────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.fn_admitted_source_breakdown(uuid[], integer, text, integer, integer)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_admitted_source_breakdown(uuid[], integer, text, integer, integer)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_admitted_source_counts(uuid[], integer)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_admitted_source_counts(uuid[], integer)
  TO authenticated;

-- ── Assertions ───────────────────────────────────────────────────────────────
-- A REVOKE naming a role that holds no direct grant is a successful no-op, so
-- "the statement ran" proves nothing here — only the privilege does. Every
-- intended end state is checked with has_function_privilege and raised by name.

DO $assert$
DECLARE
  v_fn  text;
  v_bad text[] := ARRAY[]::text[];
  v_fns text[] := ARRAY[
    'public.fn_admitted_source_breakdown(uuid[], integer, text, integer, integer)',
    'public.fn_admitted_source_counts(uuid[], integer)'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    -- The public door must be shut.
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      v_bad := v_bad || format('%s: anon STILL has EXECUTE', v_fn);
    END IF;

    -- Team-member access must survive. Losing either breaks the admission
    -- group dashboard, which is the failure this file must not cause.
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      v_bad := v_bad || format('%s: authenticated LOST EXECUTE (admission group dashboard would break)', v_fn);
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      v_bad := v_bad || format('%s: service_role LOST EXECUTE', v_fn);
    END IF;
  END LOOP;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'anon-execute revoke did not take effect: %', array_to_string(v_bad, ' | ');
  END IF;
END
$assert$;

-- ROLLBACK (restores the default-PUBLIC state — only if something depended on it)
--   GRANT EXECUTE ON FUNCTION public.fn_admitted_source_breakdown(uuid[], integer, text, integer, integer) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.fn_admitted_source_counts(uuid[], integer) TO PUBLIC;
--
-- VERIFY, in a SEPARATE call — the Management API wraps a batch in one
-- transaction, so a check inside the apply proves nothing. Neither ACL may
-- begin `=X/`:
--   SELECT p.proname, array_to_string(p.proacl, ' ') AS acl
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('fn_admitted_source_breakdown','fn_admitted_source_counts');
--
-- Then re-run the sweep itself — objects verifying is not the same as the gate
-- passing:
--   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… \
--     node scripts/ci/check-anon-exposure-live.mjs
