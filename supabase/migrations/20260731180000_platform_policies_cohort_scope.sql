-- ============================================================================
-- Migration: 20260731180000_platform_policies_cohort_scope
-- School of Influence — S1 · config substrate, prerequisite P1
-- Spec: specs/school-of-influence-batches-2026-07-30.md §6 (P1), §7 (S1)
-- ============================================================================
-- WHAT
--   1. Widens platform_policies.scope_type from ('global','institution','role',
--      'user') to ALSO allow 'cohort', so a School of Influence batch (a row in
--      `cohorts`) can carry its own tuned copy of a policy.
--   2. Teaches public.fn_get_policy() to RESOLVE that new scope.
--
-- WHY (2) IS IN THE SAME FILE — read before trimming this migration
--   Widening the CHECK alone gets 'cohort' rows INTO the table but leaves them
--   UNREADABLE. Measured live 2026-07-30: fn_get_policy()'s WHERE clause
--   enumerates institution/global/role/user only, and its ORDER BY CASE has no
--   'cohort' branch. Every typed reader named in spec §3
--   (fn_get_policy_int/bool/text/json) delegates to it, so without this half a
--   seeded cohort row would silently return the caller's p_default forever —
--   the "objects verify perfectly while the behaviour is broken" failure mode,
--   and exactly the §5 pathology ("anything that claims 'paused' while silently
--   doing nothing is a FAILURE, not a feature").
--
-- BEHAVIOUR-PRESERVING FOR ALL EXISTING ROWS — provably
--   No row can carry scope_type='cohort' before this migration, because the old
--   CHECK forbade it. The two added WHERE branches therefore match zero
--   pre-existing rows, and the rewritten ORDER BY keeps the four existing scope
--   types in their original relative order (user < institution < role < global).
--   All 544 live rows resolve bit-identically.
--
-- PRECEDENCE after this migration (most specific wins):
--   1 user
--   2 cohort   (scope_id = the specific batch/cohort)
--   3 institution
--   4 role
--   5 cohort   (scope_id IS NULL — the programme-wide cohort default)
--   6 global
--
-- ANON GRANT — DELIBERATELY PRESERVED, NOT AN OVERSIGHT
--   fn_get_policy currently carries anon=X/postgres (measured live 2026-07-30),
--   and is listed in scripts/ci/anon-exposure-functions.json. It is one of the
--   sanctioned intentional-public config lookups named verbatim in
--   scripts/ci/check-secdef-anon-revoke.mjs PASS criterion (b) ("fn_get_policy*
--   config lookups"), and unauthenticated surfaces call it directly (e.g.
--   app/api/webhooks/meta/instagram-messaging/route.ts). CREATE OR REPLACE
--   preserves the ACL, so this migration changes no grant. The GRANT below is
--   re-asserted EXPLICITLY per CLAUDE.md so the anon reach is an audit-trail
--   decision rather than a silent Supabase default. Revoking anon here would be
--   an unrelated, separately-reviewable security change with live blast radius —
--   it is deliberately NOT bundled into this feature migration.
--
-- Idempotent. Safe to re-apply. No data is written or deleted.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. P1 — allow scope_type = 'cohort'
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_policies
  DROP CONSTRAINT IF EXISTS platform_policies_scope_type_check;

ALTER TABLE public.platform_policies
  ADD CONSTRAINT platform_policies_scope_type_check
  CHECK (scope_type = ANY (ARRAY['global', 'institution', 'role', 'user', 'cohort']));

COMMENT ON COLUMN public.platform_policies.scope_type IS
  'Scope this policy row applies to: global | institution | role | user | cohort. '
  '''cohort'' with scope_id = a cohorts.id tunes one batch; ''cohort'' with '
  'scope_id IS NULL is the programme-wide default for every cohort of that kind.';

-- ROLLBACK (down migration) — only safe while no cohort-scoped rows exist.
-- Confirm first, then narrow the CHECK back:
--   SELECT count(*) FROM public.platform_policies WHERE scope_type = 'cohort';  -- must be 0
--   ALTER TABLE public.platform_policies
--     DROP CONSTRAINT platform_policies_scope_type_check;
--   ALTER TABLE public.platform_policies
--     ADD CONSTRAINT platform_policies_scope_type_check
--     CHECK (scope_type = ANY (ARRAY['global', 'institution', 'role', 'user']));
-- ...and restore the pre-cohort fn_get_policy body from
-- supabase/migrations/20260515000001_fn_get_policy_json.sql's ancestor, or simply
-- leave the resolver in place: with zero cohort rows its two extra branches are
-- unreachable and cost one index-free predicate.

-- ---------------------------------------------------------------------------
-- 2. Teach the canonical resolver about cohort scope
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_policy(p_key text, p_scope_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT value FROM platform_policies
  WHERE policy_key = p_key AND is_active = true
    AND (
      (scope_type='institution' AND scope_id=p_scope_id)
      OR (scope_type='global' AND scope_id IS NULL)
      OR (scope_type='role' AND scope_id IN (
            SELECT cr.id FROM custom_roles cr WHERE EXISTS (
              SELECT 1 FROM user_roles ur JOIN profiles p ON p.id=ur.user_id
              WHERE ur.role_id=cr.id AND p.id=auth.uid()
            )
          ))
      OR (scope_type='user' AND scope_id=auth.uid())
      -- cohort scope: the caller passes the batch's cohorts.id as p_scope_id.
      OR (scope_type='cohort' AND scope_id=p_scope_id)
      -- ...falling back to the programme-wide cohort default.
      OR (scope_type='cohort' AND scope_id IS NULL)
    )
  ORDER BY
    CASE
      WHEN scope_type = 'user'                                  THEN 1
      WHEN scope_type = 'cohort' AND scope_id IS NOT NULL        THEN 2
      WHEN scope_type = 'institution'                            THEN 3
      WHEN scope_type = 'role'                                   THEN 4
      WHEN scope_type = 'cohort' AND scope_id IS NULL            THEN 5
      WHEN scope_type = 'global'                                 THEN 6
      ELSE 99
    END
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.fn_get_policy(text, uuid) IS
  'Canonical policy resolver. Returns the most specific active value for p_key. '
  'Precedence: user > cohort(scope_id) > institution > role > cohort(default) > global. '
  'Intentionally reachable by anon (config lookups on unauthenticated surfaces) — '
  'see the migration header and scripts/ci/anon-exposure-functions.json.';

-- Grant surface re-asserted verbatim from the live ACL measured 2026-07-30
-- (postgres, authenticated, service_role, anon). CREATE OR REPLACE preserves the
-- ACL; these statements make it explicit and auditable rather than implicit.
REVOKE EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) TO authenticated, service_role;
-- CORRECTED 2026-07-31. This line previously read
--     GRANT EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) TO anon;
-- and it re-opened a live credential leak. The header above justifies it on the
-- grounds that an unauthenticated route calls this function directly; that is
-- false — app/api/webhooks/meta/instagram-messaging/route.ts uses
-- createServiceRoleClient(), which bypasses grants, as does the leadgen route.
-- Those are the only two callers. With anon EXECUTE, fn_get_policy returned the
-- Meta webhook verify tokens in full to anyone holding the public anon key
-- (measured live 2026-07-30 and again 2026-07-31 after this migration merged).
-- The grant is replaced by the revoke it should always have been, so that
-- re-applying this file is genuinely idempotent instead of quietly reopening the
-- hole. See migration 20260731200000 for the full account.
REVOKE EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) FROM anon;
