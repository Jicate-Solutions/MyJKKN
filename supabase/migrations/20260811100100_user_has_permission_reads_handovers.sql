-- ci:allow-secdef-anon  This migration does not CREATE a function; it REPLACEs
--   the platform's pre-existing user_has_permission overloads. CREATE OR REPLACE
--   does not touch grants, so this file leaves the live privilege set exactly as
--   it already is — which is the only safe posture for a function evaluated
--   inside RLS policy expressions with the querying role's privileges. Adding a
--   REVOKE ... FROM anon here would be a live privilege change to a function with
--   4,093 call sites, smuggled into a feature PR: if ANY anon-reachable policy
--   evaluates it, every anonymous page on jkkn.ai starts throwing
--   permission-denied. supabase/setup/03_policies.sql:3083 documents that exact
--   failure ("a scalar sub-select would InitPlan-evaluate it and throw
--   permission-denied for anon") and works around it with a CASE guard, so the
--   grant posture is load-bearing and already reasoned about. Auditing/altering
--   anon's EXECUTE on user_has_permission is a standalone security decision with
--   its own PR and its own live probe — not a side effect of this one.
--
-- ⚠️  DO NOT ADD A NEW FUNCTION TO THIS FILE. The marker above is whole-file, so
--   a genuinely new SECURITY DEFINER function added here would skip the anon gate.
--
-- ============================================================================
-- Teach user_has_permission() to read Director handovers — as its LAST resort.
--
-- Date: 2026-08-04
-- Spec: specs/director-desk/SPEC.md
-- Depends on: 20260811100000_director_handovers_spine.sql
--
-- ============================================================================
-- 🛑 PRE-APPLY CHECKLIST — DO THIS BEFORE YOU RUN THIS FILE. NOT OPTIONAL.
--
-- This is a CREATE OR REPLACE of a function whose body is reproduced here from
-- another migration. If production's live body has drifted from that source —
-- any later hotfix, any hand-run Management-API SQL, which this repo does do and
-- which no CI guard can see (feedback_ci_guard_cannot_see_hand_run_sql) — then
-- applying this file SILENTLY REVERTS that drift. Nothing in CI, in the diff, or
-- in the migration ledger will tell you. The only way to know is to look.
--
-- Inside the BEGIN..ROLLBACK rehearsal
-- (feedback_validate_migration_via_mgmt_api_begin_rollback), BEFORE the replace:
--
--   SELECT pg_get_functiondef('public.user_has_permission(text)'::regprocedure);
--   SELECT pg_get_functiondef('public.user_has_permission(uuid,text)'::regprocedure);
--
-- Diff each against the corresponding body below. They must differ ONLY by:
--   (text)        the final `RETURN EXISTS (legacy...)` becoming
--                 `IF EXISTS (legacy...) THEN RETURN true; END IF;` plus the new
--                 auth.uid() NULL guard and the fn_handover_grants_key call.
--   (uuid,text)   the same shape on its own legacy branch.
-- ANY other difference — an extra check, a changed predicate, a different
-- volatility or search_path — means production has moved on. ABORT. Do not
-- apply. Re-derive this file from the LIVE definition and re-open the PR.
--
-- Send the two pg_get_functiondef calls in a SEPARATE request from the rehearsal
-- batch: the Management API wraps a whole batch in one transaction, so a verify
-- query sent alongside the ROLLBACK proves nothing
-- (feedback_mgmt_api_wraps_whole_batch_in_one_txn).
--
-- STATIC RECONCILIATION ALREADY DONE (2026-08-05, repo only — production was NOT
-- queried and cannot be from here):
--   Every migration in supabase/migrations/ containing DDL on user_has_permission:
--     * 20251210_fix_security_and_performance_issues.sql   (oldest)
--     * 20260603153624_user_has_permission_stable.sql      ← NEWEST, matched
--     * this file
--   No migration dated after 20260603153624 issues CREATE / ALTER / DROP FUNCTION
--   on either overload. The (text) body below is reproduced from 20260603153624
--   and the (uuid,text) body from supabase/setup/02_functions.sql:3446, which is
--   the mirror of the same state. Both were re-verified line by line on
--   2026-08-05. The repo is self-consistent; only production can confirm the
--   repo is still true, which is what the checklist above is for.
-- ============================================================================
--
-- ⚠️  THIS IS THE HIGHEST-BLAST-RADIUS FUNCTION ON THE PLATFORM.
--     4,093 call sites across 595 migration files. Every RLS policy that gates
--     anything routes through it. If it breaks or slows down, every page on
--     jkkn.ai breaks. Read the three guarantees below before changing anything.
--
-- GUARANTEE 1 — the first three checks are untouched.
-- The super-admin bypass, the multi-role OR-merge, and the legacy
-- profiles.role fallback are reproduced verbatim from 20260603153624. The ONLY
-- edit is that the legacy check's `RETURN EXISTS(...)` becomes
-- `IF EXISTS(...) THEN RETURN true; END IF;` so a fourth check can follow it.
-- Same inputs, same answers, for every user who already had access.
--
-- GUARANTEE 2 — zero added cost on the normal path.
-- The handover lookup is reached ONLY when all three role checks have already
-- returned false. A user who holds a page by role never touches the handover
-- table. Only a user who would otherwise be DENIED pays one indexed lookup
-- (partial index on live rows + GIN on the key array). The denial path was
-- already the cheap path, and it stays cheap.
--
-- GUARANTEE 3 — volatility is preserved.
-- The (text) overload stays STABLE so the planner keeps folding it into a
-- once-per-statement InitPlan instead of re-evaluating per row — the entire
-- point of 20260603153624. fn_handover_grants_key is STABLE to match; a
-- VOLATILE callee would silently destroy that optimisation across hundreds of
-- policies and turn this into a platform-wide performance regression.
--
-- VALIDATION BEFORE APPLYING (feedback_validate_migration_via_mgmt_api_begin_rollback)
-- Rehearse in BEGIN..ROLLBACK, and verify residue is 0 in a SEPARATE call —
-- the management API wraps a whole batch in one transaction, so a verify query
-- sent alongside the rollback proves nothing
-- (feedback_mgmt_api_wraps_whole_batch_in_one_txn).
--
-- The regression test that matters is NOT "does the new grant work" but "does
-- every existing holder still get true". Assert both, as a real role holder and
-- never as a super admin — they short-circuit at check one and prove nothing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (text) overload — the RLS-critical one. STABLE preserved.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Guard: NULL or empty permission name
    IF permission_name IS NULL OR permission_name = '' THEN
        RETURN false;
    END IF;

    -- Super admin bypass: always grant all permissions
    IF EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND is_super_admin = true
    ) THEN
        RETURN true;
    END IF;

    -- Multi-role system: check all assigned roles (OR logic)
    IF EXISTS (
        SELECT 1
        FROM user_roles ur
        INNER JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = auth.uid()
        AND (cr.permissions->>permission_name)::boolean = true
    ) THEN
        RETURN true;
    END IF;

    -- Legacy fallback: check profiles.role -> custom_roles
    -- (was the final RETURN EXISTS; now an IF so the handover check can follow)
    IF EXISTS (
        SELECT 1 FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = auth.uid()
        AND (cr.permissions->>permission_name)::boolean = true
    ) THEN
        RETURN true;
    END IF;

    -- ---- NEW: Director handover, the last resort -------------------------
    -- Reached only when every role check above has said no. This is what makes
    -- "assigning someone IS the permission" true across all 4,093 call sites
    -- without rewriting a single policy.
    --
    -- auth.uid() is NULL for anon; fn_handover_grants_key cannot match a NULL
    -- grantee, but the guard is explicit so an anonymous caller short-circuits
    -- without touching the table at all.
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    RETURN public.fn_handover_grants_key(auth.uid(), permission_name);
END;
$function$;

