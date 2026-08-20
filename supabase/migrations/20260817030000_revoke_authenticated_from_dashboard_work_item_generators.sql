-- =====================================================================
-- Narrow two dashboard work-item generators to service_role
-- Created: 2026-08-17
-- Status:  FILE ONLY — NOT APPLIED. Director-gated.
-- =====================================================================
--
-- PROBLEM
--   `public.fn_generate_hr_command_center_brief_items()` is SECURITY DEFINER,
--   owned by `postgres`, and carries a direct EXECUTE grant to `authenticated`.
--   Measured on production 2026-08-10:
--
--     proacl = postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
--   So ANY logged-in user — a learner, a visiting faculty member, anyone
--   holding a session — can call the generator over PostgREST. The function is
--   idempotency-keyed per user per day (`fn_create_dashboard_work_item`
--   short-circuits on a duplicate `idempotency_key`), which is exactly what
--   makes the grant harmful rather than merely untidy: the FIRST caller of the
--   day burns that key. A user who fires it before the cron does gets the
--   brief built from whatever the data looked like at that moment, and the
--   real scheduled run then finds the key taken and writes nothing. The brief
--   is not duplicated — it is SUPPRESSED, silently, with the cron still
--   reporting success.
--
--   `public.fn_generate_event_proposal_items()` carries the identical
--   over-grant and is fixed in the same file — see SIBLING SWEEP below.
--
--   The `search_path` half of the usual SECURITY DEFINER hardening needs no
--   work here: both functions already have `proconfig = {search_path=public}`.
--   This file changes grants ONLY. It does not touch a single function body,
--   so no behaviour changes for any caller that is still allowed to call.
--
-- CALLER SWEEP (done first — the whole decision rests on it)
--   Every reference to `fn_generate_hr_command_center_brief_items` on
--   jicate/main, and the role each one executes as:
--
--     app/api/cron/dashboard-work-items/route.ts:37
--         `supabase.rpc('fn_generate_all_dashboard_work_items')` built from
--         `createServiceRoleClient()`             → runs as service_role
--     20260428_hr_command_center_brief_digest.sql:166
--         in-DB call from fn_generate_all_dashboard_work_items(), which is
--         SECURITY DEFINER owned by postgres      → inner call runs as postgres
--     lib/services/admin/notification-recipient-policies-service.ts:9
--         docblock mention only. That file wraps the
--         `notification_recipient_policies` TABLE and never .rpc()s the
--         function                                 → not a caller
--     20260429_..., 20260605191101_..., 20260816040000_..., setup/02_functions.sql
--         definitions and grant statements         → not callers
--     types/supabase.ts:103536
--         generated type, `Args: never`; no code references it
--                                                  → not a caller
--     docs/features/..., docs/qa/...               → documentation
--
--   ZERO callers run as `authenticated`. There is no
--   `.rpc('fn_generate_hr_command_center_brief_items')` anywhere under
--   app/, lib/, components/, hooks/ or scripts/. Confirmed in-database too:
--   the only function whose body mentions either generator is
--   `fn_generate_all_dashboard_work_items` (SECURITY DEFINER, owner postgres),
--   and `cron.job` holds no job referencing either name. Because the
--   dispatcher is SECURITY DEFINER, PostgreSQL checks EXECUTE on the inner
--   functions against its OWNER (`postgres`), never against the session role —
--   so the cron path cannot be affected by this change.
--
--   The control case proves it independently: the sibling
--   `fn_generate_super_admin_daily_digest` is invoked the same way, by
--   app/api/dashboard/cron/super-admin-digest/route.ts under a service-role
--   client, and has held NO `authenticated` grant on production all along.
--   It works. That is what correct looks like for this family.
--
-- SIBLING SWEEP (all 13 generators in the family, measured on prod 2026-08-10)
--   11 of 13 are already `postgres | service_role` and need nothing:
--     fn_create_dashboard_work_item, fn_generate_all_dashboard_work_items,
--     fn_generate_overdue_invoice_items, fn_generate_stale_lead_rescue_items,
--     fn_generate_pending_leave_approval_items,
--     fn_generate_unmarked_attendance_items,
--     fn_generate_recruitment_approval_items,
--     fn_generate_service_request_approval_items,
--     fn_generate_unresolved_bug_items, fn_generate_unresolved_grievance_items,
--     fn_generate_super_admin_daily_digest
--   Exactly TWO are outliers, and both are fixed here:
--     fn_generate_hr_command_center_brief_items
--     fn_generate_event_proposal_items
--
--   The reasoning carries over cleanly to the second one. It has no code
--   caller at all (no match under app/, lib/, components/, hooks/), its only
--   in-DB caller is the same postgres-owned dispatcher, and the repository
--   already declares the intended end state: supabase/setup/02_functions.sql
--   line 10049 reads
--     `REVOKE ALL ON FUNCTION fn_generate_event_proposal_items() FROM PUBLIC, anon, authenticated;`
--   That REVOKE never reached production, because setup/ files are rebuild
--   scripts rather than migrations. This file is what applies it.
--
-- WHERE THE HR GRANT CAME FROM (so it does not come back)
--   20260428_hr_command_center_brief_digest.sql:186 granted it at creation.
--   20260605191101_revoke_platform_rpcs_anon_access.sql then re-affirmed it:
--   that migration loops over 155 names and issues, for each,
--     REVOKE EXECUTE ... FROM anon, PUBLIC;  GRANT EXECUTE ... TO authenticated;
--   Its `GRANT ... TO authenticated` is unconditional, so for any function
--   that should never have been reachable by a logged-in user it WIDENS
--   access as a side effect of an anon lockdown. This generator is in that
--   list (line 154). Anyone adding a name to that list should check the
--   caller set first; and if that migration is ever re-run after this one,
--   it will re-open this hole.
--
-- APPLY-TIME SAFETY
--   No BEGIN/COMMIT in this file, deliberately — a reviewer can wrap the whole
--   thing in BEGIN … ROLLBACK against production to rehearse it, and an inner
--   COMMIT would defeat that wrapper.
--   Both guards RAISE EXCEPTION rather than RAISE NOTICE: a NOTICE-only miss
--   path stamps zero rows and reads as success.
-- =====================================================================

