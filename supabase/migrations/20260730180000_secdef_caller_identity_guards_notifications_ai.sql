-- Updated: 2026-07-30 - Guard 4 SECDEF functions that trust a caller-supplied
--                       user id, and close the anon-writable ai_query_logs.
--
-- APPLY STATUS: **NOT APPLIED.** This file is a pending change, not a record of
-- one. Every fact asserted below was read live from production
-- (kvizhngldtiuufknvehv) on 2026-07-30, but nothing here has been executed
-- against it. Apply is a separate, human-gated step.
--
-- ===========================================================================
-- WHY
-- ===========================================================================
-- A SECURITY DEFINER function that accepts a caller-supplied identity
-- (p_user_id) and never checks it against auth.uid() is an IDOR: it runs as the
-- OWNER, so RLS on the underlying table protects nothing. The caller simply
-- names whoever they want to be.
--
-- The 2026-07-28 sweep (#2564, 20260807150000_secdef_caller_identity_lock_sweep)
-- closed the 18 functions that NO application code calls, where removing the
-- grant could not change behaviour. Its header deferred the rest:
--
--     "The remaining functions ARE called by application code ... Those need a
--      per-function auth.uid()/permission guard, decided one at a time. A
--      blanket revoke there would break working screens."
--
-- These four are exactly that case. All four are called by live application
-- code through a **session-bound** Supabase client, so a revoke is NOT
-- available — see CALLERS below. Each gets a guard instead.
--
-- ===========================================================================
-- THE FOUR, AND WHAT EACH ONE COSTS TODAY
-- ===========================================================================
-- Verified live 2026-07-30. All four: prosecdef=true, owner=postgres,
-- ACL = postgres=X | authenticated=X | service_role=X (anon holds no grant).
-- None of the four is referenced by any RLS policy — a scan of pg_policies
-- qual/with_check for all four names returned zero rows — so guarding them
-- cannot break a signed-in read of any table.
--
-- 1. acknowledge_notification(p_notification_id uuid, p_user_id uuid)
--    Bypasses the user_notifications UPDATE policy `user_id = auth.uid()`.
--    Any signed-in user can mark ANY other person's notification acknowledged
--    (and read). This is not cosmetic: the route's own comment calls
--    acknowledgment "system-enforced and permanently recorded", the active
--    confirmation that someone saw and understood a notice. Forging it destroys
--    the evidentiary value AND clears the victim's blocking modal, so the
--    victim never sees a mandatory notice they are recorded as having accepted.
--      Reach: 169,543 user_notifications rows / 6,802 people. 7 notifications
--      carry requires_acknowledgment = true, covering 31,966 user-rows,
--      14,212 still unacknowledged, across 6,565 people. The largest single
--      mandatory-ack broadcast reached 6,225 recipients. Because these are
--      broadcasts, an attacker who received one already holds the real
--      notification_id from their own copy; only the victim id is needed.
--    This function also had no `SET search_path` — the only one of the four
--    missing it. Added below.
--
-- 2. increment_ai_query_count(p_user_id uuid)
--    A targeted denial of service. ~30 calls against a chosen person pushes
--    query_count to the hardcoded 30-per-5-minute ceiling, after which their
--    next AI question returns 429 RATE_LIMITED (app/api/ai-query/route.ts).
--    Repeat every 5 minutes for an indefinite lockout. The counter has no
--    upper bound.
--
-- 3. check_ai_query_rate_limit(p_user_id uuid)
--    The enabler for #2, plus a small leak. Its INSERT .. ON CONFLICT creates
--    the ai_query_rate_limits row for any person, which is the precondition
--    that makes #2 bite on someone who has never used the assistant. It also
--    returns that person's remaining quota and reset_at, beyond the own-rows
--    SELECT policy. On its own it is NOT a DoS: a fresh window preserves the
--    count and a stale window resets it to 0, which helps the victim.
--
--    2 and 3 are genuine privilege escalation, not merely unguarded:
--    ai_query_rate_limits carries ONLY a SELECT policy — no INSERT policy and
--    no UPDATE policy — so RLS default-denies a direct write. These SECDEF
--    functions are the sole write path a signed-in caller has.
--
-- 4. log_ai_query(p_user_id, p_institution_id, ...)
--    Unguarded, but on its own it grants NOTHING the caller does not already
--    have, because the table underneath is wide open (see next section). The
--    guard below is added for defence in depth; the fix that actually matters
--    is the policy change.
--
-- ===========================================================================
-- THE PART THAT IS WORSE THAN THE FOUR: ai_query_logs is anon-writable
-- ===========================================================================
-- Read live 2026-07-30:
--
--   policy "System can insert query logs"  FOR INSERT  roles=public
--                                          WITH CHECK (true)
--   grants: anon          -> SELECT, INSERT, UPDATE, DELETE, TRUNCATE, ...
--           authenticated -> SELECT, INSERT, UPDATE, DELETE, TRUNCATE, ...
--
-- `WITH CHECK (true)` for role `public` plus a table-level grant to anon means
-- any client holding the public anon key — the one embedded in every page of
-- https://www.jkkn.ai — can insert audit rows attributed to anyone, and can
-- UPDATE, DELETE or TRUNCATE the audit trail outright. Unauthenticated.
-- The table is surfaced to administrators by the policy "Super admins can view
-- all query logs", so poisoning it is visible-by-design to the people who would
-- rely on it during an investigation.
--
-- This is the same root cause as 20260726180000 and 20260728190000: Supabase's
-- ALTER DEFAULT PRIVILEGES hands anon everything on a new public-schema table,
-- and a reassuringly-named permissive policy ("System can ...") is not a rule —
-- `TO public WITH CHECK (true)` is the rule.
--
-- NOT PROVEN BY EXECUTION, DELIBERATELY. The grant and the policy are
-- sufficient evidence. Firing a write at production to demonstrate a
-- vulnerability is not a test, it is the incident.
--
-- ===========================================================================
-- CALLERS — why every grant below is KEPT, and a revoke is not on the table
-- ===========================================================================
--   acknowledge_notification   <- app/api/notifications/acknowledge/route.ts:42
--   check_ai_query_rate_limit  <- lib/services/ai-query-service.ts:98
--   increment_ai_query_count   <- lib/services/ai-query-service.ts:121
--   log_ai_query               <- lib/services/ai-query-service.ts:149
--   (ai-query-service.ts is driven only by app/api/ai-query/route.ts, which
--    calls AIQueryService.initialize(supabase) at line 372 with its own client.)
--
-- Both routes build their client from NEXT_PUBLIC_SUPABASE_ANON_KEY plus the
-- SSR cookie — createServerSupabaseClient (lib/supabase/server.ts:60) and
-- createClient (lib/supabase/server.ts:23). They therefore execute as
-- `authenticated`, NOT service_role. "It is only called from an API route" does
-- not make a revoke safe here; only a true service-role client would. Revoking
-- authenticated would break notification acknowledgment and the entire AI query
-- route.
--
-- Both routes already pass the caller's own id, taken from auth.getUser(), so
-- every guard below is a no-op on the legitimate path.
--
-- No application code touches ai_query_logs or ai_query_rate_limits directly —
-- a repo-wide grep for .from('ai_query_logs') / .from('ai_query_rate_limits')
-- returns nothing. All access is through these RPCs, which run as postgres
-- (the table owner) with relforcerowsecurity = false, so they bypass RLS
-- entirely. That is why dropping the permissive INSERT policy below cannot
-- break the application write path: the app never depended on it.
--
-- ===========================================================================
-- WHY THE GUARD IS SHAPED `auth.uid() IS NOT NULL AND ...`
-- ===========================================================================
-- Inside a SECURITY DEFINER function auth.uid() still reads the request's JWT
-- claim, not the owner, so it correctly identifies the caller. When there is no
-- JWT — service_role, or a trusted backend job — auth.uid() returns NULL.
--
-- A bare `p_user_id IS DISTINCT FROM auth.uid()` would therefore RAISE for
-- every service_role call, since NULL is distinct from any id. All four
-- functions hold a service_role grant, so that would be a silent breakage of
-- any current or future trusted caller. Leading with `auth.uid() IS NOT NULL`
-- scopes the rule to real signed-in sessions, which is exactly the threat
-- being closed.
--
-- That NULL branch is not a hole: it is reachable only by a role that can
-- EXECUTE the function, and anon holds no EXECUTE grant on any of the four.
-- The revokes and the regression guard at the end assert this rather than
-- trusting it. (CREATE OR REPLACE preserves an existing function's ACL and
-- does not re-apply Supabase's default anon grant, but it is asserted anyway.)
--
-- COALESCE(is_super_admin(), false) — a guard of the shape
-- `IF NOT (a OR b) THEN RAISE` falls THROUGH when a or b is NULL, because
-- `NOT (NULL OR false)` is NULL and `IF NULL THEN` does not fire. is_super_admin()
-- is already explicit-boolean, so this is belt-and-braces, not a fix.
--
-- IS auth.uid() THE RIGHT THING TO COMPARE AGAINST? — checked, not assumed.
-- All three tables key user_id by FK to profiles(id), NOT to auth.users(id), so
-- comparing against auth.uid() is only correct if those coincide. CLAUDE.md
-- asserts "auth.users.id == profiles.id (1:1)", and on production that is NOT
-- universally true — measured 2026-07-30:
--     profiles                                    7,225
--     auth.users                                  6,985
--     profiles whose id is NOT an auth user       1,241
--     auth users with NO profile of the same id   1,001
--     user_notifications keyed to a non-auth id  16,250  (of 169,543)
--
-- It does not reach these guards, and the reason is worth stating plainly: the
-- guard compares p_user_id against auth.uid(), and both routes pass
-- auth.getUser().id — which IS auth.uid(). The two sides are the same value by
-- construction, whatever profiles holds. The guard is therefore a strict no-op
-- on the legitimate path for every caller, including the 1,001.
--
-- What the mismatch does affect is pre-existing and untouched here: for a person
-- whose profile is keyed differently, `WHERE user_id = p_user_id` already finds
-- nothing today and the route already returns "Notification not found for this
-- user". 2,700 mandatory-acknowledgment rows sit in that state right now. That
-- is a data-integrity defect worth its own investigation; it is deliberately NOT
-- fixed here, because changing which id the lookup uses would alter behaviour
-- for 153,293 working rows in a migration whose job is to close an IDOR.
--
-- Super admins are allowed through deliberately, and this widens nothing:
-- user_notifications already carries "Super admins can manage all user
-- notifications" FOR ALL, so an administrator can already perform the
-- acknowledgment write directly.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. acknowledge_notification — self-only, plus the missing search_path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acknowledge_notification(
  p_notification_id uuid,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSON;
  v_user_notif_id UUID;
  v_already_acked TIMESTAMPTZ;
BEGIN
  -- Caller-identity guard. See header for why the NULL branch is intentional.
  IF auth.uid() IS NOT NULL
     AND p_user_id IS DISTINCT FROM auth.uid()
     AND NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'Cannot acknowledge a notification on behalf of another user'
      USING ERRCODE = '42501';
  END IF;

  -- Find the user_notification record
  SELECT id, acknowledged_at INTO v_user_notif_id, v_already_acked
  FROM user_notifications
  WHERE notification_id = p_notification_id
    AND user_id = p_user_id;

  IF v_user_notif_id IS NULL THEN
    RETURN json_build_object('error', 'Notification not found for this user');
  END IF;

  -- Already acknowledged — return success (idempotent)
  IF v_already_acked IS NOT NULL THEN
    RETURN json_build_object(
      'message', 'Already acknowledged',
      'acknowledged_at', v_already_acked
    );
  END IF;

  -- Record acknowledgment AND mark as read
  UPDATE user_notifications
  SET acknowledged_at = NOW(),
      read_at = COALESCE(read_at, NOW())
  WHERE id = v_user_notif_id;

  RETURN json_build_object(
    'message', 'Notification acknowledged',
    'acknowledged_at', NOW(),
    'notification_id', p_notification_id
  );
END;
$function$;


-- ---------------------------------------------------------------------------
-- 2. check_ai_query_rate_limit — self-only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_ai_query_rate_limit(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rate_limit RECORD;
  v_window_start TIMESTAMPTZ;
  v_queries_per_5_min INTEGER := 30;
  v_bulk_daily_limit INTEGER := 500;
  v_remaining INTEGER;
  v_bulk_remaining INTEGER;
  v_reset_at TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NOT NULL
     AND p_user_id IS DISTINCT FROM auth.uid()
     AND NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'Cannot read or create another user''s rate limit'
      USING ERRCODE = '42501';
  END IF;

  v_window_start := NOW() - INTERVAL '5 minutes';

  -- Get or create rate limit record
  INSERT INTO ai_query_rate_limits (user_id, window_start, query_count, bulk_action_count)
  VALUES (p_user_id, NOW(), 0, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET
    window_start = CASE
      WHEN ai_query_rate_limits.window_start < v_window_start
      THEN NOW()
      ELSE ai_query_rate_limits.window_start
    END,
    query_count = CASE
      WHEN ai_query_rate_limits.window_start < v_window_start
      THEN 0
      ELSE ai_query_rate_limits.query_count
    END,
    bulk_action_count = CASE
      WHEN DATE(ai_query_rate_limits.window_start) < DATE(NOW())
      THEN 0
      ELSE ai_query_rate_limits.bulk_action_count
    END,
    updated_at = NOW()
  RETURNING * INTO v_rate_limit;

  v_remaining := v_queries_per_5_min - v_rate_limit.query_count;
  v_bulk_remaining := v_bulk_daily_limit - v_rate_limit.bulk_action_count;
  v_reset_at := v_rate_limit.window_start + INTERVAL '5 minutes';

  RETURN jsonb_build_object(
    'allowed', v_remaining > 0,
    'remaining', GREATEST(0, v_remaining),
    'reset_at', v_reset_at,
    'daily_bulk_remaining', GREATEST(0, v_bulk_remaining)
  );
END;
$function$;


-- ---------------------------------------------------------------------------
-- 3. increment_ai_query_count — self-only. Closes the targeted DoS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_ai_query_count(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND p_user_id IS DISTINCT FROM auth.uid()
     AND NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'Cannot modify another user''s rate limit counter'
      USING ERRCODE = '42501';
  END IF;

  UPDATE ai_query_rate_limits
  SET
    query_count = query_count + 1,
    last_query_at = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 4. log_ai_query — self-only. Defence in depth; section 5 is the real fix.
--    All ten parameter DEFAULTs are repeated verbatim: CREATE OR REPLACE
--    redefines the signature, and dropping a default would break the caller,
--    which supplies these by name.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_ai_query(
  p_user_id uuid,
  p_institution_id uuid,
  p_query_text text,
  p_query_type text DEFAULT 'data_query'::text,
  p_tools_called text[] DEFAULT '{}'::text[],
  p_response_time_ms integer DEFAULT NULL::integer,
  p_success boolean DEFAULT true,
  p_error_code text DEFAULT NULL::text,
  p_ip_address inet DEFAULT NULL::inet,
  p_user_agent text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_log_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL
     AND p_user_id IS DISTINCT FROM auth.uid()
     AND NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'Cannot write an audit log entry attributed to another user'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO ai_query_logs (
    user_id, institution_id, query_text, query_type,
    tools_called, response_time_ms, success, error_code,
    ip_address, user_agent
  ) VALUES (
    p_user_id, p_institution_id, p_query_text, p_query_type,
    p_tools_called, p_response_time_ms, p_success, p_error_code,
    p_ip_address, p_user_agent
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 4b. Re-assert the ACL on all four, explicitly.
--
--     CREATE OR REPLACE preserves an existing function's privileges, so in
--     principle nothing above changed them. This block does not rely on that.
--     The `REVOKE ... FROM anon, PUBLIC` is stated because PostgreSQL grants
--     EXECUTE to PUBLIC on every new function and Supabase's ALTER DEFAULT
--     PRIVILEGES grants anon directly — two separate paths, and revoking only
--     `anon` would be a silent no-op against the PUBLIC half.
--
--     `authenticated` is GRANTED, not revoked, and that is the whole point of
--     this migration: every caller is session-bound and runs as that role.
--     `service_role` is re-granted because the guard's NULL branch (see header)
--     depends on trusted backend callers still being able to execute.
--
--     This also matches the ACL read live on 2026-07-30 — postgres |
--     authenticated | service_role, with no anon entry — so it asserts the
--     status quo rather than changing it.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.acknowledge_notification(uuid, uuid)  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.acknowledge_notification(uuid, uuid)  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.check_ai_query_rate_limit(uuid)       FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_ai_query_rate_limit(uuid)       TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.increment_ai_query_count(uuid)        FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_ai_query_count(uuid)        TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.log_ai_query(uuid, uuid, text, text, text[], integer, boolean, text, inet, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.log_ai_query(uuid, uuid, text, text, text[], integer, boolean, text, inet, text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5. ai_query_logs — close the unauthenticated write path
--
--    The app never used this policy (its writes arrive via log_ai_query, which
--    runs as the owner and bypasses RLS), so scoping it costs nothing. The
--    replacement keeps a signed-in person able to log their OWN query, which is
--    the only direct-insert case that could ever be legitimate.
-- ---------------------------------------------------------------------------
-- RLS must be ON for the replacement policy to mean anything. It IS on today
-- (verified live 2026-07-30), so this is an assertion, not a change — but a
-- policy is only a rule while RLS is enabled, and a self-only WITH CHECK on a
-- table with RLS off is silently inert: `authenticated` keeps its direct INSERT
-- grant and can forge rows with any user_id, which is the exact threat this
-- migration closes. Stating it here means the protection cannot be undone by a
-- later ALTER TABLE ... DISABLE without the regression guard in section 6
-- catching it.
ALTER TABLE public.ai_query_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "System can insert query logs" ON public.ai_query_logs;

-- NO replacement INSERT policy, and INSERT is revoked outright below.
--
-- The first draft of this migration replaced the blanket policy with a
-- self-only `WITH CHECK (user_id = auth.uid())`, reasoning that logging your
-- OWN query is the one direct insert that could ever be legitimate. That was a
-- half-measure. There is no such case: every write arrives through
-- log_ai_query, which runs as owner `postgres` on a table with
-- relforcerowsecurity = false and therefore bypasses RLS entirely, and a
-- repo-wide grep finds no `.from('ai_query_logs')` anywhere. The grant is
-- unused.
--
-- Leaving INSERT granted alongside a self-only check still let any signed-in
-- user bypass the RPC and write self-attributed rows carrying arbitrary
-- query_text, institution_id, ip_address and user_agent — forging the content
-- of a compliance-relevant trail while satisfying the policy, since the only
-- column the policy constrains is the one the attacker is happy to set
-- honestly. Removing the grant closes that; the RPC remains the sole writer,
-- and it now carries its own caller-identity guard.
DROP POLICY IF EXISTS "Users can insert their own query logs" ON public.ai_query_logs;

-- anon has no business touching an audit trail at all.
REVOKE ALL ON TABLE public.ai_query_logs FROM anon, PUBLIC;

-- Signed-in users keep SELECT only — the "Users can view their own query logs"
-- and "Super admins can view all query logs" policies still scope reads. Every
-- write path is now the SECDEF RPC. service_role (which bypasses RLS and keeps
-- its own grants) retains what it needs for retention jobs.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.ai_query_logs FROM authenticated;

-- ai_query_rate_limits was already locked against anon by
-- 20260728190000_lock_anon_on_20260728_backups_and_rate_limits.sql. Re-asserted
-- here because it is idempotent and this migration is the one that makes the
-- rate-limit path trustworthy end to end.
REVOKE ALL ON TABLE public.ai_query_rate_limits FROM anon, PUBLIC;


-- ---------------------------------------------------------------------------
-- 6. Regression guard — assert the end state, fail loudly otherwise.
--
--    Runs in the same transaction as the changes above, so a failure rolls the
--    whole migration back rather than leaving a half-applied security fix.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  r record;
  v_bad text := '';
  v_count integer;
BEGIN
  -- 6a. Every one of the four must still be SECDEF, must NOT be anon-executable,
  --     must still be authenticated-executable (their callers are session-bound),
  --     and must now contain an auth.uid() check in its own body.
  FOR r IN
    SELECT p.proname,
           p.prosecdef,
           has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_e,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_e,
           has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc_e,
           pg_get_functiondef(p.oid) LIKE '%auth.uid()%'             AS has_guard
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
     WHERE p.proname IN ('acknowledge_notification',
                         'check_ai_query_rate_limit',
                         'increment_ai_query_count',
                         'log_ai_query')
  LOOP
    IF NOT r.prosecdef THEN
      v_bad := v_bad || format(E'\n  %s is no longer SECURITY DEFINER', r.proname);
    END IF;
    IF r.anon_e THEN
      v_bad := v_bad || format(E'\n  %s is EXECUTE-able by anon', r.proname);
    END IF;
    IF NOT r.authed_e THEN
      v_bad := v_bad || format(E'\n  %s lost authenticated EXECUTE — its caller is session-bound and would break', r.proname);
    END IF;
    IF NOT r.svc_e THEN
      v_bad := v_bad || format(E'\n  %s lost service_role EXECUTE — the guard NULL branch assumes trusted backend callers keep it', r.proname);
    END IF;
    IF NOT r.has_guard THEN
      v_bad := v_bad || format(E'\n  %s has no auth.uid() check in its body', r.proname);
    END IF;
  END LOOP;

  -- 6b. All four must actually exist. Four names, and log_ai_query has a single
  --     overload, so the expected count is exactly 4.
  SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proname IN ('acknowledge_notification',
                       'check_ai_query_rate_limit',
                       'increment_ai_query_count',
                       'log_ai_query');
  IF v_count <> 4 THEN
    v_bad := v_bad || format(E'\n  expected 4 target functions, found %s', v_count);
  END IF;

  -- 6b-ii. RLS must be ON, or the self-only INSERT policy below is inert and
  --        authenticated's direct INSERT grant forges rows unchallenged.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relname = 'ai_query_logs' AND c.relrowsecurity
  ) THEN
    v_bad := v_bad || E'\n  ai_query_logs has RLS DISABLED — the self-only INSERT policy would be inert';
  END IF;

  -- 6c. No permissive blanket INSERT may remain on the audit trail.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'ai_query_logs'
       AND cmd        = 'INSERT'
       AND coalesce(with_check, '') IN ('true', '(true)')
  ) THEN
    v_bad := v_bad || E'\n  ai_query_logs still carries a WITH CHECK (true) INSERT policy';
  END IF;

  -- 6d. anon must hold nothing at all on the audit trail.
  IF has_table_privilege('anon', 'public.ai_query_logs', 'SELECT')
     OR has_table_privilege('anon', 'public.ai_query_logs', 'INSERT')
     OR has_table_privilege('anon', 'public.ai_query_logs', 'UPDATE')
     OR has_table_privilege('anon', 'public.ai_query_logs', 'DELETE') THEN
    v_bad := v_bad || E'\n  anon still holds a table privilege on ai_query_logs';
  END IF;

  -- 6e. The SECDEF RPC must be the ONLY writer. A signed-in user with a direct
  --     INSERT grant can forge the CONTENT of a self-attributed audit row
  --     (query_text, institution_id, ip_address, user_agent) while satisfying
  --     any user_id-only policy, so the grant itself has to go — not just a
  --     check on top of it. SELECT is deliberately still allowed: the own-rows
  --     and super-admin read policies depend on it.
  IF has_table_privilege('authenticated', 'public.ai_query_logs', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ai_query_logs', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ai_query_logs', 'DELETE') THEN
    v_bad := v_bad || E'\n  authenticated can still INSERT, UPDATE or DELETE ai_query_logs directly — log_ai_query must be the only writer';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.ai_query_logs', 'SELECT') THEN
    v_bad := v_bad || E'\n  authenticated lost SELECT on ai_query_logs — the own-rows read policy would return nothing';
  END IF;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'SECDEF caller-identity guards did not reach the expected state:%', v_bad;
  END IF;
END;
$guard$;

-- ===========================================================================
-- POST-APPLY VERIFICATION — run in a SEPARATE call.
-- The Management API wraps a whole batch in ONE transaction, so a check run in
-- the same batch as the change proves nothing about the committed state.
--
--   SELECT p.proname,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
--          pg_get_functiondef(p.oid) LIKE '%auth.uid()%'             AS guarded
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('acknowledge_notification','check_ai_query_rate_limit',
--                        'increment_ai_query_count','log_ai_query');
--
-- Expected: anon_exec false, auth_exec true, guarded true — on all four.
--
-- BEHAVIOUR CHECK (objects can verify perfectly while behaviour is broken):
--   1. Sign in as a normal test account and open a page that renders a
--      mandatory notification. Acknowledge it. It must still succeed.
--   2. Ask the AI assistant a question. It must still answer, and
--      ai_query_rate_limits.query_count for that person must still increment.
--   3. As that same account, call acknowledge_notification with SOMEONE ELSE'S
--      user id. It must now return 42501 rather than 200.
-- ===========================================================================