-- ----------------------------------------------------------------------------
-- (uuid, text) overload — called standalone via RPC, not in row predicates.
-- Volatility intentionally left as-is (see 20260603153624): marking it STABLE
-- buys nothing here and would be an unrelated change smuggled into a
-- high-risk migration.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_permission(user_id uuid, permission_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF permission_key IS NULL OR permission_key = '' THEN
        RETURN false;
    END IF;
    -- Super admin bypass
    IF EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = user_id
        AND (p.is_super_admin = true OR p.role = 'super_admin')
    ) THEN
        RETURN true;
    END IF;
    -- Multi-role system: check all assigned roles (OR logic)
    IF EXISTS (
        SELECT 1 FROM user_roles ur
        INNER JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = user_has_permission.user_id
        AND (cr.permissions->>permission_key)::boolean = true
    ) THEN
        RETURN true;
    END IF;
    -- Legacy fallback: profiles.role -> custom_roles
    IF EXISTS (
        SELECT 1 FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = user_has_permission.user_id
        AND (cr.permissions->>permission_key)::boolean = true
    ) THEN
        RETURN true;
    END IF;

    -- NEW: Director handover, last resort. Same semantics as the (text) form,
    -- so an API route asking "can this user do X" gets the same answer RLS does.
    -- The two MUST agree; a route that says no while RLS says yes produces the
    -- 403-with-data defect class, and the reverse leaks a button that then fails.
    IF user_has_permission.user_id IS NULL THEN
        RETURN false;
    END IF;

    RETURN public.fn_handover_grants_key(user_has_permission.user_id, permission_key);