-- ---- Guard 1: the targets must exist -------------------------------------
-- Fails loudly rather than silently narrowing nothing.
DO $$
BEGIN
  IF to_regprocedure('public.fn_generate_hr_command_center_brief_items()') IS NULL THEN
    RAISE EXCEPTION
      'fn_generate_hr_command_center_brief_items() not found — refusing to run '
      'a grant-narrowing migration that would otherwise no-op silently';
  END IF;

  IF to_regprocedure('public.fn_generate_event_proposal_items()') IS NULL THEN
    RAISE EXCEPTION
      'fn_generate_event_proposal_items() not found — refusing to run '
      'a grant-narrowing migration that would otherwise no-op silently';
  END IF;
END $$;

-- ---- The change ----------------------------------------------------------
-- `authenticated` is the point of this migration. `anon` and PUBLIC are
-- re-asserted alongside it because Supabase's
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon`
-- hands anon a direct grant that a REVOKE FROM PUBLIC does not undo.
-- service_role keeps EXECUTE; the owner (postgres) always retains it.

REVOKE EXECUTE ON FUNCTION public.fn_generate_hr_command_center_brief_items()
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_generate_hr_command_center_brief_items()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_generate_event_proposal_items()
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_generate_event_proposal_items()
  TO service_role;

-- ---- Guard 2: verify the catalog, do not trust the statements above -------
-- Reads pg_proc fresh. It shares no predicate with the REVOKEs, so deleting
-- them makes this fire. Proven discriminating against production 2026-08-10:
-- true for both targets, false for fn_generate_super_admin_daily_digest and
-- fn_generate_all_dashboard_work_items, which are already correctly scoped.
-- A NULL proacl is treated as a failure: for a function that means the
-- default privileges apply, and the default is EXECUTE to PUBLIC.
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(p.proname || ' => ' || COALESCE(array_to_string(p.proacl, ' | '), '<default: PUBLIC EXECUTE>'), '; ')
    INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
          'fn_generate_hr_command_center_brief_items',
          'fn_generate_event_proposal_items')
    AND (
      p.proacl IS NULL
      OR EXISTS (
        SELECT 1
        FROM aclexplode(p.proacl) a
        WHERE a.privilege_type = 'EXECUTE'
          AND CASE WHEN a.grantee = 0 THEN true
                   ELSE pg_get_userbyid(a.grantee) IN ('authenticated', 'anon')
              END
      )
    );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'grant narrowing did not take — still EXECUTE-able by authenticated/anon/PUBLIC: %',
      v_bad;
  END IF;

  RAISE NOTICE
    'fn_generate_hr_command_center_brief_items + fn_generate_event_proposal_items: '
    'EXECUTE now limited to owner + service_role';
END $$;

-- ---- Provenance ----------------------------------------------------------
COMMENT ON FUNCTION public.fn_generate_hr_command_center_brief_items() IS
  'Daily HR Command Center brief: aggregates pending leaves, active recruitment, today''s holidays, and staff on leave into a single dashboard:hr_brief work item per user with hr.dashboard.view permission. URL targets /hr (domain page). Idempotent per user per day. Wired into fn_generate_all_dashboard_work_items. EXECUTE is limited to service_role (2026-08-17): the only caller is the service-role cron app/api/cron/dashboard-work-items, and a logged-in caller could otherwise burn the day''s idempotency key and suppress the real brief.';
