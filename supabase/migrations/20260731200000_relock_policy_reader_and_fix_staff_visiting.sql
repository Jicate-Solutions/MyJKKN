-- ============================================================================
-- Updated: 2026-07-31 — re-lock fn_get_policy (it was re-granted to anon hours
-- after being revoked, and the Meta webhook credentials leaked a second time),
-- and close the latent leak in staff_ids_visiting_accessible_institutions.
--
-- ── PART 1 — fn_get_policy, re-opened by a sibling migration ────────────────
--
-- 20260730120000 revoked anon EXECUTE on the five fn_get_policy* overloads
-- because fn_get_policy_text was serving three live Meta webhook verify tokens
-- to unauthenticated callers. Hours later, 20260731180000
-- (platform_policies_cohort_scope, PR #2679) re-granted anon EXECUTE on the
-- two-argument fn_get_policy overload. Measured again on 2026-07-31: as the
-- anon role over HTTPS, fn_get_policy('meta.leadgen.verify_token') returned the
-- full 64-character token and fn_get_policy('meta.messenger.verify_token')
-- returned its 32-character token. The same leak, through a different overload.
--
-- THAT GRANT WAS DELIBERATE, AND ITS REASONING DESERVES ANSWERING RATHER THAN
-- OVERRIDING SILENTLY. The migration's header gives two justifications:
--
--   (a) "unauthenticated surfaces call it directly (e.g.
--       app/api/webhooks/meta/instagram-messaging/route.ts)".
--       FALSE, and it is the load-bearing half. That route builds its client
--       with createServiceRoleClient() (line 63), which authenticates as
--       service_role and bypasses these grants entirely. Every unauthenticated
--       route on main was swept for fn_get_policy callers: exactly two exist,
--       instagram-messaging and leadgen, and BOTH use service-role clients.
--       There is no caller that needs anon EXECUTE.
--
--   (b) "it is named in check-secdef-anon-revoke.mjs PASS criterion (b)".
--       TRUE — and that is a second defect, fixed in the same change. The gate's
--       own docstring listed "fn_get_policy* config lookups" as a sanctioned
--       intentional-public example, so CI approved the re-grant. A gate that
--       recommends the exposure cannot also catch it.
--
--   The header also said "CREATE OR REPLACE preserves the ACL, so this migration
--   changes no grant." That was true when measured and stale by the time it
--   merged: the ACL had already been revoked. Re-asserting a remembered ACL is
--   how a closed hole reopens.
--
-- ── PART 2 — staff_ids_visiting_accessible_institutions ────────────────────
--
-- Anon-executable, no guard, and its WHERE clause opens with a branch that does
-- not depend on the caller at all:
--
--     WHERE sp.institution_id IS NULL
--        OR sp.institution_id IN (SELECT unnest(_user_accessible_institutions()))
--
-- For an anonymous caller the second branch is empty, but the FIRST matches
-- unconditionally — so every staff plan filed without an institution hands its
-- team-member ids to anyone. It returns an empty array today only because all
-- 207 staff_plans currently carry an institution_id. The day one is created
-- without one, it leaks, silently and with no code change to blame.
--
-- The fix requires an authenticated caller before either branch is considered.
-- Behaviour for every logged-in user is byte-identical; only the anonymous case
-- changes, from "whatever has a null institution" to "nothing".
--
-- Anon EXECUTE is then revoked. This is observably a no-op: anon cannot read the
-- staff table at all today — measured 2026-07-31, an anon SELECT on staff
-- already fails 42501 on user_has_permission, called from a different policy on
-- the same table. Revoking here removes a capability nothing can reach.
--
-- Read-only. Creates no table and writes no data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART 1 — fn_get_policy
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_policy(text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_get_policy(text, uuid) IS
  'Config lookup. NOT reachable by anon — it can return any platform_policies '
  'value, including the Meta webhook verify tokens, which leaked twice through '
  'this path (2026-07-30 and 2026-07-31). The two unauthenticated webhook routes '
  'that read policy values use service-role clients and are unaffected. Do not '
  're-grant anon without re-reading migration 20260731200000.';

-- ---------------------------------------------------------------------------
-- PART 2 — staff_ids_visiting_accessible_institutions
-- Body is byte-identical to the deployed version except the caller check.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_ids_visiting_accessible_institutions()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(d.staff_id), ARRAY[]::uuid[])
  FROM (
    SELECT DISTINCT spc.staff_id
    FROM public.staff_plan_courses spc
    JOIN public.staff_plans sp ON sp.id = spc.staff_plan_id
    -- An unauthenticated caller gets nothing, before either branch is reached.
    -- Without this, `sp.institution_id IS NULL` matches for ANY caller and hands
    -- team-member ids to the public the moment one such plan exists.
    WHERE auth.uid() IS NOT NULL
      AND (
        sp.institution_id IS NULL
        OR sp.institution_id IN (SELECT unnest(public._user_accessible_institutions()))
      )
  ) d;
$function$;

REVOKE EXECUTE ON FUNCTION public.staff_ids_visiting_accessible_institutions()
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.staff_ids_visiting_accessible_institutions()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.staff_ids_visiting_accessible_institutions() IS
  'Visiting-Senior-Learner ids for the caller''s accessible institutions. Used by '
  'the staff_select_visiting_teacher policy. Requires an authenticated caller: '
  'its institution_id IS NULL branch is otherwise unconditional and would leak '
  'team-member ids publicly. Not reachable by anon.';

-- ---------------------------------------------------------------------------
-- Apply-time asserts. A revoke that silently did nothing is the failure mode
-- this whole class of bug is made of, so fail loudly rather than report success.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_open text;
BEGIN
  SELECT string_agg(p.proname, ', ')
    INTO v_open
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fn_get_policy', 'staff_ids_visiting_accessible_institutions')
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'anon still holds EXECUTE on: %', v_open;
  END IF;

  -- And prove the unconditional branch is actually closed: with no authenticated
  -- caller the function must return an empty array, not "everything with a null
  -- institution". This runs in the definer context, which is what an anon call
  -- produces inside the body.
  IF auth.uid() IS NULL
     AND array_length(public.staff_ids_visiting_accessible_institutions(), 1) IS NOT NULL
  THEN
    RAISE EXCEPTION
      'staff_ids_visiting_accessible_institutions still returns rows without an authenticated caller';
  END IF;
END $$;