END;
$$;

-- ============================================================================
-- CLOSE THE PERMISSION ORACLE ON THE (uuid, text) OVERLOAD
--
-- This overload is SECURITY DEFINER, takes a CALLER-SUPPLIED uuid, and never
-- compares it to auth.uid(). It has held an explicit
--   GRANT EXECUTE ... TO authenticated
-- since 20251210_fix_security_and_performance_issues.sql:687 (re-granted by
-- 20260605191101:259). Verified live on 2026-08-05:
--   has_function_privilege('authenticated', ...) = TRUE  on BOTH overloads.
--
-- That means any signed-in user can POST /rest/v1/rpc/user_has_permission with
-- {"user_id":"<anybody>","permission_key":"<anything>"} and read back true/false
-- — 7,231 profiles x 1,393 keys, a complete map of who holds what, harvested by
-- an account that holds nothing.
--
-- THE HOLE PREDATES THIS FEATURE. It is closed here because this migration is
-- what makes it worse: appending the handover branch above means the same oracle
-- now also answers "does Bob hold a handover for X", turning a role-disclosure
-- leak into a leak of who has been quietly delegated what.
--
-- WHY REVOKE RATHER THAN AN INTERNAL auth.uid() GUARD
-- ---------------------------------------------------
-- A guard (RAISE when user_id <> auth.uid()) was the other candidate and is
-- WRONG here: the legitimate callers pass OTHER people's ids on purpose — that
-- is the entire reason this overload exists, separate from the (text) form.
-- A guard would break them; a revoke does not touch them.
--
-- EVIDENCE THAT THE REVOKE IS SAFE, measured against production 2026-08-05:
--   * RLS policies calling the 2-arg form ........ 0
--     (a policy executes as the QUERYING role, so a policy caller WOULD have
--      needed the authenticated grant. There are none.)
--   * SQL functions calling the 2-arg form ....... 5, ALL SECURITY DEFINER
--     (fn_admission_lead_scope, get_lead_counts_by_source,
--      user_can_view_organizations, fn_soi_digest_audience,
--      fn_calendar_items_for_user — each executes as the function OWNER, which
--      keeps EXECUTE, so none of them is affected.)
--   * TypeScript/PostgREST callers of the 2-arg form ... 0
--     (every .rpc('user_has_permission', …) call site in app/ and lib/ passes
--      { permission_name } — the ONE-arg form, which resolves auth.uid()
--      internally and can therefore only answer about the caller themselves.)
--
-- The (text) overload deliberately KEEPS its grant: it is called from the client
-- all over the app and is not an oracle, because it only ever answers about
-- auth.uid().
--
-- APPLY-TIME ASSERT: fails loudly rather than silently leaving the hole open.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.user_has_permission(uuid, text) FROM authenticated, anon, PUBLIC;

DO $assert$
BEGIN
  IF has_function_privilege('authenticated',
       'public.user_has_permission(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'Permission oracle still open: authenticated retains EXECUTE on user_has_permission(uuid, text)';
  END IF;

  -- The (text) form MUST keep its grant, or every client permission check breaks.
  IF NOT has_function_privilege('authenticated',
       'public.user_has_permission(text)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'user_has_permission(text) lost its authenticated grant — client permission checks would all fail';
  END IF;
END;
$assert$;

NOTIFY pgrst, 'reload schema';
