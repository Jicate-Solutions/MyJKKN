-- ============================================================================
-- Updated: 2026-07-30 — close eight anon-executable readers: three that return
-- real people and your admin list, five that hand out platform settings
-- including three live Meta webhook credentials.
--
-- HOW THESE WERE FOUND, AND WHY THEY SAT THERE
-- The 6-hourly live anon sweep has been reporting 55 "grandfathered" SECURITY
-- DEFINER functions since 2026-07-30 — functions anon can execute that nobody
-- had explicitly ruled on. It never failed the build on any of them, and the
-- reason is structural: `check-anon-exposure-live.mjs` escalates a grandfathered
-- function only when it BOTH writes data AND has no permission check, and it
-- decides "has a check" by testing whether the body merely MENTIONS a guard word.
-- Read-only leaks are therefore exempt by design. All 55 warned forever and none
-- could ever escalate, which is how an alarm becomes wallpaper and four real
-- exposures stayed invisible inside it.
--
-- Each of the eight below was confirmed against production on 2026-07-30 by
-- calling it over HTTPS with the public anon key — the same key that ships in
-- every page of jkkn.ai and is readable in any browser's network tab.
--
-- GROUP A — returns real people, and your admin list. No permission check at all.
--   fn_resource_slot_conflicts  Takes a caller-supplied p_resource_id and never
--     asks who is calling. Returns user_id, full_name, designation and EMAIL
--     joined from profiles. Confirmed live as anon: 3 rows, 2 distinct real
--     names, 2 distinct email addresses, from ONE resource id; the caller picks
--     the resource and widening the time window returns more. This is the same
--     shape as fn_hostel_unallocated_candidates, which leaked 49 learners'
--     identities and was closed in #2602 two days ago.
--   tms_users_with_permission   No check. Its first branch unconditionally
--     returns every super admin. Confirmed live as anon: 14 user IDs — a
--     targeting list for the highest-privilege accounts in the platform.
--   fn_role_user_counts         No check. Returns the complete role structure
--     and headcount (81 rows). No personal data, but no reason for an
--     unauthenticated stranger to hold the org chart.
--
-- GROUP B — settings readers, and three of the settings are live credentials.
--   fn_get_policy, fn_get_policy_bool, fn_get_policy_int, fn_get_policy_text,
--   fn_get_policy_clinical_reasoning
--     Confirmed live as anon via fn_get_policy_text: meta.leadgen.verify_token
--     (64 chars), meta.messenger.verify_token (32) and
--     meta.instagram_messaging.verify_token (32) all retrieved in full. A verify
--     token is the shared secret Meta uses to prove a webhook call really came
--     from Meta; app/api/webhooks/meta/leadgen/route.ts checks exactly these, so
--     holding them means being able to inject forged admission leads into the CRM.
--     THE TOKENS THEMSELVES MUST BE REISSUED IN META'S DASHBOARD — revoking this
--     grant stops new theft, it does not un-steal what has already been read.
--     The sharpest evidence that this is a bypass and not a policy: reading
--     `platform_policies` DIRECTLY as anon returns 0 rows. The table's own
--     protection is correct and working. These five functions walk around it,
--     exposing 448 active global settings wholesale.
--     fn_get_policy_clinical_reasoning is hard-scoped to clinical_reasoning.*
--     keys and CANNOT reach the Meta tokens — revoked with the rest because anon
--     has no business reading platform configuration, not because it leaked.
--
-- WHAT WAS CHECKED BEFORE REVOKING — nothing here should break
--   * No unauthenticated page calls any of the eight. Every genuinely public
--     route on main was scanned (app/p/**, app/verify/**,
--     app/portfolio/[learnerId], app/page.tsx) against all 55 names: zero hits.
--   * The Meta leadgen webhook is unaffected: it builds its client from
--     SUPABASE_SERVICE_ROLE_KEY, which bypasses these grants entirely.
--   * app/api/analytics/usage/events/route.ts calls fn_get_policy_bool through a
--     session client that runs as anon when logged out — it returns 401 before
--     ever reaching that call.
--   * None of the eight is referenced by any RLS policy.
--
-- DELIBERATELY NOT TOUCHED: the 27 identity predicates (is_super_admin,
-- is_admin, role_has_institution_access, api_key_has_permission, …). Those are
-- the RLS backbone — is_super_admin alone appears in 1,669 policies across 612
-- tables — and revoking one does not hide rows, it makes the query ERROR. They
-- are being marked approved in the allow-list instead, in the same change.
-- ============================================================================

-- Both roles, every time. Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to
-- anon on new functions, AND anon separately inherits PUBLIC's =X/postgres
-- grant. None of these eight carries an explicit anon=X entry — anon reaches
-- them purely through PUBLIC — so `REVOKE ... FROM anon` alone would report
-- success and change nothing. The PUBLIC half is the load-bearing one.

-- Group A
REVOKE EXECUTE ON FUNCTION public.fn_resource_slot_conflicts(
  p_resource_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_exclude_id uuid
) FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.tms_users_with_permission(p_permission text)
  FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.fn_role_user_counts() FROM anon, PUBLIC;

-- Group B
REVOKE EXECUTE ON FUNCTION public.fn_get_policy(p_key text, p_scope_id uuid)
  FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.fn_get_policy_bool(
  p_key text, p_default boolean, p_scope_id uuid
) FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.fn_get_policy_int(
  p_key text, p_default integer, p_scope_id uuid
) FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.fn_get_policy_text(
  p_key text, p_default text, p_scope_id uuid
) FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.fn_get_policy_clinical_reasoning(
  p_key text, p_default jsonb
) FROM anon, PUBLIC;

-- `authenticated` keeps every one of these. The point is to remove the
-- unauthenticated caller, not to break the eight surfaces that legitimately use
-- them while logged in.
GRANT EXECUTE ON FUNCTION public.fn_resource_slot_conflicts(
  p_resource_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_exclude_id uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tms_users_with_permission(p_permission text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_role_user_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_policy(p_key text, p_scope_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_policy_bool(p_key text, p_default boolean, p_scope_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_policy_int(p_key text, p_default integer, p_scope_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_policy_text(p_key text, p_default text, p_scope_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_policy_clinical_reasoning(p_key text, p_default jsonb) TO authenticated;

-- Apply-time assert: fail loudly rather than reporting a revoke that did nothing.
DO $$
DECLARE
  v_still_open text;
BEGIN
  SELECT string_agg(p.proname, ', ')
    INTO v_still_open
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'fn_resource_slot_conflicts', 'tms_users_with_permission',
      'fn_role_user_counts', 'fn_get_policy', 'fn_get_policy_bool',
      'fn_get_policy_int', 'fn_get_policy_text',
      'fn_get_policy_clinical_reasoning'
    )
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_still_open IS NOT NULL THEN
    RAISE EXCEPTION 'anon still holds EXECUTE on: %', v_still_open;
  END IF;
END $$;
